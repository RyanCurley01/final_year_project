from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import os
from dotenv import load_dotenv
import pymysql
from contextlib import contextmanager
import boto3
from urllib.parse import urlparse, unquote
import httpx
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics.pairwise import cosine_similarity
import tempfile
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Load environment variables
load_dotenv()

# Thread pool for audio analysis
# Increased workers to 15 to handle parallel downloads and analysis faster
executor = ThreadPoolExecutor(max_workers=15)

app = FastAPI(
    title="Audio Feature Similarity Service",
    description="Real-time audio-visual recommendations with multi-dimensional feature analysis",
    version="2.0.0"
)

# CORS middleware for frontend integration
# Include both local and potential Codespaces origins
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
    "http://127.0.0.1:3000",
    # Production - Vercel (main domain)
    "https://final-year-project-two-wine.vercel.app",
    # Production - Railway (allow all Railway subdomains)
]

# Add Codespaces origins if running in Codespaces
if os.getenv('CODESPACES') == 'true':
    codespace_name = os.getenv('CODESPACE_NAME')
    domain = os.getenv('GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN', 'preview.app.github.dev')
    if codespace_name:
        allowed_origins.extend([
            f"https://{codespace_name}-5173.{domain}",
            f"https://{codespace_name}-3000.{domain}"
        ])

# Production CORS configuration - Restricted to specific frontend domains
# Use allow_origin_regex to support Railway dynamic subdomains AND Vercel preview deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,  # Explicit allowed origins
    allow_origin_regex=r"https://[\w-]+\.(up\.railway\.app|vercel\.app)",  # Railway + Vercel production domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache for audio features - loaded once at startup to avoid repeated DB queries
audio_features_cache: Dict[int, Dict] = {}
cache_loaded: bool = False

# Database configuration
DB_CONFIG = {
    'host': os.getenv('MYSQL_HOST', os.getenv('DB_HOST', 'host.docker.internal')),
    'port': int(os.getenv('MYSQL_PORT', os.getenv('DB_PORT', '3306'))),
    'user': os.getenv('MYSQL_USER', os.getenv('DB_USER', 'root')),
    'password': os.getenv('MYSQL_PASSWORD', os.getenv('MYSQL_ROOT_PASSWORD', os.getenv('DB_PASSWORD'))),
    'database': os.getenv('MYSQL_DATABASE', os.getenv('DB_NAME', 'Game_Store_System')),
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor,
    'connect_timeout': 3,  # Fast timeout to avoid blocking
    'read_timeout': 5,
    'write_timeout': 5
}

# S3 Configuration for presigned URLs
S3_CONFIG = {
    'bucket_name': os.getenv('AWS_S3_BUCKET_NAME', 'game-and-music-files'),
    'region': os.getenv('AWS_REGION', 'eu-west-1'),
    'access_key': os.getenv('AWS_ACCESS_KEY_ID'),
    'secret_key': os.getenv('AWS_SECRET_ACCESS_KEY'),
    'url_expiration': 3600  # URLs valid for 1 hour
}

# Initialize S3 client with Signature V4 (required for eu-west-1 and most regions)
s3_client = None
try:
    if S3_CONFIG['access_key'] and S3_CONFIG['secret_key']:
        from botocore.config import Config
        
        # Configure S3 client with Signature V4 and proper endpoint
        s3_config = Config(
            signature_version='s3v4',
            s3={'addressing_style': 'virtual'}
        )
        
        s3_client = boto3.client(
            's3',
            region_name=S3_CONFIG['region'],
            aws_access_key_id=S3_CONFIG['access_key'],
            aws_secret_access_key=S3_CONFIG['secret_key'],
            config=s3_config
        )
        print(f"✅ S3 client initialized for presigned URLs (region: {S3_CONFIG['region']}, signature: v4)")
    else:
        print("⚠️  AWS credentials not found. Presigned URLs will not be generated.")
except Exception as e:
    print(f"⚠️  Failed to initialize S3 client: {e}")
    s3_client = None

