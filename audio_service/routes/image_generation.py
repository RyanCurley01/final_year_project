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

from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import time
import hashlib
import random

from database import get_db_connection
from utils import console

router = APIRouter(prefix="/api/images", tags=["Image Generation"])

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


def _db_count_images(cursor, product_id: int) -> int:
    cursor.execute("SELECT COUNT(*) AS cnt FROM ImageGeneration WHERE ProductID = %s", (product_id,))
    row = cursor.fetchone() or {}
    return int(row.get("cnt") or 0)


def _db_fetch_images(cursor, product_id: int, count: int) -> list:
    """Fetch a slice of images without ORDER BY RAND() to avoid heavy scans."""
    total = _db_count_images(cursor, product_id)
    if total <= 0:
        return []

    limit_n = min(count, total)
    if total <= limit_n:
        offset = 0
    else:
        offset = random.randint(0, total - limit_n)

    cursor.execute(
        """
        SELECT ImageUrl AS url, Width AS width, Height AS height, KeywordTag AS tags
        FROM ImageGeneration
        WHERE ProductID = %s
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
    """Ensure there are at least desired_size images stored for a song."""
    with get_db_connection() as conn:
        if not conn:
            return 0
        with conn.cursor() as cursor:
            existing = _db_count_images(cursor, product_id)
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
            inserted = _db_insert_images(cursor, product_id, images)
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

            # Existing counts in one query
            cursor.execute("SELECT ProductID, COUNT(*) AS cnt FROM ImageGeneration GROUP BY ProductID")
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
                inserted = _db_insert_images(cursor, pid, images)
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
async def get_image_pool(
    song_title: str = Query(..., description="Song title for contextual image retrieval"),
    song_id: Optional[str] = Query(None, description="Song ID for cache keying"),
    count: int = Query(30, ge=1, le=1000, description="Number of images for the pool"),
    nocache: bool = Query(False, description="Skip cache for fresh refill images"),
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
        images = _generate_loremflickr_urls(keywords, count, nocache=True)
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
                        _db_insert_images(cursor, product_id, images)
                        conn.commit()
        except Exception as e:
            console.log(f"⚠️ ImageGeneration insert failed for {product_id}: {e}")

        return {
            "images": images,
            "source": "generated_and_persisted",
            "song_title": song_title,
            "tags_used": keywords,
            "mood": mood,
        }

    # Normal path: serve from DB pool (and backfill if missing).
    try:
        # Backfill up to the default pool size, then serve the requested slice.
        ensure_song_image_pool(
            product_id,
            song_title,
            _DEFAULT_POOL_SIZE,
            mood=mood,
            energy=energy,
            valence=valence,
            tempo=tempo,
            danceability=danceability,
            acousticness=acousticness,
            genre=genre,
        )

        with get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            with conn.cursor() as cursor:
                images = _db_fetch_images(cursor, product_id, count)

        return {
            "images": images,
            "source": "db_pool",
            "song_title": song_title,
            "tags_used": [],
            "mood": mood,
        }
    except HTTPException:
        raise
    except Exception as e:
        console.log(f"❌ Image pool DB error for ProductID={product_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to load image pool")


@router.get("/health")
async def image_service_health():
    """Health check for the image generation service."""
    return {
        "status": "ok",
        "cache_size": len(_image_cache),
        "providers": ["loremflickr"],
        "verified_keywords": len(_VERIFIED_KEYWORDS),
    }
