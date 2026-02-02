# audio_service/routes/feature_processing.py
from fastapi import APIRouter, HTTPException
import asyncio
from typing import Optional, Dict

from utils import console
from config import executor
from database import get_db_connection
from feature_extraction import (
    extract_audio_features_from_preview,
    extract_features_for_product_async,
    classify_genre_from_features
)
import ml_service

router = APIRouter()

# ============================================
# FEATURE EXTRACTION ADMINISTRATION
# ============================================

# EXECUTION ORDER: Router endpoint.
@router.post("/api/audio/extract-all-features")
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
        
        # We need the current cache for classification context
        current_cache = ml_service.audio_features_cache.copy()
        
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
                    # Classify genre using K-Means clustering (needs cache context)
                    genre = classify_genre_from_features(
                        features['tempo'],
                        features['energy'],
                        features['valence'],
                        features['danceability'],
                        features['acousticness'],
                        current_cache_size=len(current_cache),
                        current_cache_items=current_cache
                    )
                    
                    # Update cache (via module)
                    ml_service.audio_features_cache[product_id] = {
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
                console.log(f"❌ Error processing {product['AlbumTitle']}: {e}")
                results.append({
                    "product_id": product_id,
                    "album_title": product['AlbumTitle'],
                    "status": "error",
                    "error": str(e)
                })
        
        console.log(f"🎉 Extraction complete: {success_count} success, {error_count} errors")
        
        return {
            "status": "success",
            "total_processed": len(products),
            "successful": success_count,
            "failed": error_count,
            "saved_to_db": db_insert_count,
            "results": results
        }
    except Exception as e:
        console.log(f"❌ Error in extract_all_product_features: {e}")
        raise HTTPException(status_code=500, detail=str(e))
