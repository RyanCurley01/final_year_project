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
                            
                            required_features = [
                                'tempo', 'energy', 'valence', 'danceability', 'acousticness',
                                'spectral_centroid', 'spectral_rolloff', 'zero_crossing_rate',
                                'instrumentalness', 'loudness', 'speechiness'
                            ]
                            
                            for pid, data in audio_features_cache.items():
                                if all(k in data for k in required_features):
                                    feature_vectors.append([
                                        float(data['tempo']),
                                        float(data['energy']),
                                        float(data['valence']),
                                        float(data['danceability']),
                                        float(data['acousticness']),
                                        float(data['spectral_centroid']),
                                        float(data['spectral_rolloff']),
                                        float(data['zero_crossing_rate']),
                                        float(data['instrumentalness']),
                                        float(data['loudness']),
                                        float(data['speechiness'])
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
                                    
                                    # Fits the scaler to the raw audio features (X_data) to calculate stats 
                                    # (like min/max or mean/std) and immediately transforms the data. 
                                    # This normalizes the data so features with large numbers (like Tempo: 120) 
                                    # don't overpower small ones (like Speechiness: 0.1)
                                    scaler = scaler_class()
                                    X_sc = scaler.fit_transform(X_data)
                                    
                                    # Compresses the scaled 11-dimensional audio features down to 2 dimensions 
                                    # while keeping as much "information" (variance) as possible.
                                    pca = PCA(n_components=2)
                                    X_pca = pca.fit_transform(X_sc)
                                    
                                    # Runs the clustering on the 2D data. It assigns every song to a cluster 
                                    # (e.g., 0, 1, or 2). These labels become the "Truth" for the next steps
                                    km = KMeans(n_clusters=k, random_state=42, n_init=20)
                                    labels = km.fit_predict(X_pca)
                                    
                                    # Calculates how well-separated the clusters are
                                    sil = silhouette_score(X_pca, labels)
                                    
                                    # KNN accuracy measures cluster separability
                                    n_nbrs = min(5, len(X_data) - 1)
                                    knn = KNeighborsClassifier(n_neighbors=n_nbrs)
                                    
                                    # Checks the size of the smallest cluster. If one cluster has only 1 song, 
                                    # standard cross-validation will crash because 
                                    # it can't split that 1 song into training and test sets.
                                    min_count = min(np.bincount(labels))
                                    
                                    # if all clusters have at least 2 songs
                                    if min_count >= 2:
                                        # Decides how many "folds" to split the data into (Between 2 and 5).
                                        n_folds = max(2, min(5, min_count))
                                        
                                        # Ensures each "fold" has a proportional mix of cluster labels (stratified)
                                        cv = StratifiedKFold(n_splits=n_folds, shuffle=True, random_state=42)
                                        
                                        # Runs the KNN model multiple times on different slices of data 
                                        # and returns a list of accuracy scores
                                        cv_scores = cross_val_score(knn, X_pca, labels, cv=cv)
                                        
                                        # Gets the average accuracy across all KNN model runs
                                        val_acc = cv_scores.mean()
                                    else:
                                        # Runs the KNN model multiple times on different slices of data 
                                        # except ONE item, tests on that item, and repeats for every single item
                                        # and returns a list of accuracy scores and the average accuracy score
                                        cv_scores = cross_val_score(knn, X_pca, labels, cv=LeaveOneOut())
                                        val_acc = cv_scores.mean()
                                    
                                    # Trains the final KNN model on the entire dataset
                                    knn.fit(X_pca, labels)
                                    
                                    # Calculates the training accuracy (how well the model knows the data it has already seen). 
                                    # This is usually high, but checked against val_acc to spot overfitting.
                                    train_acc = knn.score(X_pca, labels)
                                    
                                    return {
                                        'scaler': scaler, 'pca': pca, 'kmeans': km,
                                        'labels': labels, 'X_pca': X_pca, 'X_scaled': X_sc,
                                        'train': train_acc, 'val': val_acc, 'sil': sil
                                    }
                                
                                # Runs the entire pipeline (Scale -> PCA -> KMeans -> KNN) using MinMaxScaler and StandardScaler
                                res_a = evaluate_pipeline(MinMaxScaler, X.copy(), n_clusters)
                                res_b = evaluate_pipeline(StandardScaler, X.copy(), n_clusters)
                                
                                model_performance_metrics["MinMaxScaler_train"] = round(res_a['train'], 4)
                                model_performance_metrics["MinMaxScaler_val"] = round(res_a['val'], 4)
                                model_performance_metrics["StandardScaler_train"] = round(res_b['train'], 4)
                                model_performance_metrics["StandardScaler_val"] = round(res_b['val'], 4)
                                
                                # Compares the validation accuracy (how well the clusters separate) of the two methods.
                                if res_b['val'] > res_a['val']:
                                    best = res_b
                                    best_model_name = "StandardScaler"
                                else:
                                    best = res_a
                                    best_model_name = "MinMaxScaler"
                                
                                console.log(f"   🏆 {best_model_name} (Train: {best['train']:.4f}, Val: {best['val']:.4f}, Sil: {best['sil']:.4f})")
                                
                                # Updates the global variables with the trained objects from the winning pipeline
                                # to be used later when a user asks to classify a new song that wasn't in the database at startup.
                                feature_scaler = best['scaler']
                                pca_reducer = best['pca']
                                X_pca = best['X_pca']
                                cluster_labels = best['labels']
                                
                                # 3. Converts raw numbers (e.g., 0, 1, 2) into human-readable strings (e.g., "Cluster 0").
                                cluster_names = np.array([f"Cluster {l}" for l in cluster_labels])
                                
                                # 4. Trains the main KNN classifier on all available data 
                                # to answer "What genre is this song?" queries during runtime.
                                knn_classifier = KNeighborsClassifier(n_neighbors=min(5, n_samples - 1))
                                knn_classifier.fit(X_pca, cluster_names)
                                
                                # 5. Test set evaluation for KNN metrics
                                try:
                                    # Splits the data one last time (70% train, 30% test) 
                                    # to calculate final performance metrics like Precision/Recall.
                                    X_tr, X_te, y_tr, y_te = train_test_split(
                                        X_pca, cluster_names, test_size=0.3,
                                        random_state=42, stratify=cluster_names
                                    )
                                    knn_test = KNeighborsClassifier(n_neighbors=min(5, len(X_tr) - 1))
                                    
                                    # Trains a temporary model just for this test.
                                    knn_test.fit(X_tr, y_tr)
                                    
                                    # Predicts cluster labels for the test set to see 
                                    # if they match the actual cluster labels.
                                    y_pred = knn_test.predict(X_te)
                                    
                                    # Standard ML metrics to ensure the model isn't biased towards one massive cluster.
                                    precision = precision_score(y_te, y_pred, average='weighted', zero_division=0)
                                    recall = recall_score(y_te, y_pred, average='weighted', zero_division=0)
                                    f1 = f1_score(y_te, y_pred, average='weighted', zero_division=0)
                                    test_acc = knn_test.score(X_te, y_te)
                                except Exception:
                                    # If a cluster is tiny (e.g., 2 songs), splitting it further for testing will crash. 
                                    # If that happens, it falls back to the validation score.
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
                                
                                # 80x80 grid for smooth boundaries
                                grid_res = 80  
                                
                                # Creates a virtual "grid" covering the entire 2D chart area.
                                x_min_g, x_max_g = X_pca[:, 0].min() - 0.5, X_pca[:, 0].max() + 0.5
                                y_min_g, y_max_g = X_pca[:, 1].min() - 0.5, X_pca[:, 1].max() + 0.5
                                xx, yy = np.meshgrid(
                                    np.linspace(x_min_g, x_max_g, grid_res),
                                    np.linspace(y_min_g, y_max_g, grid_res)
                                )
                                grid_points = np.c_[xx.ravel(), yy.ravel()]
                                
                                # Predicts a cluster for every single point on the empty grid
                                grid_preds = knn_classifier.predict(grid_points)
                                
                                # Convert "Cluster 0" → 0, "Cluster 1" → 1, etc.
                                grid_labels = [int(p.split()[-1]) for p in grid_preds]
                                
                                # 7. Stores the X/Y coordinates of every song, their cluster labels, and the grid data. 
                                # This dictionary is saved in memory so it can be sent to the frontend later for plotting.
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
                                # If there are fewer than 10 songs, it skips ML training to avoids errors.
                                console.log(f"⚠️ Not enough data ({len(feature_vectors)} tracks, need >= 10)")
                            
                        except Exception as e:
                            console.log(f"⚠️ ML Initialization warning: {e}")
                        
                        console.log(f"📊 Final model_performance_metrics: {model_performance_metrics}", flush=True)

                        # If everything succeeds, it returns from the function, exiting the retry loop
                        return 
        
        # If loop crashes, the outer except block catches it and retries after a delay.           
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
def classify_genre_from_features(
    tempo: float, 
    energy: float, 
    valence: float, 
    danceability: float, 
    acousticness: float,
    spectral_centroid: float = 1500.0,
    spectral_rolloff: float = 3000.0,
    zero_crossing_rate: float = 0.05,
    instrumentalness: float = 0.5,
    loudness: float = -60.0,
    speechiness: float = 0.1,
    current_cache_size: int = 0, 
    current_cache_items: Dict = {}
) -> str:
    """
    Takes raw audio features (like Tempo and Energy) from a new song and 
    predict its "Genre" (or Cluster ID) using the global machine learning models 
    (Scaler, PCA, KNN) that were trained during the startup phase
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
            # Inputs converted to decimals.
            float(tempo if tempo != 0 else 0),
            float(energy or 0),
            float(valence or 0),
            float(danceability or 0),
            float(acousticness or 0),
            float(spectral_centroid),
            float(spectral_rolloff),
            float(zero_crossing_rate),
            float(instrumentalness),
            float(loudness),
            float(speechiness)
        ]
        
        # 2. Reshape for Scikit-Learn (1 sample, 11 features)
        features_array = np.array([input_vector])
        
        # 3. Apply Scaler → PCA → KNN predict
        # "Normalizes" the data. For example, it might convert a Tempo of 120 
        # into 0.5 if the training data range was 60–180.
        features_scaled = feature_scaler.transform(features_array)
        
        # Compresses those 11 normalized numbers down to just 2 coordinates (X and Y), 
        # placing this song on the internal 2D "map" the AI created.
        features_pca = pca_reducer.transform(features_scaled)
        
        # Looks at that X,Y point on the map, finds the nearest neighbors, 
        # and decides "This point belongs to Cluster 2."
        predicted = knn_classifier.predict(features_pca)[0]
        return str(predicted)
        
    except Exception as e:
        console.log(f"⚠️ Genre classification failed: {e}")
        return "Unknown"
