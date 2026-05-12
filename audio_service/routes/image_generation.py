"""
Image Generation Proxy Route
Generates pools of real photographs via LoremFlickr, driven by audio features
from the external Docker AudioFeatures database table.

LoremFlickr serves real Flickr Creative Commons photos matching keyword tags.
Uses ONLY verified single keywords per URL (no comma-separated multi-tags) to
avoid HTTP 500 errors. Each unique lock value returns a different image.

Audio features (mood, energy, valence, tempo, danceability, acousticness, genre)
are mapped to verified Flickr-friendly single keywords so every song gets
visually relevant, mood-matched real photographs.

Content safety: NO people, nudity, red-dominant, text-heavy, concert, dance,
stadium, beach, sculpture, street, fire, car, motorcycle, helicopter, train,
guitar, piano, sailboat, volcano keywords.
Only nature, landscape, architecture, and abstract imagery.
"""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from typing import Optional
import time
import hashlib
import random
import importlib
import requests
import threading
import subprocess
import os
from urllib.parse import urlparse

from database import get_db_connection
from utils import console
from config import (
    IMAGE_POOL_S3_BUCKET,
    IMAGE_POOL_S3_PREFIX,
    IMAGE_POOL_MAX_DOWNLOAD_BYTES,
    IMAGE_POOL_DOWNLOAD_TIMEOUT_SECS,
    IMAGE_POOL_DEFAULT_SIZE,
    IMAGE_POOL_MAX_TOTAL_BYTES,
    IMAGE_POOL_ESTIMATED_AVG_IMAGE_BYTES,
    EXTERNAL_IMAGE_GENERATION_ENABLED,
)
from s3_service import upload_bytes, get_object_stream, delete_object
from config import executor
from .image_generation_db import (
    db_count_images_by_provider as _db_count_images_by_provider,
    db_trim_song_pool_by_provider_with_keys as _db_trim_song_pool_by_provider_with_keys,
    db_product_exists as _db_product_exists,
    db_s3_storage_stats as _db_s3_storage_stats,
    db_fetch_images as _db_fetch_images,
    db_fetch_hosted_image_rows as _db_fetch_hosted_image_rows,
    db_insert_hosted_images as _db_insert_hosted_images,
)
from .image_generation_cache import _image_cache, _get_cached, _set_cached
from .image_generation_keywords import (
    _VERIFIED_KEYWORDS,
    _BANNED_FIGURE_TERMS,
    _tokenize_text,
    _contains_banned_figure_terms,
    _safe_prompt_keywords,
    _build_keywords_from_features,
)

router = APIRouter(prefix="/api/images", tags=["Image Generation"])

# ============================================
# BACKFILL SCHEDULING (avoid request blocking)
# ============================================
# This section defines lightweight scheduling helpers so expensive refill work
# runs in the background instead of delaying HTTP responses.
_pool_refill_lock = threading.Lock()
_pool_refill_last_scheduled: dict[int, float] = {}
_POOL_REFILL_MIN_INTERVAL_SECS = 60.0
_EXTERNAL_IMAGE_GENERATION_ENABLED = EXTERNAL_IMAGE_GENERATION_ENABLED
_POOL_VIDEO_CACHE_TTL_SECS = 60 * 20
_pool_video_cache_lock = threading.Lock()
_pool_video_cache: dict[str, dict] = {}


# The Batch Refill (Background Job): The server spawns a background task 
# (_schedule_pool_refill) that silently goes to work downloading the rest of the images 
# (the batch) so that as the song progresses, the queue never runs out.
def _schedule_pool_refill(
    *,
    product_id: int,
    song_title: str,
    desired_size: int,
    mood: Optional[str],
    energy: Optional[float],
    valence: Optional[float],
    tempo: Optional[float],
    danceability: Optional[float],
    acousticness: Optional[float],
    genre: Optional[str],
):
    """Schedule a background refill so /pool stays fast."""
    # Global feature switch: do nothing when external generation is disabled.
    if not _EXTERNAL_IMAGE_GENERATION_ENABLED:
        return

    # Product IDs can be positive (library) or negative (imported iTunes).
    if not _is_supported_product_id(product_id):
        return

    # Throttle refill scheduling per song to avoid repeated background jobs.
    now = time.time()
    with _pool_refill_lock:
        last = _pool_refill_last_scheduled.get(product_id)
        if last and (now - last) < _POOL_REFILL_MIN_INTERVAL_SECS:
            return
        _pool_refill_last_scheduled[product_id] = now

    def _task():
        # Actual refill work runs in a background worker thread.
        try:
            inserted = ensure_song_image_pool(
                product_id,
                song_title,
                desired_size=int(desired_size),
                mood=mood,
                energy=energy,
                valence=valence,
                tempo=tempo,
                danceability=danceability,
                acousticness=acousticness,
                genre=genre,
            )
            console.log(f"🖼️ Pool refill complete ProductID={product_id} inserted={inserted}")
        except Exception as e:
            # Keep failures non-fatal so API requests remain responsive.
            console.log(f"⚠️ Pool refill failed ProductID={product_id}: {e}")

    try:
        # Submit non-blocking refill task to shared executor.
        executor.submit(_task)
    except Exception as e:
        # Scheduler failures should be logged but never crash the caller.
        console.log(f"⚠️ Pool refill scheduling failed ProductID={product_id}: {e}")

# ============================================
# CACHE + KEYWORD MODULES
# ============================================
# Shared cache and keyword logic now lives in dedicated modules:
# - image_generation_cache.py
# - image_generation_keywords.py


# ============================================
# LOREM FLICKR PROVIDER (Single Keyword Per URL)
# ============================================
# Provider-facing URL builders live here. The key rule is one keyword per URL
# to avoid unstable provider behavior from multi-tag strings.

def _generate_loremflickr_urls(keywords: list, count: int = 30,
                                width: int = 1980, height: int = 1280,
                                nocache: bool = False) -> list:
    """
    Generate LoremFlickr URLs using SINGLE verified keywords per URL.
    Cycles through the keyword list so each URL gets a different keyword.
    Each URL gets a unique ?lock=N value for a different image.

    Uses 1980x1280 for fast loading — same resolution in thumbnails and fullscreen
    so the image looks identical in both views.

    When nocache=True, appends a random cache-buster to guarantee fresh
    URLs that the browser/CDN won't have seen before.
    """
    # If caller sends no keywords, we fall back to a small neutral safe set so
    # the request still returns usable images.
    if not keywords:
        keywords = ["abstract", "landscape", "sky"]

    # Start from a random lock base so separate calls don't keep reusing the
    # exact same image IDs in the same sequence.
    base_lock = random.randint(1, 900000)
    urls = []
    for i in range(count):
        # Cycle through provided keywords (round-robin):
        # if count > number of keywords, we reuse them in order.
        keyword = keywords[i % len(keywords)]
        lock_id = base_lock + i

        # Build one provider URL per output image.
        # Important: each URL uses ONE keyword only (no comma list), because
        # multi-tag usage can cause provider instability/errors.
        base_url = f"https://loremflickr.com/{width}/{height}/{keyword}?lock={lock_id}"
        if nocache:
            # Optional cache-buster for debugging/refresh scenarios where we
            # explicitly want new URLs that bypass browser/CDN caches.
            base_url += f"&nocache={random.randint(1, 99999999)}"

        # Return a normalized image descriptor object expected by frontend code.
        urls.append({
            "url": base_url,
            "urlLarge": base_url,
            "tags": keyword,
            "lock_id": lock_id,
            "width": width,
            "height": height,
        })

    # Final list contains exactly `count` descriptor objects.
    return urls


# ============================================
# DB-BACKED PER-SONG IMAGE POOLS
# ============================================
# This section contains helper functions for reading/writing persistent image
# pools and enforcing storage limits (row count + byte budget).

_DEFAULT_POOL_SIZE = max(1, int(IMAGE_POOL_DEFAULT_SIZE))


def _safe_int(value: Optional[str]) -> Optional[int]:
    # Preserve None as None so callers can differentiate "missing" from invalid.
    if value is None:
        return None
    try:
        # Normalize whitespace and parse strict integer value.
        as_int = int(str(value).strip())
        return as_int
    except Exception:
        # Non-numeric values are treated as invalid IDs.
        return None


