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

from fastapi import APIRouter, Query, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from typing import Optional
import time
import hashlib
import random
import re
import importlib
import requests
import threading
import shutil
import subprocess
import tempfile
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
from s3_service import upload_bytes, get_object_stream
from config import executor

router = APIRouter(prefix="/api/images", tags=["Image Generation"])

# ============================================
# BACKFILL SCHEDULING (avoid request blocking)
# ============================================
_pool_refill_lock = threading.Lock()
_pool_refill_last_scheduled: dict[int, float] = {}
_POOL_REFILL_MIN_INTERVAL_SECS = 60.0
_EXTERNAL_IMAGE_GENERATION_ENABLED = EXTERNAL_IMAGE_GENERATION_ENABLED
_POOL_VIDEO_CACHE_TTL_SECS = 60 * 20
_pool_video_cache_lock = threading.Lock()
_pool_video_cache: dict[str, dict] = {}


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
    if not _EXTERNAL_IMAGE_GENERATION_ENABLED:
        return

    if product_id <= 0:
        return

    now = time.time()
    with _pool_refill_lock:
        last = _pool_refill_last_scheduled.get(product_id)
        if last and (now - last) < _POOL_REFILL_MIN_INTERVAL_SECS:
            return
        _pool_refill_last_scheduled[product_id] = now

    def _task():
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
            console.log(f"⚠️ Pool refill failed ProductID={product_id}: {e}")

    try:
        executor.submit(_task)
    except Exception as e:
        console.log(f"⚠️ Pool refill scheduling failed ProductID={product_id}: {e}")

# ============================================
# IN-MEMORY CACHE (TTL-based)
# ============================================
_image_cache = {}  # {cache_key: {"urls": [...], "timestamp": float}}
_CACHE_TTL = 300  # 5 min TTL — short so refills get fresh images
_CACHE_MAX_SIZE = 200


def _cache_key(prompt: str) -> str:
    return hashlib.md5(prompt.lower().strip().encode()).hexdigest()


def _get_cached(prompt: str):
    key = _cache_key(prompt)
    if key in _image_cache:
        entry = _image_cache[key]
        if time.time() - entry["timestamp"] < _CACHE_TTL:
            return entry["urls"]
        else:
            del _image_cache[key]
    return None


def _set_cached(prompt: str, urls: list):
    if len(_image_cache) >= _CACHE_MAX_SIZE:
        oldest_key = min(_image_cache, key=lambda k: _image_cache[k]["timestamp"])
        del _image_cache[oldest_key]
    key = _cache_key(prompt)
    _image_cache[key] = {"urls": urls, "timestamp": time.time()}


# ============================================
# VERIFIED SAFE KEYWORDS
# ============================================
# All keywords individually tested against LoremFlickr at 1920x1080
# and confirmed to return HTTP 302 (valid image redirect).
#
# REMOVED (people risk — street photography, tourists, divers, visitors):
#   fire, car, motorcycle, helicopter, train, guitar, piano, sailboat, volcano,
#   city, temple, bridge, candle, night, building, tower, lighthouse, garden,
#   reef, cave, meadow, skyscraper
# KEPT (pure nature/landscape/abstract — virtually zero people):
#   landscape, abstract, ocean, forest, mountain, rain, sky, water, flower,
#   snow, cloud, tree, river, desert, fog, aurora, rainbow, waterfall,
#   butterfly, sunset, canyon, cliff, glacier, coral, valley, marsh, dune,
#   prairie, creek, cavern
# ADDED (pure nature/geology — impossible to have people):
#   iceberg, tundra, nebula, stalactite, sandstone, lagoon, fjord, moss,
#   icicle, pebble, fern, seashell, driftwood, geode, crystal, cactus
#
# Each URL uses exactly ONE keyword — no comma-separated multi-tags.

_VERIFIED_KEYWORDS = frozenset([
    # Pure nature/landscape
    "landscape", "abstract", "ocean", "forest", "mountain", "rain",
    "sky", "water", "flower", "snow", "cloud", "tree", "river",
    "desert", "fog", "aurora", "rainbow", "waterfall", "butterfly",
    "sunset", "canyon", "cliff", "glacier", "coral", "valley",
    "marsh", "dune", "prairie", "creek", "cavern",
    # Pure nature/geology replacements
    "iceberg", "tundra", "nebula", "stalactite", "sandstone", "lagoon",
    "fjord", "moss", "icicle", "pebble", "fern", "seashell",
    "driftwood", "geode", "crystal", "cactus",
])

# Hard safety exclusion list for generated image concepts.
# These are blocked from title/prompt parsing and DB writes.
_BANNED_FIGURE_TERMS = frozenset([
    # Political/public office and governance
    "politic", "political", "politician", "politicians", "government", "governor",
    "senate", "senator", "congress", "congressman", "congresswoman", "president",
    "prime", "minister", "parliament", "election", "campaign", "diplomat", "leader",
    "leaders", "rally", "protest", "state", "statesman", "stateswoman",
    # Royal/princess archetypes
    "princess", "queen", "king", "prince", "royal", "royalty", "monarch", "monarchy",
    "duchess", "duke", "crown", "tiara",
    # Child/minor figures
    "child", "children", "kid", "kids", "minor", "minors", "toddler", "toddlers",
    "teen", "teens", "teenager", "teenagers", "baby", "babies", "infant", "infants",
    "girl", "girls", "boy", "boys", "schoolgirl", "schoolboy",
])


def _tokenize_text(value: Optional[str]) -> list[str]:
    if not value:
        return []
    return [t for t in re.findall(r"[a-z0-9]+", str(value).lower()) if len(t) > 1]


def _contains_banned_figure_terms(value: Optional[str]) -> bool:
    if not value:
        return False
    tokens = _tokenize_text(value)
    for token in tokens:
        if token in _BANNED_FIGURE_TERMS:
            return True
    return False


def _safe_prompt_keywords(prompt: Optional[str]) -> list[str]:
    """Return verified-safe keywords only, excluding blocked figure terms."""
    safe = []
    seen = set()
    for token in _tokenize_text(prompt):
        if token in seen:
            continue
        if token in _BANNED_FIGURE_TERMS:
            continue
        if token in _VERIFIED_KEYWORDS:
            safe.append(token)
            seen.add(token)
    return safe


# ============================================
# LOREM FLICKR PROVIDER (Single Keyword Per URL)
# ============================================

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
    if not keywords:
        keywords = ["abstract", "landscape", "sky"]

    base_lock = random.randint(1, 900000)
    urls = []
    for i in range(count):
        keyword = keywords[i % len(keywords)]
        lock_id = base_lock + i
        base_url = f"https://loremflickr.com/{width}/{height}/{keyword}?lock={lock_id}"
        if nocache:
            base_url += f"&nocache={random.randint(1, 99999999)}"
        urls.append({
            "url": base_url,
            "urlLarge": base_url,
            "tags": keyword,
            "lock_id": lock_id,
            "width": width,
            "height": height,
        })
    return urls


