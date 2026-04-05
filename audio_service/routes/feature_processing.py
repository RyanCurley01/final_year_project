# audio_service/routes/feature_processing.py
from fastapi import APIRouter, HTTPException
import asyncio
import json
from typing import Optional, Dict

from utils import console
from config import executor
from database import get_db_connection
from feature_extraction import (
    extract_audio_features_from_preview,
    extract_features_for_product_async,
    derive_mood
)
import ml_service

router = APIRouter()


def _safe_json_list(raw_value, expected_length: int) -> list[float]:
    if raw_value in (None, "", b""):
        return []

    parsed = raw_value
    if isinstance(raw_value, (str, bytes, bytearray)):
        try:
            parsed = json.loads(raw_value)
        except Exception:
            return []

    if not isinstance(parsed, list):
        return []

    values: list[float] = []
    for item in parsed[:expected_length]:
        try:
            values.append(float(item))
        except Exception:
            values.append(0.0)
    return values


def _is_incomplete_feature_row(row: Dict) -> bool:
    return (
        row.get('FeatureProductID') is None
        or row.get('MfccMean') is None
        or row.get('Mood') is None
        or row.get('Key_Signature') is None
        or row.get('TimeSignature') is None
        or row.get('Duration') is None
        or row.get('GenreCluster') in (None, 'Unknown')
        or row.get('Genre') in (None, 'Unknown')
        or row.get('SpectralBandwidth') is None
        or row.get('SpectralContrast') is None
    )


def _is_placeholder_library_feature_row(row: Dict) -> bool:
    if int(row.get('ProductID') or 0) <= 0 or row.get('FeatureProductID') is None:
        return False

    mfcc_values = _safe_json_list(row.get('MfccMean'), 13)
    chroma_values = _safe_json_list(row.get('ChromaMean'), 12)
    spectral_contrast_values = _safe_json_list(row.get('SpectralContrast'), 7)

    zero_vector_mfcc = bool(mfcc_values) and all(abs(value) < 1e-9 for value in mfcc_values)
    zero_vector_chroma = bool(chroma_values) and all(abs(value) < 1e-9 for value in chroma_values)
    zero_vector_contrast = bool(spectral_contrast_values) and all(abs(value) < 1e-9 for value in spectral_contrast_values)

    placeholder_signature = (
        abs(float(row.get('Tempo') or 0.0) - 120.0) < 1e-6
        and abs(float(row.get('Energy') or 0.0) - 0.55) < 1e-6
        and abs(float(row.get('Danceability') or 0.0) - 0.5) < 1e-6
        and abs(float(row.get('Valence') or 0.0) - 0.5) < 1e-6
        and abs(float(row.get('Acousticness') or 0.0) - 0.2) < 1e-6
        and abs(float(row.get('Instrumentalness') or 0.0) - 0.7) < 1e-6
        and abs(float(row.get('Loudness') or 0.0) - (-12.0)) < 1e-6
        and abs(float(row.get('Speechiness') or 0.0) - 0.08) < 1e-6
        and abs(float(row.get('SpectralCentroid') or 0.0) - 2000.0) < 1e-6
        and abs(float(row.get('SpectralRolloff') or 0.0) - 4000.0) < 1e-6
        and abs(float(row.get('ZeroCrossingRate') or 0.0) - 0.08) < 1e-6
        and abs(float(row.get('SpectralBandwidth') or 0.0) - 2000.0) < 1e-6
        and abs(float(row.get('RmsEnergy') or 0.0) - 0.08) < 1e-6
        and abs(float(row.get('OnsetRate') or 0.0) - 2.0) < 1e-6
        and abs(float(row.get('HarmonicRatio') or 0.0) - 0.6) < 1e-6
        and abs(float(row.get('PercussiveRatio') or 0.0) - 0.4) < 1e-6
        and str(row.get('Mood') or '').lower() == 'neutral'
        and str(row.get('GenreCluster') or '') == 'Cluster 1'
        and str(row.get('Key_Signature') or '') == 'C'
        and str(row.get('TimeSignature') or '') == '4/4'
        and int(row.get('Duration') or 0) == 30
    )

    return placeholder_signature or zero_vector_mfcc or zero_vector_chroma or zero_vector_contrast


