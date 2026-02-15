# audio_service/ml_service.py
import asyncio
import numpy as np
from typing import Dict, Optional
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold, LeaveOneOut
from sklearn.metrics import silhouette_score, precision_score, recall_score, f1_score
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.neighbors import KNeighborsClassifier


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
pca_reducer = None
knn_classifier = None

# Cache for extracted iTunes audio features
itunes_features_cache: Dict[int, Dict] = {}

# EXECUTION ORDER: Must be called at application startup (FastAPI 'on_event("startup")').
# Initializes the cache and trains the scaler.
async def startup_cache():
    """Load audio features cache on startup"""
    global audio_features_cache, cache_loaded
    global feature_scaler, pca_reducer, knn_classifier, model_performance_metrics, visualization_data
    
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
                        # ML Pipeline: Scale → PCA(2D) → KMeans(3) → KNN accuracy
                        try:
                            # 1. Feature Extraction - RAW values (scaler handles normalization)
                            feature_vectors = []
                            feature_labels = []
                            
                            for pid, data in audio_features_cache.items():
                                if all(k in data for k in ['tempo', 'energy', 'valence', 'danceability', 'acousticness']):
                                    feature_vectors.append([
                                        float(data['tempo'] or 120),
                                        float(data['energy'] or 0),
                                        float(data['valence'] or 0),
                                        float(data['danceability'] or 0),
                                        float(data['acousticness'] or 0),
                                        float(data.get('spectral_centroid', 1500.0)),
                                        float(data.get('spectral_rolloff', 3000.0)),
                                        float(data.get('zero_crossing_rate', 0.05)),
                                        float(data.get('instrumentalness', 0.5)),
                                        float(data.get('loudness', -60.0)),
                                        float(data.get('speechiness', 0.1))
                                    ])
                                    feature_labels.append(data.get('genre', 'Unknown'))
                            
                            if len(feature_vectors) >= 10:
                                X = np.array(feature_vectors)
                                y = np.array(feature_labels)
                                n_samples = len(X)
                                n_clusters = 3
                                
                                console.log(f"📊 ML Pipeline: {n_samples} tracks, {n_clusters} clusters")
                                
                                # 2. Model Selection: Compare scalers via full pipeline accuracy
                                # Pipeline: Scale → PCA(2D) → KMeans(3) → KNN cross-val accuracy
                                
                                def evaluate_pipeline(scaler_class, X_data, k=3):
                                    """Evaluate scaler with PCA + KMeans + KNN pipeline."""
                                    scaler = scaler_class()
                                    X_sc = scaler.fit_transform(X_data)
                                    
                                    pca = PCA(n_components=2)
                                    X_pca = pca.fit_transform(X_sc)
                                    
                                    km = KMeans(n_clusters=k, random_state=42, n_init=20)
                                    labels = km.fit_predict(X_pca)
                                    
                                    sil = silhouette_score(X_pca, labels)
                                    
                                    # KNN accuracy measures cluster separability
                                    n_nbrs = min(5, len(X_data) - 1)
                                    knn = KNeighborsClassifier(n_neighbors=n_nbrs)
                                    
                                    min_count = min(np.bincount(labels))
                                    if min_count >= 2:
                                        n_folds = max(2, min(5, min_count))
                                        cv = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)
                                        cv_scores = cross_val_score(knn, X_pca, labels, cv=cv)
                                        val_acc = cv_scores.mean()
                                    else:
                                        cv_scores = cross_val_score(knn, X_pca, labels, cv=LeaveOneOut())
                                        val_acc = cv_scores.mean()
                                    
                                    knn.fit(X_pca, labels)
                                    train_acc = knn.score(X_pca, labels)
                                    
                                    return {
                                        'scaler': scaler, 'pca': pca, 'kmeans': km,
                                        'labels': labels, 'X_pca': X_pca, 'X_scaled': X_sc,
                                        'train': train_acc, 'val': val_acc, 'sil': sil
                                    }
                                
                                res_a = evaluate_pipeline(MinMaxScaler, X.copy(), n_clusters)
                                res_b = evaluate_pipeline(StandardScaler, X.copy(), n_clusters)
                                
                                model_performance_metrics["MinMaxScaler_train"] = round(res_a['train'], 4)
                                model_performance_metrics["MinMaxScaler_val"] = round(res_a['val'], 4)
                                model_performance_metrics["StandardScaler_train"] = round(res_b['train'], 4)
                                model_performance_metrics["StandardScaler_val"] = round(res_b['val'], 4)
                                
                                # Select best scaler
                                if res_b['val'] > res_a['val']:
                                    best = res_b
                                    best_model_name = "StandardScaler"
                                else:
                                    best = res_a
                                    best_model_name = "MinMaxScaler"
                                
                                console.log(f"   🏆 {best_model_name} (Train: {best['train']:.4f}, Val: {best['val']:.4f}, Sil: {best['sil']:.4f})")
                                
                                # Set globals
                                feature_scaler = best['scaler']
                                pca_reducer = best['pca']
                                X_pca = best['X_pca']
                                cluster_labels = best['labels']
                                
                                # 3. Create cluster label names
                                cluster_names = np.array([f"Cluster {l}" for l in cluster_labels])
                                
                                # 4. Train global KNN classifier on cluster labels (for classify_genre_from_features)
                                knn_classifier = KNeighborsClassifier(n_neighbors=min(5, n_samples - 1))
                                knn_classifier.fit(X_pca, cluster_names)
                                
                                # 5. Test set evaluation for KNN metrics
                                try:
                                    X_tr, X_te, y_tr, y_te = train_test_split(
                                        X_pca, cluster_names, test_size=0.3,
                                        random_state=42, stratify=cluster_names
                                    )
                                    knn_test = KNeighborsClassifier(n_neighbors=min(5, len(X_tr) - 1))
                                    knn_test.fit(X_tr, y_tr)
                                    y_pred = knn_test.predict(X_te)
                                    
                                    precision = precision_score(y_te, y_pred, average='weighted', zero_division=0)
                                    recall = recall_score(y_te, y_pred, average='weighted', zero_division=0)
                                    f1 = f1_score(y_te, y_pred, average='weighted', zero_division=0)
                                    test_acc = knn_test.score(X_te, y_te)
                                except Exception:
                                    # Fallback if stratified split fails (too few samples per cluster)
                                    precision = best['val']
                                    recall = best['val']
                                    f1 = best['val']
                                    test_acc = best['val']
                                
                                model_performance_metrics["precision"] = round(precision, 4)
                                model_performance_metrics["recall"] = round(recall, 4)
                                model_performance_metrics["f1_score"] = round(f1, 4)
                                model_performance_metrics["test_score"] = round(test_acc, 4)
                                model_performance_metrics["silhouette_score"] = round(best['sil'], 4)
                                model_performance_metrics["optimal_k"] = n_clusters
                                
                                console.log(f"   📊 KNN Test: Acc={test_acc:.4f}, P={precision:.4f}, R={recall:.4f}, F1={f1:.4f}")
                                console.log(f"   📊 Silhouette: {best['sil']:.4f}")
                                
                                # 6. Generate decision boundary grid for visualization
                                grid_res = 80  # 80x80 grid for smooth boundaries
                                x_min_g, x_max_g = X_pca[:, 0].min() - 0.5, X_pca[:, 0].max() + 0.5
                                y_min_g, y_max_g = X_pca[:, 1].min() - 0.5, X_pca[:, 1].max() + 0.5
                                xx, yy = np.meshgrid(
                                    np.linspace(x_min_g, x_max_g, grid_res),
                                    np.linspace(y_min_g, y_max_g, grid_res)
                                )
                                grid_points = np.c_[xx.ravel(), yy.ravel()]
                                grid_preds = knn_classifier.predict(grid_points)
                                # Convert "Cluster 0" → 0, "Cluster 1" → 1, etc.
                                grid_labels = [int(p.split()[-1]) for p in grid_preds]
                                
                                # 7. Generate visualization data
                                visualization_data = {
                                    "x": X_pca[:, 0].tolist(),
                                    "y": X_pca[:, 1].tolist(),
                                    "genres": cluster_names.tolist(),
                                    "scaler": best_model_name,
                                    "metrics": model_performance_metrics,
                                    "decision_boundary": {
                                        "x_min": float(x_min_g),
                                        "x_max": float(x_max_g),
                                        "y_min": float(y_min_g),
                                        "y_max": float(y_max_g),
                                        "grid_res": grid_res,
                                        "labels": grid_labels
                                    }
                                }
                                console.log("   ✅ Visualization data ready")
                                
                            else:
                                console.log(f"⚠️ Not enough data ({len(feature_vectors)} tracks, need >= 10)")
                            
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
    Pipeline: Raw features → Scaler → PCA → KNN predict.
    Args:
        tempo: Raw BPM
        energy, valence, danceability, acousticness: 0-1 values
        current_cache_size, current_cache_items: Legacy params, ignored
    """
    global feature_scaler, pca_reducer, knn_classifier
            
    try:
        # Check if model is initialized
        if feature_scaler is None or pca_reducer is None or knn_classifier is None:
            return "Unknown"

        # 1. Use RAW feature values (must match training pipeline - no manual normalization)
        input_vector = [
            float(tempo or 120),
            float(energy or 0),
            float(valence or 0),
            float(danceability or 0),
            float(acousticness or 0),
            1500.0,     # spectral_centroid default
            3000.0,     # spectral_rolloff default
            0.05,       # zero_crossing_rate default
            0.5,        # instrumentalness default
            -60.0,      # loudness default
            0.1         # speechiness default
        ]
        
        # 2. Reshape for Scikit-Learn (1 sample, 11 features)
        features_array = np.array([input_vector])
        
        # 3. Apply Scaler → PCA → KNN predict
        features_scaled = feature_scaler.transform(features_array)
        features_pca = pca_reducer.transform(features_scaled)
        predicted = knn_classifier.predict(features_pca)[0]
        return str(predicted)
        
    except Exception as e:
        console.log(f"⚠️ Genre classification failed: {e}")
        return "Unknown"