def _hash_url(url: str) -> str:
    # Stable URL fingerprint used for dedupe and DB indexing.
    return hashlib.md5(url.encode("utf-8")).hexdigest()


def _hash_bytes(data: bytes) -> str:
    # Content-based hash used for deterministic S3 keying.
    return hashlib.md5(data).hexdigest()


def _is_absolute_url(url: str) -> bool:
    try:
        # Parse and accept only URLs with both scheme and host.
        parsed = urlparse(url)
        return bool(parsed.scheme) and bool(parsed.netloc)
    except Exception:
        # Parsing failures are treated as not-absolute.
        return False


def _absolute_url(request: Request, maybe_relative_url: str) -> str:
    # Keep empty values unchanged for caller handling.
    if not maybe_relative_url:
        return maybe_relative_url
    # If the URL already has scheme + host, it is complete and should be
    # returned unchanged.
    if _is_absolute_url(maybe_relative_url):
        return maybe_relative_url
    # Ensure we generate a fully-qualified URL that matches the API host.
    base = str(request.base_url).rstrip("/")
    # Normalize relative paths so joining is predictable.
    if not maybe_relative_url.startswith("/"):
        maybe_relative_url = "/" + maybe_relative_url
    return base + maybe_relative_url


def _download_image_bytes(source_url: str, timeout_secs: Optional[float] = None):
    """Download an image and return (bytes, content_type).

    Enforces a max download size and short timeouts to avoid tying up workers.
    """
    # Use caller override when provided; otherwise use service default timeout.
    effective_timeout = float(timeout_secs or IMAGE_POOL_DOWNLOAD_TIMEOUT_SECS)
    timeout = (effective_timeout, effective_timeout)
    with requests.get(source_url, stream=True, timeout=timeout, allow_redirects=True) as resp:
        # Stop immediately for HTTP 4xx/5xx responses so callers can handle
        # failures explicitly.
        resp.raise_for_status()
        content_type = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        # Safety check: this pipeline only accepts image MIME types.
        # Rejecting here prevents HTML/JSON error bodies from being processed.
        if not content_type.startswith("image/"):
            raise ValueError(f"Non-image content-type: {content_type or 'unknown'}")

        chunks = []
        size = 0
        for chunk in resp.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            size += len(chunk)
            # Hard cap download size to protect memory and bandwidth.
            if size > IMAGE_POOL_MAX_DOWNLOAD_BYTES:
                raise ValueError("Image too large")
            chunks.append(chunk)
        data = b"".join(chunks)
        # Guard against empty but successful responses.
        if not data:
            raise ValueError("Empty image response")
        return data, content_type


def _decode_image_bgr(data: bytes):
    """Decode image bytes into OpenCV BGR ndarray (or None on failure)."""
    try:
        # Lazy-import cv2 so module import doesn't hard-fail at startup.
        cv2 = importlib.import_module("cv2")
        import numpy as np

        arr = np.frombuffer(data, dtype=np.uint8)
        if arr.size == 0:
            return None
        # Decode into BGR image matrix used by OpenCV pipelines.
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception:
        # Decoder errors should not break the ingestion flow.
        return None


def _detect_people_in_image(data: bytes) -> bool:
    """Detect human presence using four Haar cascade layers.

    Skin-tone heuristic intentionally omitted: all images are sourced via
    _VERIFIED_KEYWORDS (nature/landscape/abstract only), so warm-toned false
    positives from sunset, sandstone, coral, and canyon keywords would far
    outweigh the marginal benefit of catching the rare incidental silhouette
    that slips past all four cascades.

    Detection layers:
      1. Frontal face  — direct portraits
      2. Profile face  — side-on faces
      3. Full body     — standing figures, even at distance
      4. Upper body    — torsos when legs are out of frame
    """
    try:
        cv2 = importlib.import_module("cv2")
    except Exception:
        return False

    img = _decode_image_bgr(data)
    if img is None:
        return False

    h, w = img.shape[:2]
    if h < 20 or w < 20:
        return False

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    cascade_configs = [
        # (filename, scaleFactor, minNeighbors, minSize)
        # Frontal: strict neighbors to avoid rock/cloud false positives.
        ("haarcascade_frontalface_default.xml", 1.1, 8, (40, 40)),
        # Profile: slightly relaxed since side-on hits are geometrically rarer.
        ("haarcascade_profileface.xml",         1.1, 7, (40, 40)),
        # Full body: finer scale steps to catch distant/small figures.
        ("haarcascade_fullbody.xml",             1.05, 6, (60, 120)),
        # Upper body: catches torsos when legs are cropped or occluded.
        ("haarcascade_upperbody.xml",            1.1, 7, (50, 50)),
    ]

    for filename, scale, neighbors, min_size in cascade_configs:
        cascade_path = os.path.join(cv2.data.haarcascades, filename)
        detector = cv2.CascadeClassifier(cascade_path)
        if detector.empty():
            continue
        hits = detector.detectMultiScale(
            gray,
            scaleFactor=scale,
            minNeighbors=neighbors,
            minSize=min_size,
            flags=cv2.CASCADE_SCALE_IMAGE,
        )
        if len(hits) > 0:
            return True

    return False


def _detect_red_border_in_image(data: bytes) -> bool:
    """Detect strong red border overlays around image edges."""
    img = _decode_image_bgr(data)
    if img is None:
        return False

    h, w = img.shape[:2]
    # Tiny images are too noisy for reliable border heuristics.
    if h < 20 or w < 20:
        return False

    border_px = max(4, int(min(h, w) * 0.06))
    top = img[:border_px, :, :]
    bottom = img[h - border_px :, :, :]
    left = img[:, :border_px, :]
    right = img[:, w - border_px :, :]

    import numpy as np

    border = np.concatenate([
        top.reshape(-1, 3),
        bottom.reshape(-1, 3),
        left.reshape(-1, 3),
        right.reshape(-1, 3),
    ], axis=0)

    b = border[:, 0].astype(np.int16)
    g = border[:, 1].astype(np.int16)
    r = border[:, 2].astype(np.int16)

    # Strong red dominance in edge pixels => likely red frame/border overlay.
    red_mask = (r > 180) & (r > (g + 60)) & (r > (b + 60))
    red_ratio = float(np.count_nonzero(red_mask)) / float(max(1, red_mask.size))
    # Reject when most edge pixels are red-dominant (likely frame overlay).
    return red_ratio >= 0.75


def _moderation_rejection_reason(data: bytes) -> Optional[str]:
    # Person check runs first as the strongest disqualifier.
    if _detect_people_in_image(data):
        return "person_detected"
    # Secondary check rejects heavy red-border overlays.
    if _detect_red_border_in_image(data):
        return "red_border_detected"
    # None means image passed moderation filters.
    return None


def _ext_from_content_type(content_type: str) -> str:
    # Map MIME type to extension for deterministic object naming.
    if content_type == "image/jpeg":
        return ".jpg"
    if content_type == "image/png":
        return ".png"
    if content_type == "image/webp":
        return ".webp"
    if content_type == "image/gif":
        return ".gif"
    # Generic fallback when MIME type is unknown.
    return ".img"


def _delete_s3_keys_best_effort(storage_keys: list[str]) -> int:
    # No-op when S3 storage is not configured.
    if not IMAGE_POOL_S3_BUCKET:
        return 0
    deleted = 0
    for key in (storage_keys or []):
        if not key:
            continue
        try:
            if delete_object(IMAGE_POOL_S3_BUCKET, key):
                deleted += 1
        except Exception as e:
            # Best-effort cleanup: log and continue for remaining keys.
            console.log(f"⚠️ Failed to delete S3 object during trim: {key} ({e})")
    return deleted