# ============================================
# DB-BACKED PER-SONG IMAGE POOLS
# ============================================

_DEFAULT_POOL_SIZE = max(1, int(IMAGE_POOL_DEFAULT_SIZE))


def _safe_int(value: Optional[str]) -> Optional[int]:
    if value is None:
        return None
    try:
        as_int = int(str(value).strip())
        return as_int
    except Exception:
        return None


def _hash_url(url: str) -> str:
    return hashlib.md5(url.encode("utf-8")).hexdigest()


def _hash_bytes(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def _is_absolute_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        return bool(parsed.scheme) and bool(parsed.netloc)
    except Exception:
        return False


def _absolute_url(request: Request, maybe_relative_url: str) -> str:
    if not maybe_relative_url:
        return maybe_relative_url
    if _is_absolute_url(maybe_relative_url):
        return maybe_relative_url
    # Ensure we generate a fully-qualified URL that matches the API host.
    base = str(request.base_url).rstrip("/")
    if not maybe_relative_url.startswith("/"):
        maybe_relative_url = "/" + maybe_relative_url
    return base + maybe_relative_url


def _download_image_bytes(source_url: str, timeout_secs: Optional[float] = None):
    """Download an image and return (bytes, content_type).

    Enforces a max download size and short timeouts to avoid tying up workers.
    """
    effective_timeout = float(timeout_secs or IMAGE_POOL_DOWNLOAD_TIMEOUT_SECS)
    timeout = (effective_timeout, effective_timeout)
    with requests.get(source_url, stream=True, timeout=timeout, allow_redirects=True) as resp:
        resp.raise_for_status()
        content_type = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if not content_type.startswith("image/"):
            raise ValueError(f"Non-image content-type: {content_type or 'unknown'}")

        chunks = []
        size = 0
        for chunk in resp.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            size += len(chunk)
            if size > IMAGE_POOL_MAX_DOWNLOAD_BYTES:
                raise ValueError("Image too large")
            chunks.append(chunk)
        data = b"".join(chunks)
        if not data:
            raise ValueError("Empty image response")
        return data, content_type


def _decode_image_bgr(data: bytes):
    """Decode image bytes into OpenCV BGR ndarray (or None on failure)."""
    try:
        cv2 = importlib.import_module("cv2")
        import numpy as np

        arr = np.frombuffer(data, dtype=np.uint8)
        if arr.size == 0:
            return None
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return img
    except Exception:
        return None


def _detect_faces_in_image(data: bytes) -> bool:
    """Detect human faces using Haar cascade object detection."""
    try:
        cv2 = importlib.import_module("cv2")
    except Exception:
        # If detector dependency is unavailable, fail open so ingestion doesn't crash.
        return False

    img = _decode_image_bgr(data)
    if img is None:
        return False

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    detector = cv2.CascadeClassifier(cascade_path)
    if detector.empty():
        return False

    faces = detector.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(24, 24),
        flags=cv2.CASCADE_SCALE_IMAGE,
    )
    return len(faces) > 0


def _detect_red_border_in_image(data: bytes) -> bool:
    """Detect strong red border overlays around image edges."""
    img = _decode_image_bgr(data)
    if img is None:
        return False

    h, w = img.shape[:2]
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
    red_mask = (r > 150) & (r > (g + 45)) & (r > (b + 45))
    red_ratio = float(np.count_nonzero(red_mask)) / float(max(1, red_mask.size))
    return red_ratio >= 0.55


def _moderation_rejection_reason(data: bytes) -> Optional[str]:
    if _detect_faces_in_image(data):
        return "face_detected"
    if _detect_red_border_in_image(data):
        return "red_border_detected"
    return None


def _ext_from_content_type(content_type: str) -> str:
    if content_type == "image/jpeg":
        return ".jpg"
    if content_type == "image/png":
        return ".png"
    if content_type == "image/webp":
        return ".webp"
    if content_type == "image/gif":
        return ".gif"
    return ".img"


def _db_count_images(cursor, product_id: int) -> int:
    cursor.execute("SELECT COUNT(*) AS cnt FROM ImageGeneration WHERE ProductID = %s", (product_id,))
    row = cursor.fetchone() or {}
    return int(row.get("cnt") or 0)


def _db_count_images_by_provider(cursor, product_id: int, provider: str) -> int:
    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM ImageGeneration WHERE ProductID = %s AND Provider = %s",
        (product_id, provider),
    )
    row = cursor.fetchone() or {}
    return int(row.get("cnt") or 0)


def _db_trim_song_pool_by_provider(cursor, product_id: int, provider: str, keep_count: int) -> int:
    """Trim older rows so a song keeps at most keep_count images for a provider."""
    keep_n = max(0, int(keep_count))
    cursor.execute(
        """
        DELETE ig
        FROM ImageGeneration ig
        JOIN (
            SELECT ImageGenID
            FROM (
                SELECT ImageGenID,
                       ROW_NUMBER() OVER (PARTITION BY ProductID ORDER BY ImageGenID DESC) AS rn
                FROM ImageGeneration
                WHERE ProductID = %s AND Provider = %s
            ) ranked
            WHERE rn > %s
        ) doomed ON doomed.ImageGenID = ig.ImageGenID
        """,
        (product_id, provider, keep_n),
    )
    return int(cursor.rowcount or 0)


def _db_product_exists(cursor, product_id: int) -> bool:
    cursor.execute("SELECT 1 AS ok FROM Products WHERE ProductID = %s LIMIT 1", (product_id,))
    row = cursor.fetchone() or {}
    return bool(row.get("ok"))


def _db_s3_storage_stats(cursor) -> tuple[int, int]:
    cursor.execute(
        """
        SELECT COALESCE(SUM(ByteSize), 0) AS total_bytes,
               COUNT(*) AS total_images
        FROM ImageGeneration
        WHERE Provider = 's3'
        """
    )
    row = cursor.fetchone() or {}
    return int(row.get("total_bytes") or 0), int(row.get("total_images") or 0)


