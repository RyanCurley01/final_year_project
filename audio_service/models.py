# audio_service/models.py
from pydantic import BaseModel
from typing import List, Optional

# EXECUTION ORDER: Models definition. Imported by routes/services.

class UserInteractionRequest(BaseModel):
    """Request to record a user interaction"""
    account_id: int
    product_id: int | str
    interaction_type: str  # 'play', 'preview', 'pause', 'purchase', 'wishlist', 'view', 'click'
    duration_seconds: Optional[int] = None
    completion_percentage: Optional[float] = None  # 0.0‑1.0 how much of the track was played
    engagement_score: Optional[float] = None        # Computed engagement metric
    device_type: Optional[str] = None               # 'desktop', 'mobile', 'tablet'
    session_id: Optional[str] = None

class AudioFeatures(BaseModel):
    """Audio features extracted from browser or uploaded file"""
    tempo: Optional[float] = None
    effective_tempo: Optional[float] = None  # Tempo adjusted by playback rate
    playback_rate: Optional[float] = None    # Current playback speed (0.1x - 2.0x)
    energy: Optional[float] = None
    danceability: Optional[float] = None
    valence: Optional[float] = None
    acousticness: Optional[float] = None
    # Extended features for full 11D similarity matching
    spectral_centroid: Optional[float] = None
    spectral_rolloff: Optional[float] = None
    zero_crossing_rate: Optional[float] = None
    instrumentalness: Optional[float] = None
    loudness: Optional[float] = None
    speechiness: Optional[float] = None

    class Config:
        extra = 'ignore'

class RealtimeRecommendationRequest(BaseModel):
    """Request for real-time audio similarity recommendations"""
    current_product_id: int
    audio_features: AudioFeatures
    account_id: Optional[int] = None
    session_id: str
    limit: int = 5

class AudioSimilarityResult(BaseModel):
    """Single audio similarity result"""
    product_id: int | str
    similarity_score: float
    tempo_match: float
    energy_match: float
    mood_match: float
    danceability_match: float
    dance_match: Optional[float] = None # Alias for frontend compatibility
    genre_match: bool
    reason: str
    
    # Raw features (for frontend visualization)
    tempo: Optional[float] = None
    energy: Optional[float] = None
    valence: Optional[float] = None
    danceability: Optional[float] = None
    acousticness: Optional[float] = None
    instrumentalness: Optional[float] = None
    speechiness: Optional[float] = None
    
    # Metadata fields
    trackName: Optional[str] = None
    artistName: Optional[str] = None
    albumTitle: Optional[str] = None
    collectionName: Optional[str] = None
    artworkUrl100: Optional[str] = None
    previewUrl: Optional[str] = None
    fileUrl: Optional[str] = None
    albumCoverImageUrl: Optional[str] = None
    price: Optional[float] = None
    albumPrice: Optional[float] = None

class ITunesSong(BaseModel):
    """iTunes song with extracted features"""
    trackId: int
    trackName: str
    artistName: str
    collectionName: Optional[str] = None
    artworkUrl100: Optional[str] = None
    previewUrl: Optional[str] = None
    trackPrice: Optional[float] = None
    primaryGenreName: Optional[str] = None
    trackTimeMillis: Optional[int] = None

class SearchSong(BaseModel):
    """Generic song model for Search/Discover (handles Database IDs and iTunes IDs)"""
    trackId: str | int  # Allow both string (e.g., 'db-1') and int IDs
    trackName: str
    artistName: str
    collectionName: Optional[str] = None
    artworkUrl100: Optional[str] = None
    previewUrl: Optional[str] = None
    trackPrice: Optional[float] = None
    primaryGenreName: Optional[str] = None
    trackTimeMillis: Optional[int] = None
    audio_features: Optional[AudioFeatures] = None  # Live audio features for this song

    class Config:
        extra = 'ignore'

class SearchSimilarityRequest(BaseModel):
    """Request for finding similar songs in Search context"""
    target_song: SearchSong
    comparison_songs: List[SearchSong]
    limit: int = 10

class ArtistSimilarityRequest(BaseModel):
    """Request for finding similar songs from the same artist"""
    artist_name: str
    target_song: ITunesSong
    artist_songs: List[ITunesSong]
    limit: int = 20

class ArtistSimilarSong(BaseModel):
    """Similar song from the same artist with ML-computed similarity"""
    trackId: int
    trackName: str
    artistName: str
    collectionName: Optional[str] = None
    artworkUrl100: Optional[str] = None
    previewUrl: Optional[str] = None
    trackPrice: Optional[float] = None
    similarity_score: float
    tempo: float
    energy: float
    valence: float
    danceability: float
    acousticness: float
    tempo_match: float
    energy_match: float
    mood_match: float
    dance_match: float
    match_reason: str
    ml_algorithm: str

class SearchSimilarSong(BaseModel):
    """Similar song for Search context with ML-computed similarity"""
    trackId: str | int
    trackName: str
    artistName: str
    collectionName: Optional[str] = None
    artworkUrl100: Optional[str] = None
    previewUrl: Optional[str] = None
    trackPrice: Optional[float] = None
    similarity_score: float
    tempo: float
    energy: float
    valence: float
    danceability: float
    acousticness: float
    tempo_match: float
    energy_match: float
    mood_match: float
    dance_match: float
    match_reason: str
    ml_algorithm: str

class UnifiedRecommendationRequest(BaseModel):
    """
    Unified request for recommendations from various parts of the application.
    Handles logic for different sources (TopCharts, Discover, Search, etc.)
    """
    source: str  # 'top_charts', 'similar_songs', 'discover_page', 'search_component'
    current_product_id: int | str
    preview_url: Optional[str] = None
    limit: int = 5
    audio_features: Optional[AudioFeatures] = None
    candidates: Optional[List[SearchSong]] = None

class MidiTargetRequest(BaseModel):
    """Request for MIDI-driven target-feature recommendations.
    The frontend sends the desired audio feature profile (set by physical knobs)
    and the backend returns the closest songs from the cache."""
    target_features: dict  # e.g. {"energy": 0.8, "valence": 0.3, "tempo": 0.6, ...}
    limit: int = 10
    source: str = 'midi_explorer'  # allows candidate filtering
    allowed_ids: Optional[List[int]] = None  # restrict candidates to these ProductIDs


class MelodyNoteEvent(BaseModel):
    """Single played MIDI note event used for melody matching."""
    note: int
    velocity: Optional[int] = 100
    ts: Optional[int] = None


class MelodyFinderRequest(BaseModel):
    """Request for contour-aware melody matching from played MIDI notes."""
    notes: List[MelodyNoteEvent]
    allowed_ids: Optional[List[int]] = None
    candidate_ids: Optional[List[int]] = None
    limit: int = 1
    similar_limit: int = 6

class LibraryMatchRequest(BaseModel):
    """Request to match external songs against the internal library (cached products)"""
    candidates: List[SearchSong]
    target_ids: Optional[List[int]] = None # Optional list of specific library IDs to compare against
    limit: int = 50 # Max songs to process at once

class LibraryMatchResult(BaseModel):
    """Result of matching an external song to the library"""
    input_track_id: str | int
    matched_product_id: Optional[str | int] = None
    similarity_score: float = 0.0
    tempo_match: float = 0.0
    energy_match: float = 0.0
    mood_match: float = 0.0
    dance_match: float = 0.0
    matched_product_name: Optional[str] = None # Optional valid if cache supports it

    class Config:
        extra = 'ignore'
