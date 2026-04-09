# audio_service/ml_service.py
import asyncio
import json
import numpy as np
from collections import Counter
from typing import Dict, List, Optional
from sklearn.base import clone
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.model_selection import GridSearchCV, train_test_split, cross_val_score, cross_validate, StratifiedKFold, LeaveOneOut
from sklearn.metrics import classification_report, confusion_matrix, silhouette_score, precision_score, recall_score, f1_score
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.neighbors import KNeighborsClassifier
from sklearn.ensemble import RandomForestClassifier, VotingClassifier
from sklearn.svm import SVC


from utils import console
from database import get_db_connection
from feature_extraction import derive_mood

# Key name → numeric index for ML feature vectors
KEY_NAME_TO_INDEX = {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
    'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
}

# Time signature string → beats-per-measure numeric value
TIME_SIG_TO_BEATS = {
    '4/4': 4.0, '3/4': 3.0, '6/8': 6.0, '2/4': 2.0, '5/4': 5.0, '7/8': 7.0
}

def _parse_json_list(val, expected_len: int, default_val: float = 0.0) -> List[float]:
    """Safely parse a JSON text field into a list of floats.
    
    Database TEXT columns like MfccMean, ChromaMean, and SpectralContrast store
    variable-length numeric arrays as JSON strings (e.g. '[0.12, 0.45, ...]').
    This helper normalises them into a fixed-length Python list of floats so
    the ML pipeline always receives vectors of the expected dimension (13 for
    MFCC, 12 for Chroma, 7 for SpectralContrast).
    """
    
    # Nothing stored yet — return a zero-filled placeholder of the right length
    if val is None:
        return [default_val] * expected_len

    # Already a Python list (e.g. passed programmatically, not from the DB)
    if isinstance(val, list):
        return [float(x) for x in val]

    # Value is a JSON string from the database — attempt to decode it
    try:
        parsed = json.loads(val)
        if isinstance(parsed, list):
            return [float(x) for x in parsed]
    except (json.JSONDecodeError, TypeError):
        # Malformed or unexpected type — fall through to the default
        pass

    # Fallback: couldn't parse anything useful, so return zeros
    return [default_val] * expected_len


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
ensemble_classifier = None  # Voting ensemble: KNN + Random Forest + SVM
best_classifier = None  # Whichever model scored highest during cross-validation

# Cache for extracted iTunes audio features
itunes_features_cache: Dict[int, Dict] = {}