def _allowed_images_by_budget(remaining_bytes: int, avg_image_bytes: int) -> int:
    avg = max(1, int(avg_image_bytes or 1))
    if remaining_bytes <= 0:
        return 0
    return max(0, int(remaining_bytes // avg))


def _is_library_product_id(product_id: int) -> bool:
    """Library songs use positive ProductIDs; iTunes-imported songs use negative IDs."""
    return int(product_id) > 0


def _db_fetch_images(cursor, product_id: int, count: int) -> list:
    """Fetch a slice of images without ORDER BY RAND() to avoid heavy scans."""
    # Prefer hosted images first so we get stable cached URLs.
    total = _db_count_images(cursor, product_id)
    if total <= 0:
        return []

    # Count the number of S3 images to avoid offset issues
    cursor.execute("SELECT COUNT(*) as s3_count FROM ImageGeneration WHERE ProductID = %s AND Provider = 's3'", (product_id,))
    s3_count = cursor.fetchone().get("s3_count", 0)

    # Only pick from S3 images to ensure they are hosted
    pool_size = s3_count
    if pool_size <= 0:
        return []

    limit_n = min(count, pool_size)
    
    if pool_size <= limit_n:
        offset = 0
    else:
        offset = random.randint(0, pool_size - limit_n)

    cursor.execute(
        """
        SELECT ImageUrl AS url, Width AS width, Height AS height, KeywordTag AS tags
        FROM ImageGeneration
        WHERE ProductID = %s AND Provider = 's3'
        ORDER BY ImageGenID ASC
        LIMIT %s OFFSET %s
        """,
        (product_id, limit_n, offset),
    )
    rows = cursor.fetchall() or []
    return [
        {
            "url": r.get("url"),
            "urlLarge": r.get("url"),
            "tags": r.get("tags"),
            "width": r.get("width"),
            "height": r.get("height"),
        }
        for r in rows
        if r.get("url")
    ]


def _db_fetch_hosted_image_rows(cursor, product_id: int) -> list:
    """Fetch all hosted image metadata rows for a product in stable order."""
    cursor.execute(
        """
        SELECT ImageGenID, StorageKey, ContentType, ImageUrl
        FROM ImageGeneration
        WHERE ProductID = %s AND Provider = 's3'
        ORDER BY ImageGenID ASC
        """,
        (product_id,),
    )
    return cursor.fetchall() or []


def _sanitize_filename(value: str, fallback: str = "image-pool") -> str:
    safe = "".join(ch for ch in (value or "") if ch.isalnum() or ch in ("-", "_", " ")).strip()
    safe = safe.replace(" ", "-")
    return safe[:80] or fallback


def _concat_quote(path: str) -> str:
    return path.replace("'", "'\\''")


def _write_ppm(path: str, rgb):
    """Write an RGB uint8 numpy array to a binary PPM file."""
    import numpy as np

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

    w = max(64, int(width))
    h = max(64, int(height))
    yy, xx = np.mgrid[0:h, 0:w]
    frame = np.zeros((h, w, 3), dtype=np.float32)

    # Frontend behavior: palette index is floor(spectralCentroid * paletteCount) % paletteCount.
    palette_idx = int(np.floor(float(spectral_centroid) * len(palettes))) % len(palettes)
    palette = [_hex_to_rgb(c) for c in palettes[palette_idx]]

    # Background gradient
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

    # Layer 2: geometric primitives (HFC-driven count)
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

    # Layer 3: particles
    particle_count = int(np.floor(_clamp01(energy) * 100.0))
    for _ in range(particle_count):
        alpha = 0.3 + float(rng.random()) * 0.5
        color = palette[int(rng.integers(0, len(palette)))]
        px = float(rng.random() * w)
        py = float(rng.random() * h)
        pr = 1.0 + float(rng.random()) * 4.0
        dist = np.sqrt((xx - px) ** 2 + (yy - py) ** 2)
        _blend(frame, dist <= pr, color, alpha)

    # Layer 4: kick/light flare
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
        # Frontend glitch detection triggers stronger visual distortion bursts.
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

    frame = np.clip(frame, 0.0, 255.0).astype(np.uint8)

    _write_ppm(out_path, frame)


def _detect_frontend_style_events(audio_file: str) -> dict:
    """Offline detector that mirrors frontend onsetDetection.js logic and thresholds."""
    import librosa
    import numpy as np

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
            prev_spectrum = spectrum.copy()
            previous_onset_function = 0.0
            previous_kick_score = 0.0
            previous_snare_score = 0.0
            continue

        # Frontend metrics
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

        # History update (same order as frontend processFrame)
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

        # Frontend glitch anomaly detector
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
    result = {
        "used_onsets": False,
        "interval_count": 0,
        "audio_duration": 0.0,
        "procedural_count": 0,
        "glitch_count": 0,
    }

    if not frame_paths:
        return result

    if audio_file and os.path.exists(audio_file) and os.path.getsize(audio_file) > 0:
        try:
            detection = _detect_frontend_style_events(audio_file)
            audio_duration = float(detection.get("audio_duration") or 0.0)
            result["audio_duration"] = max(0.0, audio_duration)

            onsets = detection.get("onsets") or []
            glitches = detection.get("glitches") or []

            if audio_duration > 0.0 and onsets:
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
                            frame = frame_paths[image_idx % len(frame_paths)]
                            image_idx += 1
                            segments.append((frame, duration))

                    with open(manifest_path, "w", encoding="utf-8") as manifest:
                        for frame, duration in segments:
                            manifest.write(f"file '{_concat_quote(frame)}'\n")
                            manifest.write(f"duration {max(0.02, float(duration)):.5f}\n")
                        manifest.write(f"file '{_concat_quote(segments[-1][0])}'\n")

                    return result
        except Exception as e:
            console.log(f"⚠️ Onset detection unavailable, using fixed frame timing: {e}")

    with open(manifest_path, "w", encoding="utf-8") as manifest:
        # Fallback: fixed-duration slideshow through all pool images.
        for frame in frame_paths:
            manifest.write(f"file '{_concat_quote(frame)}'\n")
            manifest.write(f"duration {float(fallback_frame_duration):.3f}\n")
        manifest.write(f"file '{_concat_quote(frame_paths[-1])}'\n")

    return result


def _cleanup_pool_video_cache():
    now = time.time()
    with _pool_video_cache_lock:
        expired = [k for k, v in _pool_video_cache.items() if (now - float(v.get("created_at") or 0)) > _POOL_VIDEO_CACHE_TTL_SECS]
        for key in expired:
            _pool_video_cache.pop(key, None)


def _cache_pool_video(cache_key: str, content: bytes, filename: str):
    with _pool_video_cache_lock:
        _pool_video_cache[cache_key] = {
            "content": content,
            "filename": filename,
            "created_at": time.time(),
        }


def _get_cached_pool_video(cache_key: str) -> Optional[dict]:
    _cleanup_pool_video_cache()
    with _pool_video_cache_lock:
        return _pool_video_cache.get(cache_key)


def _parse_range_header(range_header: Optional[str], total_size: int) -> Optional[tuple[int, int]]:
    if not range_header:
        return None
    raw = str(range_header).strip().lower()
    if not raw.startswith("bytes="):
        return None

    # Only support single ranges: bytes=start-end
    value = raw[len("bytes="):]
    if "," in value:
        return None

    start_str, sep, end_str = value.partition("-")
    if sep != "-":
        return None

    if start_str == "":
        # Suffix range: bytes=-N
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
    total = len(video_bytes)
    if total <= 0:
        raise HTTPException(status_code=500, detail="Generated video is empty")

    common_headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
        "Accept-Ranges": "bytes",
    }

    selected = _parse_range_header(range_header, total)
    if not selected:
        headers = {**common_headers, "Content-Length": str(total)}
        return Response(content=video_bytes, media_type="video/mp4", headers=headers)

    start, end = selected
    chunk = video_bytes[start : end + 1]
    headers = {
        **common_headers,
        "Content-Range": f"bytes {start}-{end}/{total}",
        "Content-Length": str(len(chunk)),
    }
    return Response(content=chunk, media_type="video/mp4", status_code=206, headers=headers)


def _db_insert_images(cursor, product_id: int, images: list, provider: str = "loremflickr"):
    if not images:
        return 0

    payload = []
    for img in images:
        url = (img.get("url") or "").strip()
        if not url:
            continue
        tags = (img.get("tags") or "").strip()
        if _contains_banned_figure_terms(tags) or _contains_banned_figure_terms(url):
            continue
        payload.append(
            (
                product_id,
                provider,
                (tags or None),
                url,
                _hash_url(url),
                int(img.get("width") or 1980),
                int(img.get("height") or 1280),
                int(img.get("lock_id") or 0) or None,
            )
        )

    if not payload:
        return 0

    cursor.executemany(
        """
        INSERT IGNORE INTO ImageGeneration
            (ProductID, Provider, KeywordTag, ImageUrl, UrlHash, Width, Height, LockId)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        payload,
    )
    return cursor.rowcount


def _db_insert_hosted_images(cursor, product_id: int, images: list):
    """Insert hosted images with S3 storage metadata."""
    if not images:
        return 0

    payload = []
    for img in images:
        url = (img.get("url") or "").strip()
        if not url:
            continue
        tags = (img.get("tags") or "").strip()
        source_url = (img.get("sourceUrl") or "").strip()
        if _contains_banned_figure_terms(tags) or _contains_banned_figure_terms(source_url) or _contains_banned_figure_terms(url):
            continue
        payload.append(
            (
                product_id,
                "s3",
                (tags or None),
                (source_url or None),
                (img.get("storageKey") or None),
                (img.get("contentType") or None),
                int(img.get("byteSize") or 0) or None,
                url,
                (img.get("urlHash") or _hash_url(url)),
                int(img.get("width") or 1980),
                int(img.get("height") or 1280),
                int(img.get("lock_id") or 0) or None,
            )
        )

    if not payload:
        return 0

    cursor.executemany(
        """
        INSERT IGNORE INTO ImageGeneration
            (ProductID, Provider, KeywordTag, SourceUrl, StorageKey, ContentType, ByteSize,
             ImageUrl, UrlHash, Width, Height, LockId)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s,
             %s, %s, %s, %s, %s)
        """,
        payload,
    )
    return cursor.rowcount


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
                data, content_type = _download_image_bytes(source_url, timeout_secs=download_timeout_secs)

                rejection = _moderation_rejection_reason(data)
                if rejection:
                    raise ValueError(f"Moderation rejected image: {rejection}")

                url_hash = _hash_bytes(data)
                ext = _ext_from_content_type(content_type)
                storage_key = f"{IMAGE_POOL_S3_PREFIX}/{product_id}/{url_hash}{ext}"

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
                console.log(f"⚠️ Failed to host image for ProductID={product_id} (attempt {attempt + 1}/{max_retries}): {e}")
                if "Moderation rejected image" in str(e):
                    break
                if attempt < max_retries - 1:
                    time.sleep(max(0.0, retry_backoff_secs * (attempt + 1)))  # Simple exponential backoff
        
        if not success:
            failed.append(img)

    return hosted, failed


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
    if not _EXTERNAL_IMAGE_GENERATION_ENABLED:
        return 0

    if max_images <= 0:
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
            inserted = _db_insert_hosted_images(cursor, product_id, hosted_images)
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
    if not _EXTERNAL_IMAGE_GENERATION_ENABLED:
        return 0

    if not _is_library_product_id(product_id):
        return 0

    with get_db_connection() as conn:
        if not conn:
            return 0
        with conn.cursor() as cursor:
            _db_trim_song_pool_by_provider(cursor, product_id, "s3", int(desired_size))

            existing = _db_count_images_by_provider(cursor, product_id, "s3")
            missing = max(0, int(desired_size) - existing)
            if missing <= 0:
                conn.commit()
                return 0

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

            # Prefer hosting to S3 for stable URLs + browser caching.
            hosted_images, failed_images = _host_loremflickr_images_to_s3(product_id, images)
            inserted = 0
            if hosted_images:
                inserted += _db_insert_hosted_images(cursor, product_id, hosted_images)

            # Fallback: persist original URLs for images that failed hosting.
            if failed_images:
                inserted += _db_insert_images(cursor, product_id, failed_images, provider="loremflickr")

            conn.commit()
            return inserted


def precompute_all_song_image_pools(pool_size: int = _DEFAULT_POOL_SIZE) -> dict:
    """Precompute per-song image pools so the frontend never needs placeholders."""
    if not _EXTERNAL_IMAGE_GENERATION_ENABLED:
        return {
            "songs": 0,
            "inserted": 0,
            "skipped": 0,
            "pool_size": int(pool_size),
            "status": "external_generation_disabled",
            "elapsed_seconds": 0.0,
        }

    started = time.time()
    summary = {
        "songs": 0,
        "inserted": 0,
        "skipped": 0,
        "pool_size": int(pool_size),
        "s3_limit_bytes": int(IMAGE_POOL_MAX_TOTAL_BYTES),
    }

    with get_db_connection() as conn:
        if not conn:
            return {**summary, "status": "db_unavailable"}

        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT p.ProductID, p.AlbumTitle,
                       af.Mood, af.Energy, af.Valence, af.Tempo,
                       af.Danceability, af.Acousticness, af.Genre
                FROM Products p
                LEFT JOIN AudioFeatures af ON af.ProductID = p.ProductID
                WHERE p.AlbumTitle IS NOT NULL
                AND p.AlbumTitle != ''
                AND p.preview_url IS NOT NULL
                AND p.preview_url != ''
                AND p.ProductID > 0
                """
            )
            rows = cursor.fetchall() or []

            # Existing S3 counts in one query (frontend now requests hosted-only pools)
            cursor.execute("SELECT ProductID, COUNT(*) AS cnt FROM ImageGeneration WHERE Provider = 's3' GROUP BY ProductID")
            existing_counts = {int(r["ProductID"]): int(r["cnt"]) for r in (cursor.fetchall() or [])}
            total_s3_bytes, total_s3_images = _db_s3_storage_stats(cursor)

            for row in rows:
                pid = int(row["ProductID"])
                title = row.get("AlbumTitle") or ""
                _db_trim_song_pool_by_provider(cursor, pid, "s3", int(pool_size))
                existing = int(existing_counts.get(pid, 0))
                if existing > int(pool_size):
                    existing = int(pool_size)
                missing = max(0, int(pool_size) - existing)
                if missing <= 0:
                    summary["skipped"] += 1
                    conn.commit()
                    continue

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
                    summary["status"] = "budget_cap_reached"
                    console.log(
                        f"🧱 Precompute stopped by budget cap: total_s3_bytes={total_s3_bytes} limit={IMAGE_POOL_MAX_TOTAL_BYTES}"
                    )
                    break

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
                images = _generate_loremflickr_urls(keywords, budget_limited_missing, nocache=True)
                hosted_images, failed_images = _host_loremflickr_images_to_s3(
                    pid,
                    images,
                    max_retries=2,
                    retry_backoff_secs=0.5,
                    per_image_delay_secs=0.1,
                )

                inserted = 0
                if hosted_images:
                    inserted += _db_insert_hosted_images(cursor, pid, hosted_images)
                    for hosted in hosted_images:
                        total_s3_bytes += int(hosted.get("byteSize") or 0)
                        total_s3_images += 1

                if failed_images:
                    inserted += _db_insert_images(cursor, pid, failed_images, provider="loremflickr")

                summary["songs"] += 1
                summary["inserted"] += int(inserted or 0)

                # Persist incrementally so startup precompute makes visible progress.
                conn.commit()

                if (summary["songs"] % 10) == 0:
                    console.log(
                        f"🖼️ Precompute progress: songs={summary['songs']}/{len(rows)} "
                        f"inserted={summary['inserted']} skipped={summary['skipped']}"
                    )

    summary["status"] = summary.get("status") or "ok"
    summary["s3_total_bytes"] = int(total_s3_bytes) if 'total_s3_bytes' in locals() else 0
    summary["s3_total_images"] = int(total_s3_images) if 'total_s3_images' in locals() else 0
    summary["elapsed_seconds"] = round(time.time() - started, 2)
    return summary


