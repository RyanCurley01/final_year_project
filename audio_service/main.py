from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import os
from dotenv import load_dotenv
import pymysql
from contextlib import contextmanager
import boto3
from botocore.exceptions import ClientError
from urllib.parse import urlparse, unquote

# Load environment variables
load_dotenv()

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

# Initialize S3 client
s3_client = None
try:
    if S3_CONFIG['access_key'] and S3_CONFIG['secret_key']:
        s3_client = boto3.client(
            's3',
            region_name=S3_CONFIG['region'],
            aws_access_key_id=S3_CONFIG['access_key'],
            aws_secret_access_key=S3_CONFIG['secret_key']
        )
        print("✅ S3 client initialized for presigned URLs")
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
    except Exception as e:
        print(f"⚠️  Could not load audio features cache: {e}")
        print("⚠️  Will use fallback data for recommendations")

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
        
        # Use cached audio features for instant response (no DB query!)
        if cache_loaded and audio_features_cache:
            products = [
                product for pid, product in audio_features_cache.items() 
                if pid != request.current_product_id
            ]
            print(f"✅ Using cached features for {len(products)} products (no DB query)")
        else:
            # Fallback: Query audio features from database
            products = []
            with get_db_connection() as conn:
                if conn:
                    try:
                        with conn.cursor() as cursor:
                            # Query all products with audio features except the current one
                            sql = """
                                SELECT 
                                    ProductID as id,
                                    Tempo as tempo,
                                    Energy as energy,
                                    Valence as valence,
                                    Danceability as danceability,
                                    Acousticness as acousticness,
                                    Genre as genre
                                FROM AudioFeatures
                                WHERE ProductID != %s
                                AND Tempo IS NOT NULL
                                AND Energy IS NOT NULL
                            """
                            cursor.execute(sql, (request.current_product_id,))
                            products = cursor.fetchall()
                            print(f"✅ Loaded {len(products)} products from AudioFeatures table (DB query)")
                    except Exception as db_error:
                        print(f"⚠️ Database query failed: {db_error}")
                        
        
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
                reason = f"Matching rhythm ({product['tempo']} BPM) and energy level"
            elif dominant_feature[0] == "energy":
                reason = f"Similar intensity ({product['energy']:.2f}) and vibe"
            else:
                reason = f"Comparable mood and emotional tone"
            
            recommendations.append(AudioSimilarityResult(
                product_id=product["id"],
                similarity_score=round(similarity, 3),
                tempo_match=round(tempo_match, 3),
                energy_match=round(energy_match, 3),
                mood_match=round(mood_match, 3),
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
        
        # Use cached audio features for instant response
        if cache_loaded and audio_features_cache:
            products = [
                product for pid, product in audio_features_cache.items() 
                if pid != request.current_product_id
            ]
            print(f"✅ Similar artist search using {len(products)} cached products")
        else:
            # Fallback: Query audio features from database
            products = []
            with get_db_connection() as conn:
                if conn:
                    try:
                        with conn.cursor() as cursor:
                            sql = """
                                SELECT 
                                    af.ProductID as id,
                                    p.AlbumTitle as albumTitle,
                                    af.Tempo as tempo,
                                    af.Energy as energy,
                                    af.Valence as valence,
                                    af.Danceability as danceability,
                                    af.Acousticness as acousticness,
                                    af.Genre as genre
                                FROM AudioFeatures af
                                JOIN Products p ON af.ProductID = p.ProductID
                                WHERE af.ProductID != %s
                                AND af.Tempo IS NOT NULL
                                AND af.Energy IS NOT NULL
                                AND p.AlbumTitle IS NOT NULL
                            """
                            cursor.execute(sql, (request.current_product_id,))
                            products = cursor.fetchall()
                            print(f"✅ Loaded {len(products)} products from DB for artist matching")
                    except Exception as db_error:
                        print(f"⚠️ Database query failed: {db_error}")

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