def _allowed_images_by_budget(remaining_bytes: int, avg_image_bytes: int) -> int:
    # Guardrail: force minimum divisor of 1 to avoid divide-by-zero when stats
    # are missing or unexpectedly zero.
    avg = max(1, int(avg_image_bytes or 1))
    if remaining_bytes <= 0:
        return 0
    # Integer floor gives safe number of additional images allowed.
    return max(0, int(remaining_bytes // avg))


def _is_library_product_id(product_id: int) -> bool:
    """Library songs use positive ProductIDs; iTunes-imported songs use negative IDs."""
    return int(product_id) > 0


def _is_supported_product_id(product_id: int) -> bool:
    """Image pools support both library and imported songs; only zero/invalid IDs are rejected."""
    return int(product_id) != 0


def _sanitize_filename(value: str, fallback: str = "image-pool") -> str:
    # Keep only safe filename chars and normalize spaces.
    safe = "".join(ch for ch in (value or "") if ch.isalnum() or ch in ("-", "_", " ")).strip()
    safe = safe.replace(" ", "-")
    return safe[:80] or fallback


def _concat_quote(path: str) -> str:
    # Escape single quotes for ffmpeg concat manifest format.
    return path.replace("'", "'\\''")


def _write_ppm(path: str, rgb):
    """Write an RGB uint8 numpy array to a binary PPM file."""
    import numpy as np

    # Force uint8 pixel storage and validate 3-channel RGB layout.
    arr = np.asarray(rgb, dtype=np.uint8)
    h, w, c = arr.shape
    if c != 3:
        raise ValueError("PPM expects 3-channel RGB data")
    header = f"P6\n{w} {h}\n255\n".encode("ascii")
    with open(path, "wb") as f:
        f.write(header)
        f.write(arr.tobytes())


def _normalize_image_to_ppm(ffmpeg_bin: str, input_path: str, output_path: str) -> bool:
    """Convert any single image into a one-frame PPM file via ffmpeg."""
    # Single-frame conversion ensures all sources are normalized for concat.
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i",
        input_path,
        "-frames:v",
        "1",
        output_path,
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=20, check=False)
    except Exception:
        return False
    # Success requires return code and non-empty output file.
    return proc.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 0


def _generate_procedural_frame(
    *,
    out_path: str,
    width: int,
    height: int,
    energy: float,
    lfc: float,
    hfc: float,
    spectral_centroid: float,
    onset_type: str,
    glitch: bool,
    seed: int,
):
    """Frontend-style procedural generator ported from imageGenerationService.js."""
    import numpy as np

    # Deterministic RNG seed so repeated runs are reproducible for same interval.
    rng = np.random.default_rng(int(seed))

    def _hex_to_rgb(hex_color: str) -> np.ndarray:
        h = hex_color.lstrip("#")
        return np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)

    def _blend(dst: np.ndarray, mask: np.ndarray, color: np.ndarray, alpha: float):
        if alpha <= 0:
            return
        a = np.clip(mask.astype(np.float32) * float(alpha), 0.0, 1.0)[..., None]
        dst[:] = (dst * (1.0 - a) + color[None, None, :] * a)

    def _clamp01(value: float) -> float:
        return max(0.0, min(1.0, float(value)))

    palettes = [
        ["#FF006E", "#8338EC", "#3A86FF", "#06D6A0", "#FFD166"],
        ["#2D00F7", "#6A00F4", "#8900F2", "#A100F2", "#B100E8"],
        ["#FF0000", "#FF4400", "#FF8800", "#FFBB00", "#FFFF00"],
        ["#00F5D4", "#00BBF9", "#9B5DE5", "#F15BB5", "#FEE440"],
        ["#001219", "#005F73", "#0A9396", "#94D2BD", "#E9D8A6"],
        ["#10002B", "#240046", "#3C096C", "#5A189A", "#7B2D8E"],
        ["#03071E", "#370617", "#6A040F", "#9D0208", "#D00000"],
        ["#006466", "#065A60", "#0B525B", "#144552", "#1B3A4B"],
    ]

    # Clamp canvas to sensible minimum size.
    w = max(64, int(width))
    h = max(64, int(height))
    yy, xx = np.mgrid[0:h, 0:w]
    frame = np.zeros((h, w, 3), dtype=np.float32)

    # Frontend behavior: palette index is floor(spectralCentroid * paletteCount) % paletteCount.
    palette_idx = int(np.floor(float(spectral_centroid) * len(palettes))) % len(palettes)
    palette = [_hex_to_rgb(c) for c in palettes[palette_idx]]

    # Background gradient creates the base color field.
    angle = float(rng.random() * np.pi * 2.0)
    gx1 = w / 2.0 + np.cos(angle) * w / 2.0
    gy1 = h / 2.0 + np.sin(angle) * h / 2.0
    gx2 = w - gx1
    gy2 = h - gy1
    grad_denom = max(1.0, ((gx2 - gx1) ** 2 + (gy2 - gy1) ** 2))
    t = ((xx - gx1) * (gx2 - gx1) + (yy - gy1) * (gy2 - gy1)) / grad_denom
    t = np.clip(t, 0.0, 1.0).astype(np.float32)
    mix01 = np.clip(t * 2.0, 0.0, 1.0)
    mix12 = np.clip((t - 0.5) * 2.0, 0.0, 1.0)
    left = palette[0] * (1.0 - mix01[..., None]) + palette[1] * mix01[..., None]
    right = palette[1] * (1.0 - mix12[..., None]) + palette[2] * mix12[..., None]
    frame[:] = np.where((t <= 0.5)[..., None], left, right)

    # Layer 1: organic blobs (LFC-driven count)
    large_shape_count = 3 + int(np.floor(_clamp01(lfc) * 5.0))
    for _ in range(large_shape_count):
        alpha = 0.2 + float(rng.random()) * 0.3
        color = palette[int(rng.integers(0, len(palette)))]
        cx = float(rng.random() * w)
        cy = float(rng.random() * h)
        radius = 50.0 + _clamp01(energy) * 150.0 + float(rng.random()) * 100.0

        points = 5 + int(rng.integers(0, 4))
        a_points = np.linspace(0.0, 2.0 * np.pi, points, endpoint=False)
        jitter = (rng.random(points) - 0.5) * (np.pi / points)
        a_points = np.mod(a_points + jitter, 2.0 * np.pi)
        order = np.argsort(a_points)
        a_points = a_points[order]
        r_points = radius * (0.7 + rng.random(points) * 0.6)
        r_points = r_points[order]

        bbox_r = int(min(max(radius * 1.8, 16), max(w, h)))
        x0 = max(0, int(cx) - bbox_r)
        x1 = min(w, int(cx) + bbox_r + 1)
        y0 = max(0, int(cy) - bbox_r)
        y1 = min(h, int(cy) + bbox_r + 1)
        if x1 <= x0 or y1 <= y0:
            continue

        lxx = xx[y0:y1, x0:x1] - cx
        lyy = yy[y0:y1, x0:x1] - cy
        theta = np.mod(np.arctan2(lyy, lxx), 2.0 * np.pi)
        dist = np.sqrt(lxx * lxx + lyy * lyy)
        a_ext = np.concatenate([a_points, a_points[:1] + 2.0 * np.pi])
        r_ext = np.concatenate([r_points, r_points[:1]])
        edge = np.interp(theta.ravel(), a_ext, r_ext).reshape(theta.shape)
        mask = dist <= edge
        _blend(frame[y0:y1, x0:x1, :], mask, color, alpha)

    # Layer 2: geometric primitives (HFC-driven count).
    geo_count = 5 + int(np.floor(_clamp01(hfc) * 15.0))
    for _ in range(geo_count):
        alpha = 0.1 + float(rng.random()) * 0.4
        color = palette[int(rng.integers(0, len(palette)))]
        line_w = 1.0 + float(rng.random()) * 3.0

        cx = float(rng.random() * w)
        cy = float(rng.random() * h)
        size = 10.0 + float(rng.random()) * (60.0 + _clamp01(energy) * 80.0)
        shape_type = int(rng.integers(0, 4))

        if shape_type == 0:  # Circle
            dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
            if rng.random() > 0.5:
                mask = dist <= size
            else:
                mask = np.abs(dist - size) <= line_w
            _blend(frame, mask, color, alpha)
        elif shape_type == 1:  # Triangle
            p1 = np.array([cx, cy - size], dtype=np.float32)
            p2 = np.array([cx - size * 0.866, cy + size * 0.5], dtype=np.float32)
            p3 = np.array([cx + size * 0.866, cy + size * 0.5], dtype=np.float32)

            def _sign(px, py, ax, ay, bx, by):
                return (px - bx) * (ay - by) - (ax - bx) * (py - by)

            d1 = _sign(xx, yy, p1[0], p1[1], p2[0], p2[1])
            d2 = _sign(xx, yy, p2[0], p2[1], p3[0], p3[1])
            d3 = _sign(xx, yy, p3[0], p3[1], p1[0], p1[1])
            has_neg = (d1 < 0) | (d2 < 0) | (d3 < 0)
            has_pos = (d1 > 0) | (d2 > 0) | (d3 > 0)
            fill_mask = ~(has_neg & has_pos)
            if rng.random() > 0.5:
                _blend(frame, fill_mask, color, alpha)
            else:
                edge_mask = (np.abs(d1) <= line_w * 120.0) | (np.abs(d2) <= line_w * 120.0) | (np.abs(d3) <= line_w * 120.0)
                _blend(frame, fill_mask & edge_mask, color, alpha)
        elif shape_type == 2:  # Line
            a = float(rng.random() * np.pi * 2.0)
            x2 = cx + np.cos(a) * size * 2.0
            y2 = cy + np.sin(a) * size * 2.0
            vx = x2 - cx
            vy = y2 - cy
            denom = max(1e-6, vx * vx + vy * vy)
            proj = ((xx - cx) * vx + (yy - cy) * vy) / denom
            proj_clip = np.clip(proj, 0.0, 1.0)
            nx = cx + proj_clip * vx
            ny = cy + proj_clip * vy
            dist = np.sqrt((xx - nx) ** 2 + (yy - ny) ** 2)
            mask = dist <= (line_w + 0.75)
            _blend(frame, mask, color, alpha)
        else:  # Ring
            dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
            ring1 = np.abs(dist - size) <= line_w
            ring2 = np.abs(dist - size * 0.6) <= line_w
            _blend(frame, ring1 | ring2, color, alpha)

    # Layer 3: particles (energy controls density).
    particle_count = int(np.floor(_clamp01(energy) * 100.0))
    for _ in range(particle_count):
        alpha = 0.3 + float(rng.random()) * 0.5
        color = palette[int(rng.integers(0, len(palette)))]
        px = float(rng.random() * w)
        py = float(rng.random() * h)
        pr = 1.0 + float(rng.random()) * 4.0
        dist = np.sqrt((xx - px) ** 2 + (yy - py) ** 2)
        _blend(frame, dist <= pr, color, alpha)

    # Layer 4: kick/light flare for stronger transient emphasis.
    if onset_type in ("kick", "percussion") or _clamp01(energy) > 0.6:
        flare_x = w * (0.2 + float(rng.random()) * 0.6)
        flare_y = h * (0.2 + float(rng.random()) * 0.6)
        dist = np.sqrt((xx - flare_x) ** 2 + (yy - flare_y) ** 2)
        t = np.clip(dist / 200.0, 0.0, 1.0)
        a0 = (1.0 - np.clip(t / 0.5, 0.0, 1.0)) * 0.4
        a1 = np.where(t < 0.5, np.clip((t - 0.0) / 0.5, 0.0, 1.0), np.clip((1.0 - t) / 0.5, 0.0, 1.0))
        flare = np.zeros_like(frame)
        flare += np.array([255.0, 255.0, 255.0], dtype=np.float32)[None, None, :] * a0[..., None]
        flare += palette[3][None, None, :] * (a1[..., None] * 0.28)
        frame = np.clip(frame + flare, 0.0, 255.0)

    if glitch:
        # Glitch mode applies channel shifts, scanlines, and speckle artifacts.
        shift_r = int(rng.integers(-10, 11))
        shift_g = int(rng.integers(-14, 15))
        shift_b = int(rng.integers(-8, 9))
        frame[:, :, 0] = np.roll(frame[:, :, 0], shift=shift_r, axis=1)
        frame[:, :, 1] = np.roll(frame[:, :, 1], shift=shift_g, axis=1)
        frame[:, :, 2] = np.roll(frame[:, :, 2], shift=shift_b, axis=0)

        scan = (np.arange(h) % 6) == 0
        frame[scan, :, :] *= 0.55

        speckle_mask = rng.random((h, w)) < (0.01 + 0.04 * _clamp01(energy))
        speckle_count = int(np.count_nonzero(speckle_mask))
        if speckle_count > 0:
            frame[speckle_mask] = rng.integers(0, 255, size=(speckle_count, 3), dtype=np.uint8)

    # Clamp to valid RGB range and write frame to PPM file.
    frame = np.clip(frame, 0.0, 255.0).astype(np.uint8)

    _write_ppm(out_path, frame)