# ============================================
# AUDIO-FEATURE → VERIFIED KEYWORD MAPPING
# ============================================

# Russell's Circumplex Model moods → verified safe keywords only
_mood_keyword_map = {
    "energetic": ["sunset", "canyon", "aurora", "cliff", "nebula", "sandstone", "glacier"],
    "happy":     ["flower", "rainbow", "butterfly", "fern", "lagoon", "coral", "aurora", "sky"],
    "calm":      ["ocean", "forest", "mountain", "river", "cloud", "waterfall", "fog", "snow", "fjord"],
    "sad":       ["rain", "fog", "tundra", "snow", "cloud", "desert", "cavern"],
}

# Song-title keywords → verified safe keywords
_title_keyword_map = {
    "acid":     ["abstract", "aurora"],
    "alien":    ["sky", "desert", "nebula"],
    "bass":     ["water", "ocean", "river"],
    "dream":    ["cloud", "sky", "fog"],
    "ghost":    ["fog", "tundra", "snow"],
    "glitch":   ["abstract", "geode", "crystal"],
    "night":    ["tundra", "nebula", "sky"],
    "space":    ["sky", "nebula", "aurora"],
    "dark":     ["cavern", "fog", "rain"],
    "light":    ["sky", "aurora", "rainbow"],
    "fire":     ["sunset", "canyon", "sandstone"],
    "water":    ["water", "ocean", "waterfall"],
    "electric": ["aurora", "nebula", "glacier"],
    "cyber":    ["abstract", "crystal", "geode"],
    "pulse":    ["water", "river", "ocean"],
    "wave":     ["ocean", "water", "river"],
    "zen":      ["fern", "forest", "flower"],
    "chaos":    ["canyon", "cliff", "rain"],
    "crystal":  ["snow", "waterfall", "crystal"],
    "shadow":   ["cavern", "fog", "cloud"],
    "storm":    ["rain", "cloud", "mountain"],
    "echo":     ["mountain", "river", "fog"],
    "drift":    ["cloud", "river", "driftwood"],
    "void":     ["nebula", "sky", "desert"],
    "neon":     ["aurora", "abstract", "nebula"],
    "sun":      ["sky", "desert", "flower"],
    "moon":     ["tundra", "sky", "fog"],
    "rain":     ["rain", "fog", "cloud"],
    "ocean":    ["ocean", "water", "river"],
    "forest":   ["forest", "tree", "fern"],
    "mountain": ["mountain", "snow", "landscape"],
    "flower":   ["flower", "fern", "butterfly"],
    "sky":      ["sky", "cloud", "aurora"],
    "city":     ["abstract", "sandstone", "crystal"],
}