def _is_placeholder_feature_payload(product_id: int, features: Dict) -> bool:
    if int(product_id or 0) <= 0:
        return False

    mfcc_values = [float(value) for value in (features.get('mfcc_mean') or [])[:13] if value is not None]
    chroma_values = [float(value) for value in (features.get('chroma_mean') or [])[:12] if value is not None]
    spectral_contrast_values = [float(value) for value in (features.get('spectral_contrast_mean') or [])[:7] if value is not None]

    zero_vector_mfcc = bool(mfcc_values) and all(abs(value) < 1e-9 for value in mfcc_values)
    zero_vector_chroma = bool(chroma_values) and all(abs(value) < 1e-9 for value in chroma_values)
    zero_vector_contrast = bool(spectral_contrast_values) and all(abs(value) < 1e-9 for value in spectral_contrast_values)

    placeholder_signature = (
        abs(float(features.get('tempo') or 0.0) - 120.0) < 1e-6
        and abs(float(features.get('energy') or 0.0) - 0.55) < 1e-6
        and abs(float(features.get('danceability') or 0.0) - 0.5) < 1e-6
        and abs(float(features.get('valence') or 0.0) - 0.5) < 1e-6
        and abs(float(features.get('acousticness') or 0.0) - 0.2) < 1e-6
        and abs(float(features.get('instrumentalness') or 0.0) - 0.7) < 1e-6
        and abs(float(features.get('loudness') or 0.0) - (-12.0)) < 1e-6
        and abs(float(features.get('speechiness') or 0.0) - 0.08) < 1e-6
        and abs(float(features.get('spectral_centroid') or 0.0) - 2000.0) < 1e-6
        and abs(float(features.get('spectral_rolloff') or 0.0) - 4000.0) < 1e-6
        and abs(float(features.get('zero_crossing_rate') or 0.0) - 0.08) < 1e-6
        and abs(float(features.get('spectral_bandwidth') or 0.0) - 2000.0) < 1e-6
        and abs(float(features.get('rms_energy') or 0.0) - 0.08) < 1e-6
        and abs(float(features.get('onset_rate') or 0.0) - 2.0) < 1e-6
        and abs(float(features.get('harmonic_ratio') or 0.0) - 0.6) < 1e-6
        and abs(float(features.get('percussive_ratio') or 0.0) - 0.4) < 1e-6
        and str(features.get('mood') or '').lower() == 'neutral'
        and str(features.get('key_signature') or '') == 'C'
        and str(features.get('time_signature') or '') == '4/4'
        and int(features.get('duration') or 0) == 30
    )

    return placeholder_signature or zero_vector_mfcc or zero_vector_chroma or zero_vector_contrast

# ============================================
# FEATURE EXTRACTION ADMINISTRATION
# ============================================

