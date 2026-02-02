# audio_service/models.py
from pydantic import BaseModel
from typing import List, Optional

# EXECUTION ORDER: Models definition. Imported by routes/services.

class UserInteractionRequest(BaseModel):
    """Request to record a user interaction"""
    account_id: int
    product_id: int
    interaction_type: str  # 'play', 'preview', 'pause', 'purchase', 'wishlist', 'view', 'click'
    duration_seconds: Optional[int] = None
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

class RealtimeRecommendationRequest(BaseModel):
    """Request for real-time audio similarity recommendations"""
    current_product_id: int
    audio_features: AudioFeatures
    account_id: Optional[int] = None
    session_id: str
    limit: int = 5

class AudioSimilarityResult(BaseModel):
    """Single audio similarity result"""
    product_id: int
    similarity_score: float
    tempo_match: float
    energy_match: float
    mood_match: float
    danceability_match: float
    genre_match: bool
    reason: str

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
