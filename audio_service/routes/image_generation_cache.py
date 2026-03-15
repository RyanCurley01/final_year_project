from __future__ import annotations

import hashlib
import time

"""Prompt-result cache used by /api/images/search.

This cache is deliberately process-local and short-lived. It avoids repeated
provider URL generation for identical prompts, but it is not meant to be a
shared source of truth across multiple service instances.
"""

# key(hash(prompt)) -> {"urls": list[dict], "timestamp": unix_seconds}
_image_cache: dict[str, dict] = {}
# Keep entries fresh enough for UI responsiveness while still rotating results.
_CACHE_TTL = 300
# Hard bound so cache growth cannot consume unbounded process memory.
_CACHE_MAX_SIZE = 200


def _cache_key(prompt: str) -> str:
    """Return deterministic cache key for prompt text."""
    # Normalization allows prompt variants such as extra spaces/casing
    # differences to resolve to the same entry.
    return hashlib.md5(prompt.lower().strip().encode()).hexdigest()


def _get_cached(prompt: str):
    """Return cached URL list when key exists and has not expired."""
    key = _cache_key(prompt)
    if key in _image_cache:
        entry = _image_cache[key]
        # TTL check prevents stale provider outputs from being reused too long.
        if time.time() - entry["timestamp"] < _CACHE_TTL:
            return entry["urls"]
        # Lazy cleanup keeps the write path simple and amortizes maintenance.
        del _image_cache[key]
    return None


def _set_cached(prompt: str, urls: list):
    """Store prompt result in cache and evict oldest entry when full."""
    if len(_image_cache) >= _CACHE_MAX_SIZE:
        # Evict oldest timestamp first to keep recent prompts hot.
        oldest_key = min(_image_cache, key=lambda k: _image_cache[k]["timestamp"])
        del _image_cache[oldest_key]

    key = _cache_key(prompt)
    _image_cache[key] = {"urls": urls, "timestamp": time.time()}
