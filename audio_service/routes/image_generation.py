"""
Image Generation Proxy Route
Proxies image search requests to free AI image APIs (server-side to avoid CORS).
Uses Lexica.art for Stable Diffusion image search and fallbacks.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import httpx
import asyncio
import time
import hashlib
import random

router = APIRouter(prefix="/api/images", tags=["Image Generation"])

# ============================================
# IN-MEMORY CACHE (TTL-based)
# ============================================
_image_cache = {}  # {cache_key: {"urls": [...], "timestamp": float}}
_CACHE_TTL = 3600  # 1 hour TTL for cached results
_CACHE_MAX_SIZE = 200  # Max number of cache entries


def _cache_key(prompt: str) -> str:
    """Generate a cache key from a prompt."""
    return hashlib.md5(prompt.lower().strip().encode()).hexdigest()


def _get_cached(prompt: str):
    """Get cached image URLs for a prompt if still valid."""
    key = _cache_key(prompt)
    if key in _image_cache:
        entry = _image_cache[key]
        if time.time() - entry["timestamp"] < _CACHE_TTL:
            return entry["urls"]
        else:
            del _image_cache[key]
    return None


def _set_cached(prompt: str, urls: list):
    """Cache image URLs for a prompt."""
    # Evict oldest entries if cache is full
    if len(_image_cache) >= _CACHE_MAX_SIZE:
        oldest_key = min(_image_cache, key=lambda k: _image_cache[k]["timestamp"])
        del _image_cache[oldest_key]
    key = _cache_key(prompt)
    _image_cache[key] = {"urls": urls, "timestamp": time.time()}


# ============================================
# LEXICA.ART PROVIDER (Primary - AI Image Search)
# ============================================
async def _fetch_lexica(prompt: str, count: int = 20) -> list:
    """
    Search Lexica.art for AI-generated Stable Diffusion images.
    Lexica indexes millions of SD images with their prompts.
    Free, no API key required, fast response.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                "https://lexica.art/api/v1/search",
                params={"q": prompt},
                headers={
                    "User-Agent": "AudioVisualizerApp/1.0",
                    "Accept": "application/json",
                }
            )
            if response.status_code == 200:
                data = response.json()
                images = data.get("images", [])
                urls = []
                for img in images[:count]:
                    # Prefer srcSmall for faster loading on cards
                    url = img.get("srcSmall") or img.get("src")
                    if url:
                        urls.append({
                            "url": url,
                            "urlLarge": img.get("src", url),
                            "prompt": img.get("prompt", ""),
                            "width": img.get("width", 512),
                            "height": img.get("height", 512),
                        })
                return urls
            else:
                print(f"Lexica API returned status {response.status_code}")
                return []
    except Exception as e:
        print(f"Lexica API error: {e}")
        return []


# ============================================
# LOREM PICSUM PROVIDER (Fallback - Real Photos)
# ============================================
def _generate_picsum_urls(count: int = 20, seed_prefix: str = "music") -> list:
    """
    Generate Lorem Picsum URLs as a fallback.
    These are real photos but reliably served, no API key needed.
    Each URL with a unique seed returns a consistent image.
    """
    urls = []
    for i in range(count):
        seed = f"{seed_prefix}-{i}-{random.randint(1000, 9999)}"
        url = f"https://picsum.photos/seed/{seed}/400/400"
        url_large = f"https://picsum.photos/seed/{seed}/800/800"
        urls.append({
            "url": url,
            "urlLarge": url_large,
            "prompt": f"picsum-{seed}",
            "width": 400,
            "height": 400,
        })
    return urls


# ============================================
# API ENDPOINTS
# ============================================

@router.get("/search")
async def search_images(
    prompt: str = Query(..., description="Search prompt for AI-generated images"),
    count: int = Query(20, ge=1, le=50, description="Number of images to return"),
):
    """
    Search for AI-generated images matching a prompt.
    
    RAG Pipeline:
    1. Check in-memory cache for existing results
    2. Query Lexica.art API for Stable Diffusion images
    3. Fall back to Picsum if Lexica unavailable
    4. Cache results for future requests
    
    Returns array of image objects with url, urlLarge, prompt, width, height.
    """
    # Check cache first
    cached = _get_cached(prompt)
    if cached:
        # Shuffle cached results for variety
        shuffled = list(cached)
        random.shuffle(shuffled)
        return {"images": shuffled[:count], "source": "cache", "prompt": prompt}

    # Try Lexica first (AI-generated Stable Diffusion images)
    images = await _fetch_lexica(prompt, count)

    if images:
        _set_cached(prompt, images)
        return {"images": images, "source": "lexica", "prompt": prompt}

    # Fallback to Picsum (reliable photo source)
    images = _generate_picsum_urls(count, seed_prefix=prompt[:20])
    _set_cached(prompt, images)
    return {"images": images, "source": "picsum", "prompt": prompt}