# EXECUTION ORDER: Must be called at application startup (FastAPI 'on_event("startup")').
# Initializes the cache and trains the scaler.
async def startup_cache():
    """Load audio features cache on startup"""
    global audio_features_cache, cache_loaded
    global feature_scaler, pca_reducer, knn_classifier, ensemble_classifier, model_performance_metrics, visualization_data, best_classifier
    
    # Load audio features into cache for fast recommendations
    # Retry connection if database isn't ready yet
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            with get_db_connection() as conn:
                if conn:
                    with conn.cursor() as cursor:
                        next_audio_features_cache = {}
                        sql = """
                            SELECT 
                                af.ProductID,
                                af.Tempo,
                                af.Energy,
                                af.Valence,
                                af.Danceability,
                                af.Acousticness,
                                af.Genre,
                                af.GenreCluster,
                                af.Mood,
                                af.SpectralCentroid,
                                af.SpectralRolloff,
                                af.ZeroCrossingRate,
                                af.Instrumentalness,
                                af.Loudness,
                                af.Speechiness,
                                af.Key_Signature,
                                af.TimeSignature,
                                af.Duration,
                                af.SpectralBandwidth,
                                af.SpectralContrast,
                                af.RmsEnergy,
                                af.OnsetRate,
                                af.HarmonicRatio,
                                af.PercussiveRatio,
                                af.MfccMean,
                                af.ChromaMean
                            FROM AudioFeatures af
                            LEFT JOIN Stock s ON s.ProductID = af.ProductID
                            WHERE af.Tempo IS NOT NULL
                              AND af.Energy IS NOT NULL
                              AND (
                                    af.ProductID > 0
                                    OR COALESCE(s.IsAvailable, 1) = 1
                              )
                        """
                        cursor.execute(sql)
                        results = cursor.fetchall()
                        
                        # Sets the database rows data to the dictionary keys
                        for row in results:
                            # Sanitize Tempo: If 0, set to default 120 (prevents visualizer issues)
                            if row['Tempo'] == 0:
                                row['Tempo'] = 120.0
                            
                            # Parse MFCC and Chroma JSON arrays
                            # Mel-Frequency Cepstral Coefficients (MFCC) are a set of 13 values that capture the timbral texture of a track,
                            # while Chroma features are 12 values representing the intensity of each pitch class (C, C#, D, etc.) in the track.
                            # Both are stored as JSON strings in the database and need to be parsed into Python lists for ML processing.
                            mfcc_list = _parse_json_list(row.get('MfccMean'), 13)
                            chroma_list = _parse_json_list(row.get('ChromaMean'), 12)
                            
                            # Derive mood if NULL in DB
                            mood_val = row.get('Mood')
                            if not mood_val:
                                mood_val = derive_mood(
                                    float(row.get('Valence', 0.5)),
                                    float(row.get('Energy', 0.5))
                                )
                                
                            next_audio_features_cache[row['ProductID']] = {
                                'id': row['ProductID'],
                                'tempo': row['Tempo'],
                                'energy': row['Energy'],
                                'valence': row['Valence'],
                                'danceability': row['Danceability'],
                                'acousticness': row['Acousticness'],
                                'genre': row['Genre'],
                                'genre_cluster': row.get('GenreCluster'),
                                'mood': mood_val,
                                'spectral_centroid': row.get('SpectralCentroid', 1500.0),
                                'spectral_rolloff': row.get('SpectralRolloff', 3000.0),
                                'zero_crossing_rate': row.get('ZeroCrossingRate', 0.05),
                                'instrumentalness': row.get('Instrumentalness', 0.5),
                                'loudness': row.get('Loudness', -60.0),
                                'speechiness': row.get('Speechiness', 0.1),
                                'key_signature': row.get('Key_Signature'),
                                'time_signature': row.get('TimeSignature'),
                                'duration': row.get('Duration', 0),
                                'spectral_bandwidth': row.get('SpectralBandwidth', 1500.0),
                                 
                                # Contrast between peaks and valleys across 7 frequency bands 
                                'spectral_contrast_mean': _parse_json_list(row.get('SpectralContrast'), 7),
                                'rms_energy': row.get('RmsEnergy', 0.02),
                                'onset_rate': row.get('OnsetRate', 2.0),
                                'harmonic_ratio': row.get('HarmonicRatio', 0.5),
                                'percussive_ratio': row.get('PercussiveRatio', 0.5),
                                'mfcc_mean': mfcc_list,
                                'chroma_mean': chroma_list
                            }
                        
                        # Deduplicate: if both +ID and -ID exist for the same song,
                        # keep only the positive (library) entry.
                        neg_dupes = [k for k in next_audio_features_cache if k < 0 and -k in next_audio_features_cache]
                        for k in neg_dupes:
                            del next_audio_features_cache[k]
                        if neg_dupes:
                            console.log(f"🧹 Removed {len(neg_dupes)} duplicate negative-ID cache entries")

                        audio_features_cache = next_audio_features_cache
                        cache_loaded = True
                        console.log(f"✅ Cached {len(audio_features_cache)} audio features for fast recommendations")
                        
                        # Initialize ML datasets and scale features
                        # ML Pipeline: Scale → PCA(2D) → KMeans(3) → classifier accuracy
                        try:
                            # 1. Feature Extraction - RAW values (scaler handles normalization)
                            # Uses ALL AudioFeatures columns as the feature vector:
                            # 11 core + 5 new + 1 duration + 1 key_index + 1 time_sig_beats + 13 MFCC + 12 Chroma + 7 SpectralContrast = 51D
                            feature_vectors = []
                            feature_labels = []
                            feature_product_ids = []  # Track ProductIDs for DB genre sync
                            
                            required_features = [
                                'tempo', 'energy', 'valence', 'danceability', 'acousticness',
                                'spectral_centroid', 'spectral_rolloff', 'zero_crossing_rate',
                                'instrumentalness', 'loudness', 'speechiness'
                            ]
                            
                            for pid, data in audio_features_cache.items():
                                if all(k in data for k in required_features):
                                    # Core 11 features
                                    vec = [
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
                                    ]
                                    # New 5 scalar features for better genre separation
                                    vec.append(float(data.get('spectral_bandwidth', 1500.0) or 1500.0))
                                    vec.append(float(data.get('rms_energy', 0.02) or 0.02))
                                    vec.append(float(data.get('onset_rate', 2.0) or 2.0))
                                    vec.append(float(data.get('harmonic_ratio', 0.5) or 0.5))
                                    vec.append(float(data.get('percussive_ratio', 0.5) or 0.5))
                                    # Duration (seconds)
                                    vec.append(float(data.get('duration', 0) or 0))
                                    # Key signature as numeric index (0-11)
                                    key_str = data.get('key_signature', '')
                                    vec.append(float(KEY_NAME_TO_INDEX.get(key_str, 0)))
                                    # Time signature as beats per measure
                                    ts_str = data.get('time_signature', '4/4')
                                    vec.append(float(TIME_SIG_TO_BEATS.get(ts_str, 4.0)))
                                    # MFCC means (13 timbral coefficients)
                                    mfcc = data.get('mfcc_mean', [0.0] * 13)
                                    if not isinstance(mfcc, list) or len(mfcc) != 13:
                                        mfcc = _parse_json_list(mfcc, 13)
                                    vec.extend(mfcc)
                                    # Chroma means (12 pitch class values)
                                    chroma = data.get('chroma_mean', [0.0] * 12)
                                    if not isinstance(chroma, list) or len(chroma) != 12:
                                        chroma = _parse_json_list(chroma, 12)
                                    vec.extend(chroma)
                                    # Spectral contrast means (7 bands)
                                    sc = data.get('spectral_contrast_mean', [0.0] * 7)
                                    if not isinstance(sc, list) or len(sc) != 7:
                                        sc = _parse_json_list(sc, 7)
                                    vec.extend(sc)
                                    
                                    feature_vectors.append(vec)
                                    feature_labels.append(data.get('genre', 'Unknown'))
                                    feature_product_ids.append(pid)
                            
                            if len(feature_vectors) >= 10:
                                # 2. Scale + PCA (for visualization) + KMeans clustering
                                X = np.array(feature_vectors)
                                n_clusters = 3
                                
                                # Try both scalers, pick the one with better silhouette score
                                best_sil = -1
                                best_scaler_name = 'StandardScaler'
                                X_pca = None
                                X_scaled = None
                                
                                # Compare two normalization strategies to find which produces tighter clusters:
                                # - MinMaxScaler squashes every feature to a 0–1 range
                                # - StandardScaler centres each feature to mean=0, std=1
                                for scaler_name, scaler_obj in [('MinMaxScaler', MinMaxScaler()), ('StandardScaler', StandardScaler())]:
                                    # Normalize the raw 51D feature matrix using this scaler
                                    X_sc = scaler_obj.fit_transform(X)
                                    
                                    # Reduce 51 dimensions → 2 via PCA so KMeans can cluster in 2D
                                    pca_tmp = PCA(n_components=2)                              
                                    X_pca_tmp = pca_tmp.fit_transform(X_sc)
                                    
                                    # Run KMeans clustering on the 2D projection
                                    km_tmp = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)            
                                    labels_tmp = km_tmp.fit_predict(X_pca_tmp)
                                    
                                    # Silhouette score measures how well-separated the clusters are
                                    # (ranges from -1 to 1; higher = tighter, more distinct clusters)
                                    sil = silhouette_score(X_pca_tmp, labels_tmp)
                                    
                                    model_performance_metrics[f"{scaler_name}_train"] = round(sil, 4)
                                    console.log(f"   {scaler_name} silhouette: {sil:.4f}")
                                
                                    # Keep whichever scaler produced the best silhouette score,
                                    # along with its fitted scaler, PCA, and transformed data
                                    if sil > best_sil:
                                        best_sil = sil
                                        best_scaler_name = scaler_name
                                        feature_scaler = scaler_obj
                                        pca_reducer = pca_tmp
                                        X_pca = X_pca_tmp
                                        X_scaled = X_sc
                                
                                # KMeans on the best PCA projection
                                kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
                                cluster_labels = kmeans.fit_predict(X_pca)
                                cluster_names = np.array([f"Cluster {l}" for l in cluster_labels])
                                
                                # Update genre_cluster in cache with cluster labels
                                # Genre is preserved as the actual genre; GenreCluster stores the ML cluster
                                for i, pid in enumerate(feature_product_ids):
                                    if pid in audio_features_cache:
                                        audio_features_cache[pid]['genre_cluster'] = cluster_names[i]
                                
                                # Write GenreCluster back to the database so it persists
                                try:
                                    with get_db_connection() as conn2:
                                        if conn2:
                                            with conn2.cursor() as cur2:
                                                for i, pid in enumerate(feature_product_ids):
                                                    cur2.execute(
                                                        "UPDATE AudioFeatures SET GenreCluster = %s WHERE ProductID = %s",
                                                        (cluster_names[i], pid)
                                                    )
                                                conn2.commit()
                                    console.log(f"   ✅ Updated GenreCluster in DB for {len(feature_product_ids)} songs")
                                except Exception as db_e:
                                    console.log(f"   ⚠️ Failed to write GenreCluster to DB: {db_e}")
                                
                                console.log(f"   ✅ Best scaler: {best_scaler_name} (silhouette={best_sil:.4f})")
                                
                                # 3. Split FULL 51D scaled data for model training
                                # Models train on full feature space so each algorithm
                                # learns genuinely different boundaries. PCA is only for visualization.
                                y = cluster_names
                                X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
                                    X_scaled, y, np.arange(len(X_scaled)),
                                    stratify=y, test_size=0.4, random_state=1138
                                )
                                X_valid, X_test, y_valid, y_test, idx_valid, idx_test = train_test_split(
                                    X_test, y_test, idx_test,
                                    stratify=y_test, test_size=0.5, random_state=1138
                                )
                                
                                # 4. Train and tune 4 models with GridSearchCV on 51D features
                                
                                # Support Vector Machine (RBF kernel for non-linear boundaries)
                                grid_svm = GridSearchCV(
                                    SVC(kernel='rbf', probability=True),
                                    {'C': [0.01, 0.1, 1, 10, 100], 'gamma': ['scale', 'auto', 0.1, 1]},
                                    cv=5, scoring='accuracy'
                                )
                                grid_svm.fit(X_train, y_train)
                                best_model_svm = grid_svm.best_estimator_
                                console.log(f"   SVM best params: {grid_svm.best_params_}")
                                
                                # Random Forest Classifier
                                grid_rf = GridSearchCV(
                                    RandomForestClassifier(random_state=42),
                                    {'n_estimators': [50, 100, 200], 'max_depth': [None, 10, 20]},
                                    cv=5, scoring='accuracy'
                                )
                                grid_rf.fit(X_train, y_train)
                                best_model_rf = grid_rf.best_estimator_
                                console.log(f"   RF best params: {grid_rf.best_params_}")
                                
                                # K-Nearest Neighbors
                                grid_knn = GridSearchCV(
                                    KNeighborsClassifier(),
                                    {'n_neighbors': [3, 5, 7, 9, 11]},
                                    cv=5
                                )
                                grid_knn.fit(X_train, y_train)
                                best_model_knn = grid_knn.best_estimator_
                                console.log(f"   KNN best params: {grid_knn.best_params_}")
                                
                                # Logistic Regression
                                grid_lr = GridSearchCV(
                                    LogisticRegression(max_iter=1000),
                                    {'C': [0.001, 0.01, 0.1, 1, 10, 100]},
                                    cv=5
                                )
                                grid_lr.fit(X_train, y_train)
                                best_model_lr = grid_lr.best_estimator_
                                console.log(f"   LR best params: {grid_lr.best_params_}")
                                
                                # 5. Combine training + validation sets for final models
                                X_train_final = np.concatenate((X_train, X_valid), axis=0)
                                y_train_final = np.concatenate((y_train, y_valid), axis=0)
                                
                                # 6. Per-model metrics (score on original splits, then retrain on full data)
                                per_model_metrics = {}
                                individual_full_models = {}
                                
                                tuned_models = {
                                    'SVM': best_model_svm,
                                    'RandomForest': best_model_rf,
                                    'KNN': best_model_knn,
                                    'LogisticRegression': best_model_lr
                                }
                                
                                for mname, mdl in tuned_models.items():
                                    # Score on original train/valid splits (before refitting)
                                    train_sc = round(float(mdl.score(X_train, y_train)), 4)
                                    val_sc = round(float(mdl.score(X_valid, y_valid)), 4)
                                
                                    # Clone and retrain on train+valid for final evaluation
                                    mdl_full = clone(mdl)
                                    mdl_full.fit(X_train_final, y_train_final)
                                    individual_full_models[mname] = mdl_full
                                
                                    y_pred_m = mdl_full.predict(X_test)
                                    per_model_metrics[mname] = {
                                        'train_score': train_sc,
                                        'val_score': val_sc,
                                        'test_acc': round(float(mdl_full.score(X_test, y_test)), 4),
                                        'silhouette_score': round(float(best_sil), 4),
                                        'optimal_k': n_clusters,
                                        'precision': round(float(precision_score(y_test, y_pred_m, average='weighted', zero_division=0)), 4),
                                        'recall': round(float(recall_score(y_test, y_pred_m, average='weighted', zero_division=0)), 4),
                                        'f1_score': round(float(f1_score(y_test, y_pred_m, average='weighted', zero_division=0)), 4),
                                    }
                                    console.log(f"   {mname}: val={val_sc}, test={per_model_metrics[mname]['test_acc']}")
                                
                                # 7. Ensemble classifier (all 4 models)
                                # Fit a version on X_train only, to get unbiased val score
                                ens_val_model = VotingClassifier(
                                    estimators=[
                                        ('knn', best_model_knn),
                                        ('rf', best_model_rf),
                                        ('svm', best_model_svm),
                                        ('lr', best_model_lr),
                                    ],
                                    voting='soft'
                                )
                                ens_val_model.fit(X_train, y_train)
                                ens_train_sc = round(float(ens_val_model.score(X_train, y_train)), 4)
                                ens_val_sc = round(float(ens_val_model.score(X_valid, y_valid)), 4)
                                
                                # Final ensemble on train+valid
                                ensemble_classifier = VotingClassifier(
                                    estimators=[
                                        ('knn', clone(best_model_knn)),
                                        ('rf', clone(best_model_rf)),
                                        ('svm', clone(best_model_svm)),
                                        ('lr', clone(best_model_lr)),
                                    ],
                                    voting='soft'
                                )
                                ensemble_classifier.fit(X_train_final, y_train_final)
                                individual_full_models['Ensemble'] = ensemble_classifier
                                
                                y_pred_ens = ensemble_classifier.predict(X_test)
                                per_model_metrics['Ensemble'] = {
                                    'train_score': ens_train_sc,
                                    'val_score': ens_val_sc,
                                    'test_acc': round(float(ensemble_classifier.score(X_test, y_test)), 4),
                                    'silhouette_score': round(float(best_sil), 4),
                                    'optimal_k': n_clusters,
                                    'precision': round(float(precision_score(y_test, y_pred_ens, average='weighted', zero_division=0)), 4),
                                    'recall': round(float(recall_score(y_test, y_pred_ens, average='weighted', zero_division=0)), 4),
                                    'f1_score': round(float(f1_score(y_test, y_pred_ens, average='weighted', zero_division=0)), 4),
                                }
                                console.log(f"   Ensemble: val={ens_val_sc}, test={per_model_metrics['Ensemble']['test_acc']}")
                                
                                # 8. Select production classifier by highest validation score.
                                # Tie-breakers use test accuracy then precision for deterministic selection.
                                best_model_name, best_stats = max(
                                    per_model_metrics.items(),
                                    key=lambda kv: (
                                        float(kv[1].get('val_score', 0.0)),
                                        float(kv[1].get('test_acc', 0.0)),
                                        float(kv[1].get('precision', 0.0)),
                                    ),
                                )
                                best_val = float(best_stats.get('val_score', 0.0))

                                best_classifier = individual_full_models[best_model_name]
                                knn_classifier = individual_full_models.get('KNN')
                                model_performance_metrics['best_model'] = best_model_name
                                console.log(f"   ★ Selected model: {best_model_name} (val={best_val:.4f})")
                                
                                # 9. Decision boundary grids for each model
                                # Map 2D grid back to 51D via PCA inverse_transform, then predict
                                grid_res = 80
                                x_min_g = float(X_pca[:, 0].min() - 0.5)
                                x_max_g = float(X_pca[:, 0].max() + 0.5)
                                y_min_g = float(X_pca[:, 1].min() - 0.5)
                                y_max_g = float(X_pca[:, 1].max() + 0.5)
                                xx, yy = np.meshgrid(
                                    np.linspace(x_min_g, x_max_g, grid_res),
                                    np.linspace(y_min_g, y_max_g, grid_res)
                                )
                                grid_2d = np.c_[xx.ravel(), yy.ravel()]
                                # Project 2D grid points back to 51D scaled space
                                grid_51d = pca_reducer.inverse_transform(grid_2d)
                                
                                boundary_base = {
                                    "x_min": x_min_g, "x_max": x_max_g,
                                    "y_min": y_min_g, "y_max": y_max_g,
                                    "grid_res": grid_res
                                }
                                
                                all_model_boundaries = {}
                                for mname, mdl in individual_full_models.items():
                                    preds = mdl.predict(grid_51d)
                                    labels_list = [int(p.split()[-1]) for p in preds]
                                    all_model_boundaries[mname] = {
                                        **boundary_base,
                                        "labels": labels_list
                                    }
                                
                                console.log(f"   🗺️ Decision boundaries generated for: {', '.join(all_model_boundaries.keys())}")
                                
                                # 10. Build visualization data for frontend
                                visualization_data = {
                                    "x": X_pca[:, 0].tolist(),
                                    "y": X_pca[:, 1].tolist(),
                                    "genres": cluster_names.tolist(),
                                    "scaler": best_scaler_name,
                                    "metrics": {**model_performance_metrics, "best_model": best_model_name},
                                    "per_model_metrics": per_model_metrics,
                                    "decision_boundary": all_model_boundaries.get('Ensemble', all_model_boundaries.get('KNN')),
                                    "model_boundaries": all_model_boundaries
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
    spectral_bandwidth: float = 1500.0,
    rms_energy: float = 0.02,
    onset_rate: float = 2.0,
    harmonic_ratio: float = 0.5,
    percussive_ratio: float = 0.5,
    duration: float = 0.0,
    key_signature: str = 'C',
    time_signature: str = '4/4',
    mfcc_mean: List[float] = None,
    chroma_mean: List[float] = None,
    spectral_contrast_mean: List[float] = None,
    current_cache_size: int = 0, 
    current_cache_items: Dict = {}
) -> str:
    """
    Takes raw audio features from a new song and predicts its GenreCluster
    using the global ML models (Scaler, PCA, KNN/Ensemble) trained at startup.
    Pipeline: Raw 51D features → Scaler → Best classifier predict.
    """
    global feature_scaler, pca_reducer, knn_classifier, ensemble_classifier, best_classifier
            
    try:
        # Check if model is initialized
        if feature_scaler is None:
            return "Unknown"
        
        # Need at least one classifier available
        if best_classifier is None and ensemble_classifier is None and knn_classifier is None:
            return "Unknown"

        # 1. Build 51D input vector matching training pipeline
        input_vector = [
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
            float(speechiness),
            float(spectral_bandwidth),
            float(rms_energy),
            float(onset_rate),
            float(harmonic_ratio),
            float(percussive_ratio),
            float(duration or 0),
            float(KEY_NAME_TO_INDEX.get(key_signature, 0)),
            float(TIME_SIG_TO_BEATS.get(time_signature, 4.0))
        ]
        # MFCC means (13 coefficients)
        if mfcc_mean and isinstance(mfcc_mean, list) and len(mfcc_mean) == 13:
            input_vector.extend([float(x) for x in mfcc_mean])
        else:
            input_vector.extend([0.0] * 13)
        # Chroma means (12 pitch classes)
        if chroma_mean and isinstance(chroma_mean, list) and len(chroma_mean) == 12:
            input_vector.extend([float(x) for x in chroma_mean])
        else:
            input_vector.extend([0.0] * 12)
        # Spectral contrast means (7 bands)
        if spectral_contrast_mean and isinstance(spectral_contrast_mean, list) and len(spectral_contrast_mean) == 7:
            input_vector.extend([float(x) for x in spectral_contrast_mean])
        else:
            input_vector.extend([0.0] * 7)
        
        # 2. Reshape for Scikit-Learn (1 sample, 51 features)
        features_array = np.array([input_vector])
        
        # 3. Apply Scaler then predict (models trained on 51D scaled features)
        features_scaled = feature_scaler.transform(features_array)
        
        # 4. Use the BEST MODEL from cross-validation for prediction.
        # During startup, all 4 models (KNN, RF, SVM, LR) are cross-validated
        # and the one with the highest validation score is stored as best_classifier.
        # Falls back to ensemble, then to standalone KNN if best isn't available.
        if best_classifier is not None:
            predicted = best_classifier.predict(features_scaled)[0]
        elif ensemble_classifier is not None:
            predicted = ensemble_classifier.predict(features_scaled)[0]
        else:
            predicted = knn_classifier.predict(features_scaled)[0]
        
        return str(predicted)
        
    except Exception as e:
        console.log(f"⚠️ Genre classification failed: {e}")
        return "Unknown"