def _detect_frontend_style_events(audio_file: str) -> dict:
    """Offline detector that mirrors frontend onsetDetection.js logic and thresholds."""
    import librosa
    import numpy as np

    # Load mono waveform at fixed sample rate to mirror frontend analysis cadence.
    y, sr = librosa.load(audio_file, sr=22050, mono=True)
    audio_duration = float(librosa.get_duration(y=y, sr=sr) or 0.0)
    if audio_duration <= 0.0:
        return {"audio_duration": 0.0, "onsets": [], "glitches": []}

    fft_size = 512
    hop_length = max(1, int(round(sr / 60.0)))
    stft = np.abs(librosa.stft(y, n_fft=fft_size, hop_length=hop_length, center=False, window="hann"))

    # Approximate analyser.getByteFrequencyData (0-255) on log magnitude.
    log_mag = np.log1p(stft)
    scale = float(np.percentile(log_mag, 99.5) or 1.0)
    if scale <= 1e-9:
        scale = 1.0
    byte_spectra = np.clip((log_mag / scale) * 255.0, 0.0, 255.0).astype(np.uint8)

    frame_count = int(byte_spectra.shape[1]) if byte_spectra.ndim == 2 else 0
    times = (np.arange(frame_count, dtype=np.float64) * float(hop_length) / float(sr)).tolist()

    # Thresholds mirror frontend onset/glitch detector behavior.
    threshold = 0.5
    min_time_between_onsets_ms = 100.0
    min_time_between_glitches_ms = 3500.0
    anomaly_threshold = 2.5
    anomaly_history_size = 60
    kick_threshold = 0.5
    snare_threshold = 0.9

    prev_spectrum = np.zeros((byte_spectra.shape[0],), dtype=np.uint8)
    previous_onset_function = 0.0
    previous_kick_score = 0.0
    previous_snare_score = 0.0
    last_onset_ms = -1e9
    last_glitch_ms = -1e9
    flux_history: list[float] = []
    centroid_history: list[float] = []

    onset_events = []
    glitch_events = []

    for i in range(frame_count):
        now_sec = float(times[i])
        now_ms = now_sec * 1000.0
        spectrum = byte_spectra[:, i]
        if not np.any(spectrum > 0):
            # Reset previous-state values on silent bins.
            prev_spectrum = spectrum.copy()
            previous_onset_function = 0.0
            previous_kick_score = 0.0
            previous_snare_score = 0.0
            continue

        # Compute low/high frequency content, flux, centroid, and energy.
        kick_bin_end = min(10, int(spectrum.shape[0]))
        lfc = 0.0
        for k in range(kick_bin_end):
            magnitude = float(spectrum[k]) / 255.0
            weight = float(kick_bin_end - k)
            lfc += weight * magnitude * magnitude

        hfc = 0.0
        for k in range(int(spectrum.shape[0])):
            magnitude = float(spectrum[k]) / 255.0
            hfc += float(k) * magnitude * magnitude

        flux = 0.0
        diffs = np.maximum(0.0, (spectrum.astype(np.float32) - prev_spectrum.astype(np.float32)) / 255.0)
        flux = float(np.sum(diffs))

        idx = np.arange(spectrum.shape[0], dtype=np.float32)
        mags = spectrum.astype(np.float32) / 255.0
        mag_sum = float(np.sum(mags))
        spectral_centroid = float(np.sum(idx * mags) / mag_sum) if mag_sum > 1e-9 else 0.0
        energy = float(np.sum(mags * mags))

        # Maintain rolling history used by anomaly scoring.
        flux_history.append(flux)
        centroid_history.append(spectral_centroid)
        if len(flux_history) > anomaly_history_size:
            flux_history.pop(0)
        if len(centroid_history) > anomaly_history_size:
            centroid_history.pop(0)

        normalized_lfc = float(lfc / 200.0)
        normalized_hfc = float(hfc / 10000.0)
        normalized_flux = float(flux / 10.0)

        recent_energy = flux_history[-4:-1]
        avg_energy = float(np.mean(recent_energy)) if recent_energy else flux
        energy_ratio = (flux / avg_energy) if avg_energy > 0.001 else 1.0

        diff_count = int(np.count_nonzero(diffs > 0.02))
        total_bins = max(1, int(spectrum.shape[0]))
        onset_bandwidth = float(diff_count) / float(total_bins)

        bandwidth_factor = min(max((onset_bandwidth - 0.05) / 0.15, 0.0), 1.0)
        transient_factor = min(energy_ratio / 2.5, 1.0)
        percussiveness = bandwidth_factor * transient_factor
        tonal_gate = min(max((onset_bandwidth - 0.06) / 0.09, 0.0), 1.0)

        kick_score = (0.4 * normalized_lfc) + (0.2 * normalized_flux) + (0.4 * percussiveness)
        snare_score = (0.3 * normalized_hfc) + (0.3 * normalized_flux) + (0.4 * percussiveness)
        is_kick = kick_score > previous_kick_score and kick_score > kick_threshold
        is_snare = snare_score > previous_snare_score and snare_score > snare_threshold

        raw_onset = (0.2 * normalized_lfc) + (0.15 * normalized_hfc) + (0.35 * normalized_flux) + (0.3 * percussiveness)
        onset_function = raw_onset * tonal_gate
        is_drum = percussiveness > 0.60

        is_onset = (
            (now_ms - last_onset_ms) >= min_time_between_onsets_ms
            and onset_function > previous_onset_function
            and onset_function > threshold
        )
        if is_onset and is_drum:
            last_onset_ms = now_ms
            drum_type = "kick" if is_kick else ("snare" if is_snare else "percussion")
            onset_events.append(
                {
                    "time": now_sec,
                    "strength": float(onset_function),
                    "type": drum_type,
                    "lfc": float(normalized_lfc),
                    "hfc": float(normalized_hfc),
                    "flux": float(normalized_flux),
                    "energy": float(energy),
                    "spectralCentroid": float(spectral_centroid),
                }
            )

        # Glitch detector: large z-score spikes in flux/centroid.
        if (now_ms - last_glitch_ms) >= min_time_between_glitches_ms and len(flux_history) >= 30:
            flux_arr = np.array(flux_history, dtype=np.float64)
            centroid_arr = np.array(centroid_history, dtype=np.float64)
            flux_mean = float(np.mean(flux_arr))
            flux_std = float(np.sqrt(np.mean((flux_arr - flux_mean) ** 2)))
            centroid_mean = float(np.mean(centroid_arr))
            centroid_std = float(np.sqrt(np.mean((centroid_arr - centroid_mean) ** 2)))

            flux_z = ((flux - flux_mean) / flux_std) if flux_std > 0.001 else 0.0
            centroid_z = (abs(spectral_centroid - centroid_mean) / centroid_std) if centroid_std > 0.001 else 0.0
            anomaly_score = max(float(flux_z), float(centroid_z))
            if anomaly_score > anomaly_threshold:
                last_glitch_ms = now_ms
                glitch_events.append({"time": now_sec, "strength": anomaly_score})

        prev_spectrum = spectrum.copy()
        previous_onset_function = float(onset_function)
        previous_kick_score = float(kick_score)
        previous_snare_score = float(snare_score)

    # Return timeline data used by video manifest generation.
    return {
        "audio_duration": audio_duration,
        "onsets": onset_events,
        "glitches": glitch_events,
    }