# Genre → verified safe keywords
_genre_keyword_map = {
    "electronic": ["abstract", "nebula", "aurora"],
    "techno":     ["geode", "crystal", "stalactite"],
    "ambient":    ["fog", "cloud", "ocean"],
    "rock":       ["canyon", "mountain", "cliff"],
    "pop":        ["flower", "rainbow", "butterfly"],
    "classical":  ["fern", "forest", "river"],
    "jazz":       ["driftwood", "sunset", "fog"],
    "hiphop":     ["sandstone", "abstract", "canyon"],
    "metal":      ["cavern", "stalactite", "tundra"],
}

# Energy-level intensity keywords (all verified)
_energy_keywords = {
    "high":   ["sunset", "canyon", "cliff", "glacier", "nebula"],
    "medium": ["sandstone", "lagoon", "valley", "river", "mountain"],
    "low":    ["fog", "cloud", "snow", "moss", "pebble"],
}


def _derive_mood(energy: float, valence: float) -> str:
    """Derive mood from energy and valence using Russell's Circumplex Model."""
    if energy > 0.6 and valence > 0.5:
        return "energetic"
    elif valence > 0.5:
        return "happy"
    elif energy < 0.4 and valence < 0.5:
        return "sad"
    else:
        return "calm"


def _build_keywords_from_features(
    mood: str = None,
    energy: float = None,
    valence: float = None,
    tempo: float = None,
    danceability: float = None,
    acousticness: float = None,
    genre: str = None,
    title: str = None,
) -> list:
    """
    Build a list of verified safe Flickr keywords from audio features.
    Uses song title words as primary differentiator, mood for atmosphere,
    genre for style, and energy/tempo for intensity.
    All output keywords are from the verified safe set only.
    """
    keywords = []
    used = set()

    def _add(kw_list, max_n=3):
        added = 0
        for kw in kw_list:
            if kw not in used and kw in _VERIFIED_KEYWORDS:
                keywords.append(kw)
                used.add(kw)
                added += 1
                if added >= max_n:
                    break

    # 1. Title keywords (primary differentiator — makes each song unique)
    if title:
        title_tokens = _tokenize_text(title)
        if not any(t in _BANNED_FIGURE_TERMS for t in title_tokens):
            for word in title_tokens:
                for key, kws in _title_keyword_map.items():
                    if key in word or word in key:
                        _add(kws, 2)
                        break

    # 2. Mood keywords (atmosphere)
    mood_key = (mood or "").lower().strip()
    if not mood_key or mood_key == "unknown":
        e = energy if energy is not None else 0.5
        v = valence if valence is not None else 0.5
        mood_key = _derive_mood(e, v)
    mood_kws = _mood_keyword_map.get(mood_key, _mood_keyword_map["calm"])
    _add(mood_kws, 3)

    # 3. Genre keywords
    if genre:
        genre_lower = genre.lower().strip()
        for g_key, g_kws in _genre_keyword_map.items():
            if g_key in genre_lower or genre_lower in g_key:
                _add(g_kws, 2)
                break

    # 4. Energy/tempo intensity keywords
    if energy is not None:
        if energy > 0.7:
            _add(_energy_keywords["high"], 2)
        elif energy > 0.4:
            _add(_energy_keywords["medium"], 2)
        else:
            _add(_energy_keywords["low"], 2)

    # 5. Feature-specific modifiers
    if acousticness is not None and acousticness > 0.7:
        _add(["forest", "fern", "river"], 1)
    if tempo is not None and tempo > 140:
        _add(["sunset", "canyon", "glacier"], 1)

    # Ensure at least 3 keywords
    if len(keywords) < 3:
        _add(["abstract", "landscape", "sky", "ocean", "mountain"], 3 - len(keywords))

    random.shuffle(keywords)
    return keywords