# ---- KNN-based real genre predictor (uses iTunes genres as training data) ----
_genre_knn_model = None
_genre_knn_labels = None
_genre_knn_cache_size = 0  # tracks when to retrain


def _build_genre_vector(data: dict) -> list:
    """Build a 51D feature vector from a cache entry for genre KNN."""
    vec = [
        float(data.get('tempo', 120)),
        float(data.get('energy', 0.5)),
        float(data.get('valence', 0.5)),
        float(data.get('danceability', 0.5)),
        float(data.get('acousticness', 0.5)),
        float(data.get('spectral_centroid', 1500.0)),
        float(data.get('spectral_rolloff', 3000.0)),
        float(data.get('zero_crossing_rate', 0.05)),
        float(data.get('instrumentalness', 0.5)),
        float(data.get('loudness', -60.0)),
        float(data.get('speechiness', 0.1)),
        float(data.get('spectral_bandwidth', 1500.0)),
        float(data.get('rms_energy', 0.02)),
        float(data.get('onset_rate', 2.0)),
        float(data.get('harmonic_ratio', 0.5)),
        float(data.get('percussive_ratio', 0.5)),
        float(data.get('duration', 30.0)),
        float(KEY_NAME_TO_INDEX.get(data.get('key_signature', 'C'), 0)),
        float(TIME_SIG_TO_BEATS.get(data.get('time_signature', '4/4'), 4)),
    ]
    mfcc = data.get('mfcc_mean', [0.0] * 13)
    if isinstance(mfcc, str):
        mfcc = json.loads(mfcc)
    vec.extend([float(x) for x in mfcc[:13]])
    vec.extend([0.0] * max(0, 13 - len(mfcc)))
    chroma = data.get('chroma_mean', [0.0] * 12)
    if isinstance(chroma, str):
        chroma = json.loads(chroma)
    vec.extend([float(x) for x in chroma[:12]])
    vec.extend([0.0] * max(0, 12 - len(chroma)))
    sc = data.get('spectral_contrast_mean', [0.0] * 7)
    if isinstance(sc, str):
        sc = json.loads(sc)
    vec.extend([float(x) for x in sc[:7]])
    vec.extend([0.0] * max(0, 7 - len(sc)))
    return vec


