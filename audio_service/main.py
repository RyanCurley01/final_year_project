from ast import Not
from pyexpat import features
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
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import silhouette_score
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from fastapi.responses import HTMLResponse
import json
import tempfile
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Helper class to support console.log syntax
class Console:
    def log(self, *args, **kwargs):
        print(*args, **kwargs)

console = Console()

# Load environment variables
load_dotenv()

# Global storage for visualization
visualization_data = None

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
model_performance_metrics: Dict[str, float] = {
    "MinMaxScaler_train": 0.0, 
    "StandardScaler_train": 0.0,
    "MinMaxScaler_val": 0.0, 
    "StandardScaler_val": 0.0
} # Store model training and validation scores

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
        console.log(f"✅ S3 client initialized for presigned URLs (region: {S3_CONFIG['region']}, signature: v4)")
    else:
        console.log("⚠️  AWS credentials not found. Presigned URLs will not be generated.")
except Exception as e:
    console.log(f"⚠️  Failed to initialize S3 client: {e}")
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
        console.log(f"Error generating presigned URL for {s3_url}: {e}")
        return s3_url  # Return original URL as fallback

@contextmanager
def get_db_connection():
    """Context manager for database connections with automatic cleanup"""
    connection = None
    try:
        connection = pymysql.connect(**DB_CONFIG)
        yield connection
    except pymysql.Error as e:
        console.log(f"Database connection error: {e}")
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
                                Genre,
                                SpectralCentroid,
                                SpectralRolloff,
                                ZeroCrossingRate,
                                Instrumentalness,
                                Loudness,
                                Speechiness
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
                                'genre': row['Genre'],
                                'spectral_centroid': row.get('SpectralCentroid', 1500.0),
                                'spectral_rolloff': row.get('SpectralRolloff', 3000.0),
                                'zero_crossing_rate': row.get('ZeroCrossingRate', 0.05),
                                'instrumentalness': row.get('Instrumentalness', 0.5),
                                'loudness': row.get('Loudness', -60.0),
                                'speechiness': row.get('Speechiness', 0.1)
                            }
                        
                        cache_loaded = True
                        console.log(f"✅ Cached {len(audio_features_cache)} audio features for fast recommendations")
                        
                        # Initialize ML datasets and scale features
                        # Splits database data into Training, Validation, and Test sets
                        # to generalize the model scaler across the entire catalog
                        try:
                            global feature_scaler, model_performance_metrics
                            
                            # 1. Feature Extraction & Labeling
                            feature_vectors = []
                            feature_labels = [] # Genres used as "Ground Truth" for model validation
                            
                            for pid, data in audio_features_cache.items():
                                if all(k in data for k in ['tempo', 'energy', 'valence', 'danceability', 'acousticness']):
                                    feature_vectors.append([
                                        float(data['tempo'] or 0) / 200.0,  # Normalize tempo (0-200 BPM -> 0-1)
                                        float(data['energy'] or 0),
                                        float(data['valence'] or 0),
                                        float(data['danceability'] or 0),
                                        float(data['acousticness'] or 0),
                                        float(data.get('spectral_centroid', 1500.0) / 5000.0),  # Normalize to 0-1
                                        float(data.get('spectral_rolloff', 3000.0) / 10000.0),  # Normalize to 0-1
                                        float(data.get('zero_crossing_rate', 0.05) * 10.0),     # Scale to 0-1
                                        float(data.get('instrumentalness', 0.5)),
                                        float((data.get('loudness', -60.0) + 60.0) / 60.0),     # Normalize -60 to 0 dB -> 0-1
                                        float(data.get('speechiness', 0.1))
                                    ])
                                    feature_labels.append(data.get('genre', 'Unknown'))
                            
                            if len(feature_vectors) > 50: # Ensure enough data for splitting (lowered from 100 to 50)
                                X = np.array(feature_vectors)
                                y = np.array(feature_labels)
                                
                                # 2. Data Splitting (Train / Validation / Test)
                                # Training (70%): Used to learn the scaling parameters
                                # Validation (15%): Used to select the best scaler (Model Selection)
                                # Test (15%): Used to evaluate the final performance
                                X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.3, random_state=42)
                                X_val, X_test, y_val, y_test = train_test_split(X_temp, y_temp, test_size=0.5, random_state=42)
                                
                                console.log(f"📊 ML Pipeline Initialized with {len(X)} tracks")
                                console.log(f"   Splits: Train={len(X_train)}, Val={len(X_val)}, Test={len(X_test)}")
                                
                                # 3. Model Selection (Hyperparameter Tuning)
                                # We compare two Normalization Models to see which one preserves Genre clusters best.
                                # Metric: Silhouette Score (Higher is better, meaning Genres are distinct in feature space)
                                
                                # Candidate Model A: MinMaxScaler
                                model_a = MinMaxScaler()
                                model_a.fit(X_train)
                                val_embed_a = model_a.transform(X_val)
                                
                                # Candidate Model B: StandardScaler (Z-Score)
                                model_b = StandardScaler()
                                model_b.fit(X_train)
                                val_embed_b = model_b.transform(X_val)
                                
                                # Evaluate both on Validation Set
                                # Only calculate if we have multiple genres to cluster
                                if len(set(y_val)) > 1:
                                    # Calculate Training Scores (Check for Overfitting)
                                    # Ideally, Training Score and validation score should be close.
                                    # If Training >> Validation, the model is overfitting.
                                    try:
                                        train_embed_a = model_a.transform(X_train)
                                        train_score_a = silhouette_score(train_embed_a, y_train)
                                    except: train_score_a = -1
                                    
                                    try:
                                        train_embed_b = model_b.transform(X_train)
                                        train_score_b = silhouette_score(train_embed_b, y_train)
                                    except: train_score_b = -1

                                    console.log(f"   📈 Training Set Performance (Silhouette Score):")
                                    console.log(f"      - MinMaxScaler:   {train_score_a:.4f}")
                                    console.log(f"      - StandardScaler: {train_score_b:.4f}")


                                    # Handle silhouette score errors if cluster size < 2
                                    try:
                                        score_a = silhouette_score(val_embed_a, y_val)
                                    except: score_a = -1
                                    
                                    try:
                                        score_b = silhouette_score(val_embed_b, y_val)
                                    except: score_b = -1
                                    
                                    console.log(f"   🧪 Model Selection (Validation Set Silhouette Score):")
                                    console.log(f"      - MinMaxScaler:   {score_a:.4f}")
                                    console.log(f"      - StandardScaler: {score_b:.4f}")

                                    model_performance_metrics["MinMaxScaler_train"] = round(train_score_a, 4)
                                    model_performance_metrics["StandardScaler_train"] = round(train_score_b, 4)
                                    model_performance_metrics["MinMaxScaler_val"] = round(score_a, 4)
                                    model_performance_metrics["StandardScaler_val"] = round(score_b, 4)
                                    console.log(f"✅ Model metrics stored: {model_performance_metrics}", flush=True)
                                    
                                    # Select Best Model
                                    if score_b > score_a:
                                        console.log("   🏆 Selected Model: StandardScaler")
                                        feature_scaler = model_b
                                        best_model = "StandardScaler"
                                    else:
                                        console.log("   🏆 Selected Model: MinMaxScaler")
                                        feature_scaler = model_a
                                        best_model = "MinMaxScaler"
                                else:
                                    # Fallback if validation set lacks genre diversity
                                    console.log("   ⚠️ Validation set lacks genre diversity, defaulting to MinMaxScaler")
                                    feature_scaler = model_a
                                    best_model = "MinMaxScaler"
                                
                                # Generate Visualization Data (PCA 2D Projection)
                                try:
                                    console.log("   🎨 Generating Visualization Data...")
                                    pca = PCA(n_components=2)
                                    # Transform all data with the chosen scaler
                                    X_scaled_vis = feature_scaler.transform(X)
                                    X_2d = pca.fit_transform(X_scaled_vis)
                                    
                                    global visualization_data
                                    visualization_data = {
                                        "x": X_2d[:, 0].tolist(),
                                        "y": X_2d[:, 1].tolist(),
                                        "genres": y.tolist(),
                                        "scaler": best_model,
                                        "metrics": model_performance_metrics
                                    }
                                    console.log("   ✅ Visualization data ready")
                                except Exception as ve:
                                    console.log(f"   ⚠️ Visualization generation failed: {ve}")

                                # 4. Final Evaluation (Test Set)
                                # Measures how well the selected model creates separable clusters on completely unseen data
                                if len(set(y_test)) > 1:
                                    try:
                                        test_embed = feature_scaler.transform(X_test)
                                        final_acc = silhouette_score(test_embed, y_test)
                                        console.log(f"   ✅ Final Test Set Performance: {final_acc:.4f} (Silhouette Score)")
                                    except:
                                        console.log("   ⚠️ Could not calculate final test score due to label distribution")
                                
                            else:
                                console.log(f"⚠️ Not enough data to train ML model (Found {len(feature_vectors)} tracks - need >10)")
                            
                        except Exception as e:
                            console.log(f"⚠️ ML Initialization warning: {e}")
                        
                        console.log(f"📊 Final model_performance_metrics: {model_performance_metrics}", flush=True)

                        return  # Success - exit retry loop
        except Exception as e:
            console.log(f"⚠️ Attempt {attempt + 1}/{max_retries} - Failed to load audio features cache: {e}")
            if attempt < max_retries - 1:
                console.log(f"   Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
            else:
                # Last attempt failed - log warning but don't crash
                console.log(f"❌ Could not load audio features cache after {max_retries} attempts")
                console.log(f"   Service will start but similarity will be slower (real-time analysis)")
                cache_loaded = False

@app.get("/")
async def root():
    return {
        "service": "Audio Feature Similarity Service",
        "status": "running",
        "cache_loaded": cache_loaded,
        "cached_products": len(audio_features_cache)
    }

@app.get("/visualize", response_class=HTMLResponse)
async def visualize_clusters():
    if not visualization_data:
         return "<html><body><h1>No Model visualization available (Model has not trained yet or cache is empty)</h1></body></html>"
    
    html_content = f"""
    <html>
        <head>
            <title>Audio Features Visualization</title>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <style>
                body {{ font-family: sans-serif; padding: 20px; }}
            </style>
        </head>
        <body>
            <h2>Audio Feature Clusters (PCA Projection)</h2>
            <div id="myDiv" style="width:100%;height:600px"></div>
            <script>
                var x = {json.dumps(visualization_data['x'])};
                var y = {json.dumps(visualization_data['y'])};
                var genres = {json.dumps(visualization_data['genres'])};
                var metrics = {json.dumps(visualization_data['metrics'])};
                
                // Group data by genre for better legend
                var traces = [];
                var genreGroups = {{}};
                
                for(var i=0; i<x.length; i++) {{
                    var g = genres[i];
                    if(!genreGroups[g]) genreGroups[g] = {{x:[], y:[], text:[]}};
                    genreGroups[g].x.push(x[i]);
                    genreGroups[g].y.push(y[i]);
                    genreGroups[g].text.push(g);
                }}
                
                for(var g in genreGroups) {{
                    traces.push({{
                        x: genreGroups[g].x,
                        y: genreGroups[g].y,
                        mode: 'markers',
                        type: 'scatter',
                        name: g,
                        text: genreGroups[g].text,
                        marker: {{ size: 10 }}
                    }});
                }}

                var layout = {{
                    title: 'Audio Feature Space (2D PCA) - Best Scaler: {visualization_data['scaler']}',
                    xaxis: {{ 
                        title: 'PCA Component 1',
                        showgrid: true,
                        zeroline: true,
                        showline: true,
                        showticklabels: true,
                        ticks: 'outside',
                        tickmode: 'auto',
                        nticks: 10,
                        tickfont: {{
                            size: 12,
                            color: '#ffffff'
                        }},
                        linecolor: '#ffffff',
                        gridcolor: 'rgba(255,255,255,0.2)'
                    }},
                    yaxis: {{ 
                        title: 'PCA Component 2',
                        showgrid: true,
                        zeroline: true,
                        showline: true,
                        showticklabels: true,
                        ticks: 'outside',
                        tickmode: 'auto',
                        nticks: 10,
                        tickfont: {{
                            size: 12,
                            color: '#ffffff'
                        }},
                        linecolor: '#ffffff',
                        gridcolor: 'rgba(255,255,255,0.2)'
                    }},
                    hovermode: 'closest',
                    plot_bgcolor: '#1e293b',
                    paper_bgcolor: '#0f172a',
                    font: {{
                        color: '#ffffff'
                    }}
                }};

                Plotly.newPlot('myDiv', traces, layout);
            </script>
            <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin-top: 20px;">
                <h3>Model Metrics</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background: #ddd;">
                        <th style="padding: 8px; text-align: left;">Scaler</th>
                        <th style="padding: 8px; text-align: left;">Training Score</th>
                        <th style="padding: 8px; text-align: left;">Validation Score</th>
                    </tr>
                    <tr>
                        <td style="padding: 8px;"><strong>MinMaxScaler</strong></td>
                        <td style="padding: 8px;">{visualization_data['metrics'].get('MinMaxScaler_train', 'N/A')}</td>
                        <td style="padding: 8px;">{visualization_data['metrics'].get('MinMaxScaler_val', 'N/A')}</td>
                    </tr>
                    <tr style="background: #f8f8f8;">
                        <td style="padding: 8px;"><strong>StandardScaler</strong></td>
                        <td style="padding: 8px;">{visualization_data['metrics'].get('StandardScaler_train', 'N/A')}</td>
                        <td style="padding: 8px;">{visualization_data['metrics'].get('StandardScaler_val', 'N/A')}</td>
                    </tr>
                </table>
                <p style="margin-top: 10px;"><em>Higher silhouette score indicates better separation between genres. Training vs Validation scores help detect overfitting.</em></p>
            </div>
        </body>
    </html>
    """
    return html_content

@app.get("/api/visualization/data")
async def get_visualization_data():
    """
    Returns visualization data as JSON for frontend consumption
    """
    if not visualization_data:
        raise HTTPException(status_code=404, detail="No visualization data available. Model has not been trained yet or cache is empty.")
    
    return {
        "x": visualization_data['x'],
        "y": visualization_data['y'],
        "genres": visualization_data['genres'],
        "scaler": visualization_data['scaler'],
        "metrics": visualization_data['metrics']
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
                            AND p.ProductID > 0
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
        console.log(f"Error fetching top played songs: {e}")
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
        console.log(f"Error recording interaction: {e}")
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


@app.post("/api/audio/extract-features/{product_id}")
async def extract_product_features(product_id: int):
    """
    Extract audio features for a single product using librosa (industry-standard).
    This endpoint can be used to:
    1. Extract features for a new product
    2. Re-extract features with improved accuracy (no hardcoded genre logic)
    
    Returns the extracted features and optionally updates the cache.
    """
    try:
        # Get file_url from database
        with get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT ProductID, AlbumTitle, file_url 
                    FROM Products 
                    WHERE ProductID = %s AND file_url IS NOT NULL
                """, (product_id,))
                product = cursor.fetchone()
                
                if not product:
                    raise HTTPException(status_code=404, detail=f"Product {product_id} not found or has no audio file")
        
        # Extract features using librosa
        features = await extract_features_for_product_async(product_id, product['file_url'])
        
        if not features:
            raise HTTPException(status_code=500, detail=f"Failed to extract features for product {product_id}")
        
        # Classify genre using K-Means clustering
        genre = classify_genre_from_features(
            features['tempo'],
            features['energy'],
            features['valence'],
            features['danceability'],
            features['acousticness']
        )
        
        # Update cache with new features
        audio_features_cache[product_id] = {
            'id': product_id,
            'tempo': features['tempo'],
            'energy': features['energy'],
            'valence': features['valence'],
            'danceability': features['danceability'],
            'acousticness': features['acousticness'],
            'genre': genre,
            'spectral_centroid': features.get('spectral_centroid', 1500.0),
            'spectral_rolloff': features.get('spectral_rolloff', 3000.0),
            'zero_crossing_rate': features.get('zero_crossing_rate', 0.05),
            'instrumentalness': features.get('instrumentalness', 0.5),
            'loudness': features.get('loudness', -60.0),
            'speechiness': features.get('speechiness', 0.1)
        }
        
        # Insert into database with classified genre
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    sql = """
                        INSERT INTO AudioFeatures (
                            ProductID, Tempo, Energy, Danceability, Valence,
                            Acousticness, Instrumentalness, Loudness, Speechiness,
                            SpectralCentroid, SpectralRolloff, ZeroCrossingRate, Genre
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                        )
                        ON DUPLICATE KEY UPDATE
                            Tempo = VALUES(Tempo),
                            Energy = VALUES(Energy),
                            Danceability = VALUES(Danceability),
                            Valence = VALUES(Valence),
                            Acousticness = VALUES(Acousticness),
                            Instrumentalness = VALUES(Instrumentalness),
                            Loudness = VALUES(Loudness),
                            Speechiness = VALUES(Speechiness),
                            SpectralCentroid = VALUES(SpectralCentroid),
                            SpectralRolloff = VALUES(SpectralRolloff),
                            ZeroCrossingRate = VALUES(ZeroCrossingRate),
                            Genre = VALUES(Genre)
                    """
                    cursor.execute(sql, (
                        product_id,
                        features['tempo'],
                        features['energy'],
                        features['danceability'],
                        features['valence'],
                        features['acousticness'],
                        features.get('instrumentalness', 0.5),
                        features.get('loudness', -60.0),
                        features.get('speechiness', 0.1),
                        features.get('spectral_centroid', 1500.0),
                        features.get('spectral_rolloff', 3000.0),
                        features.get('zero_crossing_rate', 0.05),
                        genre
                    ))
                    conn.commit()
                    console.log(f"✅ Features saved to database for product {product_id} with genre: {genre}")
        
        return {
            "status": "success",
            "product_id": product_id,
            "album_title": product['AlbumTitle'],
            "features": features,
            "genre": genre,
            "saved_to_database": True,
            "extraction_method": "librosa_industry_standard"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        console.log(f"❌ Error extracting features for product {product_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/audio/extract-all-features")
async def extract_all_product_features(limit: int = 197, save_to_db: bool = True):
    """
    Extract audio features for all music products using librosa.
    This replaces the hardcoded genre/mood classification with industry-standard audio analysis.
    
    Args:
        limit: Maximum number of products to process (default 50 for safety)
        save_to_db: Whether to save extracted features to AudioFeatures table (default True)
    
    Returns:
        Summary of extraction results
    """
    try:
        # Get all music products from database
        with get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT ProductID, AlbumTitle, file_url 
                    FROM Products 
                    WHERE AlbumTitle IS NOT NULL 
                    AND AlbumTitle != 'Selected Electronic Works'
                    AND file_url IS NOT NULL
                    LIMIT %s
                """, (limit,))
                products = cursor.fetchall()
        
        console.log(f"🎵 Starting librosa feature extraction for {len(products)} products...")
        console.log(f"   Save to database: {save_to_db}")
        
        success_count = 0
        error_count = 0
        db_insert_count = 0
        results = []
        
        for product in products:
            product_id = product['ProductID']
            console.log(f"   Processing: {product['AlbumTitle']} (ID: {product_id})")
            
            try:
                # Detect URL type and use appropriate extraction function
                file_url = product['file_url']
                if 'itunes.apple.com' in file_url or 'audio-ssl.itunes.apple.com' in file_url:
                    # iTunes preview URL - use sync function in thread pool
                    loop = asyncio.get_event_loop()
                    features = await loop.run_in_executor(
                        executor,
                        extract_audio_features_from_preview,
                        file_url,
                        product_id
                    )
                else:
                    # S3 URL - use async function
                    features = await extract_features_for_product_async(product_id, file_url)
                
                if features:
                    # Classify genre using K-Means clustering
                    genre = classify_genre_from_features(
                        features['tempo'],
                        features['energy'],
                        features['valence'],
                        features['danceability'],
                        features['acousticness']
                    )
                    
                    # Update cache
                    audio_features_cache[product_id] = {
                        'id': product_id,
                        'tempo': features['tempo'],
                        'energy': features['energy'],
                        'valence': features['valence'],
                        'danceability': features['danceability'],
                        'acousticness': features['acousticness'],
                        'genre': genre,
                        'spectral_centroid': features.get('spectral_centroid', 1500.0),
                        'spectral_rolloff': features.get('spectral_rolloff', 3000.0),
                        'zero_crossing_rate': features.get('zero_crossing_rate', 0.05),
                        'instrumentalness': features.get('instrumentalness', 0.5),
                        'loudness': features.get('loudness', -60.0),
                        'speechiness': features.get('speechiness', 0.1)
                    }
                    
                    # Insert into database if requested
                    if save_to_db:
                        with get_db_connection() as conn:
                            if conn:
                                with conn.cursor() as cursor:
                                    sql = """
                                        INSERT INTO AudioFeatures (
                                            ProductID, Tempo, Energy, Danceability, Valence,
                                            Acousticness, Instrumentalness, Loudness, Speechiness,
                                            SpectralCentroid, SpectralRolloff, ZeroCrossingRate, Genre
                                        ) VALUES (
                                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                                        )
                                        ON DUPLICATE KEY UPDATE
                                            Tempo = VALUES(Tempo),
                                            Energy = VALUES(Energy),
                                            Danceability = VALUES(Danceability),
                                            Valence = VALUES(Valence),
                                            Acousticness = VALUES(Acousticness),
                                            Instrumentalness = VALUES(Instrumentalness),
                                            Loudness = VALUES(Loudness),
                                            Speechiness = VALUES(Speechiness),
                                            SpectralCentroid = VALUES(SpectralCentroid),
                                            SpectralRolloff = VALUES(SpectralRolloff),
                                            ZeroCrossingRate = VALUES(ZeroCrossingRate),
                                            Genre = VALUES(Genre)
                                    """
                                    cursor.execute(sql, (
                                        product_id,
                                        features['tempo'],
                                        features['energy'],
                                        features['danceability'],
                                        features['valence'],
                                        features['acousticness'],
                                        features.get('instrumentalness', 0.5),
                                        features.get('loudness', -60.0),
                                        features.get('speechiness', 0.1),
                                        features.get('spectral_centroid', 1500.0),
                                        features.get('spectral_rolloff', 3000.0),
                                        features.get('zero_crossing_rate', 0.05),
                                        genre
                                    ))
                                    conn.commit()
                                    db_insert_count += 1
                                    console.log(f"   ✅ Saved to database with genre: {genre}")
                    
                    success_count += 1
                    results.append({
                        "product_id": product_id,
                        "album_title": product['AlbumTitle'],
                        "status": "success",
                        "saved_to_db": save_to_db,
                        "tempo": features['tempo'],
                        "energy": features['energy']
                    })
                else:
                    error_count += 1
                    results.append({
                        "product_id": product_id,
                        "album_title": product['AlbumTitle'],
                        "status": "failed"
                    })
            except Exception as e:
                error_count += 1
                console.log(f"   ❌ Error: {e}")
                results.append({
                    "product_id": product_id,
                    "album_title": product['AlbumTitle'],
                    "status": "error",
                    "error": str(e)
                })
        
        console.log(f"✅ Extraction complete: {success_count} success, {error_count} errors")
        if save_to_db:
            console.log(f"💾 Database inserts: {db_insert_count}")
        
        return {
            "status": "complete",
            "total_processed": len(products),
            "success_count": success_count,
            "error_count": error_count,
            "db_insert_count": db_insert_count if save_to_db else 0,
            "saved_to_database": save_to_db,
            "extraction_method": "librosa_industry_standard",
            "results": results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        console.log(f"❌ Batch extraction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
        console.log(f"✅ Using cached features for {len(products)} products")
                        
        
        # Sets whatever audio features are available from the 
        # frontend request as the current audio features of the currently playing song
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
        console.log(f"🎵 Calculating similarity with tempo: {current_tempo} BPM (effective_tempo: {request.audio_features.effective_tempo}, base_tempo: {request.audio_features.tempo}, playback rate: {playback_rate}x)")
        
        
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
            # e.g If Song A has energy 0.8 and Song B has 0.8, the difference is 0.0.
            # e.g If Song A has 0.9 and Song B has 0.2, the difference is 0.7.
            energy_diff = abs(product["energy"] - current_energy)

            # 1 - energy_diff: This inverts the difference to create a "match" score.
            # Large difference (e.g., 0.7) becomes a Low score (0.3 - Poor Match).
            # max(0, ...): This is a safety guard. It ensures the score never goes 
            # below zero (becomes negative), keeping the result strictly between 0 and 1.
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

            # Weights are applied to prioritize certain audio features over others based on how 
            # human listeners actually perceive musical similarity.
            # Not all features are equally important when deciding if two songs "feel" the same

            # Energy (35%) & Tempo (25%) combined make up 60% of the score.
            # This is because the "intensity" and "speed" of a track are the first things a listener notices
            similarity = (
                tempo_match * 0.25 +      # Tempo match weight
                energy_match * 0.35 +     # Energy match weight (highest)
                mood_match * 0.20 +       # Mood/valence weight
                dance_match * 0.15 +      # Danceability weight
                acoustic_match * 0.05     # Acousticness weight
            )

            # Debug: Log high similarity matches to verify computation
            if similarity > 0.8:
                console.log(f"✨ Strong Match: Song {product['id']} | Sim: {similarity:.3f} | Tempo: {tempo_match:.2f} | Energy: {energy_match:.2f}", flush=True)

            
            # Genre bonus (same genre gets small boost)
            current_genre = audio_features_cache.get(request.current_product_id, {}).get('genre', 'Unknown')
            if product["genre"] == current_genre and current_genre != 'Unknown':
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
            "features_analyzed": ["tempo", "energy", "valence", "danceability", "acousticness"],
            "model_metrics": model_performance_metrics
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {str(e)}")


# ============================================
# INDUSTRY-STANDARD AUDIO FEATURE EXTRACTION (LIBROSA)
# ============================================

def classify_genre_from_features(tempo: float, energy: float, valence: float, danceability: float, acousticness: float) -> str:
    """
    Classify genre using K-Means clustering on audio features.
    Automatically detects 3 genre clusters: Energetic, Calm, Balanced.
    
    Args:
        tempo: BPM
        energy: 0-1
        valence: 0-1 (mood/brightness)
        danceability: 0-1
        acousticness: 0-1
    
    Returns:
        Genre label ("Energetic", "Calm", or "Balanced")
    """
    global genre_classifier
    
    # Train classifier if not already trained
    if genre_classifier is None and len(audio_features_cache) >= 10:
        # Extract features from cache
        X_train = []
        for pid, data in audio_features_cache.items():
            if all(k in data for k in ['tempo', 'energy', 'valence', 'danceability', 'acousticness']):
                X_train.append([
                    float(data['tempo'] or 0) / 200.0,  # Normalize tempo (0-200 BPM -> 0-1)
                    float(data['energy'] or 0),
                    float(data['valence'] or 0),
                    float(data['danceability'] or 0),
                    float(data['acousticness'] or 0)
                ])
        
        if len(X_train) >= 10:
            # Normalize features
            scaler = StandardScaler()
            X_scaled = scaler.fit_transform(X_train)
            
            # Fit K-Means with 3 clusters
            genre_classifier = {
                'model': KMeans(n_clusters=3, random_state=42, n_init=10),
                'scaler': scaler
            }
            genre_classifier['model'].fit(X_scaled)
            
            # Determine which cluster represents which genre based on centroids
            centroids = genre_classifier['model'].cluster_centers_
            # Energy is index 1 in scaled features
            energy_values = centroids[:, 1]
            
            # Sort clusters by energy: Low energy = Calm, High energy = Energetic, Middle = Balanced
            sorted_indices = np.argsort(energy_values)
            genre_classifier['mapping'] = {
                sorted_indices[0]: "Calm",       # Lowest energy cluster
                sorted_indices[1]: "Balanced",   # Middle energy cluster  
                sorted_indices[2]: "Energetic"   # Highest energy cluster
            }
            
            console.log(f"✅ Genre classifier trained with 3 clusters (Energetic, Calm, Balanced)")
    
    # Classify the new features
    if genre_classifier:
        features = np.array([[tempo, energy, valence, danceability, acousticness]])
        features_scaled = genre_classifier['scaler'].transform(features)
        cluster = genre_classifier['model'].predict(features_scaled)[0]
        return genre_classifier['mapping'][cluster]
    else:
        # Fallback: Simple heuristic classification
        if energy > 0.7:
            return "Energetic"
        elif energy < 0.3:
            return "Calm"
        else:
            return "Balanced"

def extract_audio_features_librosa(audio_url: str, product_id: int) -> Optional[Dict]:
    """
    Extract audio features from any audio URL using librosa.
    Uses industry-standard audio analysis for tempo, energy, valence, danceability, acousticness.
    NO hardcoded genre/mood classification - purely data-driven.
    
    This is the same approach used for iTunes but works for S3/database songs.
    
    Args:
        audio_url: URL to audio file (S3 presigned URL or direct link)
        product_id: Product ID for logging
        
    Returns:
        Dict with extracted features or None if extraction fails
    """
    try:
        import librosa
        
        # Validate URL format
        parsed_url = urlparse(audio_url)
        path = parsed_url.path.lower()
        
        # Skip non-audio files (ZIP, etc.)
        if path.endswith('.zip') or path.endswith('.rar') or path.endswith('.7z'):
            console.log(f"⚠️ Skipping audio analysis for archive file (product {product_id})")
            return None
        
        # Download the audio file with longer timeout for S3 presigned URLs
        try:
            response = httpx.get(audio_url, timeout=30.0, follow_redirects=True)
            if response.status_code != 200:
                console.log(f"⚠️ Failed to download audio for product {product_id}: {response.status_code}")
                return None
        except httpx.TimeoutException:
            console.log(f"⚠️ Timeout downloading audio for product {product_id}")
            return None
        except Exception as e:
            console.log(f"⚠️ Network error downloading audio for product {product_id}: {e}")
            return None
        
        # Determine file extension from URL or default to wav
        if '.mp3' in path:
            suffix = '.mp3'
        elif '.m4a' in path:
            suffix = '.m4a'
        elif '.wav' in path:
            suffix = '.wav'
        else:
            suffix = '.wav'  # Default
        
        # Save to temp file and load with librosa
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
            tmp_file.write(response.content)
            tmp_path = tmp_file.name
        
        try:
            # Load audio file (first 30 seconds for consistency)
            y, sr = librosa.load(tmp_path, sr=22050, mono=True, duration=30)
            
            # ===== TEMPO (BPM) =====
            # Extract tempo using beat tracking
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            tempo = float(tempo) if hasattr(tempo, '__float__') else float(tempo[0]) if len(tempo) > 0 else 120.0
            
            # ===== ENERGY =====
            # RMS energy normalized to 0-1 range
            rms = librosa.feature.rms(y=y)[0]
            energy = float(np.mean(rms) / np.max(rms)) if np.max(rms) > 0 else 0.5
            energy = min(1.0, max(0.0, energy * 2))  # Scale to 0-1 range
            
            # ===== SPECTRAL FEATURES =====
            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
            spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
            
            # ===== VALENCE (Brightness/Positivity) =====
            # Estimated from spectral centroid - brighter sounds tend to feel more positive
            valence = float(np.mean(spectral_centroid) / sr)
            valence = min(1.0, max(0.0, valence * 4))
            
            # ===== DANCEABILITY =====
            # Combination of tempo stability and beat strength
            onset_env = librosa.onset.onset_strength(y=y, sr=sr)
            pulse = librosa.beat.plp(onset_envelope=onset_env, sr=sr)
            danceability = float(np.mean(pulse))
            danceability = min(1.0, max(0.0, danceability))
            
            # ===== ACOUSTICNESS =====
            # Ratio of low frequency to total energy
            spec = np.abs(librosa.stft(y))
            low_freq_energy = np.mean(spec[:int(spec.shape[0] * 0.1), :])
            total_energy = np.mean(spec)
            acousticness = float(low_freq_energy / total_energy) if total_energy > 0 else 0.3
            acousticness = min(1.0, max(0.0, acousticness * 2))
            
            # ===== LOUDNESS (dB) =====
            S = librosa.stft(y)
            loudness = float(librosa.amplitude_to_db(np.abs(S), ref=np.max).mean())
            
            # ===== INSTRUMENTALNESS =====
            # Lack of vocal frequencies (using zero crossing rate as proxy)
            zcr = librosa.feature.zero_crossing_rate(y)[0]
            zero_crossing_rate = float(np.mean(zcr))
            instrumentalness = float(np.clip(1 - zero_crossing_rate * 2, 0, 1))
            
            # ===== SPEECHINESS =====
            speechiness = float(1 - instrumentalness)
            
            features = {
                'product_id': product_id,
                'tempo': round(tempo, 2),
                'energy': round(energy, 3),
                'valence': round(valence, 3),
                'danceability': round(danceability, 3),
                'acousticness': round(acousticness, 3),
                'loudness': round(loudness, 2),
                'instrumentalness': round(instrumentalness, 3),
                'speechiness': round(speechiness, 3),
                'spectral_centroid': round(float(np.mean(spectral_centroid)), 2),
                'spectral_rolloff': round(float(np.mean(spectral_rolloff)), 2),
                'zero_crossing_rate': round(zero_crossing_rate, 4),
            }
            
            console.log(f"✅ Librosa extracted features for product {product_id}: tempo={tempo:.1f}, energy={energy:.2f}, valence={valence:.2f}")
            return features
            
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)
            
    except ImportError as e:
        console.log(f"❌ librosa required but not available: {e}")
        return None
    except Exception as e:
        console.log(f"❌ Error extracting audio features for product {product_id}: {e}")
        return None


async def extract_features_for_product_async(product_id: int, file_url: str) -> Optional[Dict]:
    """
    Async wrapper to extract audio features from S3 in a thread pool.
    Used for real-time feature extraction when cache is empty.
    """
    loop = asyncio.get_event_loop()
    
    # Generate presigned URL if needed
    presigned_url = generate_presigned_url(file_url) if file_url else None
    if not presigned_url:
        return None
    
    # Run librosa extraction in thread pool (CPU-bound operation)
    features = await loop.run_in_executor(
        executor,
        extract_audio_features_librosa,
        presigned_url,
        product_id
    )
    
    return features


# ============================================
# ML-BASED ITUNES SIMILARITY SERVICE
# ============================================

# iTunes API configuration from environment
ITUNES_API_BASE_URL = os.getenv('ITUNES_API_BASE_URL', 'https://itunes.apple.com')

# Cache for extracted iTunes audio features
itunes_features_cache: Dict[int, Dict] = {}

# Trained feature scaler for normalization (will be fit on first use)
feature_scaler = None

# K-Means model for automatic genre clustering (3 clusters: Energetic, Calm, Balanced)
genre_classifier = None
genre_labels = ["Energetic", "Calm", "Balanced"]

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
            console.log(f"⚠️ Skipping audio analysis for archive file: {audio_url}")
            return None

        import librosa
        
        # Download the preview audio
        # Download the preview audio with longer timeout for S3 presigned URLs
        try:
            response = httpx.get(audio_url, timeout=15.0, follow_redirects=True)
            if response.status_code != 200:
                console.log(f"⚠️ Failed to download preview for track {track_id}: {response.status_code}")
                return None
        except httpx.TimeoutException:
            console.log(f"⚠️ Timeout downloading preview for track {track_id}")
            return None
        except Exception as e:
            console.log(f"⚠️ Network error downloading preview for track {track_id}: {e}")
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
            
            console.log(f"✅ Extracted features for track {track_id}: tempo={tempo:.1f}, energy={energy:.2f}")
            return features
            
        finally:
            os.unlink(tmp_path)
            
    except ImportError as e:
        console.log(f"❌ librosa required but not available: {e}")
        raise HTTPException(status_code=503, detail="Audio analysis library (librosa) not available")
    except Exception as e:
        console.log(f"❌ Error extracting audio features for track {track_id}: {e}")
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
        console.log(f"❌ iTunes search error: {e}")
        raise HTTPException(status_code=500, detail=f"Error searching iTunes: {str(e)}")


@app.delete("/api/itunes/clear-imported-songs")
async def clear_imported_songs():
    """
    Delete all imported iTunes songs (negative ProductIDs) from the database.
    This removes both Products and AudioFeatures entries.
    """
    try:
        console.log("🗑️  Starting cleanup of imported songs...")
        deleted_count = 0
        
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    # Delete from AudioFeatures first (foreign key constraint)
                    cursor.execute("DELETE FROM AudioFeatures WHERE ProductID < 0")
                    audio_deleted = cursor.rowcount
                    
                    # Delete from Products
                    cursor.execute("DELETE FROM Products WHERE ProductID < 0")
                    products_deleted = cursor.rowcount
                    
                    conn.commit()
                    deleted_count = products_deleted
                    
                    console.log(f"   ✅ Deleted {products_deleted} products and {audio_deleted} audio features")
        
        # Reload cache after cleanup
        global cache_loaded
        cache_loaded = False
        
        console.log(f"🎉 Cleanup complete: {deleted_count} imported songs removed")
        
        return {
            "status": "success",
            "deleted_count": deleted_count,
            "message": f"Successfully removed {deleted_count} imported songs from database"
        }
        
    except Exception as e:
        console.log(f"❌ Cleanup error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")


@app.post("/api/itunes/import-to-database")
async def import_itunes_songs_to_database(limit: int = 100, genre: str = "electronic"):
    """
    Import iTunes songs into the database to increase dataset size for better similarity scores.
    
    Steps:
    1. Search iTunes for songs (default: electronic genre)
    2. Extract audio features from preview URLs
    3. Insert into Products table (with negative ProductIDs to avoid conflicts)
    4. Insert features into AudioFeatures table
    5. Reload cache
    
    Args:
        limit: Number of songs to import (default 100)
        genre: Genre to search for (default "electronic")
    
    Returns:
        Summary of imported songs
    """
    try:
        console.log(f"🎵 Starting iTunes import: {limit} {genre} songs...")
        
        # 1. Search iTunes API
        itunes_url = f"{ITUNES_API_BASE_URL}/search"
        params = {"term": genre, "limit": limit, "media": "music", "entity": "song"}
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(itunes_url, params=params)
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="iTunes API error")
            
            data = response.json()
            results = data.get('results', [])
        
        console.log(f"   Found {len(results)} iTunes songs")
        
        # 2. Extract features and insert into database
        imported_count = 0
        skipped_count = 0
        error_count = 0
        imported_songs = []
        
        for track in results:
            track_id = track.get('trackId')
            preview_url = track.get('previewUrl')
            
            if not preview_url:
                skipped_count += 1
                continue
            
            try:
                # Use negative IDs to avoid conflicts with existing products
                product_id = -track_id
                
                # Check if already exists
                with get_db_connection() as conn:
                    if conn:
                        with conn.cursor() as cursor:
                            cursor.execute("SELECT ProductID FROM Products WHERE ProductID = %s", (product_id,))
                            if cursor.fetchone():
                                skipped_count += 1
                                continue
                
                # Extract features from preview URL
                features = await asyncio.get_event_loop().run_in_executor(
                    executor,
                    extract_audio_features_from_preview,
                    preview_url,
                    track_id
                )
                
                if not features:
                    error_count += 1
                    continue
                
                # Classify genre using K-Means
                genre_label = classify_genre_from_features(
                    features['tempo'],
                    features['energy'],
                    features['valence'],
                    features['danceability'],
                    features['acousticness']
                )
                
                # Insert into Products table
                with get_db_connection() as conn:
                    if conn:
                        with conn.cursor() as cursor:
                            # Insert into Products
                            cursor.execute("""
                                INSERT INTO Products (
                                    ProductID, AlbumTitle, AlbumPrice,
                                    albumCoverImageUrl, file_url, preview_url
                                ) VALUES (%s, %s, %s, %s, %s, %s)
                            """, (
                                product_id,
                                track.get('trackName', 'Unknown'),
                                track.get('trackPrice', 0.99),
                                track.get('artworkUrl100', ''),
                                preview_url,  # Use preview as full file for iTunes
                                preview_url
                            ))
                            
                            # Insert into AudioFeatures
                            cursor.execute("""
                                INSERT INTO AudioFeatures (
                                    ProductID, Tempo, Energy, Danceability, Valence,
                                    Acousticness, Instrumentalness, Loudness, Speechiness,
                                    SpectralCentroid, SpectralRolloff, ZeroCrossingRate, Genre
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """, (
                                product_id,
                                features['tempo'],
                                features['energy'],
                                features['danceability'],
                                features['valence'],
                                features['acousticness'],
                                features.get('instrumentalness', 0.5),
                                features.get('loudness', -60.0),
                                features.get('speechiness', 0.1),
                                features.get('spectral_centroid', 1500.0),
                                features.get('spectral_rolloff', 3000.0),
                                features.get('zero_crossing_rate', 0.05),
                                genre_label
                            ))
                            
                            conn.commit()
                
                imported_count += 1
                imported_songs.append({
                    "product_id": product_id,
                    "track_name": track.get('trackName'),
                    "artist": track.get('artistName'),
                    "genre": genre_label,
                    "tempo": features['tempo'],
                    "energy": features['energy']
                })
                
                console.log(f"   ✅ Imported: {track.get('trackName')} by {track.get('artistName')} (Genre: {genre_label})")
                
            except Exception as e:
                error_count += 1
                console.log(f"   ❌ Error importing track {track_id}: {e}")
        
        # 3. Reload cache to include new songs
        console.log("   🔄 Reloading cache with new songs...")
        global audio_features_cache, cache_loaded
        
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    sql = """
                        SELECT 
                            ProductID, Tempo, Energy, Valence, Danceability,
                            Acousticness, Genre, SpectralCentroid, SpectralRolloff,
                            ZeroCrossingRate, Instrumentalness, Loudness, Speechiness
                        FROM AudioFeatures
                        WHERE Tempo IS NOT NULL AND Energy IS NOT NULL
                    """
                    cursor.execute(sql)
                    results = cursor.fetchall()
                    
                    audio_features_cache.clear()
                    for row in results:
                        audio_features_cache[row['ProductID']] = {
                            'id': row['ProductID'],
                            'tempo': row['Tempo'],
                            'energy': row['Energy'],
                            'valence': row['Valence'],
                            'danceability': row['Danceability'],
                            'acousticness': row['Acousticness'],
                            'genre': row['Genre'],
                            'spectral_centroid': row.get('SpectralCentroid', 1500.0),
                            'spectral_rolloff': row.get('SpectralRolloff', 3000.0),
                            'zero_crossing_rate': row.get('ZeroCrossingRate', 0.05),
                            'instrumentalness': row.get('Instrumentalness', 0.5),
                            'loudness': row.get('Loudness', -60.0),
                            'speechiness': row.get('Speechiness', 0.1)
                        }
                    
                    cache_loaded = True
                    console.log(f"   ✅ Cache reloaded: {len(audio_features_cache)} total songs")
        
        console.log(f"🎉 Import complete: {imported_count} imported, {skipped_count} skipped, {error_count} errors")
        
        return {
            "status": "success",
            "imported_count": imported_count,
            "skipped_count": skipped_count,
            "error_count": error_count,
            "total_in_cache": len(audio_features_cache),
            "imported_songs": imported_songs[:10],  # Return first 10 for preview
            "message": f"Successfully imported {imported_count} iTunes songs. Cache now contains {len(audio_features_cache)} songs total."
        }
        
    except Exception as e:
        console.log(f"❌ iTunes import error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
    2. Normalize features using pre-trained Scaler (from DB Training Set) for generalized comparison
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
        
        console.log(f"🔍 Looking up target song {target_id} in cache ({len(audio_features_cache)} items)")
        console.log(f"🔍 Cache keys sample: {list(audio_features_cache.keys())[:5]}")
        
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
            console.log(f"✅ Using cached DB features for target song {target_id}")
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
                console.log(f"❌ Audio analysis execution error: {e}")
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
        
        console.log(f"🔍 Checking {len(songs_to_process)} songs against cache. In cache: {cached_count}/{len(songs_to_process)}")
        
        if all_in_cache:
            # Fast path - all songs are pre-analyzed in database
            console.log(f"✅ Fast path: All {len(songs_to_process)} songs found in (DB/iTunes) cache")
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
            console.log(f"⚠️ Slow path: Some songs need analysis")
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
                        console.log(f"Error processing song {song.trackId}: {res}")
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
        
        # Step 4: Normalize features using Scaler
        # Squashes all audio features (tempo, energy) numbers into a range between 0.0 and 1.0
        # using trained scaler for normalization.
        all_features = np.vstack([target_vec, song_matrix])
        
        # Use the global scaler fitted on the Training Set (Generalization)
        # This applies the population's distribution knowledge to this specific artist
        try:
            if feature_scaler is not None:
                console.log("📊 Scaling features using global feature scaler...", flush=True)
                normalized_features = feature_scaler.transform(all_features)
                console.log(f"   Target Normalized: {normalized_features[0]}", flush=True)
            else:
                console.log("⚠️ No feature scaler available (insufficient training data). Using raw features.", flush=True)
                normalized_features = all_features
        except Exception as e:
            console.log(f"❌ Error during feature scaling: {e}", flush=True)
            # Fallback to raw features if scaling fails
            normalized_features = all_features
   
        normalized_target = normalized_features[0:1]  # First row is target
        normalized_songs = normalized_features[1:]    # Rest are candidates
        

        # Step 5: Compute cosine similarity

        # It draws a line (vector) from zero to the Target Song.
        # It draws vectors from zero to every Candidate Song.
        # Cosine Similarity calculates the angle between those two lines where they meet at the origin.
        # If the lines point in the same direction (Angle = 0), the songs are 100% similar.
        # If they point in different directions, they are less similar.
        similarities = cosine_similarity(normalized_target, normalized_songs)[0]
        
        console.log(f"✅ Computed {len(similarities)} similarity scores.", flush=True)
        if len(similarities) > 0:
            console.log(f"   Top Similarity: {max(similarities):.4f}", flush=True)
            console.log(f"   Avg Similarity: {np.mean(similarities):.4f}", flush=True)
        

        # Step 6: Calculate weighted similarity for all songs and sort

        # Sorts the songs by their similarity score (e.g., 95% match, 80% match...).
        # Explains why it matched. It looks at the raw numbers to see which feature was the closest.
        # Example: "Matching energy (High Energy)" vs "Similar tempo (128 BPM)".
        
        # First, calculate weighted similarity for all songs
        weighted_similarities = []
        for idx in range(len(song_data)):
            data = song_data[idx]
            features = data['features']
            
            # Calculate individual feature matches
            tempo_match = 1 - min(abs(target_features['tempo'] - features['tempo']) / 100, 1)
            energy_match = 1 - abs(target_features['energy'] - features['energy'])
            mood_match = 1 - abs(target_features['valence'] - features['valence'])
            dance_match = 1 - abs(target_features['danceability'] - features['danceability'])
            
            # Calculate overall similarity as weighted average
            overall_similarity = (
                tempo_match * 0.25 +      # 25% weight on tempo
                energy_match * 0.30 +     # 30% weight on energy
                mood_match * 0.20 +       # 20% weight on mood
                dance_match * 0.25        # 25% weight on danceability
            )
            weighted_similarities.append(overall_similarity)
        
        # Sort by weighted similarity
        sorted_indices = np.argsort(weighted_similarities)[::-1][:request.limit]
              

        # Step 7: Build response with detailed feature matching
        similar_songs = []
        feature_names = ['tempo', 'energy', 'valence', 'danceability', 'acousticness']
        
        for idx in sorted_indices:
            data = song_data[idx]
            song = data['song']
            features = data['features']
            
            # Calculate individual feature matches (recalculate for display)
            tempo_match = 1 - min(abs(target_features['tempo'] - features['tempo']) / 100, 1)
            energy_match = 1 - abs(target_features['energy'] - features['energy'])
            mood_match = 1 - abs(target_features['valence'] - features['valence'])
            dance_match = 1 - abs(target_features['danceability'] - features['danceability'])
            
            # Use the pre-calculated weighted similarity
            overall_similarity = weighted_similarities[idx]
            
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
                similarity_score=round(overall_similarity, 4),
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
        
        console.log(f"📊 Returning model_metrics in API response: {model_performance_metrics}", flush=True)
        
        return {
            "status": "success",
            "algorithm": "K-Nearest Neighbors with Cosine Similarity",
            "model_metrics": model_performance_metrics,
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
        console.log(f"❌ Artist similarity error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Artist similarity computation failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
