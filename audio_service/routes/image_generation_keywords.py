from __future__ import annotations

from typing import Optional
import random
import re

"""Keyword safety and feature-to-keyword mapping helpers.

This module is the core translation layer from song metadata/audio features to
provider-safe image keywords.

Pipeline summary:
1) Tokenize free text (title/prompt) into normalized tokens.
2) Remove blocked figure/political/child-related terms.
3) Keep only keywords that are whitelisted and verified for provider stability.
4) Blend title hints + mood + genre + numeric features into a final keyword set.
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
    """Normalize arbitrary text into lowercase alphanumeric tokens.

    Example:
    - "Neon-Rain 2024!" -> ["neon", "rain", "2024"]

    Why this exists:
    - Prevent punctuation/case from fragmenting matching logic.
    - Ensure title/prompt terms can be compared against keyword maps.
    """
    if not value:
        return []
    return [t for t in re.findall(r"[a-z0-9]+", str(value).lower()) if len(t) > 1]


def _contains_banned_figure_terms(value: Optional[str]) -> bool:
    """True when any blocked token appears in the provided text.

    Used as a safety gate so prompts/titles containing disallowed people-focused
    terms are not allowed to steer keyword generation.
    """
    if not value:
        return False
    tokens = _tokenize_text(value)
    for token in tokens:
        if token in _BANNED_FIGURE_TERMS:
            return True
    return False


def _safe_prompt_keywords(prompt: Optional[str]) -> list[str]:
    """Keep only unique verified-safe tokens from user prompt text.

    This is a strict filter:
    - token must not be banned
    - token must exist in _VERIFIED_KEYWORDS
    - duplicates are removed while preserving original order
    """
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
    """Infer mood bucket from energy/valence when mood metadata is missing.

    This fallback keeps generation deterministic even when the DB row lacks a
    precomputed mood label.
    """
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
    """Build final deduplicated keyword list from song metadata + audio features.

    How mapping influences image generation:
    - title: injects semantic hints (e.g., "storm" -> rain/cloud/mountain)
    - mood: chooses a baseline visual palette
    - genre: adds style-specific accents
    - energy: controls intensity bucket keywords
    - acousticness/tempo: add targeted modifiers

    The resulting keyword list is later used to build provider image URLs,
    which means these keywords directly control what photographs are fetched.
    """
    # Deletes the danceability variable from memory. It's accepted as a parameter so that the API 
    # doesn't break if a user sends it, but the code doesn't actually use it for anything yet.
    del danceability

    # stores the final sequence of keywords to return
    keywords = []
    
    # keeps track of keywords already added so the same word is not added twice. 
    used = set()

    def _add(kw_list, max_n=3):
        """ params: 
        - kw_list: proposed keywords to add
        - max_n: maximum number of keywords to add from the proposed list, default is 3. 
        """
             
        added = 0
        
        # Loops through all keywords in the proposed list and 
        # only adds keywords that have NOT already been used (to prevent duplicates) 
        # AND that exist in the approved hardcoded list (_VERIFIED_KEYWORDS).
        for kw in kw_list:
            if kw not in used and kw in _VERIFIED_KEYWORDS:
                keywords.append(kw)
                used.add(kw)
                added += 1
                if added >= max_n:
                    break

    # 1) Uses tokenization to extract keywords from prompt title and 
    # turn the title into a clean list of lowercase words (tokens). 
    # e.g., "Neon-Rain 2024!" becomes ["neon", "rain", "2024"].
    # Matches the title words against a predefined dictionary (_title_keyword_map).
    # If a match is found, it adds up to 2 associated image visual keywords to the final list.
    if title:
        title_tokens = _tokenize_text(title)
        if not any(t in _BANNED_FIGURE_TERMS for t in title_tokens):
            for word in title_tokens:
                for key, kws in _title_keyword_map.items():
                    if key in word or word in key:
                        _add(kws, 2)
                        break


    # 2) Mood-derived baseline.
    # Mood contributes the strongest initial theme and always adds up to 3 tags.
    mood_key = (mood or "").lower().strip()
    if not mood_key or mood_key == "unknown":
        e = energy if energy is not None else 0.5
        v = valence if valence is not None else 0.5
        mood_key = _derive_mood(e, v)
       
        
    # Looks up the keywords for the mood_key in _mood_keyword_map. 
    # If the mood isn't found in the map, it defaults to the keywords for "calm".
    # Adds up to 3 keywords from this mood list to the final list.
    mood_kws = _mood_keyword_map.get(mood_key, _mood_keyword_map["calm"])
    _add(mood_kws, 3)


    # 3) Matches the song's genre against a predefined dictionary (_genre_keyword_map).
    # If a match is found, it adds up to 2 mapped visual keywords to the final list.
    if genre:
        genre_lower = genre.lower().strip()
        for g_key, g_kws in _genre_keyword_map.items():
            if g_key in genre_lower or genre_lower in g_key:
                _add(g_kws, 2)
                break

    
    # 4) If the energy feature was provided, it checks where it lands on a scale.
    # High energy > 0.7, medium > 0.4, else low. It then adds up to 2 keywords 
    # from the corresponding intensity bucket.
    if energy is not None:
        if energy > 0.7:
            _add(_energy_keywords["high"], 2)
        elif energy > 0.4:
            _add(_energy_keywords["medium"], 2)
        else:
            _add(_energy_keywords["low"], 2)

    
    # 5) Feature-specific tweaks.
    # If the track is highly acoustic (over 70%), inject a natural, earthy keyword (max 1)
    if acousticness is not None and acousticness > 0.7:
        _add(["forest", "fern", "river"], 1)
        
    # If the track is fast (above 140 BPM), inject an environment keyword that feels sweeping or intense (max 1).   
    if tempo is not None and tempo > 140:
        _add(["sunset", "canyon", "glacier"], 1)

    
    # The image provider might fail if we give it zero keywords. 
    # If the generated list has less than 3 image keywords total, 
    # force-add some generic scenic defaults until we have exactly 3.
    if len(keywords) < 3:
        _add(["abstract", "landscape", "sky", "ocean", "mountain"], 3 - len(keywords))

    
    # Jumbles the order of the generated keywords so if this exact same song is requested 
    # 10 times, the API doesn't get the exact same A, B, C ordered string 
    # every time (which helps generate slightly different images).
    random.shuffle(keywords)
    
    return keywords
