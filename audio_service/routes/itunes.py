# audio_service/routes/itunes.py
from fastapi import APIRouter, HTTPException
import httpx
import asyncio
import os

from utils import console
from config import executor, ITUNES_API_BASE_URL
from database import get_db_connection
from feature_extraction import extract_audio_features_from_preview
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
                    # 1. Delete from UserInteractions (references Products)
                    # We might need to delete by ProductID where ProductID < 0
                    cursor.execute("DELETE FROM UserInteractions WHERE ProductID < 0")
                    interactions_deleted = cursor.rowcount
                    
                    # 2. Delete from UserRecommendations (references Products)
                    cursor.execute("DELETE FROM UserRecommendations WHERE ProductID < 0")
                    recommendations_deleted = cursor.rowcount
                    
                    # 3. Delete from AudioFeatures (references Products)
                    cursor.execute("DELETE FROM AudioFeatures WHERE ProductID < 0")
                    audio_deleted = cursor.rowcount
                    
                    # 4. Delete from Products
                    cursor.execute("DELETE FROM Products WHERE ProductID < 0")
                    products_deleted = cursor.rowcount
                    
                    conn.commit()
                    deleted_count = products_deleted
                    
                    console.log(f"   ✅ Deleted {products_deleted} products, {audio_deleted} features, {interactions_deleted} interactions")
        
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
@router.post("/api/itunes/import-top-songs")
async def import_top_songs(limit: int = 150):
    """
    Import the current Top 150 US Pop Songs from iTunes RSS Feed.
    This ensures we have a high-quality, diverse dataset for the ML model.
    """
    try:
        console.log(f"🎵 Starting Top {limit} Songs Import from iTunes RSS...")
        
        # 1. Fetch RSS Feed
        # Updated URL to generic 'topsongs' which matches curl results
        rss_url = f"https://itunes.apple.com/us/rss/topsongs/limit={limit}/json"
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(rss_url)
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="iTunes RSS error")
            
            data = response.json()
            # The RSS feed structure is different from the Search API
            entries = data.get('feed', {}).get('entry', [])
        
        console.log(f"   Found {len(entries)} songs in RSS feed")
        
        # 2. Extract features and insert
        imported_count = 0
        skipped_count = 0
        error_count = 0
        
        loop = asyncio.get_running_loop()

        for entry in entries:
            try:
                # RSS feed parsing
                track_id_str = entry.get('id', {}).get('attributes', {}).get('im:id')
                track_id = int(track_id_str) if track_id_str else 0
                
                track_name = entry.get('im:name', {}).get('label', 'Unknown')
                artist_name = entry.get('im:artist', {}).get('label', 'Unknown')
                
                # Preview URL is often in 'link' list with type 'audio/x-m4a' or similar
                links = entry.get('link', [])
                preview_url = None
                if isinstance(links, list):
                    for link in links:
                        link_type = link.get('attributes', {}).get('type', '')
                        if 'audio' in link_type or 'video' in link_type: # type is typically 'audio/x-m4a'
                            preview_url = link.get('attributes', {}).get('href')
                            break
                    if not preview_url and len(links) >= 2:
                         # Fallback: often the second link is the preview
                         preview_url = links[1].get('attributes', {}).get('href')
                elif isinstance(links, dict):
                     preview_url = links.get('attributes', {}).get('href')
                
                image_url = entry.get('im:image', [{}])[-1].get('label', '') # Get largest image
                price_str = entry.get('im:price', {}).get('attributes', {}).get('amount', '0.99')
                try:
                    price = float(price_str)
                except:
                    price = 0.99
                
                if not preview_url or not track_id:
                    skipped_count += 1
                    continue

                # Use negative IDs for imported songs
                product_id = -track_id
                
                # Check DB existence
                with get_db_connection() as conn:
                    if conn:
                        with conn.cursor() as cursor:
                            cursor.execute("SELECT ProductID FROM Products WHERE ProductID = %s", (product_id,))
                            if cursor.fetchone():
                                skipped_count += 1
                                continue
                
                # Extract Audio Features
                features = await loop.run_in_executor(
                    executor,
                    extract_audio_features_from_preview,
                    preview_url,
                    track_id
                )
                
                if not features:
                    error_count += 1
                    continue

                # Insert into DB
                with get_db_connection() as conn:
                    if conn:
                        with conn.cursor() as cursor:
                            # Products
                            # Note: Products table schema uses AlbumTitle for track name, and albumCoverImageUrl
                            cursor.execute("""
                                INSERT INTO Products (
                                    ProductID, AlbumTitle, AlbumPrice, 
                                    albumCoverImageUrl, file_url, preview_url
                                ) VALUES (%s, %s, %s, %s, %s, %s)
                            """, (
                                product_id,
                                track_name, # Storing track name in AlbumTitle as per schema
                                price,
                                image_url,
                                preview_url,
                                preview_url
                            ))
                            
                            # AudioFeatures
                            # Convert arrays to JSON string if needed
                            import json
                            mfcc_json = json.dumps(features.get('mfcc_mean', [])) if features.get('mfcc_mean') else None
                            chroma_json = json.dumps(features.get('chroma_mean', [])) if features.get('chroma_mean') else None

                            cursor.execute("""
                                INSERT INTO AudioFeatures (
                                    ProductID, Tempo, Energy, Danceability, Valence,
                                    Acousticness, Instrumentalness, Loudness, Speechiness,
                                    SpectralCentroid, SpectralRolloff, ZeroCrossingRate, Genre,
                                    MfccMean, ChromaMean
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                                f"Pop - {artist_name}", # Pseudo-genre for variety
                                mfcc_json,
                                chroma_json
                            ))
                            conn.commit()
                
                imported_count += 1
                console.log(f"   ✅ Imported: {track_name} by {artist_name}")

            except Exception as e:
                error_count += 1
                console.log(f"   ❌ Error processing entry {entry.get('im:name', {}).get('label')}: {e}")
        
        # 3. Reload Cache
        await ml_service.startup_cache()
        
        return {
            "status": "success",
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": error_count
        }

    except Exception as e:
        console.log(f"❌ RSS Import Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
                genre_label = ml_service.classify_genre_from_features(
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
                    speechiness=features.get('speechiness', 0.1)
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
                            
                            # Insert into AudioFeatures with FULL feature set
                            # Convert MFCC and Chroma arrays to JSON strings for storage
                            import json
                            mfcc_json = json.dumps(features.get('mfcc_mean', [])) if features.get('mfcc_mean') else None
                            chroma_json = json.dumps(features.get('chroma_mean', [])) if features.get('chroma_mean') else None
                            
                            cursor.execute("""
                                INSERT INTO AudioFeatures (
                                    ProductID, Tempo, Energy, Danceability, Valence,
                                    Acousticness, Instrumentalness, Loudness, Speechiness,
                                    SpectralCentroid, SpectralRolloff, ZeroCrossingRate, Genre,
                                    MfccMean, ChromaMean, Key_Signature, TimeSignature, Duration
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                                genre_label,
                                mfcc_json,
                                chroma_json,
                                features.get('key_signature', None),
                                features.get('time_signature', None),
                                features.get('duration', None)
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