# ============================================
# API ENDPOINTS
# ============================================

@router.get("/search")
async def search_images(
    prompt: str = Query(..., description="Search keywords for image retrieval"),
    count: int = Query(20, ge=1, le=1000, description="Number of images to return"),
    nocache: bool = Query(False, description="Skip cache for fresh images"),
):
    """Search for real photographs matching keyword tags via LoremFlickr."""
    if not _EXTERNAL_IMAGE_GENERATION_ENABLED:
        return {
            "images": [],
            "source": "external_generation_disabled",
            "prompt": prompt,
        }

    if not nocache:
        cached = _get_cached(prompt)
        if cached:
            shuffled = list(cached)
            random.shuffle(shuffled)
            return {"images": shuffled[:count], "source": "cache", "prompt": prompt}

    # Filter to only verified keywords
    keywords = _safe_prompt_keywords(prompt)
    if not keywords:
        keywords = ["abstract", "landscape", "sky"]

    images = _generate_loremflickr_urls(keywords, count, nocache=nocache)
    if not nocache:
        _set_cached(prompt, images)
    return {"images": images, "source": "loremflickr", "prompt": prompt}


@router.get("/pool")
def get_image_pool(
    request: Request,
    song_title: str = Query(..., description="Song title for contextual image retrieval"),
    song_id: Optional[str] = Query(None, description="Song ID for cache keying"),
    count: int = Query(30, ge=1, le=1000, description="Number of images for the pool"),
    nocache: bool = Query(False, description="Skip cache for fresh refill images"),
    pad_external: bool = Query(False, description="Pad DB pools with external LoremFlickr URLs to prevent empty responses"),
    mood: Optional[str] = Query(None, description="Song mood (energetic/happy/calm/sad)"),
    energy: Optional[float] = Query(None, ge=0, le=1, description="Energy level 0-1"),
    valence: Optional[float] = Query(None, ge=0, le=1, description="Valence (positivity) 0-1"),
    tempo: Optional[float] = Query(None, description="Tempo in BPM"),
    danceability: Optional[float] = Query(None, ge=0, le=1, description="Danceability 0-1"),
    acousticness: Optional[float] = Query(None, ge=0, le=1, description="Acousticness 0-1"),
    genre: Optional[str] = Query(None, description="Genre from AudioFeatures"),
):
    """
    LoremFlickr Mood-Aware Image Pool Generation.

    Uses ALL cached audio features to build verified Flickr keywords.
    Each URL uses a SINGLE keyword (no comma-separated tags) to avoid HTTP 500.
    Returns unique real photographs — one for every onset detection.

    When nocache=true, bypasses cache and appends cache-busters for fresh URLs.
    Count can go up to 1000 for infinite onset generation.
    """
    product_id = _safe_int(song_id)

    # If there's no DB-backed ProductID, we only serve persisted hosted images.
    if not product_id or product_id == 0:
        return {
            "images": [],
            "source": "invalid_song_id",
            "song_title": song_title,
            "tags_used": [],
            "mood": mood,
        }

    if not _is_library_product_id(int(product_id)):
        return {
            "images": [],
            "source": "library_song_only",
            "song_title": song_title,
            "tags_used": [],
            "mood": mood,
        }

    # Validate ProductID exists so refill attempts don't silently no-op.
    try:
        with get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            with conn.cursor() as cursor:
                if not _db_product_exists(cursor, int(product_id)):
                    return {
                        "images": [],
                        "source": "invalid_song_id_not_found",
                        "song_title": song_title,
                        "tags_used": [],
                        "mood": mood,
                    }
    except HTTPException:
        raise
    except Exception as e:
        console.log(f"❌ Product existence check failed for ProductID={product_id}: {e}")
        return {
            "images": [],
            "source": "db_error",
            "song_title": song_title,
            "tags_used": [],
            "mood": mood,
        }

    # External URL generation is disabled. nocache only affects clients; server still serves DB/S3 pool.
    if nocache:
        try:
            with get_db_connection() as conn:
                if not conn:
                    raise HTTPException(status_code=503, detail="Database connection unavailable")
                with conn.cursor() as cursor:
                    _db_trim_song_pool_by_provider(cursor, int(product_id), "s3", int(_DEFAULT_POOL_SIZE))
                    conn.commit()
                    images = _db_fetch_images(cursor, product_id, count)
            images = [
                {**img, "url": _absolute_url(request, img.get("url")), "urlLarge": _absolute_url(request, img.get("urlLarge") or img.get("url"))}
                for img in (images or [])
            ]
            return {
                "images": images,
                "source": "db_pool_nocache_ignored",
                "song_title": song_title,
                "tags_used": [],
                "mood": mood,
            }
        except HTTPException:
            raise
        except Exception as e:
            console.log(f"❌ Image pool DB error for ProductID={product_id}: {e}")
            return {
                "images": [],
                "source": "db_error",
                "song_title": song_title,
                "tags_used": [],
                "mood": mood,
            }

    # Normal path: serve from DB pool (no blocking backfill in-request).
    try:
        images = []
        with get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            with conn.cursor() as cursor:
                _db_trim_song_pool_by_provider(cursor, int(product_id), "s3", int(_DEFAULT_POOL_SIZE))
                conn.commit()
                images = _db_fetch_images(cursor, product_id, count)

        missing_target = max(0, int(_DEFAULT_POOL_SIZE) - len(images or []))
        if missing_target > 0:
            # Schedule a background refill so future calls return stable hosted URLs.
            desired_size = int(_DEFAULT_POOL_SIZE)
            _schedule_pool_refill(
                product_id=int(product_id),
                song_title=song_title,
                desired_size=int(desired_size),
                mood=mood,
                energy=energy,
                valence=valence,
                tempo=tempo,
                danceability=danceability,
                acousticness=acousticness,
                genre=genre,
            )

            # For tiny requests (thumbnail mode) with no hosted images yet,
            # do a small synchronous warmup so first paint can still render.
            if len(images or []) == 0 and int(count) <= 3:
                try:
                    inserted_now = _quick_warmup_s3_images(
                        int(product_id),
                        song_title,
                        mood=mood,
                        energy=energy,
                        valence=valence,
                        tempo=tempo,
                        danceability=danceability,
                        acousticness=acousticness,
                        genre=genre,
                        max_images=1,
                    )
                    if inserted_now > 0:
                        with get_db_connection() as retry_conn:
                            if retry_conn:
                                with retry_conn.cursor() as retry_cursor:
                                    _db_trim_song_pool_by_provider(retry_cursor, int(product_id), "s3", int(_DEFAULT_POOL_SIZE))
                                    retry_conn.commit()
                                    images = _db_fetch_images(retry_cursor, product_id, count)
                    missing_target = max(0, int(_DEFAULT_POOL_SIZE) - len(images or []))
                except Exception as warm_err:
                    console.log(f"⚠️ S3 warmup failed for ProductID={product_id}: {warm_err}")

            # External padding disabled by design; keep this endpoint S3/DB-only.

        # Absolutize any relative URLs (e.g. /api/images/file/..)
        images = [
            {**img, "url": _absolute_url(request, img.get("url")), "urlLarge": _absolute_url(request, img.get("urlLarge") or img.get("url"))}
            for img in (images or [])
        ]

        return {
            "images": images,
            "source": (
                "db_pool"
                if missing_target == 0
                else "db_pool_short_external_disabled"
                if not _EXTERNAL_IMAGE_GENERATION_ENABLED
                else "db_pool_short_refill_scheduled"
            ),
            "song_title": song_title,
            "tags_used": [],
            "mood": mood,
        }
    except HTTPException:
        raise
    except Exception as e:
        # IMPORTANT: Don't 500 the UI when MySQL is slow/unavailable.
        # External URL generation is disabled; return an empty set.
        console.log(f"❌ Image pool DB error for ProductID={product_id}: {e}")
        return {
            "images": [],
            "source": "db_error",
            "song_title": song_title,
            "tags_used": [],
            "mood": mood,
        }