# EXECUTION ORDER: Router endpoint.
@router.post("/api/audio/extract-all-features")
async def extract_all_product_features(
    limit: int = 272,
    save_to_db: bool = True,
    reprocess_incomplete: bool = True,
    reprocess_placeholders: bool = True,
    library_only: bool = False,
):
    """
    Extract audio features for all music products using librosa.
    This replaces the hardcoded genre/mood classification with industry-standard audio analysis.
    
    Args:
        limit: Maximum number of products to process (default 197 for safety)
        save_to_db: Whether to save extracted features to AudioFeatures table (default True)
        reprocess_incomplete: Also re-extract songs that have incomplete feature rows (default True)
        reprocess_placeholders: Also re-extract positive-ID library songs that match placeholder signatures (default True)
        library_only: Restrict processing to positive-ID library songs (default False)
    
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
                    SELECT
                        p.ProductID,
                        p.AlbumTitle,
                        p.file_url,
                        af.ProductID AS FeatureProductID,
                        af.Tempo,
                        af.Energy,
                        af.Danceability,
                        af.Valence,
                        af.Acousticness,
                        af.Instrumentalness,
                        af.Loudness,
                        af.Speechiness,
                        af.SpectralCentroid,
                        af.SpectralRolloff,
                        af.ZeroCrossingRate,
                        af.Genre,
                        af.GenreCluster,
                        af.Mood,
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
                    FROM Products p
                    LEFT JOIN AudioFeatures af ON p.ProductID = af.ProductID
                    WHERE p.AlbumTitle IS NOT NULL
                      AND p.AlbumTitle != 'Selected Electronic Works'
                      AND p.file_url IS NOT NULL
                    ORDER BY p.ProductID ASC
                """)
                candidate_rows = cursor.fetchall()

        products = []
        for row in candidate_rows:
            product_id = int(row['ProductID'])
            if library_only and product_id <= 0:
                continue

            if reprocess_incomplete:
                should_process = _is_incomplete_feature_row(row)
            else:
                should_process = row.get('FeatureProductID') is None

            if not should_process and reprocess_placeholders:
                should_process = _is_placeholder_library_feature_row(row)

            if should_process:
                products.append({
                    'ProductID': product_id,
                    'AlbumTitle': row['AlbumTitle'],
                    'file_url': row['file_url'],
                })

            if len(products) >= limit:
                break
        
        console.log(f"🎵 Starting librosa feature extraction for {len(products)} products...")
        console.log(f"   Save to database: {save_to_db}")
        console.log(f"   Library only: {library_only}")
        console.log(f"   Reprocess placeholders: {reprocess_placeholders}")

        # Concurrency control: Process 4 songs at a time to check for stuck tasks without blocking all
        sem = asyncio.Semaphore(4)

        # We need the current cache for classification context (Legacy param, but keeping for compatibility)
        current_cache = ml_service.audio_features_cache.copy()

        async def process_product(product):
            async with sem:
                product_id = product['ProductID']
                console.log(f"   Processing: {product['AlbumTitle']} (ID: {product_id})")

                try:
                    # Detect URL type and use appropriate extraction function
                    file_url = product['file_url']
                    features = None
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
                        if _is_placeholder_feature_payload(product_id, features):
                            console.log(f"   ⚠️ Refusing to save placeholder-like features for library song {product_id}")
                            return {
                                "product_id": product_id,
                                "album_title": product['AlbumTitle'],
                                "status": "failed",
                                "error": "Placeholder-like feature payload rejected"
                            }

                        # Classify genre cluster using ML model
                        # Determine genre: preserve existing; for new songs predict real genre via KNN.
                        existing_genre = ml_service.audio_features_cache.get(product_id, {}).get('genre')
                        if not existing_genre or existing_genre in (None, 'Unknown', 'Soundtrack') or existing_genre.lower().startswith('cluster'):
                            existing_genre = None  # will be replaced below

                        genre_cluster = ml_service.classify_genre_from_features(
                            features['tempo'],
                            features['energy'],
                            features['valence'],
                            features['danceability'],
                            features['acousticness'],
                            spectral_centroid=features.get('spectral_centroid', 1500.0),
                            spectral_rolloff=features.get('spectral_rolloff', 3000.0),
                            zero_crossing_rate=features.get('zero_crossing_rate', 0.05),
                            instrumentalness=features.get('instrumentalness', 0.5),
                            loudness=features.get('loudness', -60.0),
                            speechiness=features.get('speechiness', 0.1),
                            spectral_bandwidth=features.get('spectral_bandwidth', 1500.0),
                            rms_energy=features.get('rms_energy', 0.02),
                            onset_rate=features.get('onset_rate', 2.0),
                            harmonic_ratio=features.get('harmonic_ratio', 0.5),
                            percussive_ratio=features.get('percussive_ratio', 0.5),
                            duration=features.get('duration', 0),
                            key_signature=features.get('key_signature', 'C'),
                            time_signature=features.get('time_signature', '4/4'),
                            mfcc_mean=features.get('mfcc_mean'),
                            chroma_mean=features.get('chroma_mean'),
                            spectral_contrast_mean=features.get('spectral_contrast_mean'),
                            current_cache_size=len(current_cache),
                            current_cache_items=current_cache
                        )

                        # If no real genre was found, predict via KNN trained on iTunes genres.
                        # Only fall back to cluster label if KNN has insufficient training data.
                        if not existing_genre:
                            predicted_genre = ml_service.predict_real_genre(features)
                            if predicted_genre:
                                existing_genre = predicted_genre
                            else:
                                existing_genre = genre_cluster

                        # Update cache (via module)
                        # Genre is preserved as actual genre; genre_cluster stores ML cluster
                        ml_service.audio_features_cache[product_id] = {
                            'id': product_id,
                            'tempo': features['tempo'],
                            'energy': features['energy'],
                            'valence': features['valence'],
                            'danceability': features['danceability'],
                            'acousticness': features['acousticness'],
                            'genre': existing_genre,
                            'genre_cluster': genre_cluster,
                            'mood': features.get('mood', derive_mood(features['valence'], features['energy'], features['danceability'], features['acousticness'])),
                            'spectral_centroid': features.get('spectral_centroid', 1500.0),
                            'spectral_rolloff': features.get('spectral_rolloff', 3000.0),
                            'zero_crossing_rate': features.get('zero_crossing_rate', 0.05),
                            'instrumentalness': features.get('instrumentalness', 0.5),
                            'loudness': features.get('loudness', -60.0),
                            'speechiness': features.get('speechiness', 0.1),
                            'key_signature': features.get('key_signature'),
                            'time_signature': features.get('time_signature'),
                            'duration': features.get('duration'),
                            'spectral_bandwidth': features.get('spectral_bandwidth', 1500.0),
                            'spectral_contrast_mean': features.get('spectral_contrast_mean', []),
                            'rms_energy': features.get('rms_energy', 0.02),
                            'onset_rate': features.get('onset_rate', 2.0),
                            'harmonic_ratio': features.get('harmonic_ratio', 0.5),
                            'percussive_ratio': features.get('percussive_ratio', 0.5),
                            'mfcc_mean': features.get('mfcc_mean', []),
                            'chroma_mean': features.get('chroma_mean', [])
                        }

                        # Insert into database if requested
                        saved = False
                        if save_to_db:
                            try:
                                mfcc_json = json.dumps(features.get('mfcc_mean', [])) if features.get('mfcc_mean') else None
                                chroma_json = json.dumps(features.get('chroma_mean', [])) if features.get('chroma_mean') else None
                                spectral_contrast_json = json.dumps(features.get('spectral_contrast_mean', [])) if features.get('spectral_contrast_mean') else None

                                with get_db_connection() as conn:
                                    if conn:
                                        with conn.cursor() as cursor:
                                            mood = features.get('mood', derive_mood(features['valence'], features['energy'], features['danceability'], features['acousticness']))
                                            sql = """
                                                INSERT INTO AudioFeatures (
                                                    ProductID, Tempo, Energy, Danceability, Valence,
                                                    Acousticness, Instrumentalness, Loudness, Speechiness,
                                                    SpectralCentroid, SpectralRolloff, ZeroCrossingRate,
                                                    Genre, SpectralBandwidth, SpectralContrast, RmsEnergy,
                                                    OnsetRate, HarmonicRatio, PercussiveRatio,
                                                    GenreCluster, Mood, MfccMean, ChromaMean,
                                                    Key_Signature, TimeSignature, Duration
                                                ) VALUES (
                                                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                                                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
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
                                                    Genre = COALESCE(VALUES(Genre), Genre),
                                                    SpectralBandwidth = VALUES(SpectralBandwidth),
                                                    SpectralContrast = VALUES(SpectralContrast),
                                                    RmsEnergy = VALUES(RmsEnergy),
                                                    OnsetRate = VALUES(OnsetRate),
                                                    HarmonicRatio = VALUES(HarmonicRatio),
                                                    PercussiveRatio = VALUES(PercussiveRatio),
                                                    GenreCluster = VALUES(GenreCluster),
                                                    Mood = VALUES(Mood),
                                                    MfccMean = VALUES(MfccMean),
                                                    ChromaMean = VALUES(ChromaMean),
                                                    Key_Signature = VALUES(Key_Signature),
                                                    TimeSignature = VALUES(TimeSignature),
                                                    Duration = VALUES(Duration)
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
                                                existing_genre,
                                                features.get('spectral_bandwidth', 1500.0),
                                                spectral_contrast_json,
                                                features.get('rms_energy', 0.02),
                                                features.get('onset_rate', 2.0),
                                                features.get('harmonic_ratio', 0.5),
                                                features.get('percussive_ratio', 0.5),
                                                genre_cluster,
                                                mood,
                                                mfcc_json,
                                                chroma_json,
                                                features.get('key_signature', None),
                                                features.get('time_signature', None),
                                                features.get('duration', None)
                                            ))
                                            conn.commit()
                                            saved = True
                                            console.log(f"   ✅ Saved to database with genre_cluster: {genre_cluster}")
                            except Exception as db_e:
                                console.log(f"   ⚠️ DB Save failed for {product_id}: {db_e}")

                        return {
                            "product_id": product_id,
                            "album_title": product['AlbumTitle'],
                            "status": "success",
                            "saved_to_db": saved,
                            "tempo": features['tempo'],
                            "energy": features['energy']
                        }
                    else:
                        return {
                            "product_id": product_id,
                            "album_title": product['AlbumTitle'],
                            "status": "failed",
                            "error": "Extraction returned None"
                        }
                except Exception as e:
                    console.log(f"❌ Error processing {product['AlbumTitle']}: {e}")
                    return {
                        "product_id": product_id,
                        "album_title": product['AlbumTitle'],
                        "status": "error",
                        "error": str(e)
                    }

        # Run all tasks concurrently
        tasks = [process_product(p) for p in products]
        results_list = await asyncio.gather(*tasks)

        # Aggregation
        success_count = len([r for r in results_list if r['status'] == 'success'])
        error_count = len([r for r in results_list if r['status'] != 'success'])
        db_insert_count = len([r for r in results_list if r.get('saved_to_db', False)])

        console.log(f"🎉 Extraction complete: {success_count} success, {error_count} errors")

        # Retrain ML model on the newly saved data and update GenreCluster in DB
        if db_insert_count > 0:
            console.log("   🔄 Retraining ML model and updating GenreCluster...")
            await ml_service.startup_cache()
            console.log("   ✅ ML model retrained and GenreCluster updated")

        return {
            "status": "success",
            "total_processed": len(products),
            "successful": success_count,
            "failed": error_count,
            "saved_to_db": db_insert_count,
            "results": results_list
        }
    except Exception as e:
        console.log(f"❌ Error in extract_all_product_features: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/audio/backfill-mood")
async def backfill_mood():
    """
    Backfill NULL Mood values in AudioFeatures from existing Valence/Energy.
    This is a lightweight operation — no audio re-download needed.
    Derives mood using Russell's Circumplex Model (energetic/happy/calm/sad).
    """
    try:
        updated = 0
        with get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT ProductID, Valence, Energy, Danceability, Acousticness
                    FROM AudioFeatures
                    WHERE Mood IS NULL AND Valence IS NOT NULL AND Energy IS NOT NULL
                """)
                rows = cursor.fetchall()

                for row in rows:
                    mood = derive_mood(
                        float(row['Valence']),
                        float(row['Energy']),
                        float(row.get('Danceability', 0.5) or 0.5),
                        float(row.get('Acousticness', 0.5) or 0.5)
                    )
                    cursor.execute(
                        "UPDATE AudioFeatures SET Mood = %s WHERE ProductID = %s",
                        (mood, row['ProductID'])
                    )
                    updated += 1

                conn.commit()

        # Update in-memory cache too
        for pid, data in ml_service.audio_features_cache.items():
            if not data.get('mood'):
                data['mood'] = derive_mood(
                    float(data.get('valence', 0.5)),
                    float(data.get('energy', 0.5)),
                    float(data.get('danceability', 0.5)),
                    float(data.get('acousticness', 0.5))
                )

        console.log(f"✅ Backfilled Mood for {updated} rows")
        return {"status": "success", "updated": updated}
    except Exception as e:
        console.log(f"❌ Error in backfill_mood: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/audio/backfill-genre")
