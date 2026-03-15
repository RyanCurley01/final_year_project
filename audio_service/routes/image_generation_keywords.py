from __future__ import annotations

from typing import Optional
import random
import re

"""Keyword safety and feature-to-keyword mapping helpers.

This module centralizes all rules for converting user/song context into a
restricted, provider-safe keyword list.
"""

_VERIFIED_KEYWORDS = frozenset([
    "landscape", "abstract", "ocean", "forest", "mountain", "rain",
    "sky", "water", "flower", "snow", "cloud", "tree", "river",
    "desert", "fog", "aurora", "rainbow", "waterfall", "butterfly",
    "sunset", "canyon", "cliff", "glacier", "coral", "valley",
    "marsh", "dune", "prairie", "creek", "cavern",
    "iceberg", "tundra", "nebula", "stalactite", "sandstone", "lagoon",
    "fjord", "moss", "icicle", "pebble", "fern", "seashell",
    "driftwood", "geode", "crystal", "cactus",
])

_BANNED_FIGURE_TERMS = frozenset([
    "politic", "political", "politician", "politicians", "government", "governor",
    "senate", "senator", "congress", "congressman", "congresswoman", "president",
    "prime", "minister", "parliament", "election", "campaign", "diplomat", "leader",
    "leaders", "rally", "protest", "state", "statesman", "stateswoman",
    "princess", "queen", "king", "prince", "royal", "royalty", "monarch", "monarchy",
    "duchess", "duke", "crown", "tiara",
    "child", "children", "kid", "kids", "minor", "minors", "toddler", "toddlers",
    "teen", "teens", "teenager", "teenagers", "baby", "babies", "infant", "infants",
    "girl", "girls", "boy", "boys", "schoolgirl", "schoolboy",
])


def _tokenize_text(value: Optional[str]) -> list[str]:
    """Normalize arbitrary text into lowercase alphanumeric tokens."""
    if not value:
        return []
    return [t for t in re.findall(r"[a-z0-9]+", str(value).lower()) if len(t) > 1]


def _contains_banned_figure_terms(value: Optional[str]) -> bool:
    """True when any blocked token appears in the provided text."""
    if not value:
        return False
    tokens = _tokenize_text(value)
    for token in tokens:
        if token in _BANNED_FIGURE_TERMS:
            return True
    return False


def _safe_prompt_keywords(prompt: Optional[str]) -> list[str]:
    """Keep only unique verified-safe tokens from user prompt text."""
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


_mood_keyword_map = {
    "energetic": ["sunset", "canyon", "aurora", "cliff", "nebula", "sandstone", "glacier"],
    "happy": ["flower", "rainbow", "butterfly", "fern", "lagoon", "coral", "aurora", "sky"],
    "calm": ["ocean", "forest", "mountain", "river", "cloud", "waterfall", "fog", "snow", "fjord"],
    "sad": ["rain", "fog", "tundra", "snow", "cloud", "desert", "cavern"],
}

_title_keyword_map = {
    "acid": ["abstract", "aurora"],
    "alien": ["sky", "desert", "nebula"],
    "bass": ["water", "ocean", "river"],
    "dream": ["cloud", "sky", "fog"],
    "ghost": ["fog", "tundra", "snow"],
    "glitch": ["abstract", "geode", "crystal"],
    "night": ["tundra", "nebula", "sky"],
    "space": ["sky", "nebula", "aurora"],
    "dark": ["cavern", "fog", "rain"],
    "light": ["sky", "aurora", "rainbow"],
    "fire": ["sunset", "canyon", "sandstone"],
    "water": ["water", "ocean", "waterfall"],
    "electric": ["aurora", "nebula", "glacier"],
    "cyber": ["abstract", "crystal", "geode"],
    "pulse": ["water", "river", "ocean"],
    "wave": ["ocean", "water", "river"],
    "zen": ["fern", "forest", "flower"],
    "chaos": ["canyon", "cliff", "rain"],
    "crystal": ["snow", "waterfall", "crystal"],
    "shadow": ["cavern", "fog", "cloud"],
    "storm": ["rain", "cloud", "mountain"],
    "echo": ["mountain", "river", "fog"],
    "drift": ["cloud", "river", "driftwood"],
    "void": ["nebula", "sky", "desert"],
    "neon": ["aurora", "abstract", "nebula"],
    "sun": ["sky", "desert", "flower"],
    "moon": ["tundra", "sky", "fog"],
    "rain": ["rain", "fog", "cloud"],
    "ocean": ["ocean", "water", "river"],
    "forest": ["forest", "tree", "fern"],
    "mountain": ["mountain", "snow", "landscape"],
    "flower": ["flower", "fern", "butterfly"],
    "sky": ["sky", "cloud", "aurora"],
    "city": ["abstract", "sandstone", "crystal"],
}