def _build_concat_manifest_with_onsets(
    *,
    manifest_path: str,
    temp_dir: str,
    frame_paths: list[str],
    audio_file: str,
    fallback_frame_duration: float,
) -> dict:
    """Build an ffmpeg concat manifest with beat/onset-synced frame durations.

    Returns metadata:
      {
        "used_onsets": bool,
        "interval_count": int,
        "audio_duration": float,
      }
    """
    # Metadata returned to caller for logging/telemetry.
    result = {
        "used_onsets": False,
        "interval_count": 0,
        "audio_duration": 0.0,
        "procedural_count": 0,
        "glitch_count": 0,
    }

    if not frame_paths:
        # No frames means no manifest work possible.
        return result

    if audio_file and os.path.exists(audio_file) and os.path.getsize(audio_file) > 0:
        try:
            # Detect onset/glitch events from audio to drive variable frame timing.
            detection = _detect_frontend_style_events(audio_file)
            audio_duration = float(detection.get("audio_duration") or 0.0)
            result["audio_duration"] = max(0.0, audio_duration)

            onsets = detection.get("onsets") or []
            glitches = detection.get("glitches") or []

            if audio_duration > 0.0 and onsets:
                # Build sorted cut points from onsets with minimum separation.
                times: list[float] = [0.0]
                for evt in onsets:
                    ts = float(evt.get("time") or 0.0)
                    if ts <= 0.0 or ts >= audio_duration:
                        continue
                    if ts - times[-1] < 0.02:
                        continue
                    times.append(ts)
                if times[-1] < audio_duration:
                    times.append(audio_duration)

                if len(times) >= 2:
                    result["used_onsets"] = True
                    result["interval_count"] = len(times) - 1

                    segments: list[tuple[str, float]] = []
                    image_idx = 0
                    min_real_image_interval = 0.11

                    onset_idx = 0
                    glitch_idx = 0
                    for idx in range(len(times) - 1):
                        # Each interval maps to one displayed frame (real or procedural).
                        start_t = float(times[idx])
                        end_t = float(times[idx + 1])
                        duration = max(0.02, end_t - start_t)

                        while onset_idx + 1 < len(onsets) and float(onsets[onset_idx + 1].get("time") or 0.0) <= start_t:
                            onset_idx += 1
                        onset_evt = onsets[onset_idx] if onsets else {}

                        has_glitch = False
                        while glitch_idx < len(glitches):
                            gt = float(glitches[glitch_idx].get("time") or 0.0)
                            if gt < start_t:
                                glitch_idx += 1
                                continue
                            if gt < end_t:
                                has_glitch = True
                            break

                        needs_procedural_fallback = duration < min_real_image_interval

                        if has_glitch or needs_procedural_fallback:
                            # Very short/glitchy intervals get procedural frames for continuity.
                            proc_path = os.path.join(temp_dir, f"proc_{idx:06d}.ppm")
                            _generate_procedural_frame(
                                out_path=proc_path,
                                width=640,
                                height=360,
                                energy=float(onset_evt.get("energy") or 0.5),
                                lfc=float(onset_evt.get("lfc") or 0.0),
                                hfc=float(onset_evt.get("hfc") or 0.0),
                                spectral_centroid=float(onset_evt.get("spectralCentroid") or 0.0),
                                onset_type=str(onset_evt.get("type") or "percussion"),
                                glitch=bool(has_glitch),
                                seed=(idx * 1103515245 + 1337) & 0xFFFFFFFF,
                            )
                            segments.append((proc_path, duration))
                            result["procedural_count"] += 1
                            if has_glitch:
                                result["glitch_count"] += 1
                        else:
                            # Normal interval consumes next real hosted image.
                            frame = frame_paths[image_idx % len(frame_paths)]
                            image_idx += 1
                            segments.append((frame, duration))

                    with open(manifest_path, "w", encoding="utf-8") as manifest:
                        # ffmpeg concat requires final file line repeated at the end.
                        for frame, duration in segments:
                            manifest.write(f"file '{_concat_quote(frame)}'\n")
                            manifest.write(f"duration {max(0.02, float(duration)):.5f}\n")
                        manifest.write(f"file '{_concat_quote(segments[-1][0])}'\n")

                    return result
        except Exception as e:
            # Graceful fallback when onset detection fails.
            console.log(f"⚠️ Onset detection unavailable, using fixed frame timing: {e}")

    with open(manifest_path, "w", encoding="utf-8") as manifest:
        # Fallback mode: when onset timing is unavailable, each frame is shown
        # for the same fixed duration to keep output stable and predictable.
        for frame in frame_paths:
            manifest.write(f"file '{_concat_quote(frame)}'\n")
            manifest.write(f"duration {float(fallback_frame_duration):.3f}\n")
        manifest.write(f"file '{_concat_quote(frame_paths[-1])}'\n")

    return result


