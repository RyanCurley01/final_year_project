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
                        
                        # Build cache dictionary
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
                    # Query top played songs by counting 'play' interactions
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
                    
                    # Format response with presigned URLs
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

@app.get("/api/config/check")
async def check_config():
    """
    Check the current configuration without making external API calls
    """
    return {
        "environment": os.getenv('ENVIRONMENT', 'unknown'),
        "codespaces": os.getenv('CODESPACES') == 'true',
        "codespace_name": os.getenv('CODESPACE_NAME', 'not_set'),
        "cache_loaded": cache_loaded,
        "s3_configured": s3_client is not None
    }


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
                        
        
        # Extract features with defaults
        # Use effective_tempo (adjusted by playback rate) if provided, otherwise use base tempo
        # Check explicitly for None since 0 is a valid (though unusual) tempo
        if request.audio_features.effective_tempo is not None:
            current_tempo = request.audio_features.effective_tempo
        elif request.audio_features.tempo is not None:
            current_tempo = request.audio_features.tempo
        else:
            current_tempo = 120
            
        current_energy = request.audio_features.energy if request.audio_features.energy is not None else 0.5
        current_valence = request.audio_features.valence if request.audio_features.valence is not None else 0.5
        current_danceability = request.audio_features.danceability if request.audio_features.danceability is not None else 0.5
        current_acousticness = request.audio_features.acousticness if request.audio_features.acousticness is not None else 0.1
        
        playback_rate = request.audio_features.playback_rate if request.audio_features.playback_rate is not None else 1.0
        print(f"🎵 Calculating similarity with tempo: {current_tempo} BPM (effective_tempo: {request.audio_features.effective_tempo}, base_tempo: {request.audio_features.tempo}, playback rate: {playback_rate}x)")
        
        for product in products:
            if product["id"] == request.current_product_id:
                continue
            
            # Multi-dimensional feature similarity calculation
            # Tempo similarity - use ratio-based matching for better accuracy
            # A song at 120 BPM vs 12 BPM should have ~10% match, not 0%
            product_tempo = product["tempo"]
            if current_tempo > 0 and product_tempo > 0:
                tempo_ratio = min(current_tempo, product_tempo) / max(current_tempo, product_tempo)
                tempo_match = tempo_ratio  # Direct ratio gives better results
            else:
                tempo_match = 0
            
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
            
            # Weighted similarity score (production algorithm)
            # Weights based on research: energy and tempo most important for perceived similarity
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
            
            # Generate contextual reason
            dominant_feature = max(
                [("tempo", tempo_match), ("energy", energy_match), ("mood", mood_match)],
                key=lambda x: x[1]
            )
            
            if dominant_feature[0] == "tempo":
                reason = f"Matching rhythm ({product['tempo']} BPM)"
            elif dominant_feature[0] == "energy":
                reason = f"Similar intensity ({product['energy']:.2f}) and vibe"
            else:
                reason = f"Comparable mood"
            
            recommendations.append(AudioSimilarityResult(
                product_id=product["id"],
                similarity_score=round(similarity, 3),
                tempo_match=round(tempo_match, 3),
                energy_match=round(energy_match, 3),
                mood_match=round(mood_match, 3),
                danceability_match=round(dance_match, 3),
                genre_match=product["genre"] == "Electronic",
                reason=reason
            ))
        
        # Sort by similarity (descending) and apply limit
        recommendations.sort(key=lambda x: x.similarity_score, reverse=True)
        recommendations = recommendations[:request.limit]
        
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
# SIMILAR ARTIST SONGS ENDPOINT
# ============================================

class SimilarArtistSongsRequest(BaseModel):
    """Request for songs similar to specific artists based on audio features"""
    current_product_id: int
    audio_features: AudioFeatures
    session_id: str
    artists: List[str] = ["aphex-twin", "squarepusher", "boards-of-canada"]
    limit: int = 12