_genre_keyword_map = {
    "electronic": ["abstract", "nebula", "aurora"],
    "techno": ["geode", "crystal", "stalactite"],
    "ambient": ["fog", "cloud", "ocean"],
    "rock": ["canyon", "mountain", "cliff"],
    "pop": ["flower", "rainbow", "butterfly"],
    "classical": ["fern", "forest", "river"],
    "jazz": ["driftwood", "sunset", "fog"],
    "hiphop": ["sandstone", "abstract", "canyon"],
    "metal": ["cavern", "stalactite", "tundra"],
}

_energy_keywords = {
    "high": ["sunset", "canyon", "cliff", "glacier", "nebula"],
    "medium": ["sandstone", "lagoon", "valley", "river", "mountain"],
    "low": ["fog", "cloud", "snow", "moss", "pebble"],
}


def _derive_mood(energy: float, valence: float) -> str:
    """Infer mood bucket from energy/valence when mood metadata is missing."""
    if energy > 0.6 and valence > 0.5:
        return "energetic"
    if valence > 0.5:
        return "happy"
    if energy < 0.4 and valence < 0.5:
        return "sad"
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
    """Build final deduplicated keyword list from song metadata + audio features."""
    # danceability is currently accepted for API compatibility but not used in
    # ranking rules yet.
    del danceability

    keywords = []
    used = set()

    def _add(kw_list, max_n=3):
        # Preserve insertion order while preventing duplicates.
        added = 0
        for kw in kw_list:
            if kw not in used and kw in _VERIFIED_KEYWORDS:
                keywords.append(kw)
                used.add(kw)
                added += 1
                if added >= max_n:
                    break

    # 1) Song title token hints.
    if title:
        title_tokens = _tokenize_text(title)
        if not any(t in _BANNED_FIGURE_TERMS for t in title_tokens):
            for word in title_tokens:
                for key, kws in _title_keyword_map.items():
                    if key in word or word in key:
                        _add(kws, 2)
                        break

    # 2) Mood-derived baseline.
    mood_key = (mood or "").lower().strip()
    if not mood_key or mood_key == "unknown":
        e = energy if energy is not None else 0.5
        v = valence if valence is not None else 0.5
        mood_key = _derive_mood(e, v)
    mood_kws = _mood_keyword_map.get(mood_key, _mood_keyword_map["calm"])
    _add(mood_kws, 3)

    # 3) Genre refinements.
    if genre:
        genre_lower = genre.lower().strip()
        for g_key, g_kws in _genre_keyword_map.items():
            if g_key in genre_lower or genre_lower in g_key:
                _add(g_kws, 2)
                break

    # 4) Energy intensity accents.
    if energy is not None:
        if energy > 0.7:
            _add(_energy_keywords["high"], 2)
        elif energy > 0.4:
            _add(_energy_keywords["medium"], 2)
        else:
            _add(_energy_keywords["low"], 2)

    # 5) Feature-specific tweaks.
    if acousticness is not None and acousticness > 0.7:
        _add(["forest", "fern", "river"], 1)
    if tempo is not None and tempo > 140:
        _add(["sunset", "canyon", "glacier"], 1)

    # Always return a minimally diverse set.
    if len(keywords) < 3:
        _add(["abstract", "landscape", "sky", "ocean", "mountain"], 3 - len(keywords))

    random.shuffle(keywords)
    return keywords
