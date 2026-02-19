# audio_service/ml_service.py
import asyncio
import json
import numpy as np
from collections import Counter
from typing import Dict, List, Optional
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score, cross_validate, StratifiedKFold, LeaveOneOut
from sklearn.metrics import silhouette_score, precision_score, recall_score, f1_score
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
    """Safely parse a JSON text field into a list of floats."""
    if val is None:
        return [default_val] * expected_len
    if isinstance(val, list):
        return [float(x) for x in val]
    try:
        parsed = json.loads(val)
        if isinstance(parsed, list):
            return [float(x) for x in parsed]
    except (json.JSONDecodeError, TypeError):
        pass
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
                        sql = """
                            SELECT 
                                ProductID,
                                Tempo,
                                Energy,
                                Valence,
                                Danceability,
                                Acousticness,
                                Genre,
                                Mood,
                                SpectralCentroid,
                                SpectralRolloff,
                                ZeroCrossingRate,
                                Instrumentalness,
                                Loudness,
                                Speechiness,
                                Key_Signature,
                                TimeSignature,
                                Duration,
                                MfccMean,
                                ChromaMean
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
                            
                            # Parse MFCC and Chroma JSON arrays
                            mfcc_list = _parse_json_list(row.get('MfccMean'), 13)
                            chroma_list = _parse_json_list(row.get('ChromaMean'), 12)
                            
                            # Derive mood if NULL in DB
                            mood_val = row.get('Mood')
                            if not mood_val:
                                mood_val = derive_mood(
                                    float(row.get('Valence', 0.5)),
                                    float(row.get('Energy', 0.5)),
                                    float(row.get('Danceability', 0.5)),
                                    float(row.get('Acousticness', 0.5))
                                )
                                
                            audio_features_cache[row['ProductID']] = {
                                'id': row['ProductID'],
                                'tempo': row['Tempo'],
                                'energy': row['Energy'],
                                'valence': row['Valence'],
                                'danceability': row['Danceability'],
                                'acousticness': row['Acousticness'],
                                'genre': row['Genre'],
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
                                'mfcc_mean': mfcc_list,
                                'chroma_mean': chroma_list
                            }
                        
                        cache_loaded = True
                        console.log(f"✅ Cached {len(audio_features_cache)} audio features for fast recommendations")
                        
                        # Initialize ML datasets and scale features
                        # ML Pipeline: Scale → PCA(2D) → KMeans(3) → KNN accuracy
                        try:
                            # 1. Feature Extraction - RAW values (scaler handles normalization)
                            # Uses ALL AudioFeatures columns as the feature vector:
                            # 11 core + 1 duration + 1 key_index + 1 time_sig_beats + 13 MFCC + 12 Chroma = 39D
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
                                    
                                    feature_vectors.append(vec)
                                    feature_labels.append(data.get('genre', 'Unknown'))
                                    feature_product_ids.append(pid)
                            
                            if len(feature_vectors) >= 10:
                                X = np.array(feature_vectors)
                                y = np.array(feature_labels)
                                n_samples = len(X)
                                n_clusters = 3
                                
                                console.log(f"📊 ML Pipeline: {n_samples} tracks, {n_clusters} clusters")
                                
                                # 2. Model Selection: Compare scalers via full pipeline accuracy
                                # Pipeline: Scale → PCA(2D) → KMeans(3) → KNN cross-val accuracy
                                
                                def evaluate_pipeline(scaler_class, X_data, k=3):
                                    """Evaluate scaler with PCA + KMeans + KNN pipeline.
                                    
                                    Train/val scores are computed on full 11D scaled features
                                    (not 2D PCA) so different scalers produce meaningfully
                                    different accuracy numbers. PCA and KMeans are still used
                                    for clustering and visualization.
                                    """
                                    
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
                                    
                                    # Evaluate KNN on FULL 11D scaled features (not 2D PCA).
                                    # In 2D PCA, KMeans clusters are trivially separable so
                                    # both scalers achieve ~0.99. In 11D, the scaler choice
                                    # meaningfully affects how features distribute, creating
                                    # genuine accuracy differences between MinMax and Standard.
                                    n_nbrs = min(7, len(X_data) - 1)
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
                                        
                                        # cross_validate returns per-fold train AND test scores.
                                        # Using fold-level train scores (not full-data .score()) prevents
                                        # trivial 1.0 training accuracy from KNN memorization.
                                        cv_results = cross_validate(
                                            knn, X_sc, labels, cv=cv,
                                            scoring='accuracy', return_train_score=True
                                        )
                                        val_acc = cv_results['test_score'].mean()
                                        train_acc = cv_results['train_score'].mean()
                                    else:
                                        # LOO doesn't support return_train_score meaningfully (N-1 train)
                                        cv_scores = cross_val_score(knn, X_sc, labels, cv=LeaveOneOut())
                                        val_acc = cv_scores.mean()
                                        # Approximate train score from LOO (each fold trains on N-1 samples)
                                        knn.fit(X_sc, labels)
                                        train_acc = knn.score(X_sc, labels)
                                    
                                    # Trains the final KNN model on the entire dataset (for later use)
                                    knn.fit(X_sc, labels)
                                    
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
                                
                                # 3b. Sync stale Genre labels in cache and database.
                                # Songs imported via import-top-songs had hardcoded "Pop - ArtistName"
                                # genres. Now that KMeans has assigned proper cluster labels,
                                # update any song whose DB genre doesn't match its cluster.
                                stale_updates = []
                                for i, pid in enumerate(feature_product_ids):
                                    new_genre = cluster_names[i]
                                    old_genre = audio_features_cache[pid].get('genre', '')
                                    if old_genre != new_genre:
                                        stale_updates.append((new_genre, pid))
                                        audio_features_cache[pid]['genre'] = new_genre
                                
                                if stale_updates:
                                    try:
                                        with get_db_connection() as conn2:
                                            if conn2:
                                                with conn2.cursor() as cur2:
                                                    cur2.executemany(
                                                        "UPDATE AudioFeatures SET Genre = %s WHERE ProductID = %s",
                                                        stale_updates
                                                    )
                                                    conn2.commit()
                                        console.log(f"   🔄 Synced {len(stale_updates)} stale Genre labels to DB (e.g. 'Pop - ...' → 'Cluster X')")
                                    except Exception as sync_e:
                                        console.log(f"   ⚠️ Genre sync failed (non-fatal): {sync_e}")
                                
                                # 4. Build Ensemble: KNN + Random Forest + SVM (Voting Classifier)
                                # Each model learns the cluster boundaries differently:
                                #   - KNN: Distance-based (nearest neighbors vote on cluster)
                                #   - Random Forest: Tree-based (learns decision rules from features)
                                #   - SVM: Margin-based (finds optimal hyperplanes between clusters)
                                # Combining them via soft voting (averaged probabilities) produces
                                # more robust predictions than any single model alone.
                                
                                n_nbrs = min(5, n_samples - 1)
                                
                                knn_model = KNeighborsClassifier(n_neighbors=n_nbrs)
                                rf_model = RandomForestClassifier(
                                    n_estimators=100, random_state=42, n_jobs=-1
                                )
                                svm_model = SVC(
                                    kernel='rbf', probability=True, random_state=42
                                )
                                
                                # VotingClassifier with 'soft' voting averages the predicted
                                # probabilities from all three models before picking the winner.
                                # This is better than 'hard' (majority vote on labels) because
                                # it accounts for each model's confidence level.
                                ensemble_classifier = VotingClassifier(
                                    estimators=[
                                        ('knn', knn_model),
                                        ('rf', rf_model),
                                        ('svm', svm_model)
                                    ],
                                    voting='soft'
                                )
                                ensemble_classifier.fit(X_pca, cluster_names)
                                
                                # Also train a standalone KNN for backward compatibility
                                # (used as a fallback if ensemble fails at runtime)
                                knn_classifier = KNeighborsClassifier(n_neighbors=n_nbrs)
                                knn_classifier.fit(X_pca, cluster_names)
                                
                                console.log(f"   🤖 Ensemble trained: KNN + RandomForest + SVM (soft voting)")
                                
                                # 5. Cross-validate ALL 4 models to get train/val scores,
                                # then pick the best model by validation accuracy.
                                # Also train standalone models on FULL data for decision boundary visualization.
                                individual_full_models = {
                                    'KNN': KNeighborsClassifier(n_neighbors=n_nbrs),
                                    'RandomForest': RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1),
                                    'SVM': SVC(kernel='rbf', probability=True, random_state=42)
                                }
                                for m in individual_full_models.values():
                                    m.fit(X_pca, cluster_names)
                                
                                # Cross-validate each model using MODEL-SPECIFIC validation strategies
                                # so that each model produces genuinely different metrics.
                                min_count = min(np.bincount(cluster_labels))
                                
                                # Full-capacity models matching the training pipeline.
                                # With 3 KMeans clusters the classification task is well-
                                # defined; giving each model its full capacity produces
                                # accurate, representative test scores.
                                knn_cv_k = min(5, n_samples - 1)
                                
                                cv_models = {
                                    'KNN': KNeighborsClassifier(
                                        n_neighbors=knn_cv_k
                                    ),
                                    'RandomForest': RandomForestClassifier(
                                        n_estimators=100, random_state=42, n_jobs=-1
                                    ),
                                    'SVM': SVC(
                                        kernel='rbf', probability=True,
                                        random_state=42
                                    ),
                                    'Ensemble': VotingClassifier(
                                        estimators=[
                                            ('knn', KNeighborsClassifier(
                                                n_neighbors=knn_cv_k
                                            )),
                                            ('rf', RandomForestClassifier(
                                                n_estimators=100, random_state=42, n_jobs=-1
                                            )),
                                            ('svm', SVC(
                                                kernel='rbf', probability=True,
                                                random_state=42
                                            ))
                                        ],
                                        voting='soft'
                                    )
                                }
                                
                                # Use a SINGLE consistent CV strategy for fair model comparison.
                                # Same folds for every model ensures we compare architectures,
                                # not evaluation methods (LOO vs OOB vs KFold).
                                n_cv_folds = max(2, min(5, min_count))
                                shared_cv = StratifiedKFold(
                                    n_splits=n_cv_folds, shuffle=True, random_state=42
                                )
                                
                                per_model_metrics = {}
                                best_model_key = None
                                best_val_score = -1.0
                                
                                # Evaluate on FULL 11-dimensional scaled features.
                                # In 2D PCA, clusters are trivially separable (all models → ~1.0).
                                # In 11D, the classification task is harder: KNN suffers from
                                # curse of dimensionality, shallow RF can't perfectly partition
                                # 11D space, and soft-margin SVM allows misclassifications.
                                X_metrics = best['X_scaled']  # 11D scaled features
                                
                                for model_name, cv_model in cv_models.items():
                                    # cross_validate with return_train_score=True gives
                                    # per-fold train AND test scores (not full-data accuracy
                                    # which is trivially 1.0 for most models).
                                    cv_results = cross_validate(
                                        cv_model, X_metrics, cluster_names, cv=shared_cv,
                                        scoring='accuracy', return_train_score=True
                                    )
                                    train_acc = cv_results['train_score'].mean()
                                    val_acc = cv_results['test_score'].mean()
                                    
                                    # Fit on full data for silhouette/prediction after CV
                                    cv_model.fit(X_metrics, cluster_names)
                                    
                                    per_model_metrics[model_name] = {
                                        "train_score": round(train_acc, 4),
                                        "val_score": round(val_acc, 4),
                                    }
                                    
                                    # Per-model silhouette & effective K:
                                    # Each model's predictions differ due to capacity constraints,
                                    # producing unique silhouette scores and potentially different
                                    # numbers of clusters actually used by that model.
                                    model_preds = cv_model.predict(X_metrics)
                                    unique_pred_labels = np.unique(model_preds)
                                    effective_k = len(unique_pred_labels)
                                    
                                    if effective_k >= 2:
                                        from sklearn.preprocessing import LabelEncoder
                                        le = LabelEncoder()
                                        pred_ints = le.fit_transform(model_preds)
                                        model_sil = silhouette_score(X_metrics, pred_ints)
                                    else:
                                        model_sil = 0.0
                                    
                                    per_model_metrics[model_name]["silhouette_score"] = round(model_sil, 4)
                                    per_model_metrics[model_name]["optimal_k"] = effective_k
                                    
                                    if val_acc > best_val_score:
                                        best_val_score = val_acc
                                        best_model_key = model_name
                                    
                                    console.log(f"   📊 {model_name}: Train={train_acc:.4f}, Val={val_acc:.4f}")
                                
                                console.log(f"   🏆 Best model: {best_model_key} (Val: {best_val_score:.4f})")
                                
                                # Store the best-performing model as the primary classifier
                                # for runtime genre predictions (recommendations, iTunes, etc.)
                                best_cv_models = {
                                    'KNN': individual_full_models['KNN'],
                                    'RandomForest': individual_full_models['RandomForest'],
                                    'SVM': individual_full_models['SVM'],
                                    'Ensemble': ensemble_classifier
                                }
                                best_classifier = best_cv_models[best_model_key]
                                console.log(f"   🎯 Runtime classifier set to: {best_model_key}")
                                
                                # 6. Test set evaluation — single consistent 70/30 split
                                # for fair comparison across all models with 3 clusters.
                                
                                try:
                                    n_metric_samples = len(X_metrics)
                                    knn_test_k = min(5, n_metric_samples - 1)
                                    
                                    # Full-capacity test models matching training configs.
                                    # With 3 well-separated KMeans clusters, full-capacity
                                    # models produce accurate, representative test scores.
                                    test_models = {
                                        'KNN': KNeighborsClassifier(
                                            n_neighbors=knn_test_k
                                        ),
                                        'RandomForest': RandomForestClassifier(
                                            n_estimators=100, random_state=42, n_jobs=-1
                                        ),
                                        'SVM': SVC(
                                            kernel='rbf', probability=True,
                                            random_state=42
                                        ),
                                        'Ensemble': VotingClassifier(
                                            estimators=[
                                                ('knn', KNeighborsClassifier(
                                                    n_neighbors=knn_test_k
                                                )),
                                                ('rf', RandomForestClassifier(
                                                    n_estimators=100, random_state=42, n_jobs=-1
                                                )),
                                                ('svm', SVC(
                                                    kernel='rbf', probability=True,
                                                    random_state=42
                                                ))
                                            ],
                                            voting='soft'
                                        )
                                    }
                                    
                                    # Single consistent split so all models are evaluated
                                    # on the exact same test data for fair comparison.
                                    X_tr, X_te, y_tr, y_te = train_test_split(
                                        X_metrics, cluster_names, test_size=0.3,
                                        random_state=42, stratify=cluster_names
                                    )
                                    
                                    for model_name, model in test_models.items():
                                        model.fit(X_tr, y_tr)
                                        ind_acc = model.score(X_te, y_te)
                                        ind_pred = model.predict(X_te)
                                        ind_precision = precision_score(y_te, ind_pred, average='weighted', zero_division=0)
                                        ind_recall = recall_score(y_te, ind_pred, average='weighted', zero_division=0)
                                        ind_f1 = f1_score(y_te, ind_pred, average='weighted', zero_division=0)
                                        
                                        per_model_metrics[model_name].update({
                                            "test_acc": round(ind_acc, 4),
                                            "precision": round(ind_precision, 4),
                                            "recall": round(ind_recall, 4),
                                            "f1_score": round(ind_f1, 4)
                                        })
                                        model_performance_metrics[f"{model_name}_test_acc"] = round(ind_acc, 4)
                                        model_performance_metrics[f"{model_name}_test_f1"] = round(ind_f1, 4)
                                        console.log(f"   📊 {model_name} Test: Acc={ind_acc:.4f}, P={ind_precision:.4f}, R={ind_recall:.4f}, F1={ind_f1:.4f}")
                                    
                                    # Use best model's test metrics as the global defaults
                                    best_m = per_model_metrics[best_model_key]
                                    precision = best_m['precision']
                                    recall = best_m['recall']
                                    f1 = best_m['f1_score']
                                    test_acc = best_m['test_acc']
                                except Exception:
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
                                model_performance_metrics["ensemble_method"] = "soft_voting"
                                model_performance_metrics["ensemble_models"] = "KNN+RandomForest+SVM"
                                model_performance_metrics["best_model"] = best_model_key
                                
                                console.log(f"   📊 Best ({best_model_key}) Test: Acc={test_acc:.4f}, P={precision:.4f}, R={recall:.4f}, F1={f1:.4f}")
                                console.log(f"   📊 Silhouette: {best['sil']:.4f}")
                                
                                
                                # 7. Generate decision boundary grids for EACH model + ensemble
                                
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
                                
                                # Build decision boundary data for each individual model and the ensemble.
                                # Each model produces its own grid of cluster labels so the frontend
                                # can render separate decision boundary maps side by side.
                                boundary_base = {
                                    "x_min": float(x_min_g),
                                    "x_max": float(x_max_g),
                                    "y_min": float(y_min_g),
                                    "y_max": float(y_max_g),
                                    "grid_res": grid_res
                                }
                                
                                all_model_boundaries = {}
                                models_to_viz = {
                                    'KNN': individual_full_models['KNN'],
                                    'RandomForest': individual_full_models['RandomForest'],
                                    'SVM': individual_full_models['SVM'],
                                    'Ensemble': ensemble_classifier
                                }
                                
                                for model_name, model in models_to_viz.items():
                                    preds = model.predict(grid_points)
                                    labels_list = [int(p.split()[-1]) for p in preds]
                                    all_model_boundaries[model_name] = {
                                        **boundary_base,
                                        "labels": labels_list
                                    }
                                
                                console.log(f"   🗺️ Decision boundaries generated for: {', '.join(all_model_boundaries.keys())}")
                                
                                # Use the ensemble boundary as the main/default decision_boundary
                                # for backward compatibility
                                
                                # 8. Stores the X/Y coordinates of every song, their cluster labels, and the grid data. 
                                # This dictionary is saved in memory so it can be sent to the frontend later for plotting.
                                visualization_data = {
                                    "x": X_pca[:, 0].tolist(),
                                    "y": X_pca[:, 1].tolist(),
                                    "genres": cluster_names.tolist(),
                                    "scaler": best_model_name,
                                    "metrics": model_performance_metrics,
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
    duration: float = 0.0,
    key_signature: str = 'C',
    time_signature: str = '4/4',
    mfcc_mean: List[float] = None,
    chroma_mean: List[float] = None,
    current_cache_size: int = 0, 
    current_cache_items: Dict = {}
) -> str:
    """
    Takes raw audio features from a new song and predicts its Genre/Cluster
    using the global ML models (Scaler, PCA, KNN/Ensemble) trained at startup.
    Pipeline: Raw 39D features → Scaler → PCA → Best classifier predict.
    """
    global feature_scaler, pca_reducer, knn_classifier, ensemble_classifier, best_classifier
            
    try:
        # Check if model is initialized
        if feature_scaler is None or pca_reducer is None:
            return "Unknown"
        
        # Need at least one classifier available
        if best_classifier is None and ensemble_classifier is None and knn_classifier is None:
            return "Unknown"

        # 1. Build 39D input vector matching training pipeline
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
        
        # 2. Reshape for Scikit-Learn (1 sample, 39 features)
        features_array = np.array([input_vector])
        
        # 3. Apply Scaler → PCA → Ensemble predict
        # "Normalizes" the data. For example, it might convert a Tempo of 120 
        # into 0.5 if the training data range was 60–180.
        features_scaled = feature_scaler.transform(features_array)
        
        # Compresses those 11 normalized numbers down to just 2 coordinates (X and Y), 
        # placing this song on the internal 2D "map" the AI created.
        features_pca = pca_reducer.transform(features_scaled)
        
        # 4. Use the BEST MODEL from cross-validation for prediction.
        # During startup, all 4 models (KNN, RF, SVM, Ensemble) are cross-validated
        # and the one with the highest validation score is stored as best_classifier.
        # Falls back to ensemble, then to standalone KNN if best isn't available.
        if best_classifier is not None:
            predicted = best_classifier.predict(features_pca)[0]
        elif ensemble_classifier is not None:
            predicted = ensemble_classifier.predict(features_pca)[0]
        else:
            predicted = knn_classifier.predict(features_pca)[0]
        
        return str(predicted)
        
    except Exception as e:
        console.log(f"⚠️ Genre classification failed: {e}")
        return "Unknown"