def generate_presigned_url(s3_url: str) -> str:
    """
    Generate a presigned URL for an S3 object.
    
    Args:
        s3_url: Full S3 URL (e.g., https://bucket.s3.region.amazonaws.com/key)
    
    Returns:
        Presigned URL or original URL if presigning fails
    """
    if not s3_url or not s3_client:
        return s3_url
    
    try:
        # Extract the S3 key from the URL
        # Format: https://bucket.s3.region.amazonaws.com/path/to/file
        parsed = urlparse(s3_url)
        key = parsed.path.lstrip('/')
        
        # URL decode the key (database has URL-encoded paths, S3 keys have literal characters)
        key = unquote(key)
        
        # Generate presigned URL
        presigned_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': S3_CONFIG['bucket_name'],
                'Key': key
            },
            ExpiresIn=S3_CONFIG['url_expiration']
        )
        
        return presigned_url
    except Exception as e:
        print(f"Error generating presigned URL for {s3_url}: {e}")
        return s3_url  # Return original URL as fallback

@contextmanager
def get_db_connection():
    """Context manager for database connections with automatic cleanup"""
    connection = None
    try:
        connection = pymysql.connect(**DB_CONFIG)
        yield connection
    except pymysql.Error as e:
        print(f"Database connection error: {e}")
        yield None
    finally:
        if connection:
            connection.close()