class SimilarArtistSong(BaseModel):
    """Song result with artist similarity info"""
    id: int
    productId: int
    albumTitle: Optional[str] = None
    similarity_score: float
    tempo_match: float
    energy_match: float
    mood_match: float
    artist_style_match: str
    reason: str

# Artist audio profiles - typical characteristics of each artist's sound
ARTIST_PROFILES = {
    "aphex-twin": {
        "name": "Aphex Twin",
        "tempo_range": (120, 180),
        "energy_range": (0.5, 0.9),
        "valence_range": (0.2, 0.6),
        "acousticness_max": 0.3,
        "style": "IDM / Glitch / Experimental"
    },
    "squarepusher": {
        "name": "Squarepusher", 
        "tempo_range": (140, 200),
        "energy_range": (0.6, 0.95),
        "valence_range": (0.4, 0.8),
        "acousticness_max": 0.25,
        "style": "Drill n Bass / Jazz-Influenced IDM"
    },
    "boards-of-canada": {
        "name": "Boards of Canada",
        "tempo_range": (60, 120),
        "energy_range": (0.2, 0.5),
        "valence_range": (0.3, 0.6),
        "acousticness_max": 0.6,
        "style": "Ambient / Downtempo / Nostalgic"
    }
}

@app.post("/api/audio/similar-artist-songs")
async def get_similar_artist_songs(request: SimilarArtistSongsRequest):
    """
    Get songs that match the audio characteristics of similar artists
    (Aphex Twin, Squarepusher, Boards of Canada)
    
    Uses the current playing song's audio features to find tracks that 
    would fit the style of these IDM/electronic artists.
    """
    try:
        results = []
        
        # Require cached audio features - no fallback data
        if not cache_loaded or not audio_features_cache:
            raise HTTPException(status_code=503, detail="Audio features cache not loaded. Database connection required.")
        
        products = [
            product for pid, product in audio_features_cache.items() 
            if pid != request.current_product_id
        ]
        print(f"✅ Similar artist search using {len(products)} cached products")

        # Extract current features
        current_tempo = request.audio_features.effective_tempo or request.audio_features.tempo or 120
        current_energy = request.audio_features.energy or 0.5
        current_valence = request.audio_features.valence or 0.5
        current_acousticness = request.audio_features.acousticness or 0.3
        
        print(f"🎵 Finding songs similar to artists with current features: tempo={current_tempo}, energy={current_energy}")
        
        # Determine which artist profile best matches current features
        best_artist_match = None
        best_artist_score = 0
        
        for artist_id in request.artists:
            if artist_id in ARTIST_PROFILES:
                profile = ARTIST_PROFILES[artist_id]
                
                # Calculate how well current song matches this artist's style
                tempo_in_range = profile["tempo_range"][0] <= current_tempo <= profile["tempo_range"][1]
                energy_in_range = profile["energy_range"][0] <= current_energy <= profile["energy_range"][1]
                valence_in_range = profile["valence_range"][0] <= current_valence <= profile["valence_range"][1]
                acousticness_ok = current_acousticness <= profile["acousticness_max"]
                
                score = (
                    (0.35 if tempo_in_range else 0) +
                    (0.30 if energy_in_range else 0) +
                    (0.20 if valence_in_range else 0) +
                    (0.15 if acousticness_ok else 0)
                )
                
                if score > best_artist_score:
                    best_artist_score = score
                    best_artist_match = artist_id
        
        # Find songs that match the artist style(s)
        for product in products:
            if product["id"] == request.current_product_id:
                continue
            
            product_tempo = product["tempo"]
            product_energy = product["energy"]
            product_valence = product["valence"]
            product_acousticness = product.get("acousticness", 0.3)
            
            # Calculate similarity to each artist profile
            artist_scores = {}
            for artist_id in request.artists:
                if artist_id in ARTIST_PROFILES:
                    profile = ARTIST_PROFILES[artist_id]
                    
                    # Tempo fit
                    if profile["tempo_range"][0] <= product_tempo <= profile["tempo_range"][1]:
                        tempo_fit = 1.0 - abs(product_tempo - (profile["tempo_range"][0] + profile["tempo_range"][1])/2) / (profile["tempo_range"][1] - profile["tempo_range"][0])
                    else:
                        tempo_fit = 0.2
                    
                    # Energy fit
                    if profile["energy_range"][0] <= product_energy <= profile["energy_range"][1]:
                        energy_fit = 1.0
                    else:
                        energy_fit = max(0, 1 - abs(product_energy - (profile["energy_range"][0] + profile["energy_range"][1])/2))
                    
                    # Valence fit
                    if profile["valence_range"][0] <= product_valence <= profile["valence_range"][1]:
                        valence_fit = 1.0
                    else:
                        valence_fit = max(0, 1 - abs(product_valence - (profile["valence_range"][0] + profile["valence_range"][1])/2))
                    
                    artist_scores[artist_id] = (tempo_fit * 0.35 + energy_fit * 0.35 + valence_fit * 0.30)
            
            # Get best matching artist for this song
            if artist_scores:
                best_match = max(artist_scores.items(), key=lambda x: x[1])
                artist_style = ARTIST_PROFILES[best_match[0]]["style"]
                artist_name = ARTIST_PROFILES[best_match[0]]["name"]
            else:
                artist_style = "Electronic"
                artist_name = "Similar Artist"
            
            # Calculate overall similarity (combination of current song match + artist style match)
            tempo_match = min(current_tempo, product_tempo) / max(current_tempo, product_tempo) if current_tempo > 0 and product_tempo > 0 else 0
            energy_match = max(0, 1 - abs(product_energy - current_energy))
            mood_match = max(0, 1 - abs(product_valence - current_valence))
            
            overall_similarity = (
                tempo_match * 0.25 +
                energy_match * 0.30 +
                mood_match * 0.20 +
                max(artist_scores.values() if artist_scores else [0]) * 0.25
            )
            
            # Only include songs above threshold
            if overall_similarity >= 0.15:
                # Generate contextual reason
                if tempo_match > 0.8:
                    reason = f"Matching rhythm at {int(product_tempo)} BPM - {artist_name} style"
                elif energy_match > 0.8:
                    reason = f"Similar intensity level - fits {artist_style}"
                else:
                    reason = f"Comparable vibe to {artist_name}"
                
                results.append(SimilarArtistSong(
                    id=product["id"],
                    productId=product["id"],
                    albumTitle=product.get("albumTitle"),
                    similarity_score=round(overall_similarity, 3),
                    tempo_match=round(tempo_match, 3),
                    energy_match=round(energy_match, 3),
                    mood_match=round(mood_match, 3),
                    artist_style_match=best_match[0] if artist_scores else "electronic",
                    reason=reason
                ))
        
        # Sort by similarity and limit
        results.sort(key=lambda x: x.similarity_score, reverse=True)
        results = results[:request.limit]
        
        return {
            "songs": results,
            "session_id": request.session_id,
            "current_product_id": request.current_product_id,
            "best_artist_match": best_artist_match,
            "best_artist_score": round(best_artist_score, 3),
            "artists_analyzed": request.artists,
            "algorithm": "multi-artist-audio-similarity"
        }
        
    except Exception as e:
        print(f"❌ Error in similar artist songs: {e}")
        raise HTTPException(status_code=500, detail=f"Error finding similar artist songs: {str(e)}")