@router.get("/pool")
async def get_image_pool(
    song_title: str = Query(..., description="Song title for contextual image retrieval"),
    song_id: Optional[int] = Query(None, description="Song ID for cache keying"),
    count: int = Query(30, ge=1, le=50, description="Number of images for the pool"),
):
    """
    RAG-Enhanced Image Pool Generation.
    
    Uses song metadata to construct contextually relevant prompts,
    then retrieves a pool of AI-generated images for onset-triggered display.
    
    MCP Pattern: Acts as a tool that the frontend onset detection calls,
    with song context passed as parameters for retrieval augmentation.
    """
    # RAG Step 1: Extract keywords from song title
    title_lower = song_title.lower().strip()
    keywords = title_lower.split()

    # RAG Step 2: Map keywords to visual themes (knowledge base)
    theme_map = {
        "acid": ["psychedelic neon abstract art", "acid trip colorful digital art", "alien acid landscape surreal"],
        "alien": ["alien landscape sci-fi digital art", "alien world surreal neon", "extraterrestrial abstract colorful"],
        "bass": ["deep bass underwater waves", "bass frequency visualization neon", "deep vibration abstract art"],
        "dream": ["dreamscape surreal fantasy landscape", "ethereal dream clouds abstract", "lucid dream digital art colorful"],
        "ghost": ["spectral ethereal glow abstract", "ghostly translucent digital art", "haunted ethereal mist neon"],
        "glitch": ["glitch art digital corruption", "pixel glitch cyberpunk neon", "broken digital abstract art"],
        "night": ["night sky neon abstract", "dark night cyberpunk cityscape", "nocturnal abstract digital art"],
        "space": ["outer space nebula colorful", "cosmic galaxy abstract art", "space nebula stars digital"],
        "dark": ["dark abstract art moody", "dark digital art shadows neon", "dark surreal landscape"],
        "light": ["light rays abstract colorful", "luminous digital art ethereal", "bright light abstract neon"],
        "fire": ["fire flames abstract digital art", "burning abstract neon colorful", "fire energy visualization"],
        "water": ["underwater abstract digital art", "water waves colorful neon", "ocean abstract visualization"],
        "electric": ["electric lightning abstract neon", "electric energy digital art", "electric pulse visualization"],
        "cyber": ["cyberpunk neon cityscape abstract", "cyber digital art futuristic", "cybernetic abstract neon"],
        "pulse": ["pulse wave abstract neon", "heartbeat pulse visualization", "rhythm pulse digital art"],
        "wave": ["wave abstract digital art colorful", "sound wave visualization neon", "ocean wave abstract art"],
        "zen": ["zen peaceful abstract digital art", "meditative calm abstract", "zen garden surreal art"],
        "chaos": ["chaos abstract digital art colorful", "chaotic energy neon visualization", "entropy abstract art"],
        "crystal": ["crystal abstract digital art", "crystalline structure neon", "crystal formation colorful art"],
        "shadow": ["shadow abstract dark digital art", "shadow play neon contrast", "dark shadow surreal art"],
        "storm": ["storm abstract digital art", "lightning storm neon colorful", "tempest abstract visualization"],
        "echo": ["echo waves abstract digital art", "reverb echo visualization neon", "sound echo abstract art"],
        "drift": ["drifting abstract digital art", "drift movement neon colorful", "flowing drift abstract art"],
        "void": ["void abstract dark digital art", "void space neon minimal", "empty void surreal art"],
        "neon": ["neon lights abstract digital art", "neon glow colorful cyberpunk", "neon abstract visualization"],
        "ted": ["abstract electronic music visualization", "digital art electronic beats", "electronic music colorful abstract"],
        "selected": ["curated electronic music abstract art", "selected works digital visualization", "electronic abstract art"],
    }

    # RAG Step 3: Build contextually augmented prompts
    prompts = set()
    matched_themes = []

    for keyword in keywords:
        for theme_key, theme_prompts in theme_map.items():
            if theme_key in keyword or keyword in theme_key:
                matched_themes.extend(theme_prompts)

    # If no specific themes matched, use generic electronic music themes
    if not matched_themes:
        matched_themes = [
            "abstract electronic music visualization colorful digital art",
            "electronic beats abstract neon visualization",
            "colorful abstract digital art music",
            "vibrant abstract electronic art visualization",
            "dynamic abstract art colorful energy",
        ]

    # Add the song title itself as a prompt modifier
    for theme in matched_themes:
        prompts.add(f"{title_lower} {theme}")
    prompts.add(f"{title_lower} abstract digital art electronic music")
    prompts.add(f"abstract visualization {title_lower} colorful neon")

    # RAG Step 4: Fetch images using augmented prompts (parallel requests)
    all_images = []
    seen_urls = set()

    # Use up to 3 different prompts for variety
    prompt_list = list(prompts)[:3]
    images_per_prompt = max(count // len(prompt_list), 10)

    # Fetch from all prompts in parallel
    tasks = [_fetch_lexica(p, images_per_prompt) for p in prompt_list]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, list):
            for img in result:
                if img["url"] not in seen_urls:
                    seen_urls.add(img["url"])
                    all_images.append(img)

    # If we got enough images, cache and return
    if len(all_images) >= count // 2:
        random.shuffle(all_images)
        _set_cached(f"pool:{song_title}", all_images)
        return {
            "images": all_images[:count],
            "source": "lexica",
            "song_title": song_title,
            "prompts_used": prompt_list,
        }

    # Fallback: supplement with Picsum
    needed = count - len(all_images)
    picsum_images = _generate_picsum_urls(needed, seed_prefix=title_lower[:15])
    all_images.extend(picsum_images)
    random.shuffle(all_images)

    _set_cached(f"pool:{song_title}", all_images)
    return {
        "images": all_images[:count],
        "source": "mixed",
        "song_title": song_title,
        "prompts_used": prompt_list,
    }


@router.get("/health")
async def image_service_health():
    """Health check for the image generation service."""
    return {
        "status": "ok",
        "cache_size": len(_image_cache),
        "providers": ["lexica", "picsum"],
    }
