# audio_service/routes/recommendations.py
from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict
import asyncio
import httpx
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from utils import console
from config import executor, ITUNES_API_BASE_URL
from database import get_db_connection
from models import (
    RealtimeRecommendationRequest, 
    AudioSimilarityResult, 
    ArtistSimilarityRequest,
    ArtistSimilarSong,
    ITunesSong,
    SearchSimilarityRequest,
    SearchSimilarSong,
    SearchSong,
    UnifiedRecommendationRequest,
    LibraryMatchRequest,
    LibraryMatchResult
)
from feature_extraction import (
    extract_audio_features_from_preview,
    extract_features_for_product_async,
    extract_audio_features_from_preview_async
)
import ml_service

router = APIRouter()

# ============================================
# CACHED AUDIO FEATURES ENDPOINT (for artist songs)
# ============================================

# EXECUTION ORDER: Router endpoint.
@router.get("/api/audio/cached-features")
async def get_cached_audio_features(artist_only: bool = True):
    """
    Get cached audio features from the AudioFeatures table.
    This allows the frontend to use REAL extracted features instead of pseudo-features.
    
    Args:
        artist_only: If True, only return artist songs (negative ProductIDs from iTunes).
                     If False, return all cached features including discover page songs.
    
    Returns:
        Dictionary mapping ProductID to audio features (tempo, energy, valence, danceability, etc.)
    """
    try:
        if not ml_service.cache_loaded or not ml_service.audio_features_cache:
            return {
                "status": "error",
                "message": "Audio features cache not loaded",
                "features": {}
            }
        
        # Filter based on artist_only parameter
        if artist_only:
            # Artist songs have negative ProductIDs (from iTunes import)
            features = {
                str(pid): {
                    "productId": pid,
                    "tempo": data.get('tempo', 120),
                    "energy": data.get('energy', 0.5),
                    "valence": data.get('valence', 0.5),
                    "danceability": data.get('danceability', 0.5),
                    "acousticness": data.get('acousticness', 0.5),
                    "instrumentalness": data.get('instrumentalness', 0.5),
                    "speechiness": data.get('speechiness', 0.1),
                    "loudness": data.get('loudness', -60),
                    "genre": data.get('genre', 'Unknown'),
                    "spectralCentroid": data.get('spectral_centroid', 1500),
                    "spectralRolloff": data.get('spectral_rolloff', 3000),
                    "zeroCrossingRate": data.get('zero_crossing_rate', 0.05)
                }
                for pid, data in ml_service.audio_features_cache.items()
                if pid < 0  # Negative IDs are iTunes artist songs
            }
        else:
            # Return all cached features
            features = {
                str(pid): {
                    "productId": pid,
                    "tempo": data.get('tempo', 120),
                    "energy": data.get('energy', 0.5),
                    "valence": data.get('valence', 0.5),
                    "danceability": data.get('danceability', 0.5),
                    "acousticness": data.get('acousticness', 0.5),
                    "instrumentalness": data.get('instrumentalness', 0.5),
                    "speechiness": data.get('speechiness', 0.1),
                    "loudness": data.get('loudness', -60),
                    "genre": data.get('genre', 'Unknown'),
                    "spectralCentroid": data.get('spectral_centroid', 1500),
                    "spectralRolloff": data.get('spectral_rolloff', 3000),
                    "zeroCrossingRate": data.get('zero_crossing_rate', 0.05)
                }
                for pid, data in ml_service.audio_features_cache.items()
            }
        
        return {
            "status": "success",
            "count": len(features),
            "features": features
        }
    except Exception as e:
        console.log(f"Error fetching cached features: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# UNIFIED RECOMMENDATION ENDPOINT
# ============================================

@router.post("/api/audio/unified-recommendations")
async def get_unified_recommendations(request: UnifiedRecommendationRequest):
    """
    Single recommendation endpoint handling multiple sources and visualizers.
    Handles feature extraction from S3 or iTunes depending on the source.
    """
    try:
        current_id_str = str(request.current_product_id)
        current_id_int = 0
        try:
             current_id_int = int(current_id_str)
        except:
             pass
             
        clean_current_id = clean_id_str(current_id_str)

        # 1. Determine or Extract Features for Target Song
        target_features = None
        cached_features = None
        
        # PRIORITY 1: Check Cache (High Quality ML Features)
        if current_id_int != 0:
            # Check negative ID (artist songs stored as negative in DB)
            neg_id = -abs(current_id_int)
            if neg_id in ml_service.audio_features_cache:
                cached_features = ml_service.audio_features_cache[neg_id]
            # Check positive ID
            elif abs(current_id_int) in ml_service.audio_features_cache:
                cached_features = ml_service.audio_features_cache[abs(current_id_int)]
        
        if cached_features:
             target_features = cached_features.copy()
             console.log(f"✅ Using CACHED audio features for {clean_current_id} as BASE")
             
             # IGNORE live energy/valence/etc as Cached ML features are ground truth for SELECTION.
             # We use Live features only for Display/Match calculation later.
             
             if request.audio_features:
                  req_f = request.audio_features
                  # Tempo scale check
                  rate = req_f.playback_rate if req_f.playback_rate else 1.0
                  if rate != 1.0:
                       target_features['tempo'] = target_features.get('tempo', 120) * rate
                  
        # PRIORITY 3: Request Features ONLY (if no cache)
        elif request.audio_features:
             # Convert request.audio_features to dict format used by cache
             target_features = request.audio_features.dict() 
             # Ensure required keys exist with defaults if missing
             target_features.setdefault('tempo', 120)
             target_features.setdefault('energy', 0.5)
             target_features.setdefault('valence', 0.5)
             target_features.setdefault('danceability', 0.5)
             target_features.setdefault('acousticness', 0.5)
             console.log(f"⚠️ Using LIVE audio features from request for {clean_current_id} (No Cache Found)")

        # PRIORITY 4: Live Extraction from Preview URL (Fallback)
        # If still not found and preview_url provided, extract features
        if not target_features and request.preview_url:
            console.log(f"🔍 Extracting features for {request.source} from {request.preview_url}")
            
            is_itunes = 'apple.com' in request.preview_url
            
            if is_itunes or request.source in ['top_charts', 'similar_songs']:
                # Synchronous extraction (run in executor)
                loop = asyncio.get_event_loop()
                target_features = await loop.run_in_executor(
                    executor,
                    extract_audio_features_from_preview,
                    request.preview_url,
                    current_id_int
                )
            else:
                # S3 / Discover extraction
                target_features = await extract_features_for_product_async(current_id_int, request.preview_url)

        if not target_features:
             # Fallback default features
             target_features = {
                 'tempo': 120, 'energy': 0.5, 'valence': 0.5, 
                 'danceability': 0.5, 'acousticness': 0.5,
                 'spectral_centroid': 1500, 'spectral_rolloff': 3000,
                 'zero_crossing_rate': 0.05, 'instrumentalness': 0.5,
                 'loudness': -60, 'speechiness': 0.1
             }

        # Ensure all keys exist
        target_features.setdefault('tempo', 120)
        target_features.setdefault('energy', 0.5)
        target_features.setdefault('valence', 0.5)
        target_features.setdefault('danceability', 0.5)
        target_features.setdefault('acousticness', 0.5)
        
        # 2. Select Candidates based on Source and Request Data
        candidates = []
        
        # LOGGING: Data for debugging
        console.log(f"🧠 Unified Recs: Source={request.source}, LiveFeatures={bool(request.audio_features)}, CacheSize={len(ml_service.audio_features_cache)}")
        if target_features:
            console.log(f"🎯 Target Vector: Tempo={target_features.get('tempo')}, Energy={target_features.get('energy')}")

        # If the request provides explicit candidates (e.g. Search), use them
        if request.candidates and len(request.candidates) > 0:
            console.log(f"✅ Using {len(request.candidates)} provided comparison songs")
            
            # Limit to 20 max to prevent timeout during feature extraction
            songs_to_process = request.candidates[:20]
            tasks = []
            
            for song in songs_to_process:
                 # Check if live audio features provided for this song
                 if song.audio_features:
                      # Use live features directly from the song
                      live_song_features = song.audio_features.dict()
                      safe_features = {
                          'tempo': live_song_features.get('tempo', 120),
                          'energy': live_song_features.get('energy', 0.5),
                          'valence': live_song_features.get('valence', 0.5),
                          'danceability': live_song_features.get('danceability', 0.5),
                      }
                      tasks.append(asyncio.sleep(0, result=safe_features))
                      continue
                 
                 # Check if features are already cached
                 tid_raw = song.trackId
                 tid_res = None
                 try:
                     tid_res = int(tid_raw)
                 except:
                     pass
                 
                 found_features = None
                 if tid_res is not None:
                      # Check Negative ID (Artist)
                      if -abs(tid_res) in ml_service.audio_features_cache:
                           found_features = ml_service.audio_features_cache[-abs(tid_res)]
                      # Check Positive ID
                      elif abs(tid_res) in ml_service.audio_features_cache:
                           found_features = ml_service.audio_features_cache[abs(tid_res)]
                           
                 if found_features:
                      # Use ALL cached features to ensure similarity calculation is accurate
                      safe_features = found_features.copy()
                      tasks.append(asyncio.sleep(0, result=safe_features))
                 elif song.previewUrl:
                      loop = asyncio.get_event_loop()
                      tasks.append(loop.run_in_executor(
                          executor, extract_audio_features_from_preview, song.previewUrl, tid_raw
                      ))
                 else:
                      tasks.append(asyncio.sleep(0, result=None))
                      
            if tasks:
                 results = await asyncio.gather(*tasks, return_exceptions=True)
            else:
                 results = []
                 
            for i, res in enumerate(results):
                 song = songs_to_process[i]
                 # Skip if self (Double check string conversion for safety)
                 if str(song.trackId) == clean_current_id and request.source != 'search_component':
                      continue
                      
                 features = None
                 if isinstance(res, dict):
                      features = res
                      
                 if features:
                      candidates.append({
                           'id': song.trackId,
                           'tempo': features.get('tempo'),
                           'energy': features.get('energy'),
                           'valence': features.get('valence'),
                           'danceability': features.get('danceability'),
                           'acousticness': features.get('acousticness'),
                           'loudness': features.get('loudness', -60),
                           'speechiness': features.get('speechiness', 0.1),
                           'spectral_centroid': features.get('spectral_centroid', 1500),
                           'spectral_rolloff': features.get('spectral_rolloff', 3000),
                           'zero_crossing_rate': features.get('zero_crossing_rate', 0.05),
                           'instrumentalness': features.get('instrumentalness', 0.5),
                           '_meta': song 
                      })
            
        else:
            # Fallback to pure cache iteration
            all_cached = ml_service.audio_features_cache.items()
            
            # Candidate filtering logic
            if request.source in ['top_charts', 'similar_songs', 'search_component']:
                # Recommend from ALL cached content (Artist Songs AND Library Songs)
                candidates = []
                for pid, p in all_cached:
                     # For TopCharts and SimilarSongs, ONLY include Artist Songs (Negative IDs)
                     if request.source in ['top_charts', 'similar_songs'] and pid >= 0:
                         continue

                     # Strict filtering of current song
                     if str(pid) == clean_current_id or pid == current_id_int:
                          continue
                     
                     # Extra safety check for integer equality
                     try:
                          if int(pid) == int(clean_current_id) or int(pid) == current_id_int:
                               continue
                     except: pass

                     # Check against negative/positive variants just in case
                     try:
                         if abs(int(pid)) == abs(int(clean_current_id)):
                             continue
                     except: pass

                     candidates.append(p)
                     
                console.log(f"🔎 Filtered Candidates: {len(candidates)} from {len(all_cached)} cached items")

            elif request.source == 'discover_page':
                # Recommend Discover Songs (Positive IDs)
                candidates = []
                for pid, p in all_cached:
                    if pid > 0:
                         if str(pid) == clean_current_id or pid == current_id_int:
                              continue
                         try:
                             if int(pid) == int(clean_current_id): continue
                         except: pass
                         candidates.append(p)
                         
            else:
                 candidates = [p for pid, p in all_cached if str(pid) != clean_current_id]

        console.log(f"🔎 Candidate Pool Size: {len(candidates)}")

        # 3. Calculate Similarity
        if not candidates:
             return {"status": "success", "recommendations": []}

        # ENFORCE CANDIDATE FILTERING (Self & Source Type)
        # This creates a 'clean' candidate list before we do any math.
        filtered_candidates = []
        for c in candidates:
            # A. Robust Self-Filtering
            cid_raw = c.get('id')
            is_self = False
            
            # String comparison (strip whitespace)
            clean_cid = str(cid_raw).strip() if cid_raw is not None else ""
            if clean_cid and clean_cid == clean_current_id:
                is_self = True
            
            # Integer comparison (handle mismatch types & negative/positive variants)
            if not is_self and cid_raw is not None:
                try:
                    cid_int = int(cid_raw)
                    # Direct match
                    if cid_int == current_id_int:
                        is_self = True
                    # Abs match (handles negative IDs representing same song in different contexts)
                    elif current_id_int != 0 and abs(cid_int) == abs(current_id_int):
                         is_self = True
                except:
                    pass
            
            if is_self:
                continue

            # B. Source Filtering (Artist Only)
            # We strictly enforce that "Artist" contexts should NEVER show "Library" songs.
            # Sources: 'top_charts', 'similar_songs', 'visualiser', 'visualizer', 'sidebar', 'search_component'
            # We treat any request that isn't explicitly 'discover_page' or 'library' as potentially needing filtering if it behaves like an artist view
            
            # Robust source checking (substring match)
            source_lower = request.source.lower()
            artist_context_keywords = ['chart', 'similar', 'visual', 'side', 'search']
            is_artist_context = any(kw in source_lower for kw in artist_context_keywords)
            
            # Explicitly allow discover/library matches
            if 'discover' in source_lower or 'library' in source_lower:
                is_artist_context = False

            if is_artist_context:
                try:
                    cid_int = int(cid_raw)
                    # Library songs in our DB are small positive IDs (1-1000). 
                    # Cached Artist songs use Negative IDs.
                    # Live Artist songs (iTunes) use large positive IDs (>1,000,000).
                    
                    if cid_int > 0 and cid_int < 1000000:
                        # Only skip library songs if requesting song is NOT a discovery/library song
                        # If current song (target) is from library (positive < 1M), we should show library matches
                        is_current_library = current_id_int > 0 and current_id_int < 1000000
                        if not is_current_library:
                            continue # Skip Library Song
                except:
                    pass # Keep if ID is weird (e.g. uuid string or something else)

            filtered_candidates.append(c)
        
        candidates = filtered_candidates
        console.log(f"🔎 Final Filtered Candidates: {len(candidates)} (Artist Only Filter: {is_artist_context})")
        
        if not candidates:
             return {"status": "success", "recommendations": []}

        target_vector = [
            float(target_features.get('tempo') if target_features.get('tempo') is not None else 120) / 200.0,
            float(target_features.get('energy') if target_features.get('energy') is not None else 0.5),
            float(target_features.get('valence') if target_features.get('valence') is not None else 0.5),
            float(target_features.get('danceability') if target_features.get('danceability') is not None else 0.5),
            float(target_features.get('acousticness') if target_features.get('acousticness') is not None else 0.5),
            float(target_features.get('spectral_centroid') if target_features.get('spectral_centroid') is not None else 1500.0) / 5000.0,
            float(target_features.get('spectral_rolloff') if target_features.get('spectral_rolloff') is not None else 3000.0) / 10000.0,
            float(target_features.get('zero_crossing_rate') if target_features.get('zero_crossing_rate') is not None else 0.05) * 10.0,
            float(target_features.get('instrumentalness') if target_features.get('instrumentalness') is not None else 0.5),
            float((target_features.get('loudness') if target_features.get('loudness') is not None else -60.0) + 60.0) / 60.0,
            float(target_features.get('speechiness') if target_features.get('speechiness') is not None else 0.1)
        ]
        
        candidate_vectors = []
        candidate_objs = []
        
        for p in candidates:
             vec = [
                float(p.get('tempo') if p.get('tempo') is not None else 120) / 200.0,
                float(p.get('energy') if p.get('energy') is not None else 0.5),
                float(p.get('valence') if p.get('valence') is not None else 0.5),
                float(p.get('danceability') if p.get('danceability') is not None else 0.5),
                float(p.get('acousticness') if p.get('acousticness') is not None else 0.5),
                float(p.get('spectral_centroid') if p.get('spectral_centroid') is not None else 1500.0) / 5000.0,
                float(p.get('spectral_rolloff') if p.get('spectral_rolloff') is not None else 3000.0) / 10000.0,
                float(p.get('zero_crossing_rate') if p.get('zero_crossing_rate') is not None else 0.05) * 10.0,
                float(p.get('instrumentalness') if p.get('instrumentalness') is not None else 0.5),
                float((p.get('loudness') if p.get('loudness') is not None else -60.0) + 60.0) / 60.0,
                float(p.get('speechiness') if p.get('speechiness') is not None else 0.1)
            ]
             candidate_vectors.append(vec)
             candidate_objs.append(p)
             
        if not candidate_vectors:
            return {"status": "success", "recommendations": []}

        # 4. Pure cosine similarity on manually-normalized vectors
        target_arr = np.array(target_vector).reshape(1, -1)
        candidates_arr = np.array(candidate_vectors)
        
        sims = cosine_similarity(target_arr, candidates_arr)[0]
        
        recommendations = []
        for i, score in enumerate(sims):
            p = candidate_objs[i]
            
            tempo_match=1.0 - min(abs(target_features.get('tempo',120) - (p.get('tempo') or 120)), 100)/100
            energy_match=1.0 - abs(target_features.get('energy',0.5) - (p.get('energy') or 0.5))
            mood_match=1.0 - abs(target_features.get('valence',0.5) - (p.get('valence') or 0.5))
            dance_match=1.0 - abs(target_features.get('danceability',0.5) - (p.get('danceability') or 0.5))
            
            matches = [
                ('tempo', tempo_match, f"Matching rhythm ({p.get('tempo', 0):.0f} BPM)"),
                ('energy', energy_match, f"Similar intensity ({p.get('energy', 0):.0%})"),
                ('mood', mood_match, f"Similar mood"),
                ('dance', dance_match, f"Comparable groove")
            ]
            best_match = max(matches, key=lambda x: x[1])
            
            meta = p.get('_meta') 
            
            result = AudioSimilarityResult(
                product_id=p['id'],
                similarity_score=round(float(score), 3),
                tempo_match=round(tempo_match, 3),
                energy_match=round(energy_match, 3),
                mood_match=round(mood_match, 3),
                danceability_match=round(dance_match, 3),
                dance_match=round(dance_match, 3), 
                genre_match=False, 
                reason=best_match[2],
                
                # Populate raw features
                tempo=p.get('tempo'),
                energy=p.get('energy'),
                valence=p.get('valence'),
                danceability=p.get('danceability'),
                acousticness=p.get('acousticness'),
                instrumentalness=p.get('instrumentalness'),
                speechiness=p.get('speechiness'),
                
                trackName=meta.trackName if meta else None,
                artistName=meta.artistName if meta else None,
                albumTitle=meta.collectionName if meta else None,
                collectionName=meta.collectionName if meta else None,
                artworkUrl100=meta.artworkUrl100 if meta else None,
                previewUrl=meta.previewUrl if meta else None
            )
            recommendations.append(result)
            
        # Filter: Only > 0% similarity
        recommendations = [r for r in recommendations if r.similarity_score > 0]
            
        recommendations.sort(key=lambda x: x.similarity_score, reverse=True)
        
        # Limit to max 20, or lower if requester set a lower limit
        limit_count = 20
        if request.limit and request.limit < 20:
             limit_count = request.limit
        
        top_recommendations = recommendations[:limit_count]
        
        # 5. Hydrate Data from Database and iTunes for Cached Items
        missing_meta_ids = [r for r in top_recommendations if not r.trackName]
        
        if missing_meta_ids:
             try:
                 # Split IDs into DB (positive) and iTunes (negative)
                 db_ids = []
                 itunes_ids = []
                 
                 for r in missing_meta_ids:
                      try:
                           pid_int = int(r.product_id)
                           if pid_int > 0:
                               db_ids.append(pid_int)
                           elif pid_int < 0:
                               itunes_ids.append(abs(pid_int))
                      except:
                           pass
                           
                 # A. Hydrate DB Songs
                 if db_ids:
                     id_string = ",".join(str(i) for i in db_ids)
                     with get_db_connection() as conn:
                         if conn:
                             with conn.cursor() as cursor:
                                 # Fetch standard columns (ArtistName not in DB)
                                 sql = f"""
                                    SELECT ProductID, AlbumTitle, albumCoverImageUrl, preview_url
                                    FROM Products 
                                    WHERE ProductID IN ({id_string})
                                 """
                                 cursor.execute(sql)
                                 rows = cursor.fetchall()
                                 
                                 meta_map = {row['ProductID']: row for row in rows}
                                 
                                 for r in top_recommendations:
                                     # Try int conversion for lookup
                                     pid_int = 0
                                     try: pid_int = int(r.product_id)
                                     except: pass
                                     
                                     if pid_int > 0 and pid_int in meta_map:
                                         data = meta_map[pid_int]
                                         # Prefer AlbumTitle, fallback to ID if completely missing
                                         r.trackName = data.get('AlbumTitle') or f"Track {r.product_id}"
                                         r.artworkUrl100 = data.get('albumCoverImageUrl')
                                         r.previewUrl = data.get('preview_url')
                                         if not r.artistName or r.artistName == "Artist":
                                             r.artistName = "Library Artist"

                 # B. Hydrate iTunes Songs via Lookup API
                 if itunes_ids:
                     # Limit lookup batch size
                     lookup_ids = ",".join(str(i) for i in itunes_ids[:50])
                     itunes_map = {}
                     
                     try:
                         async with httpx.AsyncClient(timeout=5.0) as client:
                             # Lookup original metadata including Artist
                             resp = await client.get(f"{ITUNES_API_BASE_URL}/lookup", params={"id": lookup_ids})
                             if resp.status_code == 200:
                                 results = resp.json().get('results', [])
                                 for item in results:
                                     # Map by negative ID (our internal ID)
                                     itunes_map[-item['trackId']] = item
                     except Exception as ex:
                         console.log(f"iTunes hydration failed: {ex}")

                     for r in top_recommendations:
                         try: pid_int = int(r.product_id)
                         except: continue
                         
                         if pid_int < 0 and pid_int in itunes_map:
                             data = itunes_map[pid_int]
                             r.trackName = data.get('trackName')
                             r.artistName = data.get('artistName') # Correct artist name from iTunes
                             r.albumTitle = data.get('collectionName')
                             r.artworkUrl100 = data.get('artworkUrl100')
                             r.previewUrl = data.get('previewUrl')

             except Exception as rx:
                 console.log(f"Error hydrating metadata: {rx}")
        
        # Prepare "Live" features for the frontend visualizer (so it updates)
        # But we used the High-Quality Cache features for the actual math above.
        response_features = target_features
        if request.audio_features:
             # If we have live data, return it for display purposes
             response_features = request.audio_features.dict()
             # Fill gaps with our calculation features (defaults or cache)
             for k, v in target_features.items():
                  if k not in response_features or response_features[k] is None:
                       response_features[k] = v
        
        return {
            "status": "success", 
            "recommendations": top_recommendations,
            "target_features": response_features
        }
            
    except Exception as e:
        console.log(f"Error in unified recommendations: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

def clean_id_str(s: str) -> str:
    """Helper to handle IDs like '-123' vs '123' matching strings"""
    return s.strip()

# ============================================
# LIBRARY MATCH ENDPOINT (Reverse Search)
# ============================================

@router.post("/api/audio/match-library", response_model=Dict)
async def match_library_songs(request: LibraryMatchRequest):
    """
    Match external comparison songs against the ENTIRE internal library (cached products).
    Used by SimilarSongs page to find which library track each artist song is most similar to.
    
    This is effectively a 'Reverse Search':
    - Input: List of Artist Songs
    - Target: All 47 cached library songs
    - Output: For each input song, the best matching library song and score.
    """
    try:
        if not ml_service.cache_loaded or not ml_service.audio_features_cache:
            # Try to trigger load if empty
            await ml_service.startup_cache()
            
        # 1. Get Cached Library Songs (positive IDs)
        # If target_ids provided in request, filter by them. Otherwise take all.
        
        target_set = set(request.target_ids) if request.target_ids else None
        
        library_songs = []
        for pid, features in ml_service.audio_features_cache.items():
            try: 
                pid_int = int(pid)
                if pid_int > 0: # Positive IDs are library songs
                    if target_set and pid_int not in target_set:
                        continue
                        
                    # Add ID to features for easier access
                    f = features.copy()
                    f['id'] = pid
                    library_songs.append(f)
            except: pass
            
        if not library_songs:
            # If we requested specific targets but none were found in cache, that's an issue
            if target_set:
                console.log(f"Warning: None of the {len(target_set)} target IDs were found in cache.")
            return {"status": "error", "message": "No matching library songs found in cache"}

        # Limit library songs to standard set if needed (e.g. 47) 
        # but we scan all available positive IDs
        
        results = []
        
        # 2. For each input candidate, find best library match
        for candidate in request.candidates[:request.limit]:
            
            # Extract features for candidate (or get from cache if exists)
            # Check if this external song happens to be in our cache (e.g. by name match or ID)
            # For now, we assume we need to extract from preview URL or we can't score it
            # BUT, to save time, similar songs usually sends features or we rely on 'unified' style
            # Actually, most efficiency is gained if we already have features. 
            
            # Since generating features for 50 input songs is slow, 
            # we check if we have cached features for these 'external' songs (negative IDs)
            
            candidate_features = None
            try:
                # Try lookup by ID (negative ID for artist songs)
                cid = str(candidate.trackId)
                if cid in ml_service.audio_features_cache:
                    candidate_features = ml_service.audio_features_cache[cid]
                else:
                    # Try negative version
                    try:
                        neg_id = str(-abs(int(cid)))
                        if neg_id in ml_service.audio_features_cache:
                             candidate_features = ml_service.audio_features_cache[neg_id]
                    except: pass
            except: pass
            
            if not candidate_features and candidate.previewUrl:
                 # Real-time extraction for uncached songs
                 try:
                     # Use the async wrapper
                     cid_int = 0
                     try: cid_int = int(candidate.trackId)
                     except: pass
                     
                     # Wait for extraction (this might be slow, but necessary for first load)
                     extracted = await extract_audio_features_from_preview_async(candidate.previewUrl, cid_int)
                     
                     if extracted:
                         candidate_features = extracted
                         # Optional: Cache it logic here if desired
                 except Exception as ex:
                     console.log(f"Extraction failed for {candidate.trackName}: {ex}")
                 
            if not candidate_features:
                continue

            # Create vector for candidate
            c_vec = [
                float(candidate_features.get('tempo', 120) or 120) / 200.0,
                float(candidate_features.get('energy', 0.5) or 0.5),
                float(candidate_features.get('valence', 0.5) or 0.5),
                float(candidate_features.get('danceability', 0.5) or 0.5),
                float(candidate_features.get('acousticness', 0.5) or 0.5),
                float(candidate_features.get('spectral_centroid', 1500.0) / 5000.0),
                float(candidate_features.get('spectral_rolloff', 3000.0) / 10000.0),
                float(candidate_features.get('zero_crossing_rate', 0.05) * 10.0),
                float(candidate_features.get('instrumentalness', 0.5)),
                float((candidate_features.get('loudness', -60.0) + 60.0) / 60.0),
                float(candidate_features.get('speechiness', 0.1))
            ]
            
            best_match = None
            best_score = -1.0
            
            # Compare against all library songs
            for lib_song in library_songs:
                l_vec = [
                    float(lib_song.get('tempo', 120) or 120) / 200.0,
                    float(lib_song.get('energy', 0.5) or 0.5),
                    float(lib_song.get('valence', 0.5) or 0.5),
                    float(lib_song.get('danceability', 0.5) or 0.5),
                    float(lib_song.get('acousticness', 0.5) or 0.5),
                    float(lib_song.get('spectral_centroid', 1500.0) / 5000.0),
                    float(lib_song.get('spectral_rolloff', 3000.0) / 10000.0),
                    float(lib_song.get('zero_crossing_rate', 0.05) * 10.0),
                    float(lib_song.get('instrumentalness', 0.5)),
                    float((lib_song.get('loudness', -60.0) + 60.0) / 60.0),
                    float(lib_song.get('speechiness', 0.1))
                ]
                
                # Manual Dot Product for speed (Cosine Sim)
                # Vectors are not normalised here, so using sklearn is better usually
                # But for 1 vs 47, loop is fine. 
                # Let's use sklearn for batch if possible, but 1-to-many loop is okay here
                
                score = cosine_similarity([c_vec], [l_vec])[0][0]
                
                if score > best_score:
                    best_score = score
                    best_match = lib_song

            if best_match:
                 # Match Reason
                tempo_match=1.0 - min(abs(candidate_features.get('tempo',120) - best_match.get('tempo',120)), 100)/100
                energy_match=1.0 - abs(candidate_features.get('energy',0.5) - best_match.get('energy',0.5))
                mood_match=1.0 - abs(candidate_features.get('valence',0.5) - best_match.get('valence',0.5))
                dance_match=1.0 - abs(candidate_features.get('danceability',0.5) - best_match.get('danceability',0.5))
            
                reason_list = [
                    ('tempo', tempo_match, f"Matching rhythm ({best_match.get('tempo', 0):.0f} BPM)"),
                    ('energy', energy_match, f"Similar intensity ({best_match.get('energy', 0):.0%})"),
                    ('mood', mood_match, f"Similar mood"),
                    ('dance', dance_match, f"Comparable groove")
                ]
                text_reason = max(reason_list, key=lambda x: x[1])[2]

                res = LibraryMatchResult(
                    input_track_id=candidate.trackId,
                    matched_product_id=best_match['id'],
                    similarity_score=float(best_score),
                    match_reason=text_reason,
                    tempo_match=round(tempo_match, 3),
                    energy_match=round(energy_match, 3),
                    mood_match=round(mood_match, 3),
                    dance_match=round(dance_match, 3)
                )
                results.append(res)
                
        # Hydrate library names
        if results:
             ids = {r.matched_product_id for r in results}
             if ids:
                 id_string = ",".join(str(i) for i in ids)
                 with get_db_connection() as conn:
                     if conn:
                         with conn.cursor() as cursor:
                             sql = f"SELECT ProductID, AlbumTitle FROM Products WHERE ProductID IN ({id_string})"
                             cursor.execute(sql)
                             rows = cursor.fetchall()
                             name_map = {str(row['ProductID']): row['AlbumTitle'] for row in rows}
                             
                             for r in results:
                                 r.matched_product_name = name_map.get(str(r.matched_product_id))

        return {
            "status": "success",
            "matches": results
        }

    except Exception as e:
        console.log(f"Error in match library: {e}")
        raise HTTPException(status_code=500, detail=str(e))