@app.get("/api/audio/features/{product_id}")
async def get_product_audio_features(product_id: int):
    """
    Get stored audio features for a specific product from database
    """
    try:
        # Check cache first
        if cache_loaded and product_id in audio_features_cache:
            return {
                "product_id": product_id,
                "features": audio_features_cache[product_id],
                "status": "success",
                "data_source": "cache"
            }
        
        # Query from AudioFeatures table
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    sql = """
                        SELECT 
                            Tempo as tempo,
                            Energy as energy,
                            Valence as valence,
                            Danceability as danceability,
                            Acousticness as acousticness,
                            Genre as genre
                        FROM AudioFeatures
                        WHERE ProductID = %s
                    """
                    cursor.execute(sql, (product_id,))
                    features_data = cursor.fetchone()
                    
                    if features_data:
                        return {
                            "product_id": product_id,
                            "features": features_data,
                            "status": "success",
                            "data_source": "database"
                        }
                    else:
                        raise HTTPException(status_code=404, detail=f"No audio features found for product {product_id}")
            else:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving audio features: {str(e)}")


# ============================================
# ML-BASED ITUNES SIMILARITY SERVICE
# ============================================

# iTunes API configuration from environment
ITUNES_API_BASE_URL = os.getenv('ITUNES_API_BASE_URL', 'https://itunes.apple.com')

