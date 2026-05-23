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
        parsed = [float(x) for x in val]
        
        if len(parsed) < expected_len:
            parsed.extend([default_val] * (expected_len - len(parsed)))
        return parsed[:expected_len]

    # Value is a JSON string from the database — attempt to decode it
    try:
        parsed = json.loads(val)
        if isinstance(parsed, list):
            result = [float(x) for x in parsed]

            if len(result) < expected_len:
                result.extend([default_val] * (expected_len - len(result)))
            return result[:expected_len]
    except (json.JSONDecodeError, TypeError):
        # Malformed or unexpected type — fall through to the default
        pass

    # Fallback: couldn't parse anything useful, so return zeros
    return [default_val] * expected_len


# Uses the elbow method (inertia drop) combined with the
# silhouette score to choose the best k in the range [k_min, k_max].
# This lets the data drive the number of clusters rather than assuming 3.
def _select_n_clusters(X: np.ndarray, k_min: int = 3, k_max: int = 8) -> int:
    """Choose the number of KMeans clusters using silhouette score.

    Silhouette score measures how well each point fits its own cluster vs.
    neighbouring clusters (range −1 to 1, higher = better separation).
    We iterate k from k_min to k_max and keep the k with the highest score.

    Parameters
    ----------
    X      : scaled feature matrix (n_samples, n_features)
    k_min  : smallest k to evaluate (must be >= 2 for silhouette)
    k_max  : largest k to evaluate (capped at n_samples − 1)

    Returns
    -------
    best_k : int, the chosen number of clusters
    """
    k_max = min(k_max, len(X) - 1)  # silhouette undefined for k >= n_samples
    if k_max < k_min:
        return k_min  # dataset too small; fall back to minimum

    best_k, best_sil = k_min, -1.0
    for k in range(k_min, k_max + 1):
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = km.fit_predict(X)
        # silhouette_score requires at least 2 distinct labels
        if len(set(labels)) < 2:
            continue
        sil = silhouette_score(X, labels)
        console.log(f"      k={k}: silhouette={sil:.4f}")
        if sil > best_sil:
            best_sil, best_k = sil, k

    console.log(f"   ✅ Selected n_clusters={best_k} (silhouette={best_sil:.4f})")
    return best_k


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
ensemble_classifier = None
best_classifier = None

