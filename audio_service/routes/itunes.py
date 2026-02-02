# audio_service/routes/itunes.py
from fastapi import APIRouter, HTTPException
import httpx
import asyncio
import os

from utils import console
from config import executor, ITUNES_API_BASE_URL
from database import get_db_connection
from feature_extraction import (
    extract_audio_features_from_preview,
    classify_genre_from_features
)
import ml_service

router = APIRouter()

# ============================================
# ITUNES INTEGRATION ENDPOINTS
# ============================================

# EXECUTION ORDER: Router endpoint.
@router.get("/api/itunes/search")
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

# EXECUTION ORDER: Router endpoint.
@router.delete("/api/itunes/clear-imported-songs")
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
        ml_service.cache_loaded = False
        # We should ideally clear the cache immediately to reflect changes
        # Re-running startup_cache or clearing just the deleted keys would be better
        # For now, just marking it not loaded might force a reload if logic elsewhere checks it?
        # But looking at get_cached_audio_features, it just checks cache_loaded then reads generic dict.
        # If we set cache_loaded=False, it returns error.
        # So we SHOULD reload.
        
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

# EXECUTION ORDER: Router endpoint.
@router.post("/api/itunes/import-to-database")
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
        
        loop = asyncio.get_running_loop()

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
                features = await loop.run_in_executor(
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
                    feature_results = cursor.fetchall()
                    
                    ml_service.audio_features_cache.clear()
                    for row in feature_results:
                        ml_service.audio_features_cache[row['ProductID']] = {
                            'id': row['ProductID'],
                            'tempo': row['Tempo'],
                            'energy': row['Energy'],
                            'valence': row['Valence'],
                            'danceability': row['Danceability'],
                            'acousticness': row['Acousticness'],
                            'genre': row['Genre'],
                            'spectral_centroid': row['SpectralCentroid'],
                            'spectral_rolloff': row['SpectralRolloff'],
                            'zero_crossing_rate': row['ZeroCrossingRate'],
                            'instrumentalness': row['Instrumentalness'],
                            'loudness': row['Loudness'],
                            'speechiness': row['Speechiness']
                        }
        
        ml_service.cache_loaded = True
        console.log(f"   ✅ Cache reloaded with {len(ml_service.audio_features_cache)} songs")
        
        return {
            "status": "success",
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": error_count,
            "total_in_db": len(ml_service.audio_features_cache),
            "sample_imported": imported_songs[:5]
        }
    except Exception as e:
          console.log(f"❌ Import error: {e}")
          raise HTTPException(status_code=500, detail=str(e))