def _cleanup_pool_video_cache():
    # Drop stale in-memory video blobs older than TTL.
    now = time.time()
    with _pool_video_cache_lock:
        expired = [k for k, v in _pool_video_cache.items() if (now - float(v.get("created_at") or 0)) > _POOL_VIDEO_CACHE_TTL_SECS]
        for key in expired:
            _pool_video_cache.pop(key, None)


def _cache_pool_video(cache_key: str, content: bytes, filename: str):
    # Store generated video bytes for short-term repeat download acceleration.
    with _pool_video_cache_lock:
        _pool_video_cache[cache_key] = {
            "content": content,
            "filename": filename,
            "created_at": time.time(),
        }


def _get_cached_pool_video(cache_key: str) -> Optional[dict]:
    # Purge first, then read current key.
    _cleanup_pool_video_cache()
    with _pool_video_cache_lock:
        return _pool_video_cache.get(cache_key)


def _parse_range_header(range_header: Optional[str], total_size: int) -> Optional[tuple[int, int]]:
    # No Range header means caller should return full content (HTTP 200).
    if not range_header:
        return None
    raw = str(range_header).strip().lower()
    if not raw.startswith("bytes="):
        return None

    # Only support single byte ranges: bytes=start-end.
    value = raw[len("bytes="):]
    if "," in value:
        return None

    start_str, sep, end_str = value.partition("-")
    if sep != "-":
        return None

    if start_str == "":
        # Suffix-range format (bytes=-N) requests the last N bytes.
        try:
            length = int(end_str)
        except Exception:
            return None
        if length <= 0:
            return None
        if length >= total_size:
            return (0, total_size - 1)
        return (total_size - length, total_size - 1)

    try:
        start = int(start_str)
    except Exception:
        return None
    if start < 0 or start >= total_size:
        return None

    if end_str == "":
        end = total_size - 1
    else:
        try:
            end = int(end_str)
        except Exception:
            return None
        if end < start:
            return None
        end = min(end, total_size - 1)

    return (start, end)


def _pool_video_http_response(video_bytes: bytes, filename: str, range_header: Optional[str] = None) -> Response:
    # Validate output payload before crafting HTTP response.
    total = len(video_bytes)
    if total <= 0:
        raise HTTPException(status_code=500, detail="Generated video is empty")

    common_headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
        "Accept-Ranges": "bytes",
    }

    # If no valid range requested, return full file.
    selected = _parse_range_header(range_header, total)
    if not selected:
        headers = {**common_headers, "Content-Length": str(total)}
        return Response(content=video_bytes, media_type="video/mp4", headers=headers)

    # Range request path: serve partial content with RFC-compliant headers.
    start, end = selected
    chunk = video_bytes[start : end + 1]
    headers = {
        **common_headers,
        "Content-Range": f"bytes {start}-{end}/{total}",
        "Content-Length": str(len(chunk)),
    }
    return Response(content=chunk, media_type="video/mp4", status_code=206, headers=headers)


def backfill_all_s3_images_to_db() -> int:
    """
    Single-pass bulk backfill: scan entire S3 prefix once, group by product_id,
    insert all missing rows in one DB session. Returns total rows inserted.
    """
    from s3_service import list_all_objects_under_prefix

    if not IMAGE_POOL_S3_BUCKET:
        console.log("⚠️ No S3 bucket configured, skipping backfill.")
        return 0

    console.log(f"🔍 Scanning S3 bucket {IMAGE_POOL_S3_BUCKET} under prefix {IMAGE_POOL_S3_PREFIX}/ ...")
    all_objects = list_all_objects_under_prefix(IMAGE_POOL_S3_BUCKET, f"{IMAGE_POOL_S3_PREFIX}/")

    if not all_objects:
        console.log("⚠️ No S3 objects found under prefix.")
        return 0

    console.log(f"✅ Found {len(all_objects)} S3 objects. Grouping by product_id ...")

    # Group objects by product_id parsed from key: {prefix}/{product_id}/{hash}.{ext}
    from collections import defaultdict
    grouped: dict[int, list[dict]] = defaultdict(list)
    skipped = 0
    for obj in all_objects:
        key = obj["key"]
        # Expected format: image-pool/1234/abc123def456.jpg
        parts = key.split("/")
        if len(parts) < 3:
            skipped += 1
            continue
        try:
            product_id = int(parts[-2])
        except (ValueError, IndexError):
            skipped += 1
            continue
        grouped[product_id].append(obj)

    console.log(f"📦 Grouped into {len(grouped)} products. Skipped {skipped} malformed keys.")

    content_type_map = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "webp": "image/webp", "gif": "image/gif",
    }

    total_inserted = 0

    with get_db_connection() as conn:
        if not conn:
            console.log("⚠️ No DB connection available.")
            return 0

        with conn.cursor() as cursor:
            for product_id, objects in grouped.items():
                hosted_images = []
                for obj in objects:
                    key = obj["key"]
                    filename = key.rsplit("/", 1)[-1]
                    url_hash = filename.rsplit(".", 1)[0] if "." in filename else filename
                    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "img"
                    content_type = content_type_map.get(ext, "image/jpeg")
                    hosted_url = f"/api/images/file/{product_id}/{url_hash}"

                    hosted_images.append({
                        "url": hosted_url,
                        "urlLarge": hosted_url,
                        "tags": None,
                        "width": 1980,
                        "height": 1280,
                        "lock_id": None,
                        "sourceUrl": None,
                        "storageKey": key,
                        "contentType": content_type,
                        "byteSize": obj["size"],
                        "urlHash": url_hash,
                    })

                if hosted_images:
                    inserted = _db_insert_hosted_images(
                        cursor,
                        product_id,
                        hosted_images,
                        _contains_banned_figure_terms,
                        _hash_url,
                    )
                    total_inserted += inserted

            conn.commit()
            console.log(f"✅ Bulk backfill complete: {total_inserted} rows inserted across {len(grouped)} products.")

    return total_inserted
    
    
def _host_loremflickr_images_to_s3(
    product_id: int,
    images: list,
    *,
    max_retries: int = 3,
    retry_backoff_secs: float = 1.0,
    per_image_delay_secs: float = 0.5,
    download_timeout_secs: Optional[float] = None,
):
    """Download LoremFlickr images and upload to S3, returning hosted image dicts.

    If S3 isn't configured, returns an empty list.
    """
    # Without bucket config, skip hosting and report all as failed.
    if not IMAGE_POOL_S3_BUCKET:
        return [], list(images or [])

    hosted = []
    failed = []
    for img in images:
        source_url = (img.get("url") or "").strip()
        if not source_url:
            continue
        if _contains_banned_figure_terms(img.get("tags")) or _contains_banned_figure_terms(source_url):
            failed.append(img)
            continue
            
        success = False
        for attempt in range(max_retries):
            try:
                # Download original image bytes with bounded timeout/size.
                data, content_type = _download_image_bytes(source_url, timeout_secs=download_timeout_secs)

                rejection = _moderation_rejection_reason(data)
                if rejection:
                    raise ValueError(f"Moderation rejected image: {rejection}")

                url_hash = _hash_bytes(data)
                ext = _ext_from_content_type(content_type)
                storage_key = f"{IMAGE_POOL_S3_PREFIX}/{product_id}/{url_hash}{ext}"

                # Evict old S3 object if this UrlHash already exists with a different key
                # to prevents orphaned S3 objects when a row's StorageKey changes via upsert.
                try:
                    with get_db_connection() as evict_conn:
                        if evict_conn:
                            with evict_conn.cursor() as evict_cursor:
                                evict_cursor.execute(
                                    "SELECT StorageKey FROM ImageGeneration WHERE ProductID = %s AND UrlHash = %s LIMIT 1",
                                    (product_id, url_hash),
                                )
                                old_row = evict_cursor.fetchone()
                                if old_row:
                                    old_key = (old_row.get("StorageKey") or "").strip()
                                    if old_key and old_key != storage_key:
                                        delete_object(IMAGE_POOL_S3_BUCKET, old_key)
                except Exception as evict_err:
                    console.log(f"⚠️ Could not evict old S3 key for ProductID={product_id}: {evict_err}")
                    
                ok = upload_bytes(
                    IMAGE_POOL_S3_BUCKET,
                    storage_key,
                    data,
                    content_type=content_type,
                    cache_control="public, max-age=31536000, immutable",
                    metadata={"product_id": str(product_id), "source": "loremflickr"},
                )
                if not ok:
                    raise Exception("S3 upload_bytes returned False")

                # Store relative URL; we'll absolutize per-request in the endpoint.
                hosted_url = f"/api/images/file/{product_id}/{url_hash}"
                hosted.append(
                    {
                        "url": hosted_url,
                        "urlLarge": hosted_url,
                        "tags": img.get("tags"),
                        "width": img.get("width") or 1980,
                        "height": img.get("height") or 1280,
                        "lock_id": img.get("lock_id"),
                        "sourceUrl": source_url,
                        "storageKey": storage_key,
                        "contentType": content_type,
                        "byteSize": len(data),
                        "urlHash": url_hash,
                    }
                )
                success = True
                if per_image_delay_secs > 0:
                    time.sleep(per_image_delay_secs)  # Add a polite delay to respect rate limits
                break
            except Exception as e:
                # Retry transient failures; stop early for moderation rejects.
                console.log(f"⚠️ Failed to host image for ProductID={product_id} (attempt {attempt + 1}/{max_retries}): {e}")
                if "Moderation rejected image" in str(e):
                    break
                if attempt < max_retries - 1:
                    time.sleep(max(0.0, retry_backoff_secs * (attempt + 1)))  # Simple exponential backoff
        
        if not success:
            failed.append(img)

    return hosted, failed

