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
from fastapi.responses import StreamingResponse
from typing import Optional
import time
import hashlib
import random
import requests
import threading
from urllib.parse import urlparse

from database import get_db_connection
from utils import console
from config import (
    IMAGE_POOL_S3_BUCKET,
    IMAGE_POOL_S3_PREFIX,
    IMAGE_POOL_MAX_DOWNLOAD_BYTES,
    IMAGE_POOL_DOWNLOAD_TIMEOUT_SECS,
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

_DEFAULT_POOL_SIZE = 80


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


def _db_insert_images(cursor, product_id: int, images: list, provider: str = "loremflickr"):
    if not images:
        return 0

    payload = []
    for img in images:
        url = (img.get("url") or "").strip()
        if not url:
            continue
        payload.append(
            (
                product_id,
                provider,
                (img.get("tags") or None),
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
        payload.append(
            (
                product_id,
                "s3",
                (img.get("tags") or None),
                (img.get("sourceUrl") or None),
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
            
        success = False
        for attempt in range(max_retries):
            try:
                data, content_type = _download_image_bytes(source_url, timeout_secs=download_timeout_secs)
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
    with get_db_connection() as conn:
        if not conn:
            return 0
        with conn.cursor() as cursor:
            existing = _db_count_images_by_provider(cursor, product_id, "s3")
            missing = max(0, int(desired_size) - existing)
            if missing <= 0:
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
            images = _generate_loremflickr_urls(keywords, missing, nocache=True)

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
    started = time.time()
    summary = {"songs": 0, "inserted": 0, "skipped": 0, "pool_size": int(pool_size)}

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
                """
            )
            rows = cursor.fetchall() or []

            # Existing S3 counts in one query (frontend now requests hosted-only pools)
            cursor.execute("SELECT ProductID, COUNT(*) AS cnt FROM ImageGeneration WHERE Provider = 's3' GROUP BY ProductID")
            existing_counts = {int(r["ProductID"]): int(r["cnt"]) for r in (cursor.fetchall() or [])}

            for row in rows:
                pid = int(row["ProductID"])
                title = row.get("AlbumTitle") or ""
                existing = int(existing_counts.get(pid, 0))
                missing = max(0, int(pool_size) - existing)
                if missing <= 0:
                    summary["skipped"] += 1
                    continue

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
                images = _generate_loremflickr_urls(keywords, missing, nocache=True)
                hosted_images, failed_images = _host_loremflickr_images_to_s3(pid, images)

                inserted = 0
                if hosted_images:
                    inserted += _db_insert_hosted_images(cursor, pid, hosted_images)

                if failed_images:
                    inserted += _db_insert_images(cursor, pid, failed_images, provider="loremflickr")

                summary["songs"] += 1
                summary["inserted"] += int(inserted or 0)

            conn.commit()

    summary["status"] = "ok"
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
        for word in title.lower().split():
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
    if not nocache:
        cached = _get_cached(prompt)
        if cached:
            shuffled = list(cached)
            random.shuffle(shuffled)
            return {"images": shuffled[:count], "source": "cache", "prompt": prompt}

    # Filter to only verified keywords
    raw_tags = [w.strip() for w in prompt.lower().split() if len(w.strip()) > 2]
    keywords = [t for t in raw_tags if t in _VERIFIED_KEYWORDS]
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

    # If there's no DB-backed ProductID (e.g., transient client-only song),
    # fall back to the old behavior so we don't break the UI.
    if not product_id or product_id == 0:
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
        images = _generate_loremflickr_urls(keywords, count, nocache=bool(nocache))
        return {
            "images": images,
            "source": "loremflickr_fallback",
            "song_title": song_title,
            "tags_used": keywords,
            "mood": mood,
        }

    # nocache=true means: generate fresh URLs, persist them, and return them.
    if nocache:
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
        images = _generate_loremflickr_urls(keywords, count, nocache=True)
        try:
            with get_db_connection() as conn:
                if conn:
                    with conn.cursor() as cursor:
                        # Keep this path fast: persist URLs only (no S3 download/upload here).
                        _db_insert_images(cursor, product_id, images, provider="loremflickr")
                        conn.commit()
        except Exception as e:
            console.log(f"⚠️ ImageGeneration insert failed for {product_id}: {e}")

        # Also schedule a hosted backfill so subsequent calls return stable /file URLs.
        desired_size = max(_DEFAULT_POOL_SIZE, int(count))
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

        returned = [
            {**img, "url": _absolute_url(request, img.get("url")), "urlLarge": _absolute_url(request, img.get("urlLarge") or img.get("url"))}
            for img in (images or [])
        ]

        return {
            "images": returned,
            "source": "generated_and_persisted",
            "song_title": song_title,
            "tags_used": keywords,
            "mood": mood,
        }

    # Normal path: serve from DB pool (no blocking backfill in-request).
    try:
        images = []
        with get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            with conn.cursor() as cursor:
                images = _db_fetch_images(cursor, product_id, count)

        missing = max(0, int(count) - len(images or []))
        if missing > 0:
            # Schedule a background refill so future calls return stable hosted URLs.
            desired_size = max(_DEFAULT_POOL_SIZE, int(count))
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
                                    images = _db_fetch_images(retry_cursor, product_id, count)
                    missing = max(0, int(count) - len(images or []))
                except Exception as warm_err:
                    console.log(f"⚠️ S3 warmup failed for ProductID={product_id}: {warm_err}")

            # Optional legacy/dev behavior: pad the response with external URLs.
            if pad_external:
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
                generated = _generate_loremflickr_urls(keywords, missing, nocache=True)
                images = (images or []) + (generated or [])

        # Absolutize any relative URLs (e.g. /api/images/file/..)
        images = [
            {**img, "url": _absolute_url(request, img.get("url")), "urlLarge": _absolute_url(request, img.get("urlLarge") or img.get("url"))}
            for img in (images or [])
        ]

        return {
            "images": images,
            "source": (
                "db_pool"
                if missing == 0
                else ("db_pool_padded" if pad_external else "db_pool_short_refill_scheduled")
            ),
            "song_title": song_title,
            "tags_used": [],
            "mood": mood,
        }
    except HTTPException:
        raise
    except Exception as e:
        # IMPORTANT: Don't 500 the UI when MySQL is slow/unavailable.
        # Fall back to on-the-fly generation so thumbnails load.
        console.log(f"❌ Image pool DB error for ProductID={product_id}: {e}")

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
        generated = _generate_loremflickr_urls(keywords, count, nocache=bool(nocache))

        returned = [
            {**img, "url": _absolute_url(request, img.get("url")), "urlLarge": _absolute_url(request, img.get("urlLarge") or img.get("url"))}
            for img in (generated or [])
        ]
        return {
            "images": returned,
            "source": "loremflickr_db_fallback",
            "song_title": song_title,
            "tags_used": keywords,
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


@router.get("/health")
async def image_service_health():
    """Health check for the image generation service."""
    return {
        "status": "ok",
        "cache_size": len(_image_cache),
        "providers": ["loremflickr", "s3"],
        "verified_keywords": len(_VERIFIED_KEYWORDS),
    }