async def backfill_genre(force: bool = False):
    """
    Backfill Genre values in AudioFeatures by looking up the actual genre
    from the iTunes Lookup API.  Works for iTunes-imported songs (negative
    ProductIDs) whose absolute value is the iTunes trackId.

    Query params:
        force=true  — re-lookup ALL iTunes-imported songs, not just
                       NULL/Unknown ones.  Use this to fix songs that were
                       imported with the wrong RSS chart-category genre
                       (e.g. "Pop" instead of "Electronic").
    """
    import httpx

    try:
        # 1. Find rows that need genre
        with get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            with conn.cursor() as cursor:
                if force:
                    # Re-lookup every iTunes-imported song
                    cursor.execute("""
                        SELECT ProductID FROM AudioFeatures
                        WHERE ProductID < 0
                    """)
                else:
                    cursor.execute("""
                        SELECT ProductID FROM AudioFeatures
                        WHERE (Genre IS NULL OR Genre = '' OR Genre = 'Unknown')
                        AND ProductID < 0
                    """)
                rows = cursor.fetchall()

        if not rows:
            return {"status": "success", "updated": 0, "message": "No rows need genre backfill"}

        product_ids = [r['ProductID'] for r in rows]
        console.log(f"🎵 Backfilling genre for {len(product_ids)} songs via iTunes Lookup {'(force)' if force else ''}...")

        # 2. iTunes Lookup API accepts up to ~200 comma-separated IDs per request
        updated = 0
        batch_size = 150
        async with httpx.AsyncClient(timeout=30.0) as client:
            for i in range(0, len(product_ids), batch_size):
                batch = product_ids[i:i + batch_size]
                track_ids = [str(abs(pid)) for pid in batch]
                lookup_url = f"https://itunes.apple.com/lookup?id={','.join(track_ids)}"

                try:
                    resp = await client.get(lookup_url)
                    if resp.status_code != 200:
                        console.log(f"   ⚠️ iTunes lookup returned {resp.status_code}")
                        continue

                    data = resp.json()
                    # Build trackId → genre map
                    genre_map = {}
                    for result in data.get('results', []):
                        tid = result.get('trackId')
                        genre_name = result.get('primaryGenreName')
                        if tid and genre_name:
                            genre_map[-tid] = genre_name  # negative ProductID

                    # 3. Update DB
                    if genre_map:
                        with get_db_connection() as conn:
                            if conn:
                                with conn.cursor() as cursor:
                                    for pid, genre in genre_map.items():
                                        cursor.execute(
                                            "UPDATE AudioFeatures SET Genre = %s WHERE ProductID = %s",
                                            (genre, pid)
                                        )
                                        # Update cache too
                                        if pid in ml_service.audio_features_cache:
                                            ml_service.audio_features_cache[pid]['genre'] = genre
                                        updated += 1
                                    conn.commit()

                    console.log(f"   Batch {i // batch_size + 1}: looked up {len(track_ids)}, updated {len(genre_map)}")
                except Exception as batch_e:
                    console.log(f"   ⚠️ Batch error: {batch_e}")

        console.log(f"✅ Backfilled Genre for {updated} rows")
        return {"status": "success", "updated": updated}
    except Exception as e:
        console.log(f"❌ Error in backfill_genre: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/audio/backfill-genre-library")
