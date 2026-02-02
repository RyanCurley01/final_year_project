# audio_service/ml_service.py
import asyncio
import numpy as np
from typing import Dict
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import silhouette_score
from sklearn.decomposition import PCA

from utils import console
from database import get_db_connection

# EXECUTION ORDER: Global state initialization.
# Cache for audio features - loaded once at startup to avoid repeated DB queries
audio_features_cache: Dict[int, Dict] = {}
cache_loaded: bool = False
model_performance_metrics: Dict[str, float] = {
    "MinMaxScaler_train": 0.0, 
    "StandardScaler_train": 0.0,
    "MinMaxScaler_val": 0.0, 
    "StandardScaler_val": 0.0
} # Store model training and validation scores

visualization_data = None
feature_scaler = None

# Cache for extracted iTunes audio features
itunes_features_cache: Dict[int, Dict] = {}

# EXECUTION ORDER: Must be called at application startup (FastAPI 'on_event("startup")').
# Initializes the cache and trains the scaler.
async def startup_cache():
    """Load audio features cache on startup"""
    global audio_features_cache, cache_loaded
    global feature_scaler, model_performance_metrics, visualization_data
    
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
                            # Sanitize Tempo: If 0, set to default 120 (prevents visualizer issues)
                            if row['Tempo'] == 0:
                                row['Tempo'] = 120.0
                                
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
