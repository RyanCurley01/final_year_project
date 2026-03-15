from __future__ import annotations

import hashlib
import time

# Small process-local cache for /search prompt results.
# This is intentionally in-memory only (no Redis/shared state).

# In-memory cache of generated image URL lists.
_image_cache: dict[str, dict] = {}
_CACHE_TTL = 300
_CACHE_MAX_SIZE = 200


def _cache_key(prompt: str) -> str:
    """Return deterministic cache key for prompt text."""
    # Lower+strip ensures semantically equivalent prompts share cache entries.
    return hashlib.md5(prompt.lower().strip().encode()).hexdigest()


def _get_cached(prompt: str):
    """Return cached URL list when key exists and has not expired."""
    key = _cache_key(prompt)
    if key in _image_cache:
        entry = _image_cache[key]
        if time.time() - entry["timestamp"] < _CACHE_TTL:
            return entry["urls"]
        # Remove stale entries lazily during read path.
        del _image_cache[key]
    return None


def _set_cached(prompt: str, urls: list):
    """Store prompt result in cache and evict oldest entry when full."""
    if len(_image_cache) >= _CACHE_MAX_SIZE:
        # FIFO-ish eviction by oldest timestamp to bound memory.
        oldest_key = min(_image_cache, key=lambda k: _image_cache[k]["timestamp"])
        del _image_cache[oldest_key]

    key = _cache_key(prompt)
    _image_cache[key] = {"urls": urls, "timestamp": time.time()}