@app.on_event("startup")
async def startup_cache():
    """Load audio features cache on startup"""
    global audio_features_cache, cache_loaded
    
    # Load audio features into cache for fast recommendations
    # Retry connection if database isn't ready yet
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            with get_db_connection() as conn:
                if conn:
                    with conn.cursor() as cursor:
                        sql = """
                            SELECT 
                                ProductID,
                                Tempo,
                                Energy,
                                Valence,
                                Danceability,
                                Acousticness,
                                Genre
                            FROM AudioFeatures
                            WHERE Tempo IS NOT NULL
                            AND Energy IS NOT NULL
                        """
                        cursor.execute(sql)
                        results = cursor.fetchall()
                        
                        # Sets the database rows data to the dictionary keys
                        for row in results:
                            audio_features_cache[row['ProductID']] = {
                                'id': row['ProductID'],
                                'tempo': row['Tempo'],
                                'energy': row['Energy'],
                                'valence': row['Valence'],
                                'danceability': row['Danceability'],
                                'acousticness': row['Acousticness'],
                                'genre': row['Genre']
                            }
                        
                        cache_loaded = True
                        print(f"✅ Cached {len(audio_features_cache)} audio features for fast recommendations")
                        return  # Success - exit retry loop
        except Exception as e:
            print(f"⚠️ Attempt {attempt + 1}/{max_retries} - Failed to load audio features cache: {e}")
            if attempt < max_retries - 1:
                print(f"   Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
            else:
                # Last attempt failed - log warning but don't crash
                print(f"❌ Could not load audio features cache after {max_retries} attempts")
                print(f"   Service will start but similarity will be slower (real-time analysis)")
                cache_loaded = False

@app.get("/")
async def root():
    return {
        "service": "Audio Feature Similarity Service",
        "status": "running",
        "cache_loaded": cache_loaded,
        "cached_products": len(audio_features_cache)
    }

@app.get("/health")
async def health_check():
    # Check database connectivity
    db_status = "disconnected"
    audio_features_count = 0
    with get_db_connection() as conn:
        if conn:
            try:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT COUNT(*) as count FROM AudioFeatures")
                    result = cursor.fetchone()
                    audio_features_count = result['count'] if result else 0
                    db_status = "connected"
            except Exception as e:
                db_status = f"error: {str(e)}"
    
    return {
        "status": "healthy",
        "database_status": db_status,
        "audio_features_in_db": audio_features_count,
        "cache_loaded": cache_loaded,
        "cached_products": len(audio_features_cache)
    }

# ============================================
# TOP PLAYED SONGS ENDPOINT (from UserInteractions)
# ============================================

@app.get("/api/songs/top-played")
async def get_top_played_songs(limit: int = 5):
    """
    Get top played songs based on play count from UserInteractions table.
    Returns songs ranked by number of 'play' interactions.
    
    Args:
        limit: Maximum number of songs to return (default: 5)
    """
    try:
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    # Joins Products and UserInteractions tables to show most played songs
                    # Renames columns to variable names for the Python dictionary
                    sql = """
                        SELECT 
                            p.ProductID as productId,
                            p.AlbumTitle as albumTitle,
                            p.albumCoverImageUrl,
                            p.file_url as fileUrl,
                            p.preview_url as previewUrl,
                            p.AlbumPrice as albumPrice,
                            COUNT(ui.InteractionID) as playCount
                        FROM Products p
                        LEFT JOIN UserInteractions ui ON p.ProductID = ui.ProductID 
                            AND ui.InteractionType = 'play'
                        WHERE p.AlbumTitle IS NOT NULL 
                            AND p.AlbumTitle != 'Selected Electronic Works'
                            AND p.file_url IS NOT NULL
                        GROUP BY p.ProductID, p.AlbumTitle, p.albumCoverImageUrl, 
                                 p.file_url, p.preview_url, p.AlbumPrice
                        ORDER BY playCount DESC, p.AlbumTitle ASC
                        LIMIT %s
                    """
                    cursor.execute(sql, (limit,))
                    results = cursor.fetchall()
                    
                    # Map database table (with presigned URLs) to array variables so variables can be used directly in frontend
                    songs = []
                    for row in results:
                        songs.append({
                            "productId": row['productId'],
                            "albumTitle": row['albumTitle'],
                            "albumCoverImageUrl": generate_presigned_url(row['albumCoverImageUrl']),
                            "fileUrl": generate_presigned_url(row['fileUrl']),
                            "previewUrl": generate_presigned_url(row['previewUrl']) if row['previewUrl'] else None,
                            "albumPrice": float(row['albumPrice']) if row['albumPrice'] else 0.5,
                            "playCount": row['playCount']
                        })
                    
                    return {
                        "status": "success",
                        "data": songs,
                        "count": len(songs)
                    }
            else:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        print(f"Error fetching top played songs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================
# RECORD USER INTERACTION ENDPOINT
# ============================================

class UserInteractionRequest(BaseModel):
    """Request to record a user interaction"""
    account_id: int
    product_id: int
    interaction_type: str  # 'play', 'preview', 'pause', 'purchase', 'wishlist', 'view', 'click'
    duration_seconds: Optional[int] = None
    session_id: Optional[str] = None

@app.post("/api/interactions/record")
async def record_interaction(interaction: UserInteractionRequest):
    """
    Record a user interaction with a product (e.g., play, preview, purchase)
    This tracks user behavior for analytics and recommendations
    """
    try:
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    # Maps the object models fields to the database columns so the interaction type of a product can be recorded
                    # Adds the new row to the UserInteractions table so a new interaction can keep being recorded
                    sql = """
                        INSERT INTO UserInteractions 
                        (AccountID, ProductID, InteractionType, DurationSeconds, SessionID)
                        VALUES (%s, %s, %s, %s, %s)
                    """
                    cursor.execute(sql, (
                        interaction.account_id,
                        interaction.product_id,
                        interaction.interaction_type,
                        interaction.duration_seconds,
                        interaction.session_id
                    ))
                    conn.commit()
                    
                    return {
                        "status": "success",
                        "message": f"Recorded {interaction.interaction_type} interaction for product {interaction.product_id}",
                        "interaction_id": cursor.lastrowid
                    }
            else:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
    except Exception as e:
        print(f"Error recording interaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ============================================
# REAL-TIME AUDIO RECOMMENDATION ENDPOINTS
# ============================================

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

# Manual "Heuristic" Logic for discover pages songs for speed as all database songs are always cached
# so building numpy matrices and running scikit-learn models is unnsecessary overhead here.
@app.post("/api/audio/realtime-recommendations")
async def get_realtime_recommendations(request: RealtimeRecommendationRequest):
    """
    Get real-time product recommendations based on audio features
    Uses euclidean distance in feature space for similarity
    Production-ready with comprehensive audio feature matching
    OPTIMIZED: Uses in-memory cache for sub-50ms response times
    """
    try:
        recommendations = []
        
        # Require cached audio features - no fallback data
        if not cache_loaded or not audio_features_cache:
            raise HTTPException(status_code=503, detail="Audio features cache not loaded. Database connection required.")
        
        products = [
            product for pid, product in audio_features_cache.items() 
            if pid != request.current_product_id
        ]
        print(f"✅ Using cached features for {len(products)} products")
                        
        
        # Sets whatever audio features are available from the 
        # request as the current audio features of the currently playing song
        if request.audio_features.effective_tempo is not None:
            current_tempo = request.audio_features.effective_tempo
        elif request.audio_features.tempo is not None:
            rate = request.audio_features.playback_rate if request.audio_features.playback_rate else 1.0
            current_tempo = request.audio_features.tempo * rate
            
        current_energy = request.audio_features.energy if request.audio_features.energy is not None else 0.5
        current_valence = request.audio_features.valence if request.audio_features.valence is not None else 0.5
        current_danceability = request.audio_features.danceability if request.audio_features.danceability is not None else 0.5
        current_acousticness = request.audio_features.acousticness if request.audio_features.acousticness is not None else 0.1
        
        playback_rate = request.audio_features.playback_rate if request.audio_features.playback_rate is not None else 1.0
        print(f"🎵 Calculating similarity with tempo: {current_tempo} BPM (effective_tempo: {request.audio_features.effective_tempo}, base_tempo: {request.audio_features.tempo}, playback rate: {playback_rate}x)")
        
        
        for product in products:
            if product["id"] == request.current_product_id:
                continue
            
            # Tempo: Uses a ratio comparison (min/max) so that 60 vs 120 BPM is a 50% match
            product_tempo = product["tempo"]
            if current_tempo > 0 and product_tempo > 0:
                tempo_ratio = min(current_tempo, product_tempo) / max(current_tempo, product_tempo)
                tempo_match = tempo_ratio  # Direct ratio gives better results
            else:
                tempo_match = 0
            

            # Subtracts the current audio feature of the currently playing song 
            # from the cached database audio feature to get a difference
            # to be minused from 1 to get a similarity score of (1 = identical or 0 = completely different)

            # Energy similarity
            energy_diff = abs(product["energy"] - current_energy)
            energy_match = max(0, 1 - energy_diff)
            
            # Valence (mood) similarity
            valence_diff = abs(product["valence"] - current_valence)
            mood_match = max(0, 1 - valence_diff)
            
            # Danceability similarity
            dance_diff = abs(product.get("danceability", 0.5) - current_danceability)
            dance_match = max(0, 1 - dance_diff)
            
            # Acousticness similarity
            acoustic_diff = abs(product.get("acousticness", 0.1) - current_acousticness)
            acoustic_match = max(0, 1 - acoustic_diff)
            

            # Weights applied to each similarity score
            # Energy and tempo weights are hightest for perceived similarity
            similarity = (
                tempo_match * 0.25 +      # Tempo match weight
                energy_match * 0.35 +     # Energy match weight (highest)
                mood_match * 0.20 +       # Mood/valence weight
                dance_match * 0.15 +      # Danceability weight
                acoustic_match * 0.05     # Acousticness weight
            )

            
            # Genre bonus (same genre gets small boost)
            if product["genre"] == "Electronic":
                similarity = min(1.0, similarity + 0.05)
            
            # Max functions chooses ONE tuple based on it's highest similarity score
            dominant_feature = max(
                [("tempo", tempo_match), ("energy", energy_match), ("mood", mood_match)],

                # Uses the lambda function to get the second item in the tuple
                # for determining the maximum similarity score of an audio feature 
                # for choosing the correct reason
                key=lambda x: x[1]
            )
            
            # If any feature is the highest, generate reason with that feature
            if dominant_feature[0] == "tempo":
                reason = f"Matching rhythm ({product['tempo']} BPM)"
            elif dominant_feature[0] == "energy":
                reason = f"Similar intensity ({product['energy']:.2f}) and vibe"
            else:
                reason = f"Comparable mood"


            recommendations.append(AudioSimilarityResult(
                product_id=product["id"],
                similarity_score=round(similarity, 3), # Makes the result strictly between 0.000 and 1.000.
                tempo_match=round(tempo_match, 3),
                energy_match=round(energy_match, 3),
                mood_match=round(mood_match, 3),
                danceability_match=round(dance_match, 3),
                genre_match=product["genre"] == "Electronic",
                reason=reason
            ))
        
        # Sorts the recommendend products by similarity score of the current song 
        # in descending order with a limit of 5
        recommendations.sort(key=lambda x: x.similarity_score, reverse=True)
        recommendations = recommendations[:request.limit]
        
        # recommendations dictionary is automatically converted into JSON by FastAPI 
        # and sent as the HTTP response for the frontend
        return {
            "recommendations": recommendations,
            "session_id": request.session_id,
            "current_product_id": request.current_product_id,
            "algorithm": "multi-dimensional-audio-similarity",
            "features_analyzed": ["tempo", "energy", "valence", "danceability", "acousticness"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {str(e)}")


# ============================================
# ML-BASED ITUNES SIMILARITY SERVICE
# ============================================

# iTunes API configuration from environment
ITUNES_API_BASE_URL = os.getenv('ITUNES_API_BASE_URL', 'https://itunes.apple.com')

# Cache for extracted iTunes audio features
itunes_features_cache: Dict[int, Dict] = {}

# Trained feature scaler for normalization (will be fit on first use)
feature_scaler = None

# To extract audio features from iTunes preview URLs using librosa
def extract_audio_features_from_preview(audio_url: str, track_id: int) -> Optional[Dict]:
    """
    Extract audio features from iTunes preview URL using librosa.
    Uses industry-standard audio analysis for tempo, energy, etc.
    Returns features in Spotify-like format for compatibility.
    """
    try:
        # Validate URL format
        parsed_url = urlparse(audio_url)
        path = parsed_url.path.lower()
        
        # Skip non-audio files (ZIP, etc.)
        if path.endswith('.zip') or path.endswith('.rar') or path.endswith('.7z'):
            print(f"⚠️ Skipping audio analysis for archive file: {audio_url}")
            return None

        import librosa
        
        # Download the preview audio
        # Download the preview audio with longer timeout for S3 presigned URLs
        try:
            response = httpx.get(audio_url, timeout=15.0, follow_redirects=True)
            if response.status_code != 200:
                print(f"⚠️ Failed to download preview for track {track_id}: {response.status_code}")
                return None
        except httpx.TimeoutException:
            print(f"⚠️ Timeout downloading preview for track {track_id}")
            return None
        except Exception as e:
            print(f"⚠️ Network error downloading preview for track {track_id}: {e}")
            return None
        
        # Save to temp file and load with librosa
        with tempfile.NamedTemporaryFile(suffix='.m4a', delete=False) as tmp_file:
            tmp_file.write(response.content)
            tmp_path = tmp_file.name
        
        try:
            # Load audio file
            y, sr = librosa.load(tmp_path, sr=22050, mono=True, duration=30)
            
            # Extract tempo (BPM) using beat tracking
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            tempo = float(tempo) if hasattr(tempo, '__float__') else float(tempo[0]) if len(tempo) > 0 else 120.0
            
            # Extract energy (RMS energy normalized to 0-1)
            rms = librosa.feature.rms(y=y)[0]
            energy = float(np.mean(rms) / np.max(rms)) if np.max(rms) > 0 else 0.5
            energy = min(1.0, max(0.0, energy * 2))  # Scale to 0-1 range
            
            # Extract spectral features for valence estimation
            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
            spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
            
            # Valence estimation (brightness/positivity)
            valence = float(np.mean(spectral_centroid) / sr)
            valence = min(1.0, max(0.0, valence * 4))
            
            # Danceability - combination of tempo stability and beat strength
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
            danceability = float(np.mean(pulse))
            danceability = min(1.0, max(0.0, danceability))
            
            # Acousticness - ratio of low frequency to total energy
            spec = np.abs(librosa.stft(y))
            low_freq_energy = np.mean(spec[:int(spec.shape[0] * 0.1), :])
            total_energy = np.mean(spec)
            acousticness = float(low_freq_energy / total_energy) if total_energy > 0 else 0.3
            acousticness = min(1.0, max(0.0, acousticness * 2))
            
            features = {
                'track_id': track_id,
                'tempo': round(tempo, 1),
                'energy': round(energy, 3),
                'valence': round(valence, 3),
                'danceability': round(danceability, 3),
                'acousticness': round(acousticness, 3),
            }
            
            print(f"✅ Extracted features for track {track_id}: tempo={tempo:.1f}, energy={energy:.2f}")
            return features
            
        finally:
            os.unlink(tmp_path)
            
    except ImportError as e:
        print(f"❌ librosa required but not available: {e}")
        raise HTTPException(status_code=503, detail="Audio analysis library (librosa) not available")
    except Exception as e:
        print(f"❌ Error extracting audio features for track {track_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Audio feature extraction failed: {e}")


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

@app.get("/api/itunes/search")
async def search_itunes(term: str, limit: int = 200, media: str = "music", entity: str = "song"):
    """Proxy endpoint for iTunes Search API."""
    try:
        itunes_url = f"{ITUNES_API_BASE_URL}/search"
        params = {"term": term, "limit": limit, "media": media, "entity": entity}
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(itunes_url, params=params)
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="iTunes API error")
            
            return response.json()
            
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="iTunes API timeout")
    except Exception as e:
        print(f"❌ iTunes search error: {e}")
        raise HTTPException(status_code=500, detail=f"Error searching iTunes: {str(e)}")


# ============================================
# ML SAME-ARTIST SIMILARITY ENDPOINT
# Using K-Nearest Neighbors with Cosine Similarity
# ============================================

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


# This function uses the Machine Learning technique called Content-Based Filtering for 
# mathematically comparing the actual audio characteristics of the songs. Machine Learning logic
# used here because the audio qualities vary wildly compared to the curated database. 
# ML techniques like MinMaxScaler (Normalization) and cosine similarity are essential here to prevent 
# one loud song from breaking the calculations.
@app.post("/api/ml/artist-similarity")
async def compute_artist_similarity(request: ArtistSimilarityRequest):
    """
    ML-based similarity computation for songs within the same artist.
    Uses K-Nearest Neighbors with cosine similarity in normalized feature space.
    
    This is a real industry-standard ML algorithm:
    1. Extract/estimate audio features for all artist songs
    2. Normalize features using MinMaxScaler for fair comparison
    3. Compute cosine similarity between target song and all other songs
    4. Return top K most similar songs ranked by similarity score
    
    The algorithm uses 5-dimensional feature vectors:
    - Tempo (BPM, normalized to 0-1 range)
    - Energy (0-1)
    - Valence/Mood (0-1)
    - Danceability (0-1)
    - Acousticness (0-1)
    """
    from sklearn.preprocessing import MinMaxScaler
    from sklearn.metrics.pairwise import cosine_similarity
    
    try:
        skipped_songs = []
        
        # Check if database cache is loaded - fail fast if not
        if not cache_loaded or len(audio_features_cache) == 0:
            raise HTTPException(
                status_code=503,
                detail="Audio features cache not available. Service is still initializing or database connection failed. Please try again in a few seconds."
            )
        
        # Step 1: Check if target song features are in database cache first
        target_features = None
        target_id = int(request.target_song.trackId)  # Ensure integer for cache lookup
        
        print(f"🔍 Looking up target song {target_id} in cache ({len(audio_features_cache)} items)")
        print(f"🔍 Cache keys sample: {list(audio_features_cache.keys())[:5]}")
        
        if target_id in audio_features_cache:
            # Use pre-computed features from database
            cached = audio_features_cache[target_id]
            target_features = {
                'tempo': cached['tempo'],
                'energy': cached['energy'],
                'valence': cached['valence'],
                'danceability': cached['danceability'],
                'acousticness': cached['acousticness']
            }
            print(f"✅ Using cached DB features for target song {target_id}")
        elif target_id in itunes_features_cache:
            target_features = itunes_features_cache[target_id]
        else:
            # Require preview URL for real audio analysis
            if not request.target_song.previewUrl:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Target song '{request.target_song.trackName}' has no preview URL for audio analysis"
                )
            

            # Perform real audio analysis
            loop = asyncio.get_event_loop()
            try:
                # To prevent librosa synchronous extraction freezing API,
                # Use run_in_executor to get recommendations while 
                # one song is finished processing
                target_features = await loop.run_in_executor(
                    executor,
                    extract_audio_features_from_preview,
                    request.target_song.previewUrl,
                    request.target_song.trackId
                )
            except Exception as e:
                print(f"❌ Audio analysis execution error: {e}")
                target_features = None
            
            if target_features is None:
                is_zip = request.target_song.previewUrl and request.target_song.previewUrl.lower().endswith('.zip')
                msg = f"Audio analysis failed for target song '{request.target_song.trackName}'"
                if is_zip:
                    msg += ". The file format (ZIP) is not supported for audio analysis."
                
                raise HTTPException(
                    status_code=422,
                    detail=msg
                )
            
            itunes_features_cache[request.target_song.trackId] = target_features

        
        # Step 2: Extract features for all artist songs (excluding target)
        song_data = []
        song_features = []
        skipped_songs = []
        
        # Prepare list of songs to process
        songs_to_process = []
        for song in request.artist_songs:
            if song.trackId == request.target_song.trackId:
                continue
            songs_to_process.append(song)
        
        # Check if ALL songs are in database cache - if so, skip async processing entirely
        # Convert IDs to integers for consistent cache lookup
        # Also include iTunes cache in fast path logic
        cachable_ids = set()
        for song in songs_to_process:
            try:
                cachable_ids.add(int(song.trackId))
            except:
                cachable_ids.add(song.trackId)
                
        # Count how many are in either cache
        cached_count = sum(1 for sid in cachable_ids if sid in audio_features_cache or sid in itunes_features_cache)
        all_in_cache = cached_count == len(songs_to_process)
        
        print(f"🔍 Checking {len(songs_to_process)} songs against cache. In cache: {cached_count}/{len(songs_to_process)}")
        
        if all_in_cache:
            # Fast path - all songs are pre-analyzed in database
            print(f"✅ Fast path: All {len(songs_to_process)} songs found in (DB/iTunes) cache")
            for song in songs_to_process:
                try:
                    tid = int(song.trackId)
                except:
                    tid = song.trackId

                # Prioritize DB cache
                if tid in audio_features_cache:
                    cached = audio_features_cache[tid]
                    features = {
                        'tempo': cached['tempo'],
                        'energy': cached['energy'],
                        'valence': cached['valence'],
                        'danceability': cached['danceability'],
                        'acousticness': cached['acousticness']
                    }
                elif tid in itunes_features_cache:
                    features = itunes_features_cache[tid]
                else:
                    # Should not exist if logic holds, but safe fallback
                    continue
                
                feature_vec = [
                    features['tempo'],
                    features['energy'],
                    features['valence'],
                    features['danceability'],
                    features['acousticness']
                ]
                song_features.append(feature_vec)
                song_data.append({
                    'song': song,
                    'features': features
                })
        else:
            # Slow path - need to analyze some songs
            print(f"⚠️ Slow path: Some songs need analysis")
            # Parallelize audio analysis for songs not in cache
            tasks = []
            for song in songs_to_process:
                # First check database cache
                # Ensure we use integer ID for lookup
                try:
                    tid = int(song.trackId)
                except:
                    tid = song.trackId
                
                if tid in audio_features_cache:
                    # Already in DB cache, use it immediately
                    cached = audio_features_cache[tid]
                    tasks.append(asyncio.sleep(0, result={
                        'tempo': cached['tempo'],
                        'energy': cached['energy'],
                        'valence': cached['valence'],
                        'danceability': cached['danceability'],
                        'acousticness': cached['acousticness']
                    }))
                elif tid in itunes_features_cache:
                    # Already cached from iTunes, use it
                    tasks.append(asyncio.sleep(0, result=itunes_features_cache[tid]))
                elif song.previewUrl:
                    # If user demands real data immediately, we should skip live analysis if it takes too long
                    # But ML needs data. We will rely on robustness fix for ZIP files
                    loop = asyncio.get_event_loop()
                    tasks.append(
                        loop.run_in_executor(
                            executor,
                            extract_audio_features_from_preview,
                            song.previewUrl,
                            tid
                        )
                    )
                else:
                    # No preview URL, skip this song
                    tasks.append(asyncio.sleep(0, result=None))

            # Wait for all analysis tasks to complete
            if tasks:
                results = await asyncio.gather(*tasks, return_exceptions=True)
            else:
                results = []

            # Process results
            for i, song in enumerate(songs_to_process):
                features = None
                try:
                    tid = int(song.trackId)
                except:
                    tid = song.trackId
                
                # Check database cache first
                if tid in audio_features_cache:
                    cached = audio_features_cache[tid]
                    features = {
                        'tempo': cached['tempo'],
                        'energy': cached['energy'],
                        'valence': cached['valence'],
                        'danceability': cached['danceability'],
                        'acousticness': cached['acousticness']
                    }
                elif song.trackId in itunes_features_cache:
                    features = itunes_features_cache[song.trackId]
                else:
                    # Get result from parallel execution
                    res = results[i] if i < len(results) else None
                    
                    # Check if result is an exception or valid data
                    if isinstance(res, Exception):
                        print(f"Error processing song {song.trackId}: {res}")
                        features = None
                    else:
                        features = res
                    
                    # Cache if valid
                    if features:
                        itunes_features_cache[song.trackId] = features

                if not features:
                    skipped_songs.append({
                        'trackId': song.trackId,
                        'trackName': song.trackName,
                        'reason': 'Audio analysis failed or no preview URL'
                    })
                    continue
                
                # Build feature vector [tempo, energy, valence, danceability, acousticness]
                feature_vec = [
                    features.get('tempo', 120),
                    features.get('energy', 0.5),
                    features.get('valence', 0.5),
                    features.get('danceability', 0.5),
                    features.get('acousticness', 0.3)
                ]
                song_features.append(feature_vec)
                song_data.append({
                    'song': song,
                    'features': features
                })
        
        if not song_features:
            return {
                "status": "success",
                "target_song": {
                    "trackId": request.target_song.trackId,
                    "trackName": request.target_song.trackName,
                    "artistName": request.target_song.artistName
                },
                "similar_songs": [],
                "message": "No other songs from this artist available"
            }
        
        # Step 3: Build feature matrices
        target_vec = np.array([[
            target_features.get('tempo', 120),
            target_features.get('energy', 0.5),
            target_features.get('valence', 0.5),
            target_features.get('danceability', 0.5),
            target_features.get('acousticness', 0.3)
        ]])
        
        song_matrix = np.array(song_features)
        
        # Step 4: Normalize features using MinMaxScaler
        # Squashes all audio features (tempo, energy) numbers into a range between 0.0 and 1.0
        # using MinMaxScaler for normalization.
        all_features = np.vstack([target_vec, song_matrix])
        scaler = MinMaxScaler()
        normalized_features = scaler.fit_transform(all_features)
        
        normalized_target = normalized_features[0:1]  # First row is target
        normalized_songs = normalized_features[1:]    # Rest are candidates
        

        # Step 5: Compute cosine similarity

        # It draws a line (vector) from zero to the Target Song.
        # It draws lines to every Candidate Song.
        # Cosine Similarity calculates the angle between the lines.
        # If the lines point in the same direction (Angle = 0), the songs are 100% similar.
        # If they point in different directions, they are less similar.
        similarities = cosine_similarity(normalized_target, normalized_songs)[0]
        

        # Step 6: Sort by similarity and get top K

        # Sorts the songs by their similarity score (e.g., 95% match, 80% match...).
        # Explains why it matched. It looks at the raw numbers to see which feature was the closest.
        # Example: "Matching energy (High Energy)" vs "Similar tempo (128 BPM)".
        sorted_indices = np.argsort(similarities)[::-1][:request.limit]
              

        # Step 7: Build response with detailed feature matching
        similar_songs = []
        feature_names = ['tempo', 'energy', 'valence', 'danceability', 'acousticness']
        
        for idx in sorted_indices:
            data = song_data[idx]
            song = data['song']
            features = data['features']
            similarity = float(similarities[idx])
            
            # Calculate individual feature matches
            tempo_match = 1 - min(abs(target_features['tempo'] - features['tempo']) / 100, 1)
            energy_match = 1 - abs(target_features['energy'] - features['energy'])
            mood_match = 1 - abs(target_features['valence'] - features['valence'])
            dance_match = 1 - abs(target_features['danceability'] - features['danceability'])
            
            # Determine match reason based on closest features
            matches = [
                ('tempo', tempo_match, f"Similar tempo ({int(features['tempo'])} BPM)"),
                ('energy', energy_match, f"Matching energy ({features['energy']:.0%})"),
                ('mood', mood_match, f"Similar mood/vibe"),
                ('danceability', dance_match, f"Comparable rhythm feel")
            ]
            best_match = max(matches, key=lambda x: x[1])
            
            similar_songs.append(ArtistSimilarSong(
                trackId=song.trackId,
                trackName=song.trackName,
                artistName=song.artistName,
                collectionName=song.collectionName,
                artworkUrl100=song.artworkUrl100,
                previewUrl=song.previewUrl,
                trackPrice=song.trackPrice,
                similarity_score=round(similarity, 4),
                tempo=features['tempo'],
                energy=features['energy'],
                valence=features['valence'],
                danceability=features['danceability'],
                acousticness=features['acousticness'],
                tempo_match=round(tempo_match, 3),
                energy_match=round(energy_match, 3),
                mood_match=round(mood_match, 3),
                dance_match=round(dance_match, 3),
                match_reason=best_match[2],
                ml_algorithm="KNN-Cosine-Similarity"
            ))
        
        return {
            "status": "success",
            "algorithm": "K-Nearest Neighbors with Cosine Similarity",
            "normalization": "MinMaxScaler",
            "features_used": feature_names,
            "target_song": {
                "trackId": request.target_song.trackId,
                "trackName": request.target_song.trackName,
                "artistName": request.target_song.artistName,
                "tempo": target_features['tempo'],
                "energy": target_features['energy'],
                "valence": target_features['valence'],
                "danceability": target_features['danceability'],
                "acousticness": target_features['acousticness']
            },
            "artist_songs_analyzed": len(song_data),
            "similar_songs": similar_songs,
            "skipped_songs": skipped_songs
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Artist similarity error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Artist similarity computation failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