# The Fast Path (Warmup): Respond to the user immediately with 1 or 2 images 
# it grabs as fast as possible so the animation can start.
def _quick_warmup_s3_images(
    product_id: int,
    song_title: str,
    *,
    mood: Optional[str] = None,
    energy: Optional[float] = None,
    valence: Optional[float] = None,
    tempo: Optional[float] = None,
    danceability: Optional[float] = None,
    acousticness: Optional[float] = None,
    genre: Optional[str] = None,
    max_images: int = 1,
) -> int:
    """Try a tiny synchronous warmup quickly to avoid request timeouts."""
    # Fast-path guard when feature is disabled.
    if not _EXTERNAL_IMAGE_GENERATION_ENABLED:
        return 0

    if max_images <= 0:
        return 0

    # Build a small candidate set and host a minimal number of images synchronously.
    keywords = _build_keywords_from_features(
        mood=mood,
        energy=energy,
        valence=valence,
        tempo=tempo,
        danceability=danceability,
        acousticness=acousticness,
        genre=genre,
        title=song_title,
    )
    images = _generate_loremflickr_urls(keywords, max_images, nocache=True)
    hosted_images, _ = _host_loremflickr_images_to_s3(
        product_id,
        images,
        max_retries=1,
        retry_backoff_secs=0.0,
        per_image_delay_secs=0.0,
        download_timeout_secs=min(2.0, IMAGE_POOL_DOWNLOAD_TIMEOUT_SECS),
    )

    if not hosted_images:
        return 0

    with get_db_connection() as conn:
        if not conn:
            return 0
        with conn.cursor() as cursor:
            inserted = _db_insert_hosted_images(
                cursor,
                product_id,
                hosted_images,
                _contains_banned_figure_terms,
                _hash_url,
            )
            conn.commit()
            return int(inserted or 0)


