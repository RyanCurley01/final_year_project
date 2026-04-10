# audio_service/routes/itunes.py
from fastapi import APIRouter, HTTPException
import httpx
import asyncio
import json
import os
from datetime import datetime

from utils import console
from config import (
    executor,
    ITUNES_API_BASE_URL,
    AUDIO_FEATURES_MAX_IMPORTED_ROWS,
    AUDIO_FEATURES_PRUNE_ENABLED,
    STOCK_UNAVAILABLE_RETENTION_DAYS,
)
from database import get_db_connection
from feature_extraction import extract_audio_features_from_preview, derive_mood
from ml_service import _parse_json_list
import ml_service

router = APIRouter()

# Interval (in seconds) between automatic top-chart refreshes.
# Default: 1 hour.  Override with env var TOPCHARTS_REFRESH_INTERVAL.
REFRESH_INTERVAL = int(os.getenv("TOPCHARTS_REFRESH_INTERVAL", 60 * 60))
STARTUP_REFRESH_DELAY = int(os.getenv("TOPCHARTS_STARTUP_REFRESH_DELAY", 5))

# Weekly catalog composition targets
TOPCHARTS_TARGET_COUNT = 150
ITUNES_SEARCH_TARGET_COUNT = 75
LIBRARY_TARGET_COUNT = 47
ITUNES_SEARCH_TERMS = [
    "Aphex Twin", "Squarepusher", "Boards of Canada",
    "Autechre", "Four Tet", "Brian Eno",
    "ambient electronic", "IDM", "electronica",
]

# Track the background task so we can cancel it on shutdown
_refresh_task: asyncio.Task | None = None


async def _lookup_real_genre(track_id: int, fallback: str = "Unknown") -> str:
    """
    Look up the authoritative primaryGenreName for a single track via the
    iTunes Lookup API.  The RSS category label is unreliable (it reflects
    the *chart* category, not the track's actual genre), so we always prefer
    the Lookup API result.

    Falls back to *fallback* on any error.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://itunes.apple.com/lookup?id={track_id}"
            )
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                if results:
                    genre = results[0].get("primaryGenreName")
                    if genre:
                        return genre
    except Exception:
        pass
    return fallback


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

                # Classify genre cluster using ML pipeline (same as import-to-database)
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
                    spectral_contrast_mean=features.get('spectral_contrast_mean')
                )
                # Look up the real genre from the iTunes Lookup API
                # (RSS category label reflects the chart, not the track's actual genre)
                rss_genre = entry.get('category', {}).get('attributes', {}).get('label', 'Unknown')
                actual_genre = await _lookup_real_genre(track_id, fallback=rss_genre)

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
                            spectral_contrast_json = json.dumps(features.get('spectral_contrast_mean', [])) if features.get('spectral_contrast_mean') else None

                            cursor.execute("""
                                INSERT INTO AudioFeatures (
                                    ProductID, Tempo, Energy, Danceability, Valence,
                                    Acousticness, Instrumentalness, Loudness, Speechiness,
                                    SpectralCentroid, SpectralRolloff, ZeroCrossingRate, Genre,
                                    GenreCluster, SpectralBandwidth, SpectralContrast,
                                    RmsEnergy, OnsetRate, HarmonicRatio, PercussiveRatio,
                                    MfccMean, ChromaMean, Key_Signature, TimeSignature, Duration
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                                actual_genre,
                                genre_label,
                                features.get('spectral_bandwidth', 1500.0),
                                spectral_contrast_json,
                                features.get('rms_energy', 0.02),
                                features.get('onset_rate', 2.0),
                                features.get('harmonic_ratio', 0.5),
                                features.get('percussive_ratio', 0.5),
                                mfcc_json,
                                chroma_json,
                                features.get('key_signature', None),
                                features.get('time_signature', None),
                                features.get('duration', None)
                            ))
                            conn.commit()
                
                imported_count += 1
                console.log(f"   ✅ Imported: {track_name} by {artist_name} (Genre: {actual_genre}, Cluster: {genre_label})")

            except Exception as e:
                error_count += 1
                console.log(f"   ❌ Error processing entry {entry.get('im:name', {}).get('label')}: {e}")
        
        prune_result = {"pruned": 0, "before": 0, "after": 0}
        if AUDIO_FEATURES_PRUNE_ENABLED:
            prune_result = _prune_imported_audiofeatures(AUDIO_FEATURES_MAX_IMPORTED_ROWS)
            if prune_result["pruned"] > 0:
                console.log(
                    f"   🧹 Pruned imported AudioFeatures: {prune_result['before']} -> {prune_result['after']} "
                    f"(removed {prune_result['pruned']})"
                )

        # 3. Reload Cache
        await ml_service.startup_cache()
        
        return {
            "status": "success",
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": error_count,
            "pruned_imported": prune_result["pruned"],
            "imported_before_prune": prune_result["before"],
            "imported_after_prune": prune_result["after"],
        }

    except Exception as e:
        console.log(f"❌ RSS Import Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/itunes/import-to-database")