@router.get("/file/{product_id}/{url_hash}")
def get_hosted_image_file(product_id: int, url_hash: str):
    """Serve a hosted image by stable URL (browser-cacheable)."""
    if not IMAGE_POOL_S3_BUCKET:
        raise HTTPException(status_code=503, detail="S3 bucket not configured")

    # Look up the object key from the DB when available.
    row = {}
    try:
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT StorageKey, ContentType
                        FROM ImageGeneration
                        WHERE ProductID = %s AND UrlHash = %s
                        LIMIT 1
                        """,
                        (int(product_id), str(url_hash)),
                    )
                    row = cursor.fetchone() or {}
    except Exception as e:
        console.log(f"⚠️ Hosted image DB lookup failed for ProductID={product_id}, UrlHash={url_hash}: {e}")

    storage_key = (row or {}).get("StorageKey")

    # DB-less fallback: infer the object key pattern used by hosting.
    candidate_keys: list[str] = []
    if storage_key:
        candidate_keys.append(storage_key)
    else:
        for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".img"):
            candidate_keys.append(f"{IMAGE_POOL_S3_PREFIX}/{int(product_id)}/{str(url_hash)}{ext}")

    obj = None
    for key in candidate_keys:
        obj = get_object_stream(IMAGE_POOL_S3_BUCKET, key)
        if obj:
            break

    if not obj:
        raise HTTPException(status_code=404, detail="Image object missing")

    body, content_type, _content_length = obj
    headers = {
        "Cache-Control": "public, max-age=31536000, immutable",
        "ETag": f'"{url_hash}"',
    }
    return StreamingResponse(body, media_type=(content_type or row.get("ContentType") or "image/jpeg"), headers=headers)


@router.get("/pool-video")
def download_image_pool_video(
    request: Request,
    song_id: int = Query(..., gt=0, description="Song ProductID for hosted pool video export"),
    song_title: str = Query("image-pool", description="Song title used in the downloaded filename"),
    audio_url: Optional[str] = Query(None, description="Optional song audio URL to mux into the video"),
    frame_duration: float = Query(0.45, ge=0.1, le=3.0, description="Seconds each image stays on screen"),
    onset_sync: bool = Query(True, description="When true and audio is available, switch images on detected audio onsets"),
):
    """Create and download an MP4 slideshow containing all hosted pool images for a song.

    If audio_url is provided, the visuals loop to match full audio duration.
    Supports HTTP byte ranges for resumable downloads.
    """
    if not IMAGE_POOL_S3_BUCKET:
        raise HTTPException(status_code=503, detail="S3 bucket not configured")

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise HTTPException(status_code=503, detail="ffmpeg is not available on this server")

    cache_key = hashlib.md5(
        f"v3|{int(song_id)}|{song_title}|{audio_url or ''}|{float(frame_duration):.3f}|{bool(onset_sync)}".encode("utf-8")
    ).hexdigest()
    cached = _get_cached_pool_video(cache_key)
    if cached and cached.get("content"):
        return _pool_video_http_response(
            cached.get("content") or b"",
            cached.get("filename") or f"{_sanitize_filename(song_title)}-image-pool.mp4",
            request.headers.get("range"),
        )

    rows = []
    try:
        with get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            with conn.cursor() as cursor:
                rows = _db_fetch_hosted_image_rows(cursor, int(song_id))
    except HTTPException:
        raise
    except Exception as e:
        console.log(f"❌ Pool video DB lookup failed for ProductID={song_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load image pool metadata")

    if not rows:
        raise HTTPException(status_code=404, detail="No hosted image pool found for this song")

    with tempfile.TemporaryDirectory(prefix=f"pool_video_{int(song_id)}_") as tmp_dir:
        frame_paths: list[str] = []

        for idx, row in enumerate(rows):
            storage_key = (row or {}).get("StorageKey")
            if not storage_key:
                continue

            obj = get_object_stream(IMAGE_POOL_S3_BUCKET, storage_key)
            if not obj:
                continue

            body, content_type, _content_length = obj
            try:
                data = body.read()
            except Exception:
                data = None
            finally:
                try:
                    body.close()
                except Exception:
                    pass

            if not data:
                continue

            content_type = ((row or {}).get("ContentType") or "").strip().lower()
            source_ext = _ext_from_content_type(content_type)
            source_path = os.path.join(tmp_dir, f"source_{idx:05d}{source_ext}")
            with open(source_path, "wb") as frame_file:
                frame_file.write(data)

            normalized_path = os.path.join(tmp_dir, f"frame_{idx:05d}.ppm")
            if _normalize_image_to_ppm(ffmpeg_bin, source_path, normalized_path):
                frame_paths.append(normalized_path)
            else:
                console.log(f"⚠️ Failed to normalize pool image frame ProductID={song_id} idx={idx}")

        if not frame_paths:
            raise HTTPException(status_code=404, detail="Hosted pool images are missing in storage")

        audio_file = ""
        if audio_url:
            audio_file = os.path.join(tmp_dir, "song_audio.bin")
            try:
                timeout = (10, 60)
                with requests.get(audio_url, stream=True, timeout=timeout, allow_redirects=True) as audio_resp:
                    audio_resp.raise_for_status()
                    max_audio_bytes = 150 * 1024 * 1024
                    written = 0
                    with open(audio_file, "wb") as out_audio:
                        for chunk in audio_resp.iter_content(chunk_size=64 * 1024):
                            if not chunk:
                                continue
                            written += len(chunk)
                            if written > max_audio_bytes:
                                raise ValueError("Audio file too large")
                            out_audio.write(chunk)
            except Exception as e:
                console.log(f"⚠️ Pool video audio download failed ProductID={song_id}: {e}")
                audio_file = ""

        concat_file = os.path.join(tmp_dir, "frames.txt")
        manifest_meta = {
            "used_onsets": False,
            "interval_count": 0,
            "audio_duration": 0.0,
        }
        if onset_sync and audio_file and os.path.exists(audio_file) and os.path.getsize(audio_file) > 0:
            manifest_meta = _build_concat_manifest_with_onsets(
                manifest_path=concat_file,
                temp_dir=tmp_dir,
                frame_paths=frame_paths,
                audio_file=audio_file,
                fallback_frame_duration=float(frame_duration),
            )
        else:
            manifest_meta = _build_concat_manifest_with_onsets(
                manifest_path=concat_file,
                temp_dir=tmp_dir,
                frame_paths=frame_paths,
                audio_file="",
                fallback_frame_duration=float(frame_duration),
            )

        silent_video_file = os.path.join(tmp_dir, "pool_video_silent.mp4")
        build_cmd = [
            ffmpeg_bin,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            concat_file,
            "-vsync",
            "vfr",
            "-vf",
            "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            silent_video_file,
        ]

        try:
            proc = subprocess.run(build_cmd, capture_output=True, text=True, timeout=180, check=False)
        except subprocess.TimeoutExpired:
            raise HTTPException(status_code=504, detail="Video generation timed out")

        if proc.returncode != 0 or not os.path.exists(silent_video_file):
            console.log(
                f"❌ ffmpeg pool video generation failed ProductID={song_id}: "
                f"returncode={proc.returncode} stderr={proc.stderr[-1200:] if proc.stderr else ''}"
            )
            raise HTTPException(status_code=500, detail="Failed to generate image pool video")

        final_video_file = silent_video_file

        if audio_file and os.path.exists(audio_file) and os.path.getsize(audio_file) > 0:
                with_audio_file = os.path.join(tmp_dir, "pool_video_with_audio.mp4")
                mux_cmd = [
                    ffmpeg_bin,
                    "-y",
                    "-stream_loop",
                    "-1",
                    "-i",
                    silent_video_file,
                    "-i",
                    audio_file,
                    "-map",
                    "0:v:0",
                    "-map",
                    "1:a:0",
                    "-c:v",
                    "libx264",
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-shortest",
                    "-movflags",
                    "+faststart",
                    with_audio_file,
                ]

                try:
                    mux_proc = subprocess.run(mux_cmd, capture_output=True, text=True, timeout=240, check=False)
                    if mux_proc.returncode == 0 and os.path.exists(with_audio_file):
                        final_video_file = with_audio_file
                        if manifest_meta.get("used_onsets"):
                            console.log(
                                f"🎬 Pool video onset-sync ProductID={song_id} "
                                f"intervals={manifest_meta.get('interval_count')} "
                                f"audio_secs={manifest_meta.get('audio_duration'):.2f} "
                                f"procedural={manifest_meta.get('procedural_count')} "
                                f"glitch={manifest_meta.get('glitch_count')}"
                            )
                    else:
                        console.log(
                            f"⚠️ Pool video mux failed ProductID={song_id}: "
                            f"returncode={mux_proc.returncode} stderr={mux_proc.stderr[-1200:] if mux_proc.stderr else ''}"
                        )
                except subprocess.TimeoutExpired:
                    console.log(f"⚠️ Pool video mux timeout ProductID={song_id}")

        with open(final_video_file, "rb") as video_file:
            video_bytes = video_file.read()

    filename = f"{_sanitize_filename(song_title)}-image-pool.mp4"
    _cache_pool_video(cache_key, video_bytes, filename)
    return _pool_video_http_response(video_bytes, filename, request.headers.get("range"))


@router.get("/health")
async def image_service_health():
    """Health check for the image generation service."""
    return {
        "status": "ok",
        "cache_size": len(_image_cache),
        "providers": ["loremflickr", "s3"],
        "verified_keywords": len(_VERIFIED_KEYWORDS),
    }