# Cache for extracted iTunes audio features
itunes_features_cache: Dict[int, Dict] = {}

# Trained feature scaler for normalization (will be fit on first use)
feature_scaler = None

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


class SimilarityRequest(BaseModel):
    """Request for computing similarity between iTunes songs and library.
    Audio analysis is always performed - songs without preview URLs will be skipped."""
    itunes_songs: List[ITunesSong]


class SongWithSimilarity(BaseModel):
    """iTunes song with similarity score to library"""
    trackId: int
    trackName: str
    artistName: str
    collectionName: Optional[str] = None
    artworkUrl100: Optional[str] = None
    previewUrl: Optional[str] = None
    trackPrice: Optional[float] = None
    tempo: float
    energy: float
    valence: float
    danceability: float
    acousticness: float
    features_source: str
    similarity_score: float
    matched_library_song_id: Optional[int] = None
    matched_library_song_title: Optional[str] = None
    tempo_match: float
    energy_match: float
    mood_match: float
    dance_match: float


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


@app.post("/api/itunes/compute-similarity")
async def compute_itunes_similarity(request: SimilarityRequest):
    """
    Compute ML-based similarity scores between iTunes songs and library songs.
    Uses cosine similarity in a multi-dimensional audio feature space.
    """
    try:
        from sklearn.metrics.pairwise import cosine_similarity
        
        # Get library songs with audio features from cache
        if not cache_loaded or not audio_features_cache:
            raise HTTPException(status_code=503, detail="Library audio features not loaded")
        
        library_songs = list(audio_features_cache.values())
        if not library_songs:
            raise HTTPException(status_code=404, detail="No library songs with audio features")
        
        # Prepare library feature matrix
        library_features = []
        library_ids = []
        for song in library_songs:
            features = [
                song.get('tempo', 120) / 200,
                song.get('energy', 0.5),
                song.get('valence', 0.5),
                song.get('danceability', 0.5),
                song.get('acousticness', 0.3)
            ]
            library_features.append(features)
            library_ids.append(song['id'])
        
        library_matrix = np.array(library_features)
        results = []
        skipped_songs = []
        
        for itunes_song in request.itunes_songs:
            if itunes_song.trackId in itunes_features_cache:
                features = itunes_features_cache[itunes_song.trackId]
            else:
                # Require real audio analysis - no fallback estimation
                if not itunes_song.previewUrl:
                    skipped_songs.append({
                        'trackId': itunes_song.trackId,
                        'trackName': itunes_song.trackName,
                        'reason': 'No preview URL available for audio analysis'
                    })
                    continue
                
                # Perform real audio analysis
                loop = asyncio.get_event_loop()
                features = await loop.run_in_executor(
                    executor,
                    extract_audio_features_from_preview,
                    itunes_song.previewUrl,
                    itunes_song.trackId
                )
                
                if features is None:
                    skipped_songs.append({
                        'trackId': itunes_song.trackId,
                        'trackName': itunes_song.trackName,
                        'reason': 'Audio analysis failed'
                    })
                    continue
                
                itunes_features_cache[itunes_song.trackId] = features
            
            itunes_feature_vec = np.array([[
                features.get('tempo', 120) / 200,
                features.get('energy', 0.5),
                features.get('valence', 0.5),
                features.get('danceability', 0.5),
                features.get('acousticness', 0.3)
            ]])
            
            similarities = cosine_similarity(itunes_feature_vec, library_matrix)[0]
            
            best_idx = np.argmax(similarities)
            best_similarity = float(similarities[best_idx])
            best_library_id = library_ids[best_idx]
            best_library_song = library_songs[best_idx]
            
            tempo_match = 1 - min(abs(features.get('tempo', 120) - best_library_song.get('tempo', 120)) / 100, 1)
            energy_match = 1 - abs(features.get('energy', 0.5) - best_library_song.get('energy', 0.5))
            mood_match = 1 - abs(features.get('valence', 0.5) - best_library_song.get('valence', 0.5))
            dance_match = 1 - abs(features.get('danceability', 0.5) - best_library_song.get('danceability', 0.5))
            
            results.append(SongWithSimilarity(
                trackId=itunes_song.trackId,
                trackName=itunes_song.trackName,
                artistName=itunes_song.artistName,
                collectionName=itunes_song.collectionName,
                artworkUrl100=itunes_song.artworkUrl100,
                previewUrl=itunes_song.previewUrl,
                trackPrice=itunes_song.trackPrice,
                tempo=features.get('tempo', 120),
                energy=features.get('energy', 0.5),
                valence=features.get('valence', 0.5),
                danceability=features.get('danceability', 0.5),
                acousticness=features.get('acousticness', 0.3),
                features_source='analyzed',
                similarity_score=round(best_similarity, 3),
                matched_library_song_id=best_library_id,
                matched_library_song_title=best_library_song.get('albumTitle'),
                tempo_match=round(tempo_match, 3),
                energy_match=round(energy_match, 3),
                mood_match=round(mood_match, 3),
                dance_match=round(dance_match, 3)
            ))
        
        results.sort(key=lambda x: x.similarity_score, reverse=True)
        
        return {
            "status": "success",
            "algorithm": "cosine-similarity-multi-dimensional",
            "features_used": ["tempo", "energy", "valence", "danceability", "acousticness"],
            "library_songs_compared": len(library_songs),
            "results": results,
            "skipped_songs": skipped_songs
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error computing similarity: {e}")
        raise HTTPException(status_code=500, detail=f"Error computing similarity: {str(e)}")


# ============================================
# ML SONG SIMILARITY ENDPOINT - K-NEAREST NEIGHBORS
# ============================================

class MLSimilarSongsRequest(BaseModel):
    """Request for ML-based similar songs"""
    song_id: Optional[int] = None
    song_name: Optional[str] = None
    artist_name: Optional[str] = None
    limit: int = 10

class MLSimilarSong(BaseModel):
    """ML-analyzed similar song result"""
    productId: int
    albumTitle: str
    albumCoverImageUrl: Optional[str] = None
    fileUrl: Optional[str] = None
    previewUrl: Optional[str] = None
    albumPrice: Optional[float] = None
    similarity_score: float
    tempo: float
    energy: float
    valence: float
    danceability: float
    acousticness: float
    feature_distances: Dict[str, float]
    match_reason: str

@app.post("/api/ml/similar-songs")
async def get_ml_similar_songs(request: MLSimilarSongsRequest):
    """
    ML-based similar songs using K-Nearest Neighbors with cosine similarity.
    
    This endpoint uses actual machine learning to find songs most similar to the 
    requested song based on audio features (tempo, energy, valence, danceability, acousticness).
    
    The algorithm:
    1. Builds a feature matrix from all songs in the database
    2. Normalizes features using MinMaxScaler for fair comparison
    3. Uses cosine similarity to find the K most similar songs
    4. Returns songs ranked by similarity score
    """
    from sklearn.preprocessing import MinMaxScaler
    from sklearn.metrics.pairwise import cosine_similarity
    
    try:
        # Step 1: Find the target song
        target_song = None
        target_features = None
        
        with get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database unavailable")
            
            with conn.cursor() as cursor:
                # Find target song by ID or name
                if request.song_id:
                    cursor.execute("""
                        SELECT p.ProductID, p.AlbumTitle, p.albumCoverImageUrl, 
                               p.file_url, p.preview_url, p.AlbumPrice,
                               af.Tempo, af.Energy, af.Valence, af.Danceability, af.Acousticness
                        FROM Products p
                        LEFT JOIN AudioFeatures af ON p.ProductID = af.ProductID
                        WHERE p.ProductID = %s
                    """, (request.song_id,))
                elif request.song_name:
                    search_term = f"%{request.song_name}%"
                    cursor.execute("""
                        SELECT p.ProductID, p.AlbumTitle, p.albumCoverImageUrl,
                               p.file_url, p.preview_url, p.AlbumPrice,
                               af.Tempo, af.Energy, af.Valence, af.Danceability, af.Acousticness
                        FROM Products p
                        LEFT JOIN AudioFeatures af ON p.ProductID = af.ProductID
                        WHERE p.AlbumTitle LIKE %s
                        LIMIT 1
                    """, (search_term,))
                else:
                    raise HTTPException(status_code=400, detail="Either song_id or song_name required")
                
                target_song = cursor.fetchone()
                
                if not target_song:
                    raise HTTPException(status_code=404, detail="Song not found")
                
                # Step 2: Get all songs with audio features
                cursor.execute("""
                    SELECT p.ProductID, p.AlbumTitle, p.albumCoverImageUrl,
                           p.file_url, p.preview_url, p.AlbumPrice,
                           af.Tempo, af.Energy, af.Valence, af.Danceability, af.Acousticness
                    FROM Products p
                    INNER JOIN AudioFeatures af ON p.ProductID = af.ProductID
                    WHERE p.ProductID != %s
                    AND af.Tempo IS NOT NULL
                    AND af.Energy IS NOT NULL
                    AND p.AlbumTitle IS NOT NULL
                    AND p.AlbumTitle != 'Selected Electronic Works'
                """, (target_song['ProductID'],))
                
                all_songs = cursor.fetchall()
        
        if not all_songs:
            raise HTTPException(status_code=404, detail="No songs with audio features found")
        
        # Step 3: Build feature matrices
        # Target song features (handle NULL values with defaults)
        target_tempo = float(target_song['Tempo']) if target_song['Tempo'] else 120.0
        target_energy = float(target_song['Energy']) if target_song['Energy'] else 0.5
        target_valence = float(target_song['Valence']) if target_song['Valence'] else 0.5
        target_danceability = float(target_song['Danceability']) if target_song['Danceability'] else 0.5
        target_acousticness = float(target_song['Acousticness']) if target_song['Acousticness'] else 0.3
        
        target_features = np.array([[
            target_tempo,
            target_energy,
            target_valence,
            target_danceability,
            target_acousticness
        ]])
        
        # Build feature matrix for all songs
        song_features = []
        valid_songs = []
        
        for song in all_songs:
            tempo = float(song['Tempo']) if song['Tempo'] else 120.0
            energy = float(song['Energy']) if song['Energy'] else 0.5
            valence = float(song['Valence']) if song['Valence'] else 0.5
            danceability = float(song['Danceability']) if song['Danceability'] else 0.5
            acousticness = float(song['Acousticness']) if song['Acousticness'] else 0.3
            
            song_features.append([tempo, energy, valence, danceability, acousticness])
            valid_songs.append(song)
        
        song_matrix = np.array(song_features)
        
        # Step 4: Normalize features using MinMaxScaler
        # Combine target and all songs for consistent scaling
        all_features = np.vstack([target_features, song_matrix])
        scaler = MinMaxScaler()
        normalized_features = scaler.fit_transform(all_features)
        
        normalized_target = normalized_features[0:1]  # First row is target
        normalized_songs = normalized_features[1:]    # Rest are candidates
        
        # Step 5: Compute cosine similarity
        similarities = cosine_similarity(normalized_target, normalized_songs)[0]
        
        # Step 6: Get top K similar songs
        top_indices = np.argsort(similarities)[::-1][:request.limit]
        
        # Step 7: Build response with detailed feature matching
        similar_songs = []
        feature_names = ['tempo', 'energy', 'valence', 'danceability', 'acousticness']
        
        for idx in top_indices:
            song = valid_songs[idx]
            similarity = float(similarities[idx])
            
            # Calculate individual feature distances
            song_feat = song_features[idx]
            feature_distances = {}
            for i, name in enumerate(feature_names):
                if name == 'tempo':
                    # Tempo distance normalized to 0-1 (max difference ~200 BPM)
                    distance = abs(target_features[0][i] - song_feat[i]) / 200.0
                else:
                    # Other features already 0-1, so direct difference
                    distance = abs(target_features[0][i] - song_feat[i])
                feature_distances[name] = round(1 - min(distance, 1.0), 3)  # Convert to match score
            
            # Determine match reason based on closest features
            best_feature = max(feature_distances.items(), key=lambda x: x[1])
            if best_feature[0] == 'tempo':
                reason = f"Similar tempo ({int(song_feat[0])} BPM)"
            elif best_feature[0] == 'energy':
                reason = f"Matching energy level ({song_feat[1]:.2f})"
            elif best_feature[0] == 'valence':
                reason = f"Similar mood/positivity"
            elif best_feature[0] == 'danceability':
                reason = f"Comparable danceability"
            else:
                reason = f"Acoustic characteristics match"
            
            similar_songs.append(MLSimilarSong(
                productId=song['ProductID'],
                albumTitle=song['AlbumTitle'],
                albumCoverImageUrl=generate_presigned_url(song['albumCoverImageUrl']) if song['albumCoverImageUrl'] else None,
                fileUrl=generate_presigned_url(song['file_url']) if song['file_url'] else None,
                previewUrl=generate_presigned_url(song['preview_url']) if song['preview_url'] else None,
                albumPrice=float(song['AlbumPrice']) if song['AlbumPrice'] else 0.5,
                similarity_score=round(similarity, 4),
                tempo=song_feat[0],
                energy=song_feat[1],
                valence=song_feat[2],
                danceability=song_feat[3],
                acousticness=song_feat[4],
                feature_distances=feature_distances,
                match_reason=reason
            ))
        
        return {
            "status": "success",
            "target_song": {
                "productId": target_song['ProductID'],
                "albumTitle": target_song['AlbumTitle'],
                "tempo": target_tempo,
                "energy": target_energy,
                "valence": target_valence,
                "danceability": target_danceability,
                "acousticness": target_acousticness
            },
            "algorithm": "K-Nearest Neighbors with Cosine Similarity",
            "features_used": feature_names,
            "normalization": "MinMaxScaler",
            "similar_songs": similar_songs,
            "total_songs_analyzed": len(valid_songs)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ ML similarity error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"ML similarity computation failed: {str(e)}")


@app.get("/api/ml/similar-songs/{product_id}")
async def get_ml_similar_songs_by_id(product_id: int, limit: int = 10):
    """
    GET endpoint for ML-based similar songs - convenience wrapper.
    Finds songs similar to the given product ID using ML cosine similarity.
    """
    request = MLSimilarSongsRequest(song_id=product_id, limit=limit)
    return await get_ml_similar_songs(request)


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
        # Combine target and all songs for consistent scaling
        all_features = np.vstack([target_vec, song_matrix])
        scaler = MinMaxScaler()
        normalized_features = scaler.fit_transform(all_features)
        
        normalized_target = normalized_features[0:1]  # First row is target
        normalized_songs = normalized_features[1:]    # Rest are candidates
        
        # Step 5: Compute cosine similarity
        similarities = cosine_similarity(normalized_target, normalized_songs)[0]
        
        # Step 6: Sort by similarity and get top K
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