def _is_real_genre(genre: str) -> bool:
    """Return True if genre is a real label, not a cluster or placeholder."""
    if not genre:
        return False
    g = genre.strip().lower()
    return g not in ('', 'unknown', 'soundtrack') and not g.startswith('cluster')


def _train_genre_knn():
    """Train (or retrain) the genre KNN from cached songs with real genre labels."""
    global _genre_knn_model, _genre_knn_labels, _genre_knn_cache_size

    train_vectors, train_labels = [], []
    for pid, data in audio_features_cache.items():
        genre = data.get('genre', '')
        if not _is_real_genre(genre):
            continue
        vec = _build_genre_vector(data)
        if len(vec) != 51:
            continue
        train_vectors.append(vec)
        train_labels.append(genre)

    if len(train_vectors) < 3:
        _genre_knn_model = None
        _genre_knn_labels = None
        return

    X = np.array(train_vectors)
    if feature_scaler is not None:
        X = feature_scaler.transform(X)

    k = min(5, len(train_vectors))
    clf = KNeighborsClassifier(n_neighbors=k)
    clf.fit(X, train_labels)

    _genre_knn_model = clf
    _genre_knn_labels = list(set(train_labels))
    _genre_knn_cache_size = len(audio_features_cache)
    console.log(f"🎵 Trained genre KNN: {len(train_vectors)} songs, {len(_genre_knn_labels)} genres")


def predict_real_genre(features: dict) -> Optional[str]:
    """
    Predict a real genre label (e.g. 'Electronic', 'Pop') for a song
    using KNN trained on iTunes songs with known genres.
    Returns None if not enough training data is available.
    """
    global _genre_knn_model, _genre_knn_cache_size

    # Retrain if cache has grown significantly since last training
    if _genre_knn_model is None or len(audio_features_cache) - _genre_knn_cache_size > 20:
        _train_genre_knn()

    if _genre_knn_model is None:
        return None

    try:
        vec = _build_genre_vector(features)
        if len(vec) != 51:
            return None
        X = np.array([vec])
        if feature_scaler is not None:
            X = feature_scaler.transform(X)
        return str(_genre_knn_model.predict(X)[0])
    except Exception as e:
        console.log(f"⚠️ Genre KNN prediction failed: {e}")
        return None