async def backfill_genre_library(force: bool = False):
    """
    Predict Genre for library songs (positive ProductIDs) using a KNN
    classifier trained on iTunes songs that already have known genres.
    Requires /api/audio/backfill-genre to have run first so that iTunes
    songs provide labelled training data.
    Use ?force=true to re-predict ALL library songs, overwriting existing genres.
    """
    import json
    import numpy as np
    from sklearn.neighbors import KNeighborsClassifier

    def _build_vector(data: dict) -> list:
        """Build a 51D feature vector from a cache entry."""
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
        ]
        # key_signature → numeric index (0-11)
        vec.append(float(ml_service.KEY_NAME_TO_INDEX.get(
            data.get('key_signature', 'C'), 0)))
        # time_signature → beats-per-measure
        vec.append(float(ml_service.TIME_SIG_TO_BEATS.get(
            data.get('time_signature', '4/4'), 4)))
        # MFCC (13)
        mfcc = data.get('mfcc_mean', [0.0] * 13)
        if isinstance(mfcc, str):
            mfcc = json.loads(mfcc)
        vec.extend([float(x) for x in mfcc[:13]])
        vec.extend([0.0] * max(0, 13 - len(mfcc)))
        # Chroma (12)
        chroma = data.get('chroma_mean', [0.0] * 12)
        if isinstance(chroma, str):
            chroma = json.loads(chroma)
        vec.extend([float(x) for x in chroma[:12]])
        vec.extend([0.0] * max(0, 12 - len(chroma)))
        # Spectral Contrast (7)
        sc = data.get('spectral_contrast_mean', [0.0] * 7)
        if isinstance(sc, str):
            sc = json.loads(sc)
        vec.extend([float(x) for x in sc[:7]])
        vec.extend([0.0] * max(0, 7 - len(sc)))
        return vec

    try:
        # 1. Split cache: songs with known genre → training, library songs without → prediction
        train_vectors, train_labels = [], []
        predict_pids, predict_vectors = [], []

        for pid, data in ml_service.audio_features_cache.items():
            genre = data.get('genre') or 'Unknown'
            vec = _build_vector(data)
            if len(vec) != 51:
                continue
            is_library = pid > 0
            has_genre = genre not in ('Unknown', '')

            if is_library and (force or not has_genre):
                # Library song to predict (or re-predict when force=true)
                predict_pids.append(pid)
                predict_vectors.append(vec)
            elif has_genre:
                # Use as training data (iTunes songs + library songs not being re-predicted)
                train_vectors.append(vec)
                train_labels.append(genre)

        if not train_vectors:
            return {
                "status": "error",
                "message": "No songs with known genres to train from. "
                           "Run /api/audio/backfill-genre first to populate iTunes genres."
            }

        if not predict_pids:
            return {"status": "success", "updated": 0,
                    "message": "All library songs already have genres assigned"}

        console.log(f"🎵 Training genre classifier on {len(train_vectors)} songs "
                     f"({len(set(train_labels))} genres) to predict {len(predict_pids)} library songs")

        # 2. Scale with the existing scaler from the ML pipeline
        X_train = np.array(train_vectors)
        X_pred  = np.array(predict_vectors)
        if ml_service.feature_scaler is not None:
            X_train = ml_service.feature_scaler.transform(X_train)
            X_pred  = ml_service.feature_scaler.transform(X_pred)

        # 3. Train a KNN genre classifier
        k = min(5, len(train_vectors))
        clf = KNeighborsClassifier(n_neighbors=k)
        clf.fit(X_train, train_labels)

        predictions = clf.predict(X_pred)

        # 4. Update DB and cache
        updated = 0
        with get_db_connection() as conn:
            if not conn:
                raise HTTPException(status_code=503, detail="Database connection unavailable")
            with conn.cursor() as cursor:
                for pid, genre in zip(predict_pids, predictions):
                    cursor.execute(
                        "UPDATE AudioFeatures SET Genre = %s WHERE ProductID = %s",
                        (genre, pid)
                    )
                    if pid in ml_service.audio_features_cache:
                        ml_service.audio_features_cache[pid]['genre'] = genre
                    updated += 1
                conn.commit()

        console.log(f"✅ Predicted Genre for {updated} library songs via audio-feature KNN")
        return {
            "status": "success",
            "updated": updated,
            "training_samples": len(train_vectors),
            "unique_genres": len(set(train_labels)),
            "predictions": {str(pid): genre for pid, genre in zip(predict_pids, predictions)}
        }
    except Exception as e:
        console.log(f"❌ Error in backfill_genre_library: {e}")
        raise HTTPException(status_code=500, detail=str(e))