def ensure_song_image_pool(
    product_id: int,
    song_title: str,
    desired_size: int = _DEFAULT_POOL_SIZE,
    *,
    mood: Optional[str] = None,
    energy: Optional[float] = None,
    valence: Optional[float] = None,
    tempo: Optional[float] = None,
    danceability: Optional[float] = None,
    acousticness: Optional[float] = None,
    genre: Optional[str] = None,
) -> int:
    """Ensure there are at least desired_size S3-hosted images stored for a song."""
    # Global toggle and product ID guardrails.
    if not _EXTERNAL_IMAGE_GENERATION_ENABLED:
        return 0

    if not _is_supported_product_id(product_id):
        return 0

    with get_db_connection() as conn:
        if not conn:
            return 0
        with conn.cursor() as cursor:
            # Before adding images, it checks if the pool is too big. 
            # If the target pool size is 30 but somehow there are 50 images saved, 
            # it explicitly trims those 20 extra images from the database and 
            # deletes the files from S3 to save storage space.
            trimmed_rows, trimmed_keys = _db_trim_song_pool_by_provider_with_keys(cursor, product_id, "s3", int(desired_size))
            if trimmed_rows > 0:
                _delete_s3_keys_best_effort(trimmed_keys)

            # It looks at the database to see how many images this song already has. 
            # If it already has the desired_size (e.g., 30), 
            # it stops and returns instantly and does no work. 
            # If it only has 5, it knows it is missing 25.
            existing = _db_count_images_by_provider(cursor, product_id, "s3")
            missing = max(0, int(desired_size) - existing)
            if missing <= 0:
                # Nothing to add; commit trim changes and return.
                conn.commit()
                return 0

            # Recalculates the average file size and figures out how many bytes are entirely left on the system. 
            # It limits the batch refill specifically to ensure it never exceeds the total storage limit set for the server.
            total_s3_bytes, total_s3_images = _db_s3_storage_stats(cursor)
            remaining_budget_bytes = max(0, int(IMAGE_POOL_MAX_TOTAL_BYTES) - int(total_s3_bytes))
            avg_image_bytes = (
                int(total_s3_bytes // total_s3_images)
                if total_s3_images > 0
                else int(IMAGE_POOL_ESTIMATED_AVG_IMAGE_BYTES)
            )
            budget_limited_missing = min(
                missing,
                _allowed_images_by_budget(remaining_budget_bytes, avg_image_bytes),
            )
            if budget_limited_missing <= 0:
                console.log(
                    f"🧱 Pool refill budget cap reached: total_s3_bytes={total_s3_bytes} limit={IMAGE_POOL_MAX_TOTAL_BYTES}"
                )
                return 0

            keywords = _build_keywords_from_features(
                mood=mood,
                energy=energy,
                valence=valence,
                tempo=tempo,
                danceability=danceability,
                acousticness=acousticness,
                genre=genre,
                title=song_title,
            )
            images = _generate_loremflickr_urls(keywords, budget_limited_missing, nocache=True)

            # Rather than saving standard URLs to the database, it downloads the images to the server's S3 Bucket. 
            # This prevents "link rot" (where the external provider changes the image) and 
            # ensures the images are delivered lightning-fast over a CDN to the React frontend.
            hosted_images, failed_images = _host_loremflickr_images_to_s3(product_id, images)
            inserted = 0
            if hosted_images:
                inserted += _db_insert_hosted_images(
                    cursor,
                    product_id,
                    hosted_images,
                    _contains_banned_figure_terms,
                    _hash_url,
                )

            if failed_images:
                console.log(
                    f"⚠️ Skipped non-hosted images for ProductID={product_id}: failed={len(failed_images)}"
                )

            conn.commit()
            return inserted


def precompute_all_song_image_pools(pool_size: int = _DEFAULT_POOL_SIZE) -> dict:
    """Precompute per-song image pools so the frontend never needs placeholders."""
    
    # Guard clause: If LoremFlickr external generation is toggled off via env var,
    # return immediately with a structured no-op summary so callers can distinguish
    # "disabled" from "failed".
    if not _EXTERNAL_IMAGE_GENERATION_ENABLED:
        return {
            "songs": 0,
            "inserted": 0,
            "skipped": 0,
            "pool_size": int(pool_size),
            "status": "external_generation_disabled",
            "elapsed_seconds": 0.0,
        }

    # Start a wall-clock timer so the summary reports total runtime of the batch job.
    started = time.time()
    
    # Accumulator dictionary tracking progress across all songs. This is returned
    # at the end and also logged periodically during the run.
    summary = {
        "songs": 0,
        "inserted": 0,
        "skipped": 0,
        "underfilled_songs": 0,
        "pool_size": int(pool_size),
        "s3_limit_bytes": int(IMAGE_POOL_MAX_TOTAL_BYTES),
    }

    # Open a single database connection for the entire batch to avoid connection churn.
    with get_db_connection() as conn:
        if not conn:
            return {**summary, "status": "db_unavailable"}

        with conn.cursor() as cursor:
            # Query all library songs (ProductID > 0) that have a title and preview URL,
            # LEFT JOINing AudioFeatures to get mood/energy/genre columns used for keyword generation.
            # iTunes-imported songs (negative IDs) are excluded — they don't get image pools.
            cursor.execute(
                """
                SELECT p.ProductID, p.AlbumTitle,
                       af.Mood, af.Energy, af.Valence, af.Tempo,
                       af.Danceability, af.Acousticness, af.Genre
                FROM Products p
                LEFT JOIN AudioFeatures af ON af.ProductID = p.ProductID
                WHERE p.AlbumTitle IS NOT NULL
                AND p.AlbumTitle != ''
                AND p.file_url IS NOT NULL
                AND p.file_url != ''
                AND p.ProductID > 0
                """
            )
            rows = cursor.fetchall() or []
            
            # Load the current total S3 storage usage (bytes + image count) to enforce the 1.7GB budget cap.
            total_s3_bytes, total_s3_images = _db_s3_storage_stats(cursor)
            budget_exhausted = False

            # Iterate through every eligible library song one at a time.
            for row in rows:
                pid = int(row["ProductID"])
                title = row.get("AlbumTitle") or ""
                
                # Trim Phase: If this song somehow has MORE images than the target pool_size
                # (e.g. pool_size was reduced since last run), delete the excess rows from the
                # database and remove the corresponding S3 objects to reclaim storage.
                trimmed_rows, trimmed_keys = _db_trim_song_pool_by_provider_with_keys(cursor, pid, "s3", int(pool_size))
                if trimmed_rows > 0:
                    _delete_s3_keys_best_effort(trimmed_keys)
                                      
                # Count how many S3-hosted images this song currently has in the database.
                existing = _db_count_images_by_provider(cursor, pid, "s3")
                inserted_for_song = 0

                # Skip Condition: If the pool is already at or above target size, no work needed.
                if existing >= int(pool_size):
                    summary["skipped"] += 1
                else:
                    # Multi-Round Fill Loop: Each round attempts to fetch and host the remaining
                    # missing images. Multiple rounds are needed because some images get rejected
                    # by moderation (face detection, red borders) or fail to download.
                    rounds = 0
                    no_progress_rounds = 0
                    max_rounds_per_song = 8

                    while existing < int(pool_size) and rounds < max_rounds_per_song:
                        rounds += 1
                        
                        # Calculate how many images are still needed to reach the target pool size.
                        missing = max(0, int(pool_size) - existing)

                        # Budget Guard: Calculate how many bytes remain before hitting the global
                        # 1.7GB S3 storage cap, then convert to an image count using the running
                        # average image size. This prevents any single song from blowing the budget.
                        remaining_budget_bytes = max(0, int(IMAGE_POOL_MAX_TOTAL_BYTES) - int(total_s3_bytes))
                        avg_image_bytes = (
                            int(total_s3_bytes // total_s3_images)
                            if total_s3_images > 0
                            else int(IMAGE_POOL_ESTIMATED_AVG_IMAGE_BYTES)
                        )
                        budget_limited_missing = min(
                            missing,
                            _allowed_images_by_budget(remaining_budget_bytes, avg_image_bytes),
                        )
                        
                        # If the budget allows zero more images, stop the entire precompute job.
                        if budget_limited_missing <= 0:
                            budget_exhausted = True
                            summary["status"] = "budget_cap_reached"
                            console.log(
                                f"🧱 Precompute stopped by budget cap: total_s3_bytes={total_s3_bytes} limit={IMAGE_POOL_MAX_TOTAL_BYTES}"
                            )
                            break

                        # Keyword Generation: Translate this song's audio features (mood, energy,
                        # genre, tempo, etc.) into safe Flickr search keywords like "sunset",
                        # "mountain", "aurora" that produce visually relevant nature photographs.
                        keywords = _build_keywords_from_features(
                            mood=row.get("Mood"),
                            energy=row.get("Energy"),
                            valence=row.get("Valence"),
                            tempo=row.get("Tempo"),
                            danceability=row.get("Danceability"),
                            acousticness=row.get("Acousticness"),
                            genre=row.get("Genre"),
                            title=title,
                        )
                        
                        # URL Generation: Build LoremFlickr URLs using the keywords, one keyword
                        # per URL with unique ?lock=N values for image variety.
                        images = _generate_loremflickr_urls(keywords, budget_limited_missing, nocache=True)
                        
                        # Download + Moderate + Upload: For each URL, download the image, run it
                        # through face detection and red-border moderation, then upload passing
                        # images to S3. Returns (hosted_images, failed_images) split.
                        # Uses aggressive settings (1 retry, no backoff, no delay) for batch speed.
                        hosted_images, _failed_images = _host_loremflickr_images_to_s3(
                            pid,
                            images,
                            max_retries=1,
                            retry_backoff_secs=0.0,
                            per_image_delay_secs=0.3,
                        )

                        inserted_round = 0
                        if hosted_images:
                            # Persist the hosted image metadata (S3 key, URL hash, byte size, etc.)
                            # into the ImageGeneration table via INSERT IGNORE (deduped by ProductID + UrlHash).
                            inserted_round += _db_insert_hosted_images(
                                cursor,
                                pid,
                                hosted_images,
                                _contains_banned_figure_terms,
                                _hash_url,
                            )
                            
                            # Update the running in-memory byte/count totals so the budget guard
                            # stays accurate across songs without re-querying the database.
                            for hosted in hosted_images:
                                total_s3_bytes += int(hosted.get("byteSize") or 0)
                                total_s3_images += 1

                        inserted_for_song += int(inserted_round or 0)

                        # Commit after every round so that if the server crashes mid-batch,
                        # all previously inserted images are preserved and recoverable.
                        conn.commit()

                        # Re-check the actual DB count to detect whether this round made progress.
                        # If moderation rejected every image, the count won't have increased.
                        refreshed_existing = _db_count_images_by_provider(cursor, pid, "s3")
                        if refreshed_existing <= existing:
                            no_progress_rounds += 1
                        else:
                            no_progress_rounds = 0
                        existing = refreshed_existing

                        # Stall Detection: If two consecutive rounds produced zero new images
                        # (all rejected by moderation or failed to download), give up on this
                        # song to avoid wasting time on keywords that only return bad images.
                        if no_progress_rounds >= 2:
                            break

                    # If the pool still couldn't reach target size after all rounds,
                    # record it as underfilled for reporting purposes.
                    if existing < int(pool_size):
                        summary["underfilled_songs"] += 1

                # Update aggregate counters regardless of whether the song was skipped or filled.
                summary["songs"] += 1
                summary["inserted"] += int(inserted_for_song or 0)

                # If the global S3 budget was exhausted, stop processing remaining songs entirely.
                if budget_exhausted:
                    break

                # Progress logging every 10 songs so operators can monitor long-running batch jobs.
                if (summary["songs"] % 10) == 0:
                    console.log(
                        f"🖼️ Precompute progress: songs={summary['songs']}/{len(rows)} "
                        f"inserted={summary['inserted']} skipped={summary['skipped']}"
                    )

    # Finalize the summary with storage stats and elapsed time before returning.
    summary["status"] = summary.get("status") or "ok"
    summary["s3_total_bytes"] = int(total_s3_bytes) if 'total_s3_bytes' in locals() else 0
    summary["s3_total_images"] = int(total_s3_images) if 'total_s3_images' in locals() else 0
    summary["elapsed_seconds"] = round(time.time() - started, 2)
    return summary


# ============================================
# API ROUTER COMPOSITION
# ============================================
# Endpoints are split into dedicated modules for readability:
# - image_generation_endpoints.py: search/pool/file/health
# - image_generation_video.py: pool-video export
from .image_generation_endpoints import router as endpoints_router
from .image_generation_video import router as video_router

router.include_router(endpoints_router)
router.include_router(video_router)