async def import_itunes_songs_to_database(limit: int = 50, genre: str = "pop"):
    """
    Import iTunes songs into the database to increase dataset size for better similarity scores.
    
    Steps:
    1. Search iTunes for songs by the given genre or artist name
    2. Extract audio features from preview URLs
    3. Insert into Products table (with negative ProductIDs to avoid conflicts)
    4. Insert features into AudioFeatures table
    5. Reload cache
    
    Args:
        limit: Number of songs to import (max 75)
        genre: Search term — artist name (e.g. "Aphex Twin") or genre (e.g. "pop")
    
    Returns:
        Summary of imported songs
    """
    try:
        enforced_limit = max(1, min(int(limit or ITUNES_SEARCH_TARGET_COUNT), ITUNES_SEARCH_TARGET_COUNT))
        search_term = genre or "pop"
        console.log(f"🎵 Starting iTunes import: {enforced_limit} '{search_term}' songs...")
        
        # 1. Search iTunes API
        itunes_url = f"{ITUNES_API_BASE_URL}/search"
        params = {"term": search_term, "limit": enforced_limit, "media": "music", "entity": "song"}
        
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
                
                # Classify genre cluster using ML pipeline
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
                    spectral_contrast_mean=features.get('spectral_contrast_mean')
                )
                actual_genre = track.get('primaryGenreName', 'Unknown')
                
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
                            spectral_contrast_json = json.dumps(features.get('spectral_contrast_mean', [])) if features.get('spectral_contrast_mean') else None
                            
                            cursor.execute("""
                                INSERT INTO AudioFeatures (
                                    ProductID, Tempo, Energy, Danceability, Valence,
                                    Acousticness, Instrumentalness, Loudness, Speechiness,
                                    SpectralCentroid, SpectralRolloff, ZeroCrossingRate, Genre,
                                    GenreCluster, SpectralBandwidth, SpectralContrast,
                                    RmsEnergy, OnsetRate, HarmonicRatio, PercussiveRatio,
                                    Mood, MfccMean, ChromaMean, Key_Signature, TimeSignature, Duration
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                                actual_genre,
                                genre_label,
                                features.get('spectral_bandwidth', 1500.0),
                                spectral_contrast_json,
                                features.get('rms_energy', 0.02),
                                features.get('onset_rate', 2.0),
                                features.get('harmonic_ratio', 0.5),
                                features.get('percussive_ratio', 0.5),
                                features.get('mood', derive_mood(features['valence'], features['energy'])),
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
                    "genre": actual_genre,
                    "genre_cluster": genre_label,
                    "tempo": features['tempo'],
                    "energy": features['energy']
                })
                
                console.log(f"   ✅ Imported: {track.get('trackName')} by {track.get('artistName')} (Genre: {actual_genre}, Cluster: {genre_label})")
                
            except Exception as e:
                error_count += 1
                console.log(f"   ❌ Error importing track {track_id}: {e}")
        
        prune_result = {"pruned": 0, "before": 0, "after": 0}
        if AUDIO_FEATURES_PRUNE_ENABLED:
            prune_result = _prune_imported_audiofeatures(AUDIO_FEATURES_MAX_IMPORTED_ROWS)
            if prune_result["pruned"] > 0:
                console.log(
                    f"   🧹 Pruned imported AudioFeatures: {prune_result['before']} -> {prune_result['after']} "
                    f"(removed {prune_result['pruned']})"
                )

        # 3. Reload cache to include new songs
        console.log("   🔄 Reloading cache with new songs...")
        
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    sql = """
                        SELECT 
                            ProductID, Tempo, Energy, Valence, Danceability,
                            Acousticness, Genre, Mood, SpectralCentroid, SpectralRolloff,
                            ZeroCrossingRate, Instrumentalness, Loudness, Speechiness,
                            Key_Signature, TimeSignature, Duration, MfccMean, ChromaMean
                        FROM AudioFeatures
                        WHERE Tempo IS NOT NULL AND Energy IS NOT NULL
                    """
                    cursor.execute(sql)
                    feature_results = cursor.fetchall()
                    
                    ml_service.audio_features_cache.clear()
                    for row in feature_results:
                        mfcc_list = _parse_json_list(row.get('MfccMean'), 13)
                        chroma_list = _parse_json_list(row.get('ChromaMean'), 12)
                        mood_val = row.get('Mood') or derive_mood(
                            float(row.get('Valence', 0.5)),
                            float(row.get('Energy', 0.5))
                        )
                        ml_service.audio_features_cache[row['ProductID']] = {
                            'id': row['ProductID'],
                            'tempo': row['Tempo'],
                            'energy': row['Energy'],
                            'valence': row['Valence'],
                            'danceability': row['Danceability'],
                            'acousticness': row['Acousticness'],
                            'genre': row['Genre'],
                            'mood': mood_val,
                            'spectral_centroid': row['SpectralCentroid'],
                            'spectral_rolloff': row['SpectralRolloff'],
                            'zero_crossing_rate': row['ZeroCrossingRate'],
                            'instrumentalness': row['Instrumentalness'],
                            'loudness': row['Loudness'],
                            'speechiness': row['Speechiness'],
                            'key_signature': row.get('Key_Signature'),
                            'time_signature': row.get('TimeSignature'),
                            'duration': row.get('Duration', 0),
                            'mfcc_mean': mfcc_list,
                            'chroma_mean': chroma_list
                        }
        
        ml_service.cache_loaded = True
        console.log(f"   ✅ Cache reloaded with {len(ml_service.audio_features_cache)} songs")
        
        return {
            "status": "success",
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": error_count,
            "total_in_db": len(ml_service.audio_features_cache),
            "pruned_imported": prune_result["pruned"],
            "imported_before_prune": prune_result["before"],
            "imported_after_prune": prune_result["after"],
            "sample_imported": imported_songs[:5]
        }
    except Exception as e:
          console.log(f"❌ Import error: {e}")
          raise HTTPException(status_code=500, detail=str(e))


# ============================================
# LIVE TOP-CHARTS REFRESH (DIFFERENTIAL SYNC)
# ============================================

def _mark_products_unavailable(cursor, product_ids: list[int]):
    """
    Mark a list of product IDs as unavailable in Stock (IsAvailable = 0)
    instead of deleting them.  This preserves history so the store shows
    which songs were previously available but have since been removed.
    The caller is responsible for committing the transaction.
    """
    if not product_ids:
        return

    for pid in product_ids:
        _upsert_stock(cursor, int(pid), 0)


def _safe_execute(cursor, sql: str, params=None):
    """Execute a statement, silently skipping expected idempotency errors."""
    try:
        cursor.execute(sql, params)
    except Exception as e:
        msg = str(e)
        # 1146: table doesn't exist
        # 1060: duplicate column name
        # 1061: duplicate key name
        if "1146" in msg or "1060" in msg or "1061" in msg:
            return
        raise


def _ensure_stock_schema(cursor):
    """Best-effort schema hardening for stock retention behavior."""
    _safe_execute(cursor, "ALTER TABLE Stock ADD COLUMN IsAvailable TINYINT(1) NOT NULL DEFAULT 1")
    _safe_execute(cursor, "ALTER TABLE Stock ADD COLUMN UnavailableSince DATETIME NULL")
    _safe_execute(cursor, "ALTER TABLE Stock ADD COLUMN AvailableSince DATETIME NULL")


def _purge_stale_unavailable_imports(cursor, retention_days: int) -> int:
    """
    Delete imported songs (negative ProductIDs) that have stayed unavailable
    for at least retention_days.
    """
    keep_days = max(1, int(retention_days))
    cursor.execute(
        """
        SELECT DISTINCT ProductID
        FROM Stock
        WHERE ProductID < 0
          AND COALESCE(IsAvailable, 1) = 0
          AND UnavailableSince IS NOT NULL
          AND UnavailableSince <= DATE_SUB(NOW(), INTERVAL %s DAY)
        """,
        (keep_days,)
    )
    stale_ids = [int(r["ProductID"]) for r in cursor.fetchall()]
    if not stale_ids:
        return 0

    fmt = ",".join(["%s"] * len(stale_ids))
    _safe_execute(cursor, f"DELETE FROM UserInteractions WHERE ProductID IN ({fmt})", stale_ids)
    _safe_execute(cursor, f"DELETE FROM UserRecommendations WHERE ProductID IN ({fmt})", stale_ids)
    _safe_execute(cursor, f"DELETE FROM Wishlist WHERE ProductID IN ({fmt})", stale_ids)
    _safe_execute(cursor, f"DELETE FROM Sold_Products WHERE ProductID IN ({fmt})", stale_ids)
    _safe_execute(cursor, f"DELETE FROM Purchased_Products WHERE ProductID IN ({fmt})", stale_ids)
    _safe_execute(cursor, f"DELETE FROM CustomerSummary WHERE ProductID IN ({fmt})", stale_ids)
    _safe_execute(cursor, f"DELETE FROM Payments WHERE ProductID IN ({fmt})", stale_ids)
    _safe_execute(cursor, f"DELETE FROM Order_Items WHERE ProductID IN ({fmt})", stale_ids)
    _safe_execute(cursor, f"DELETE FROM Stock WHERE ProductID IN ({fmt})", stale_ids)
    _safe_execute(cursor, f"DELETE FROM AudioFeatures WHERE ProductID IN ({fmt})", stale_ids)
    _safe_execute(cursor, f"DELETE FROM Products WHERE ProductID IN ({fmt})", stale_ids)
    return len(stale_ids)


def _prune_imported_audiofeatures(max_imported_rows: int) -> dict:
    """
    Keep imported iTunes songs (negative ProductIDs) bounded by deleting
    low-priority rows first: unavailable songs first, then oldest updated rows.
    """
    # Cap comes from config so composition changes take effect without code edits.
    target_cap = int(max_imported_rows)

    if target_cap <= 0:
        return {"pruned": 0, "before": 0, "after": 0}

    with get_db_connection() as conn:
        if not conn:
            return {"pruned": 0, "before": 0, "after": 0}

        with conn.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS c FROM AudioFeatures WHERE ProductID < 0")
            before = int((cursor.fetchone() or {}).get("c") or 0)
            if before <= target_cap:
                return {"pruned": 0, "before": before, "after": before}

            # Prune in rounds and re-check count each round to guarantee we hit cap.
            while True:
                cursor.execute("SELECT COUNT(*) AS c FROM AudioFeatures WHERE ProductID < 0")
                current = int((cursor.fetchone() or {}).get("c") or 0)
                overflow = max(0, current - target_cap)
                if overflow <= 0:
                    break

                cursor.execute(
                    """
                    SELECT af.ProductID
                    FROM AudioFeatures af
                    LEFT JOIN Stock s ON s.ProductID = af.ProductID
                    WHERE af.ProductID < 0
                    ORDER BY COALESCE(s.IsAvailable, 0) ASC, af.UpdatedAt ASC, af.FeatureID ASC
                    LIMIT %s
                    """,
                    (overflow,)
                )
                to_prune = [int(r["ProductID"]) for r in cursor.fetchall()]
                if not to_prune:
                    break

                fmt = ",".join(["%s"] * len(to_prune))

                # Remove dependent rows first to satisfy FK constraints.
                _safe_execute(cursor, f"DELETE FROM UserInteractions WHERE ProductID IN ({fmt})", to_prune)
                _safe_execute(cursor, f"DELETE FROM UserRecommendations WHERE ProductID IN ({fmt})", to_prune)
                _safe_execute(cursor, f"DELETE FROM Wishlist WHERE ProductID IN ({fmt})", to_prune)
                _safe_execute(cursor, f"DELETE FROM Sold_Products WHERE ProductID IN ({fmt})", to_prune)
                _safe_execute(cursor, f"DELETE FROM Purchased_Products WHERE ProductID IN ({fmt})", to_prune)
                _safe_execute(cursor, f"DELETE FROM CustomerSummary WHERE ProductID IN ({fmt})", to_prune)
                _safe_execute(cursor, f"DELETE FROM Payments WHERE ProductID IN ({fmt})", to_prune)
                _safe_execute(cursor, f"DELETE FROM Order_Items WHERE ProductID IN ({fmt})", to_prune)
                _safe_execute(cursor, f"DELETE FROM Stock WHERE ProductID IN ({fmt})", to_prune)
                _safe_execute(cursor, f"DELETE FROM AudioFeatures WHERE ProductID IN ({fmt})", to_prune)
                _safe_execute(cursor, f"DELETE FROM Products WHERE ProductID IN ({fmt})", to_prune)
                conn.commit()

            cursor.execute("SELECT COUNT(*) AS c FROM AudioFeatures WHERE ProductID < 0")
            after = int((cursor.fetchone() or {}).get("c") or 0)
            return {"pruned": max(0, before - after), "before": before, "after": after}


def _upsert_stock(cursor, product_id: int, is_available: int):
    """
    Insert or update a Stock row for a product.
    Works whether or not the UNIQUE index on ProductID exists:
      - With the index: ON DUPLICATE KEY UPDATE fires on the unique ProductID.
      - Without the index: falls back to check-then-insert/update.
    Silently skips FK constraint errors (product may not exist yet).
    """
    available_flag = 1 if int(is_available) == 1 else 0
    try:
        if available_flag == 1:
            cursor.execute(
                "INSERT INTO Stock (IsAvailable, ProductID, UnavailableSince, AvailableSince) VALUES (1, %s, NULL, NOW()) "
                "ON DUPLICATE KEY UPDATE IsAvailable = 1, UnavailableSince = NULL, "
                "AvailableSince = CASE WHEN IsAvailable = 0 THEN NOW() ELSE AvailableSince END",
                (product_id,)
            )
        else:
            cursor.execute(
                "INSERT INTO Stock (IsAvailable, ProductID, UnavailableSince, AvailableSince) VALUES (0, %s, NOW(), NULL) "
                "ON DUPLICATE KEY UPDATE IsAvailable = 0, UnavailableSince = COALESCE(UnavailableSince, NOW()), AvailableSince = NULL",
                (product_id,)
            )
        return
    except Exception as e:
        if "1452" in str(e):
            return  # FK constraint — product doesn't exist yet, skip
        pass

    # Fallback for schemas without unique key or UnavailableSince support.
    cursor.execute("SELECT StockID FROM Stock WHERE ProductID = %s ORDER BY StockID DESC LIMIT 1", (product_id,))
    row = cursor.fetchone()
    if row:
        sid = int(row["StockID"])
        if available_flag == 1:
            try:
                cursor.execute(
                    "UPDATE Stock SET IsAvailable = 1, UnavailableSince = NULL, "
                    "AvailableSince = CASE WHEN IsAvailable = 0 THEN NOW() ELSE AvailableSince END "
                    "WHERE StockID = %s",
                    (sid,)
                )
            except Exception:
                cursor.execute("UPDATE Stock SET IsAvailable = 1 WHERE StockID = %s", (sid,))
        else:
            try:
                cursor.execute(
                    "UPDATE Stock SET IsAvailable = 0, UnavailableSince = COALESCE(UnavailableSince, NOW()), AvailableSince = NULL WHERE StockID = %s",
                    (sid,)
                )
            except Exception:
                cursor.execute("UPDATE Stock SET IsAvailable = 0 WHERE StockID = %s", (sid,))
    else:
        if available_flag == 1:
            try:
                cursor.execute(
                    "INSERT INTO Stock (IsAvailable, ProductID, UnavailableSince, AvailableSince) VALUES (1, %s, NULL, NOW())",
                    (product_id,)
                )
            except Exception as e:
                if "1452" in str(e):
                    return
                cursor.execute("INSERT INTO Stock (IsAvailable, ProductID) VALUES (1, %s)", (product_id,))
        else:
            try:
                cursor.execute("INSERT INTO Stock (IsAvailable, ProductID, UnavailableSince) VALUES (0, %s, NOW())", (product_id,))
            except Exception as e:
                if "1452" in str(e):
                    return
                cursor.execute("INSERT INTO Stock (IsAvailable, ProductID) VALUES (0, %s)", (product_id,))


async def _import_single_song_rss(entry, loop) -> dict | None:
    """
    Parse an RSS feed entry, extract audio features and return a dict ready for
    DB insertion, or None on failure.
    """
    track_id_str = entry.get('id', {}).get('attributes', {}).get('im:id')
    track_id = int(track_id_str) if track_id_str else 0

    track_name = entry.get('im:name', {}).get('label', 'Unknown')
    artist_name = entry.get('im:artist', {}).get('label', 'Unknown')

    links = entry.get('link', [])
    preview_url = None
    if isinstance(links, list):
        for link in links:
            link_type = link.get('attributes', {}).get('type', '')
            if 'audio' in link_type or 'video' in link_type:
                preview_url = link.get('attributes', {}).get('href')
                break
        if not preview_url and len(links) >= 2:
            preview_url = links[1].get('attributes', {}).get('href')
    elif isinstance(links, dict):
        preview_url = links.get('attributes', {}).get('href')

    image_url = entry.get('im:image', [{}])[-1].get('label', '')
    price_str = entry.get('im:price', {}).get('attributes', {}).get('amount', '0.99')
    try:
        price = float(price_str)
    except Exception:
        price = 0.99

    if not preview_url or not track_id:
        return None

    product_id = -track_id

    features = await loop.run_in_executor(
        executor, extract_audio_features_from_preview, preview_url, track_id
    )
    if not features:
        return None

    genre_label = ml_service.classify_genre_from_features(
        features['tempo'], features['energy'], features['valence'],
        features['danceability'], features['acousticness'],
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
        spectral_contrast_mean=features.get('spectral_contrast_mean')
    )
    # Look up the real genre via iTunes Lookup API (RSS category is unreliable)
    rss_genre = entry.get('category', {}).get('attributes', {}).get('label', 'Unknown')
    actual_genre = await _lookup_real_genre(track_id, fallback=rss_genre)

    mfcc_json = json.dumps(features.get('mfcc_mean', [])) if features.get('mfcc_mean') else None
    chroma_json = json.dumps(features.get('chroma_mean', [])) if features.get('chroma_mean') else None
    spectral_contrast_json = json.dumps(features.get('spectral_contrast_mean', [])) if features.get('spectral_contrast_mean') else None

    return {
        "product_id": product_id,
        "track_name": track_name,
        "artist_name": artist_name,
        "price": price,
        "image_url": image_url,
        "preview_url": preview_url,
        "features": features,
        "genre_label": genre_label,
        "actual_genre": actual_genre,
        "mfcc_json": mfcc_json,
        "chroma_json": chroma_json,
        "spectral_contrast_json": spectral_contrast_json,
    }


async def _import_single_song_search(track, loop) -> dict | None:
    """
    Parse an iTunes Search API result, extract audio features and return a dict
    ready for DB insertion, or None on failure.
    """
    track_id = track.get('trackId')
    preview_url = track.get('previewUrl')
    if not preview_url or not track_id:
        return None

    product_id = -track_id

    features = await loop.run_in_executor(
        executor, extract_audio_features_from_preview, preview_url, track_id
    )
    if not features:
        return None

    genre_label = ml_service.classify_genre_from_features(
        features['tempo'], features['energy'], features['valence'],
        features['danceability'], features['acousticness'],
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
        spectral_contrast_mean=features.get('spectral_contrast_mean')
    )
    actual_genre = track.get('primaryGenreName', 'Unknown')

    mfcc_json = json.dumps(features.get('mfcc_mean', [])) if features.get('mfcc_mean') else None
    chroma_json = json.dumps(features.get('chroma_mean', [])) if features.get('chroma_mean') else None
    spectral_contrast_json = json.dumps(features.get('spectral_contrast_mean', [])) if features.get('spectral_contrast_mean') else None

    return {
        "product_id": product_id,
        "track_name": track.get('trackName', 'Unknown'),
        "artist_name": track.get('artistName', 'Unknown'),
        "price": track.get('trackPrice', 0.99),
        "image_url": track.get('artworkUrl100', ''),
        "preview_url": preview_url,
        "features": features,
        "genre_label": genre_label,
        "actual_genre": actual_genre,
        "mfcc_json": mfcc_json,
        "chroma_json": chroma_json,
        "spectral_contrast_json": spectral_contrast_json,
    }


def _insert_song_row(cursor, song: dict):
    """Insert a parsed song dict into Products + AudioFeatures."""
    f = song["features"]
    cursor.execute("""
        INSERT INTO Products (ProductID, AlbumTitle, AlbumPrice,
                              albumCoverImageUrl, file_url, preview_url)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (
        song["product_id"], song["track_name"], song["price"],
        song["image_url"], song["preview_url"], song["preview_url"]
    ))
    cursor.execute("""
        INSERT INTO AudioFeatures (
            ProductID, Tempo, Energy, Danceability, Valence,
            Acousticness, Instrumentalness, Loudness, Speechiness,
            SpectralCentroid, SpectralRolloff, ZeroCrossingRate, Genre,
            GenreCluster, SpectralBandwidth, SpectralContrast,
            RmsEnergy, OnsetRate, HarmonicRatio, PercussiveRatio,
            Mood, MfccMean, ChromaMean, Key_Signature, TimeSignature, Duration
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        song["product_id"],
        f['tempo'], f['energy'], f['danceability'], f['valence'],
        f['acousticness'],
        f.get('instrumentalness', 0.5), f.get('loudness', -60.0),
        f.get('speechiness', 0.1), f.get('spectral_centroid', 1500.0),
        f.get('spectral_rolloff', 3000.0), f.get('zero_crossing_rate', 0.05),
        song.get("actual_genre", "Unknown"),
        song["genre_label"],
        f.get('spectral_bandwidth', 1500.0),
        song.get("spectral_contrast_json"),
        f.get('rms_energy', 0.02), f.get('onset_rate', 2.0),
        f.get('harmonic_ratio', 0.5), f.get('percussive_ratio', 0.5),
        f.get('mood', derive_mood(f['valence'], f['energy'])),
        song["mfcc_json"], song["chroma_json"],
        f.get('key_signature'), f.get('time_signature'), f.get('duration')
    ))
    # Also ensure a Stock row exists (available since we just imported it)
    _upsert_stock(cursor, int(song["product_id"]), 1)


async def _fetch_current_chart_ids() -> tuple[dict[int, dict], dict[int, dict]]:
    """
    Fetch the current iTunes Top songs (RSS) and a capped set of iTunes search songs,
    returning two dicts mapping negative product_id → entry/track
    for RSS and Search results respectively.

    Sources:
      - RSS: Top 150 charting songs (topsongs feed).
      - Search: Top 75 most popular current songs via the iTunes "topSongs" lookup
        plus artist-specific searches (Aphex Twin, Squarepusher, Boards of Canada),
        followed by genre fallback terms if still under target.
    """
    rss_entries: dict[int, dict] = {}
    search_tracks: dict[int, dict] = {}

    async with httpx.AsyncClient(timeout=30.0) as client:
        # --- Top 150 charting songs via Electronic genre RSS ---
        electronic_rss_feeds = [
            f"https://itunes.apple.com/us/rss/topsongs/limit=200/genre=7/json",   # Electronic
            f"https://itunes.apple.com/us/rss/topsongs/limit=200/genre=17/json",  # Dance
        ]
        for rss_url in electronic_rss_feeds:
            if len(rss_entries) >= TOPCHARTS_TARGET_COUNT:
                break
            try:
                resp = await client.get(rss_url)
                if resp.status_code == 200:
                    entries = resp.json().get('feed', {}).get('entry', [])
                    for entry in entries:
                        tid_str = entry.get('id', {}).get('attributes', {}).get('im:id')
                        if tid_str:
                            pid = -int(tid_str)
                            if pid not in rss_entries:
                                rss_entries[pid] = entry
                                if len(rss_entries) >= TOPCHARTS_TARGET_COUNT:
                                    break
            except Exception as e:
                console.log(f"   ⚠️ Electronic RSS fetch failed: {e}")

        # --- Top 75 popular songs via additional RSS genre feeds + artist/genre search ---
        # Dynamic target: if RSS returned fewer than expected, let search fill the gap
        search_target = max(
            ITUNES_SEARCH_TARGET_COUNT,
            AUDIO_FEATURES_MAX_IMPORTED_ROWS - len(rss_entries),
        )

        # Skip genre RSS sub-feeds (iTunes sub-genre IDs are unreliable).
        # Fill entirely from artist search terms for accurate electronic content.
        rss_genre_feeds = []
        genre_rss_budget = 0
        for feed_url in rss_genre_feeds:
            if len(search_tracks) >= genre_rss_budget:
                break
            try:
                resp = await client.get(feed_url)
                if resp.status_code == 200:
                    feed_entries = resp.json().get('feed', {}).get('entry', [])
                    for entry in feed_entries:
                        tid_str = entry.get('id', {}).get('attributes', {}).get('im:id')
                        if not tid_str:
                            continue
                        pid = -int(tid_str)
                        if pid not in rss_entries and pid not in search_tracks:
                            # Convert RSS entry to search-like dict for _import_single_song_search compat
                            links = entry.get('link', [])
                            preview_url = None
                            if isinstance(links, list):
                                for link in links:
                                    link_type = link.get('attributes', {}).get('type', '')
                                    if 'audio' in link_type or 'video' in link_type:
                                        preview_url = link.get('attributes', {}).get('href')
                                        break
                                if not preview_url and len(links) >= 2:
                                    preview_url = links[1].get('attributes', {}).get('href')
                            if preview_url:
                                # Look up real genre via iTunes Lookup API
                                real_genre = await _lookup_real_genre(
                                    int(tid_str),
                                    fallback=entry.get('category', {}).get('attributes', {}).get('label', 'Unknown')
                                )
                                search_tracks[pid] = {
                                    'trackId': int(tid_str),
                                    'trackName': entry.get('im:name', {}).get('label', 'Unknown'),
                                    'artistName': entry.get('im:artist', {}).get('label', 'Unknown'),
                                    'previewUrl': preview_url,
                                    'artworkUrl100': entry.get('im:image', [{}])[-1].get('label', ''),
                                    'trackPrice': float(entry.get('im:price', {}).get('attributes', {}).get('amount', '0.99') or '0.99'),
                                    'primaryGenreName': real_genre,
                                }
                                if len(search_tracks) >= genre_rss_budget:
                                    break
            except Exception as e:
                console.log(f"   ⚠️ Genre RSS feed failed: {e}")

        # Then fill remaining slots with artist-specific and genre search terms
        for term in ITUNES_SEARCH_TERMS:
            if len(search_tracks) >= search_target:
                break
            try:
                params = {"term": term, "limit": 200, "media": "music", "entity": "song"}
                resp = await client.get(f"{ITUNES_API_BASE_URL}/search", params=params)
                if resp.status_code == 200:
                    for track in resp.json().get('results', []):
                        tid = track.get('trackId')
                        pid = -int(tid) if tid else None
                        if (
                            pid
                            and track.get('previewUrl')
                            and pid not in rss_entries
                            and pid not in search_tracks
                        ):
                            search_tracks[pid] = track
                            if len(search_tracks) >= search_target:
                                break
            except Exception as e:
                console.log(f"   ⚠️ Search fetch failed for term '{term}': {e}")

    return rss_entries, search_tracks


@router.post("/api/itunes/refresh-topcharts")
async def refresh_topcharts():
    """
    Live differential sync of the entire store catalogue (every 1 hour).

        iTunes songs (ProductID < 0):
            1. Fetch the current Top 150 chart songs (RSS) + top 75 charting/artist songs
               (genre RSS feeds for Pop/Hip-Hop/Rock/R&B, Aphex Twin, Squarepusher,
               Boards of Canada, and genre fallback terms).
            2. Determine a strict replacement budget for this cycle.
            3. Import up to that many new chart entries.
            4. Mark the same number of dropped songs unavailable in Stock (kept for history).
            5. Existing chart songs → ensure Stock is available.

        Library songs (ProductID > 0):
            6. Validate the fixed 47-song library set has a reachable file_url (S3) and AudioFeatures.
            7. Mark unavailable if the file is gone; mark available if it came back.

    Finally reload the ML cache so recommendations reflect the latest state.
    """
    try:
        console.log("🔄 Starting live store refresh (iTunes + library)...")
        start_ts = datetime.utcnow()

        # Ensure stock schema has columns needed for retention handling.
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    _ensure_stock_schema(cursor)
                    conn.commit()

        # ── ITUNES SONGS ──────────────────────────────────────────────
        # 1. Fetch live chart IDs from iTunes
        rss_entries, search_tracks = await _fetch_current_chart_ids()
        live_ids: set[int] = set(rss_entries.keys()) | set(search_tracks.keys())
        console.log(f"   📡 Live charts: {len(rss_entries)} top-chart + {len(search_tracks)} pop = {len(live_ids)} unique songs")

        # 2. Get existing iTunes product IDs from DB and track which imported rows
        # are currently available in stock. Only currently available songs can be
        # removed as replacements in this cycle.
        existing_itunes_ids: set[int] = set()
        available_itunes_ids: set[int] = set()
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT p.ProductID, MAX(COALESCE(s.IsAvailable, 1)) AS IsAvailable
                        FROM Products p
                        LEFT JOIN Stock s ON s.ProductID = p.ProductID
                        WHERE p.ProductID < 0
                        GROUP BY p.ProductID
                        """
                    )
                    imported_rows = cursor.fetchall()
                    existing_itunes_ids = {int(row['ProductID']) for row in imported_rows}
                    available_itunes_ids = {
                        int(row['ProductID'])
                        for row in imported_rows
                        if int(row.get('IsAvailable') or 0) == 1
                    }
        console.log(f"   💾 Existing in DB: {len(existing_itunes_ids)} iTunes songs")

        # 3. Compute diff and pair removals/additions so each cycle performs
        # strict one-for-one replacement for the rotating imported pool.
        ids_to_add_all = sorted(live_ids - existing_itunes_ids)
        ids_dropped_all = sorted(available_itunes_ids - live_ids)
        ids_kept = existing_itunes_ids & live_ids   # still on charts or returning from retention

        console.log(f"   📊 Diff: {len(ids_dropped_all)} replaceable drops, {len(ids_to_add_all)} new, {len(ids_kept)} kept")

        # 4. Determine the exact number of replacement pairs allowed this cycle.
        # Cold-start: when no iTunes songs exist yet, allow a full initial import
        # up to max_imports_per_cycle instead of requiring one-for-one replacement.
        max_imports_per_cycle = int(os.getenv("MAX_IMPORTS_PER_CYCLE", str(AUDIO_FEATURES_MAX_IMPORTED_ROWS)))
        if not existing_itunes_ids:
            replacement_budget = min(len(ids_to_add_all), max_imports_per_cycle)
            console.log(f"   🆕 Cold start detected — seeding up to {replacement_budget} songs")
        else:
            replacement_budget = min(len(ids_dropped_all), len(ids_to_add_all), max_imports_per_cycle)
        ids_to_add_this_cycle = ids_to_add_all[:replacement_budget]
        ids_to_remove_candidates = ids_dropped_all[:replacement_budget]
        deferred_additions_count = max(0, len(ids_to_add_all) - replacement_budget)
        deferred_removals_count = max(0, len(ids_dropped_all) - replacement_budget)

        if replacement_budget == 0:
            console.log("   ℹ️ No replacement pairs scheduled this cycle")
        else:
            console.log(
                f"   🔁 Replacement budget: {replacement_budget} "
                f"(deferred adds: {deferred_additions_count}, deferred removals: {deferred_removals_count})"
            )

        # 5. Re-mark kept songs as available (they're still on the charts)
        # and revive retained songs that re-enter the live set.
        if ids_kept:
            with get_db_connection() as conn:
                if conn:
                    with conn.cursor() as cursor:
                        for pid in ids_kept:
                            _upsert_stock(cursor, int(pid), 1)
                        conn.commit()

        # 6. Import only the matched replacement additions for this cycle.
        marked_unavailable_count = 0
        imported_count = 0
        error_count = 0
        loop = asyncio.get_running_loop()

        for pid in ids_to_add_this_cycle:
            try:
                song: dict | None = None
                if pid in rss_entries:
                    song = await _import_single_song_rss(rss_entries[pid], loop)
                elif pid in search_tracks:
                    song = await _import_single_song_search(search_tracks[pid], loop)

                if not song:
                    error_count += 1
                    continue

                with get_db_connection() as conn:
                    if conn:
                        with conn.cursor() as cursor:
                            _insert_song_row(cursor, song)
                            conn.commit()

                imported_count += 1
                console.log(f"   ✅ Imported: {song['track_name']} by {song['artist_name']}")

            except Exception as e:
                error_count += 1
                console.log(f"   ❌ Error importing {pid}: {e}")

        # 7. Only retire as many currently available songs as were successfully
        # imported, so every removal has a concrete replacement in the same cycle.
        ids_to_mark_unavailable = ids_to_remove_candidates[:imported_count]
        deferred_removals_count += max(0, replacement_budget - imported_count)
        deferred_additions_count += max(0, replacement_budget - imported_count)

        if ids_to_mark_unavailable:
            with get_db_connection() as conn:
                if conn:
                    with conn.cursor() as cursor:
                        _mark_products_unavailable(cursor, ids_to_mark_unavailable)
                        conn.commit()
                        marked_unavailable_count = len(ids_to_mark_unavailable)
            console.log(f"   🚫 Marked {marked_unavailable_count} replaced iTunes songs as unavailable")

        if imported_count != marked_unavailable_count:
            console.log(
                f"   ⚠️ Replacement imbalance after import: imported={imported_count}, removed={marked_unavailable_count}"
            )

        # ── LIBRARY SONGS ─────────────────────────────────────────────
        # 8. Validate library songs (positive ProductIDs): check file_url + AudioFeatures
        library_available = 0
        library_unavailable = 0
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    # Validate only the fixed library target set to keep runtime/data expectations stable.
                    cursor.execute("""
                        SELECT p.ProductID, p.file_url, af.FeatureID
                        FROM Products p
                        LEFT JOIN AudioFeatures af ON af.ProductID = p.ProductID
                        WHERE p.ProductID > 0
                        ORDER BY p.ProductID ASC
                        LIMIT %s
                    """, (LIBRARY_TARGET_COUNT,))
                    library_rows = cursor.fetchall()

                    for row in library_rows:
                        pid = row['ProductID']
                        file_url = (row.get('file_url') or '').strip()
                        has_features = row.get('FeatureID') is not None
                        is_available = 1 if (file_url and has_features) else 0

                        if is_available:
                            library_available += 1
                        else:
                            library_unavailable += 1

                        # Upsert Stock row
                        _upsert_stock(cursor, pid, is_available)

                    conn.commit()
        console.log(f"   📚 Library songs: {library_available} available, {library_unavailable} unavailable")

        purged_unavailable_count = 0
        with get_db_connection() as conn:
            if conn:
                with conn.cursor() as cursor:
                    purged_unavailable_count = _purge_stale_unavailable_imports(
                        cursor,
                        STOCK_UNAVAILABLE_RETENTION_DAYS,
                    )
                    conn.commit()
        if purged_unavailable_count > 0:
            console.log(
                f"   🗑️ Removed {purged_unavailable_count} imported songs unavailable for >= {STOCK_UNAVAILABLE_RETENTION_DAYS} days"
            )

        prune_result = {"pruned": 0, "before": 0, "after": 0}
        if AUDIO_FEATURES_PRUNE_ENABLED:
            prune_result = _prune_imported_audiofeatures(AUDIO_FEATURES_MAX_IMPORTED_ROWS)
            if prune_result["pruned"] > 0:
                console.log(
                    f"   🧹 Pruned imported AudioFeatures: {prune_result['before']} -> {prune_result['after']} "
                    f"(removed {prune_result['pruned']})"
                )

        # ── RELOAD ────────────────────────────────────────────────────
        # 9. Reload ML cache
        await ml_service.startup_cache()

        cached_imported_count = sum(1 for pid in ml_service.audio_features_cache if int(pid) < 0)
        cached_library_count = sum(1 for pid in ml_service.audio_features_cache if int(pid) > 0)

        elapsed = (datetime.utcnow() - start_ts).total_seconds()
        summary = {
            "status": "success",
            "topcharts_target": TOPCHARTS_TARGET_COUNT,
            "artist_search_target": ITUNES_SEARCH_TARGET_COUNT,
            "live_topcharts": len(rss_entries),
            "live_artist_search": len(search_tracks),
            "live_imported_total": len(live_ids),
            "itunes_new_detected": len(ids_to_add_all),
            "itunes_replacement_budget": replacement_budget,
            "itunes_marked_unavailable": marked_unavailable_count,
            "itunes_imported": imported_count,
            "itunes_deferred_additions": deferred_additions_count,
            "itunes_deferred_removals": deferred_removals_count,
            "itunes_kept": len(ids_kept),
            "library_available": library_available,
            "library_unavailable": library_unavailable,
            "errors": error_count,
            "purged_unavailable_week": purged_unavailable_count,
            "pruned_imported": prune_result["pruned"],
            "imported_before_prune": prune_result["before"],
            "imported_after_prune": prune_result["after"],
            "cached_imported_available": cached_imported_count,
            "cached_library_total": cached_library_count,
            "total_in_cache": len(ml_service.audio_features_cache),
            "elapsed_seconds": round(elapsed, 1),
        }
        console.log(f"🎉 Store refresh complete in {elapsed:.1f}s: {summary}")
        return summary

    except Exception as e:
        console.log(f"❌ Store refresh error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Refresh failed: {str(e)}")