_genre_knn_model_labels_hash = None

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
                                    vec = _build_feature_vector(data)                                 
                                    feature_vectors.append(vec)
                                    feature_labels.append(data.get('genre', 'Unknown'))
                                    feature_product_ids.append(pid)
                            
                            if len(feature_vectors) >= 10:
                                X = np.array(feature_vectors)

                                # 2. Train / Validation / Test Split
                                # Temporary placeholder labels for stratification. Cluster
                                # labels are needed to stratify, but can't cluster yet (no scaler fitted).
                                # Uses a simple quantile-based proxy on the first PC of raw data.
                                # Real cluster labels are assigned after the split.
                                proxy_labels = _proxy_stratify_labels(X, n_bins=3)

                                (X_train_raw, X_temp_raw,
                                 proxy_train,  proxy_temp,
                                 idx_train,    idx_temp) = train_test_split(
                                    X, proxy_labels, np.arange(len(X)),
                                    stratify=proxy_labels, test_size=0.4, random_state=1138
                                )
                                (X_valid_raw, X_test_raw,
                                 proxy_valid,  proxy_test,
                                 idx_valid,    idx_test) = train_test_split(
                                    X_temp_raw, proxy_temp, idx_temp,
                                    stratify=proxy_temp, test_size=0.5, random_state=1138
                                )
                                
                                # 3. Scaler Selection - Try both scalers, pick the one with better validation accuracy
                                best_val_acc   = -1.0
                                best_scaler_name = 'StandardScaler'
                                X_train_scaled = None
                                X_valid_scaled = None
                                X_test_scaled  = None
                                
                                
                                for scaler_name, scaler_obj in [
                                    ('MinMaxScaler',   MinMaxScaler()),
                                    ('StandardScaler', StandardScaler()),
                                ]:
                                    scaler_obj.fit(X_train_raw)
                                    Xtr = scaler_obj.transform(X_train_raw)
                                    Xva = scaler_obj.transform(X_valid_raw)
                                    Xte = scaler_obj.transform(X_test_raw)

                                    n_clusters_tmp = _select_n_clusters(Xtr)
                                    km_tmp = KMeans(n_clusters=n_clusters_tmp, random_state=42, n_init=10)
                                    y_tmp = np.array([f"Cluster {l}" for l in km_tmp.fit_predict(Xtr)])
                                    y_val_tmp = np.array([f"Cluster {l}" for l in km_tmp.predict(Xva)])

                                    knn_probe = KNeighborsClassifier(n_neighbors=min(5, len(Xtr)))
                                    cv_scores = cross_val_score(knn_probe, Xtr, y_tmp, cv=min(3, len(Xtr)//2))
                                    probe_acc = float(cv_scores.mean())

                                    model_performance_metrics[f"{scaler_name}_train"] = round(probe_acc, 4)
                                    console.log(f"   {scaler_name} probe CV-acc: {probe_acc:.4f}")

                                    if probe_acc > best_val_acc:
                                        best_val_acc     = probe_acc
                                        best_scaler_name = scaler_name
                                        feature_scaler   = scaler_obj
                                        X_train_scaled   = Xtr
                                        X_valid_scaled   = Xva
                                        X_test_scaled    = Xte

                                console.log(f"   ✅ Best scaler: {best_scaler_name} (probe val-acc={best_val_acc:.4f})")
                                
                                
                                # 4. Clustering in FULL 51D scaled space, not 2D PCA.
                                
                                # n_clusters chosen by silhouette in 51D (not hardcoded 3)
                                n_clusters = _select_n_clusters(X_train_scaled)

                                kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
                                y_train = np.array([f"Cluster {l}" for l in kmeans.fit_predict(X_train_scaled)])
                                y_valid = np.array([f"Cluster {l}" for l in kmeans.predict(X_valid_scaled)])
                                y_test  = np.array([f"Cluster {l}" for l in kmeans.predict(X_test_scaled)])

                                # Silhouette on 51D training clusters (informational)
                                best_sil = silhouette_score(X_train_scaled, y_train)
                                console.log(f"   51D KMeans silhouette (train): {best_sil:.4f}")

                                pca_reducer = PCA(n_components=2)
                                pca_reducer.fit(X_train_scaled)
                                X_pca_train = pca_reducer.transform(X_train_scaled)
                                X_pca_valid = pca_reducer.transform(X_valid_scaled)
                                X_pca_test = pca_reducer.transform(X_test_scaled)
                                X_pca = np.vstack([X_pca_train, X_pca_valid, X_pca_test])

                                y_all = np.concatenate([y_train, y_valid, y_test])

                                # Update genre_cluster in cache for ALL samples using KMeans
                                all_indices = np.concatenate([idx_train, idx_valid, idx_test])
                                all_scaled  = np.concatenate([X_train_scaled, X_valid_scaled, X_test_scaled])
                                all_cluster_labels = np.array(
                                    [f"Cluster {l}" for l in kmeans.predict(all_scaled)]
                                )
                                for i, pid in enumerate(
                                    [feature_product_ids[j] for j in all_indices]
                                ):
                                    if pid in audio_features_cache:
                                        audio_features_cache[pid]['genre_cluster'] = all_cluster_labels[i]
                            
                            
                                # Write GenreCluster back to the database so it persists
                                try:
                                    with get_db_connection() as conn2:
                                        if conn2:
                                            with conn2.cursor() as cur2:
                                                num_updated = 0
                                                for i, orig_idx in enumerate(all_indices):
                                                    pid = feature_product_ids[orig_idx]
                                                    cur2.execute(
                                                        "UPDATE AudioFeatures SET GenreCluster = %s WHERE ProductID = %s",
                                                        (all_cluster_labels[i], pid)
                                                    )
                                                    num_updated += cur2.rowcount
                                                conn2.commit()
                                    console.log(f"   ✅ Updated GenreCluster in DB for {num_updated} songs")
                                except Exception as db_e:
                                    console.log(f"   ⚠️ Failed to write GenreCluster to DB: {db_e}")
                            
                                
                                # 5. Hyperparameter Tuning with GridSearchCV, selecting best params by validation set score.
                                # Guards against tiny datasets where CV folds would be
                                # too small to be statistically meaningful (< 5 samples per fold).
                                n_train = len(X_train_scaled)
                                cv_folds = min(5, max(2, n_train // 5))
                                used_gridsearch = cv_folds >= 2

                                if cv_folds < 2:
                                    console.log(f"   ⚠️ Too few training samples ({n_train}) for CV — skipping tuning")
                                    # Fall back to regularized hyperparameters for small datasets
                                    best_model_svm = SVC(kernel='rbf', probability=True, C=1.0, gamma='scale', class_weight='balanced')
                                    best_model_rf  = RandomForestClassifier(random_state=42, max_depth=3, min_samples_leaf=5, n_estimators=20)
                                    best_model_knn = KNeighborsClassifier(n_neighbors=min(5, max(3, n_train)), weights='uniform')
                                    best_model_lr  = LogisticRegression(max_iter=1000, C=0.01, class_weight='balanced', solver='lbfgs')
                                    for m in [best_model_svm, best_model_rf, best_model_knn, best_model_lr]:
                                        m.fit(X_train_scaled, y_train)
                                    grid_svm = None
                                    grid_rf = None
                                    grid_knn = None
                                    grid_lr = None
                                else:
                                    grid_svm = GridSearchCV(
                                        SVC(kernel='rbf', probability=True, class_weight='balanced'),
                                        {'C': [0.01, 0.1, 1.0], 'gamma': ['scale', 'auto', 0.1]},
                                        cv=cv_folds, scoring='accuracy', refit=True, return_train_score=True
                                    )
                                    grid_svm.fit(X_train_scaled, y_train)
                                    best_model_svm = grid_svm.best_estimator_
                                    svm_val_score = float(best_model_svm.score(X_valid_scaled, y_valid))
                                    console.log(f"   SVM val-score: {svm_val_score:.4f}")

                                    grid_rf = GridSearchCV(
                                        RandomForestClassifier(random_state=42, min_samples_leaf=15, min_samples_split=20),
                                        {'n_estimators': [20, 30], 'max_depth': [2, 3, 4], 'min_samples_leaf': [15, 20, 25]},
                                        cv=cv_folds, scoring='accuracy', refit=True, return_train_score=True
                                    )
                                    grid_rf.fit(X_train_scaled, y_train)
                                    best_model_rf = grid_rf.best_estimator_
                                    rf_val_score = float(best_model_rf.score(X_valid_scaled, y_valid))
                                    console.log(f"   RF val-score: {rf_val_score:.4f}")

                                    max_k = min(9, n_train - 1)
                                    knn_candidates = [k for k in [3, 5, 7, 9] if k <= max_k] or [max(3, max_k)]
                                    grid_knn = GridSearchCV(
                                        KNeighborsClassifier(weights='uniform'),
                                        {'n_neighbors': knn_candidates},
                                        cv=cv_folds, refit=True, return_train_score=True
                                    )
                                    grid_knn.fit(X_train_scaled, y_train)
                                    best_model_knn = grid_knn.best_estimator_
                                    knn_val_score = float(best_model_knn.score(X_valid_scaled, y_valid))
                                    console.log(f"   KNN val-score: {knn_val_score:.4f}")

                                    grid_lr = GridSearchCV(
                                        LogisticRegression(max_iter=10000, solver='lbfgs'),
                                        {'C': [0.001, 0.01, 0.1, 1.0]},
                                        cv=cv_folds, refit=True, return_train_score=True
                                    )
                                    grid_lr.fit(X_train_scaled, y_train)
                                    best_model_lr = grid_lr.best_estimator_
                                    lr_val_score = float(best_model_lr.score(X_valid_scaled, y_valid))
                                    console.log(f"   LR val-score: {lr_val_score:.4f}")

                                X_train_final = np.concatenate((X_train_scaled, X_valid_scaled), axis=0)
                                y_train_final = np.concatenate((y_train, y_valid), axis=0)


                                per_model_metrics = {}
                                individual_full_models = {}

                                tuned_models = {
                                    'SVM': best_model_svm,
                                    'RandomForest': best_model_rf,
                                    'KNN': best_model_knn,
                                    'LogisticRegression': best_model_lr
                                }

                                for mname, mdl in tuned_models.items():
                                    # Get training score as resubstitution error: model fitted on X_train, scored on X_train
                                    # This gives an honest estimate and ensures train <= val
                                    train_sc = round(float(mdl.score(X_train_scaled, y_train)), 4)
                                    
                                    # Validation score: model fitted on X_train, scored on X_valid
                                    val_sc = round(float(mdl.score(X_valid_scaled, y_valid)), 4)

                                    mdl_full = clone(mdl)
                                    mdl_full.fit(X_train_final, y_train_final)
                                    individual_full_models[mname] = mdl_full

                                    y_pred_m = mdl_full.predict(X_test_scaled)
                                    per_model_metrics[mname] = {
                                        'train_score': train_sc,
                                        'val_score': val_sc,
                                        'test_acc': round(float(mdl_full.score(X_test_scaled, y_test)), 4),
                                        'silhouette_score': round(float(best_sil), 4),
                                        'optimal_k': n_clusters,
                                        'precision': round(float(precision_score(y_test, y_pred_m, average='weighted', zero_division=0)), 4),
                                        'recall': round(float(recall_score(y_test, y_pred_m, average='weighted', zero_division=0)), 4),
                                        'f1_score': round(float(f1_score(y_test, y_pred_m, average='weighted', zero_division=0)), 4),
                                    }
                                    console.log(f"   {mname}: val={val_sc}, test={per_model_metrics[mname]['test_acc']}")

                                    # Sanity check: flag if val still beats train (indicates possible underfitting or bad split)
                                    if val_sc > train_sc + 0.05:
                                        console.log(f"   ⚠️ {mname}: val ({val_sc}) > train ({train_sc}) by >{0.05:.0%} — possible underfitting or skewed split")
                                        console.log(f"      pred distribution on val: {np.bincount(mdl.predict(X_valid_scaled))}")

                                # Build ensemble for evaluation on train/val/test sets
                                ens_probe = VotingClassifier(
                                    estimators=[
                                        ('knn', clone(best_model_knn)),
                                        ('rf', clone(best_model_rf)),
                                        ('svm', clone(best_model_svm)),
                                        ('lr', clone(best_model_lr)),
                                    ],
                                    voting='soft'
                                )

                                # Train on X_train_scaled and evaluate on both train and validation sets
                                ens_probe.fit(X_train_scaled, y_train)
                                ens_train_sc = round(float(ens_probe.score(X_train_scaled, y_train)), 4)
                                ens_val_sc = round(float(ens_probe.score(X_valid_scaled, y_valid)), 4)

                                # Build final ensemble classifier trained on train+val for test evaluation
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

                                y_pred_ens = ensemble_classifier.predict(X_test_scaled)
                                per_model_metrics['Ensemble'] = {
                                    'train_score': ens_train_sc,
                                    'val_score': ens_val_sc,
                                    'test_acc': round(float(ensemble_classifier.score(X_test_scaled, y_test)), 4),
                                    'silhouette_score': round(float(best_sil), 4),
                                    'optimal_k': n_clusters,
                                    'precision': round(float(precision_score(y_test, y_pred_ens, average='weighted', zero_division=0)), 4),
                                    'recall': round(float(recall_score(y_test, y_pred_ens, average='weighted', zero_division=0)), 4),
                                    'f1_score': round(float(f1_score(y_test, y_pred_ens, average='weighted', zero_division=0)), 4),
                                }
                                console.log(f"   Ensemble: val={ens_val_sc}, test={per_model_metrics['Ensemble']['test_acc']}")

                                best_model_name, best_stats = max(
                                    per_model_metrics.items(),
                                    key=lambda kv: (float(kv[1].get('val_score', 0.0)), float(kv[1].get('test_acc', 0.0))),
                                )
                                best_val = float(best_stats.get('val_score', 0.0))

                                best_classifier = individual_full_models[best_model_name]
                                knn_classifier = individual_full_models.get('KNN')
                                model_performance_metrics['best_model'] = best_model_name
                                console.log(f"   ★ Selected model: {best_model_name} (val={best_val:.4f}, test={best_stats.get('test_acc', 0.0):.4f})")

                                # 10. Decision boundary grids for visualisation.
                                # Boundaries are computed in the 51D classifier
                                # space and only then projected to 2D for display
                                
                                # Samples a dense grid in the 2D PCA visualisation
                                # plane, reconstruct approximate 51D points, make predictions, and
                                # mark the result as an approximation.
                                grid_res = 80
                                x_min_g = float(X_pca[:, 0].min() - 0.5)
                                x_max_g = float(X_pca[:, 0].max() + 0.5)
                                y_min_g = float(X_pca[:, 1].min() - 0.5)
                                y_max_g = float(X_pca[:, 1].max() + 0.5)
                                xx, yy = np.meshgrid(
                                    np.linspace(x_min_g, x_max_g, grid_res),
                                    np.linspace(y_min_g, y_max_g, grid_res)
                                )
                                grid_2d  = np.c_[xx.ravel(), yy.ravel()]
                                
                                # Reconstruct approximate 51D vectors from the 2D grid.
                                # inverse_transform is lossy (maps onto a 2D hyperplane in
                                # 51D); boundaries shown in the visualiser are approximations only.
                                grid_51d = pca_reducer.inverse_transform(grid_2d)

                                boundary_base = {
                                    "x_min": x_min_g, "x_max": x_max_g,
                                    "y_min": y_min_g, "y_max": y_max_g,
                                    "grid_res": grid_res,
                                    "approximate": True   # flag so the frontend can show a disclaimer
                                }

                                all_model_boundaries = {}
                                for mname, mdl in individual_full_models.items():
                                    preds       = mdl.predict(grid_51d)
                                    labels_list = [int(p.split()[-1]) for p in preds]
                                    all_model_boundaries[mname] = {
                                        **boundary_base,
                                        "labels": labels_list
                                    }

                                console.log(f"   🗺️ Decision boundaries generated for: {', '.join(all_model_boundaries.keys())}")

                                visualization_data = {
                                    "x": X_pca[:, 0].tolist(),
                                    "y": X_pca[:, 1].tolist(),
                                    "genres": y_all.tolist(),
                                    "scaler": best_scaler_name,
                                    "metrics": {**model_performance_metrics, "best_model": best_model_name},
                                    "per_model_metrics": per_model_metrics,
                                    "decision_boundary": all_model_boundaries.get('Ensemble', all_model_boundaries.get('KNN')),
                                    "model_boundaries": all_model_boundaries
                                }
                                console.log("   ✅ Visualization data ready")
                            else:
                                console.log(f"⚠️ Not enough data ({len(feature_vectors)} tracks, need >= 10)")
                            
                        except Exception as e:
                            console.log(f"⚠️ ML Initialization warning: {e}")
                        
                        console.log(f"📊 Final model_performance_metrics: {model_performance_metrics}", flush=True)
                        return
        
        except Exception as e:
            console.log(f"⚠️ Attempt {attempt + 1}/{max_retries} - Failed to load audio features cache: {e}")
            if attempt < max_retries - 1:
                console.log(f"   Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
            else:
                console.log(f"❌ Could not load audio features cache after {max_retries} attempts")
                console.log(f"   Service will start but similarity will be slower (real-time analysis)")
                cache_loaded = False


# Shared feature-vector builder 
def _build_feature_vector(data: dict) -> List[float]:
    """Build a normalised 51D feature vector from a cache entry.

    Field order must exactly match the order used during model training.
    Any change here must be reflected in classify_genre_from_features as well.
    """
    key_str = data.get('key_signature', '')
    ts_str  = data.get('time_signature', '4/4')

    vec = [
        float(data.get('tempo', 120.0)),           
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
        float(data.get('spectral_bandwidth', 1500.0) or 1500.0),  
        float(data.get('rms_energy', 0.02) or 0.02),              
        float(data.get('onset_rate', 2.0) or 2.0),                
        float(data.get('harmonic_ratio', 0.5) or 0.5),            
        float(data.get('percussive_ratio', 0.5) or 0.5),          
        float(data.get('duration', 0) or 0),                      
        float(KEY_NAME_TO_INDEX.get(key_str, 0)),                  
        float(TIME_SIG_TO_BEATS.get(ts_str, 4.0)),                 
    ]
    # MFCC (13), Chroma (12), SpectralContrast (7) — all via _parse_json_list
    # so truncation, padding, and type coercion are handled uniformly 
    vec.extend(_parse_json_list(data.get('mfcc_mean'),              13))
    vec.extend(_parse_json_list(data.get('chroma_mean'),            12))
    vec.extend(_parse_json_list(data.get('spectral_contrast_mean'), 7))
    return vec  


def _proxy_stratify_labels(X: np.ndarray, n_bins: int = 3) -> np.ndarray:
    """Create rough stratification labels from the first principal component.

    Used to ensure the initial train/val/test split is balanced before real
    cluster labels are available (which require fitting a scaler first).
    """
    pca_tmp   = PCA(n_components=1)
    pc1       = pca_tmp.fit_transform(X)[:, 0]
    quantiles = np.percentile(pc1, np.linspace(0, 100, n_bins + 1)[1:-1])
    return np.digitize(pc1, quantiles)


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
    spectral_contrast_mean: List[float] = None
) -> str:
    """
    Takes raw audio features from a new song and predicts its GenreCluster
    using the global ML models (Scaler → Best classifier) trained at startup.
    Pipeline: Raw 51D features → Scaler → Best classifier predict.
    """
    global feature_scaler, pca_reducer, knn_classifier, ensemble_classifier, best_classifier
            
    try:
        if feature_scaler is None:
            return "Unknown"
        if best_classifier is None and ensemble_classifier is None and knn_classifier is None:
            return "Unknown"

        # Applys the same tempo correction used in startup_cache so that
        # zero-tempo tracks map to 120.0 at inference, matching their training value.
        safe_tempo = float(tempo) if tempo and tempo != 0 else 120.0

        # Builds the 51D input vector using the shared helper so training and
        # inference always produce identically structured vectors.
        inference_data = {
            'tempo':                safe_tempo,
            'energy':               energy,
            'valence':              valence,
            'danceability':         danceability,
            'acousticness':         acousticness,
            'spectral_centroid':    spectral_centroid,
            'spectral_rolloff':     spectral_rolloff,
            'zero_crossing_rate':   zero_crossing_rate,
            'instrumentalness':     instrumentalness,
            'loudness':             loudness,
            'speechiness':          speechiness,
            'spectral_bandwidth':   spectral_bandwidth,
            'rms_energy':           rms_energy,
            'onset_rate':           onset_rate,
            'harmonic_ratio':       harmonic_ratio,
            'percussive_ratio':     percussive_ratio,
            'duration':             duration,
            'key_signature':        key_signature,
            'time_signature':       time_signature,
            'mfcc_mean':            mfcc_mean   or [0.0] * 13,
            'chroma_mean':          chroma_mean or [0.0] * 12,
            'spectral_contrast_mean': spectral_contrast_mean or [0.0] * 7,
        }
        input_vector = _build_feature_vector(inference_data)

        if len(input_vector) != 51:
            console.log(f"⚠️ classify_genre_from_features: expected 51D vector, got {len(input_vector)}D")
            return "Unknown"

        features_array = np.array([input_vector])
        features_scaled = feature_scaler.transform(features_array)

        predicted = best_classifier.predict(features_scaled)[0]
        return str(predicted)
        
    except Exception as e:
        console.log(f"⚠️ Genre classification failed: {e}")
        return "Unknown"


# ── KNN-based real genre predictor (uses iTunes genres as training data) ────
_genre_knn_model = None
_genre_knn_labels = None
_genre_knn_model_labels_hash = None


def _is_real_genre(genre: str) -> bool:
    """Return True if genre is a real label, not a cluster or placeholder."""
    if not genre:
        return False
    g = genre.strip().lower()
    return g not in ('', 'unknown', 'soundtrack') and not g.startswith('cluster')


def _train_genre_knn():
    global _genre_knn_model, _genre_knn_labels, _genre_knn_model_labels_hash

    train_vectors, train_labels = [], []
    for pid, data in audio_features_cache.items():
        genre = data.get('genre', '')
        if not _is_real_genre(genre):
            continue
        
        vec = _build_feature_vector(data)
        if len(vec) != 51:
            continue
        train_vectors.append(vec)
        train_labels.append(genre)

    if len(train_vectors) < 3:
        _genre_knn_model = None
        _genre_knn_labels = None
        _genre_knn_model_labels_hash = None
        return

    labels_hash = hash(tuple(sorted(set(train_labels))))
    if _genre_knn_model is not None and _genre_knn_model_labels_hash == labels_hash:
        return

    X = np.array(train_vectors)
    if feature_scaler is not None:
        X = feature_scaler.transform(X)

    k = min(5, len(train_vectors))
    clf = KNeighborsClassifier(n_neighbors=k)
    clf.fit(X, train_labels)

    _genre_knn_model = clf
    _genre_knn_labels = list(set(train_labels))
    _genre_knn_model_labels_hash = labels_hash
    console.log(f"🎵 Trained genre KNN: {len(train_vectors)} songs, {len(_genre_knn_labels)} genres")


def predict_real_genre(features: dict) -> Optional[str]:
    global _genre_knn_model, _genre_knn_model_labels_hash

    _train_genre_knn()

    if _genre_knn_model is None:
        return None

    try:
        vec = _build_feature_vector(features)
        if len(vec) != 51:
            return None
        X = np.array([vec])
        if feature_scaler is not None:
            X = feature_scaler.transform(X)
        return str(_genre_knn_model.predict(X)[0])
    except Exception as e:
        console.log(f"⚠️ Genre KNN prediction failed: {e}")
        return None
