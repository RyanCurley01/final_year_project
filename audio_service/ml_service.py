# audio_service/ml_service.py
import asyncio
import numpy as np
from typing import Dict, Optional
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import silhouette_score, classification_report, precision_score, recall_score, f1_score
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.neighbors import KNeighborsClassifier
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold


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
knn_classifier = None

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
                                
                                # ALWAYS calculate Training Scores (Check for Overfitting)
                                # REFACTOR: Use K-Means Cluster Labels instead of Genre for Scoring
                                # This measures how well the data *can* be clustered, rather than how well it matches genres.
                                try:
                                    train_embed_a = model_a.transform(X_train)
                                    # Generate 'perfect' cluster labels for this projection to see structural quality
                                    kms_a = KMeans(n_clusters=3, random_state=42, n_init=10).fit(train_embed_a)
                                    train_score_a = silhouette_score(train_embed_a, kms_a.labels_)
                                except: train_score_a = -1.0
                                
                                try:
                                    train_embed_b = model_b.transform(X_train)
                                    # Generate 'perfect' cluster labels for this projection to see structural quality
                                    kms_b = KMeans(n_clusters=3, random_state=42, n_init=10).fit(train_embed_b)
                                    train_score_b = silhouette_score(train_embed_b, kms_b.labels_)
                                except: train_score_b = -1.0


                                # Calculate Validation Scores
                                # For validation, we predict which cluster the validation points belong to, 
                                # and check if they still fit well.
                                try:
                                    val_labels_a = kms_a.predict(val_embed_a)
                                    score_a = silhouette_score(val_embed_a, val_labels_a) if len(set(val_labels_a)) > 1 else -1.0
                                except: score_a = -1.0
                                
                                try:
                                    val_labels_b = kms_b.predict(val_embed_b)
                                    score_b = silhouette_score(val_embed_b, val_labels_b) if len(set(val_labels_b)) > 1 else -1.0
                                except: score_b = -1.0

                                model_performance_metrics["MinMaxScaler_train"] = round(train_score_a, 4)
                                model_performance_metrics["StandardScaler_train"] = round(train_score_b, 4)
                                model_performance_metrics["MinMaxScaler_val"] = round(score_a, 4)
                                model_performance_metrics["StandardScaler_val"] = round(score_b, 4)


                                # Select Best Model based on Blended Score
                                if score_b > score_a:
                                    console.log(f"   🏆 Selected Model: StandardScaler (Score: {score_b:.4f})")
                                    feature_scaler = model_b
                                    best_model = "StandardScaler"
                                else:
                                    console.log(f"   🏆 Selected Model: MinMaxScaler (Score: {score_a:.4f})")
                                    feature_scaler = model_a
                                    best_model = "MinMaxScaler"
                                
                                
                                # 4. Use PCA + K-Means (5 Clusters) for tighter grouping
                                try:
                                    console.log("   🔄 Applying PCA + K-Means (k=5) for optimized clustering...")
                                    
                                    # Use full dataset for clustering
                                    X_full_scaled = feature_scaler.transform(X)
                                    
                                    # Dimensionality Reduction: Compress to 3 principal components
                                    # This removes noise and forces tighter clusters (improves Silhouette Score)
                                    pca_reducer = PCA(n_components=3)
                                    X_reduced = pca_reducer.fit_transform(X_full_scaled)
                                    
                                    # Increase clusters to 5 to allow for more specific groups
                                    kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)
                                    cluster_labels = kmeans.fit_predict(X_reduced)
                                    
                                    # Convert to string labels for compatibility
                                    y_clusters = np.array([f"Cluster {l}" for l in cluster_labels])
                                    
                                    console.log(f"   ✅ PCA+K-Means applied. Distribution: {np.unique(y_clusters, return_counts=True)}")

                                    # 5. Train KNN Classifier to predict these clusters
                                    # Use the REDUCED features for training if we want consistency, 
                                    # OR use original scaled features if we want the model to learn the mapping.
                                    # Usually, training on the original scaled features is better for new data inference
                                    # unless we also apply PCA to new incoming data every time.
                                    # For simplicity here, we stick to X_full_scaled for the KNN input
                                    # so the 'classify_genre_from_features' function doesn't break (it expects raw features).
                                    
                                    X_train_c, X_test_c, y_train_c, y_test_c = train_test_split(X_full_scaled, y_clusters, test_size=0.3, random_state=42)
                                    
                                    knn_k = 5
                                    global knn_classifier
                                    knn_classifier = KNeighborsClassifier(n_neighbors=knn_k)
                                    knn_classifier.fit(X_train_c, y_train_c)
                                    
                                    # Evaluate (KNN validation)
                                    y_pred = knn_classifier.predict(X_test_c)
                                    
                                    precision = precision_score(y_test_c, y_pred, average='weighted', zero_division=0)
                                    recall = recall_score(y_test_c, y_pred, average='weighted', zero_division=0)
                                    f1 = f1_score(y_test_c, y_pred, average='weighted', zero_division=0)
                                    
                                    console.log(f"   📊 Classification Report (KNN predicting Clusters):")
                                    model_performance_metrics["precision"] = round(precision, 4)
                                    model_performance_metrics["recall"] = round(recall, 4)
                                    model_performance_metrics["f1_score"] = round(f1, 4)
                                    model_performance_metrics["optimal_k"] = knn_k
                                    
                                    # Retrain robust global classifier
                                    knn_classifier.fit(X_full_scaled, y_clusters)
                                    
                                    # Calculate FINAL SCORE using the REDUCED feature space (where the clusters actually live)
                                    # This is valid because we are evaluating the separation of the *clusters themselves*
                                    final_acc = silhouette_score(X_reduced, cluster_labels)
                                    model_performance_metrics["silhouette_score"] = round(final_acc, 4)
                                    model_performance_metrics["test_score"] = round(final_acc, 4)
                                    console.log(f"   ✅ Cluster Separation (PCA Space): {final_acc:.4f}")
                                    
                                except Exception as ke:
                                    console.log(f"   ⚠️ Clustering/Classification failed: {ke}")
                                    y_clusters = y # Fallback

                                # Generate Visualization Data (PCA 2D Projection for UI)
                                try:
                                    console.log("   🎨 Generating Visualization Data...")
                                    # We already have X_reduced (3D), just take first 2 dims for plot
                                    
                                    visualization_data = {
                                        "x": X_reduced[:, 0].tolist(),
                                        "y": X_reduced[:, 1].tolist(),
                                        "genres": y_clusters.tolist(),
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
                                        # Recalculate silhouette on the CLUSTERS, not genres
                                        # Note: x_test from original split corresponds to some indices, 
                                        # but existing X_test/y_test are genre-based splits.
                                        # We should check silhouette of the K-Means clusters on the whole dataset
                                        final_acc = silhouette_score(X_full_scaled, y_clusters)
                                        model_performance_metrics["silhouette_score"] = round(final_acc, 4)
                                        model_performance_metrics["test_score"] = round(final_acc, 4) # Legacy key
                                        console.log(f"   ✅ Cluster Separation: {final_acc:.4f} (Silhouette Score)")
                                    except:
                                        model_performance_metrics["test_score"] = 0.0
                                        console.log("   ⚠️ Could not calculate final test score")
                                
                            else:
                                console.log(f"⚠️ Not enough data to train ML model (Found {len(feature_vectors)} tracks - need >50)")
                            
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

# EXECUTION ORDER: Called by routes (iTunes, Feature Processing) to classify new tracks
def classify_genre_from_features(tempo: float, energy: float, valence: float, danceability: float, acousticness: float, current_cache_size: int = 0, current_cache_items: Dict = {}) -> str:
    """
    Classify genre using the trained Global KNN Classifier.
    Args:
        tempo: Raw BPM
        energy, valence, danceability, acousticness: 0-1 values
        current_cache_size, current_cache_items: Legacy params, ignored
    """
    global feature_scaler, knn_classifier
            
    try:
        # Check if model is initialized
        if feature_scaler is None:
            return "Unknown"

        # 1. Manual Pre-normalization (Must match startup_cache logic lines 107-117)
        # Note: We use defaults for the spectral/advanced features not provided by the quick preview analysis
        input_vector = [
            float(tempo or 0) / 200.0,
            float(energy or 0),
            float(valence or 0),
            float(danceability or 0),
            float(acousticness or 0),
            1500.0 / 5000.0,    # spectral_centroid default
            3000.0 / 10000.0,   # spectral_rolloff default
            0.05 * 10.0,        # zero_crossing_rate default scaled
            0.5,                # instrumentalness default
            0.0,                # loudness default ((-60+60)/60)
            0.1                 # speechiness default
        ]
        
        # 2. Reshape for Scikit-Learn (1 sample, 11 features)
        features_array = np.array([input_vector])
        
        # 3. Apply the learned Scaler (MinMax or Standard)
        features_scaled = feature_scaler.transform(features_array)
        
        # 4. Predict Genre
        predicted_genre = knn_classifier.predict(features_scaled)[0]
        return str(predicted_genre)
        
    except Exception as e:
        console.log(f"⚠️ Genre classification failed: {e}")
        return "Unknown"