# ============================================
# BACKGROUND AUTO-REFRESH SCHEDULER
# ============================================

async def _run_scheduled_refresh(trigger: str):
    try:
        console.log(f"⏰ {trigger} store refresh starting (interval={REFRESH_INTERVAL}s)...")
        await refresh_topcharts()
    except Exception as e:
        console.log(f"⚠️ {trigger} store refresh failed: {e}")
        return False
    return True

async def _topcharts_refresh_loop():
    """
    Background coroutine that refreshes the store on a fixed interval (default 1 hour).
    Runs forever until the task is cancelled (e.g. on app shutdown).
    """
    # Wait a short period after startup so dependent services are ready, then
    # hydrate the imported catalogue immediately instead of waiting an hour.
    if STARTUP_REFRESH_DELAY > 0:
        await asyncio.sleep(STARTUP_REFRESH_DELAY)

    # Retry startup refresh with backoff — DB may still be initialising
    max_retries = 5
    for attempt in range(1, max_retries + 1):
        success = await _run_scheduled_refresh(f"Startup (attempt {attempt}/{max_retries})")
        if success:
            break
        if attempt < max_retries:
            wait = min(15 * attempt, 60)
            console.log(f"⏳ Retrying startup refresh in {wait}s...")
            await asyncio.sleep(wait)
        else:
            console.log("❌ Startup refresh exhausted all retries. Will retry at next scheduled interval.")

    while True:
        await asyncio.sleep(REFRESH_INTERVAL)
        await _run_scheduled_refresh("Scheduled")


def start_refresh_scheduler():
    """Start the background refresh loop. Call once from the app startup event."""
    global _refresh_task
    if _refresh_task is None or _refresh_task.done():
        _refresh_task = asyncio.get_event_loop().create_task(_topcharts_refresh_loop())
        console.log(
            f"🕐 Top-charts auto-refresh scheduled: startup delay={STARTUP_REFRESH_DELAY}s, interval={REFRESH_INTERVAL}s"
        )


def stop_refresh_scheduler():
    """Cancel the background refresh loop. Call from the app shutdown event."""
    global _refresh_task
    if _refresh_task and not _refresh_task.done():
        _refresh_task.cancel()
        console.log("🛑 Top-charts auto-refresh cancelled")
