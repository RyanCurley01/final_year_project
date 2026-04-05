# audio_service/routes/recommendations.py
from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict
import json
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
    MidiTargetRequest,
    MelodyFinderRequest,
    LibraryMatchRequest,
    LibraryMatchResult,
)
from feature_extraction import (
    extract_audio_features_from_preview,
    extract_features_for_product_async,
    extract_audio_features_from_preview_async,
)
from s3_service import generate_presigned_url
import ml_service
from ml_service import KEY_NAME_TO_INDEX, TIME_SIG_TO_BEATS, _parse_json_list

router = APIRouter()


def _expand_match_target_ids(target_ids: Optional[List[int]]) -> Optional[set[int]]:
    """Expand requested target IDs so live iTunes track IDs can match cached imported IDs."""
    if not target_ids:
        return None

    expanded: set[int] = set()
    for raw_target_id in target_ids:
        try:
            target_id = int(raw_target_id)
        except Exception:
            continue

        if target_id == 0:
            continue

        expanded.add(target_id)
        expanded.add(abs(target_id))
        expanded.add(-abs(target_id))

    return expanded or None


def _resolve_discover_product_id(current_id_raw: str, preview_url: Optional[str]) -> int:
    """Resolve ProductID for discover/library songs.

    Handles numeric IDs directly, and falls back to Products.preview_url lookup
    when the incoming ID is missing/non-numeric.
    """
    try:
        pid = int(str(current_id_raw).strip())
        if pid > 0:
            return pid
    except Exception:
        pass

    if not preview_url:
        return 0

    try:
        with get_db_connection() as conn:
            if not conn:
                return 0
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT ProductID
                    FROM Products
                    WHERE preview_url = %s
                    LIMIT 1
                    """,
                    (preview_url,),
                )
                row = cursor.fetchone() or {}
                return int(row.get("ProductID") or 0)
    except Exception as e:
        console.log(f"⚠️ Discover ProductID resolution failed: {e}")
        return 0


def _build_similarity_vector(f: dict) -> list:
    """
    Build a normalized similarity vector from audio features dict.
    Uses ALL AudioFeatures columns for comprehensive similarity matching:
    11 core + 5 new + 1 duration + 1 key_index + 1 time_sig_beats + 13 MFCC + 12 Chroma + 7 SpectralContrast = 51D
    """
    vec = [
        float(f.get('tempo') if f.get('tempo') is not None else 120) / 200.0,
        float(f.get('energy') if f.get('energy') is not None else 0.5),
        float(f.get('valence') if f.get('valence') is not None else 0.5),
        float(f.get('danceability') if f.get('danceability') is not None else 0.5),
        float(f.get('acousticness') if f.get('acousticness') is not None else 0.5),
        float(f.get('spectral_centroid') if f.get('spectral_centroid') is not None else 1500.0) / 5000.0,
        float(f.get('spectral_rolloff') if f.get('spectral_rolloff') is not None else 3000.0) / 10000.0,
        float(f.get('zero_crossing_rate') if f.get('zero_crossing_rate') is not None else 0.05) * 10.0,
        float(f.get('instrumentalness') if f.get('instrumentalness') is not None else 0.5),
        float((f.get('loudness') if f.get('loudness') is not None else -60.0) + 60.0) / 60.0,
        float(f.get('speechiness') if f.get('speechiness') is not None else 0.1),
        # New features for genre separation
        float(f.get('spectral_bandwidth') if f.get('spectral_bandwidth') is not None else 1500.0) / 5000.0,
        float(f.get('rms_energy') if f.get('rms_energy') is not None else 0.02) * 10.0,
        float(f.get('onset_rate') if f.get('onset_rate') is not None else 2.0) / 10.0,
        float(f.get('harmonic_ratio') if f.get('harmonic_ratio') is not None else 0.5),
        float(f.get('percussive_ratio') if f.get('percussive_ratio') is not None else 0.5),
        # Duration normalized (0-300s typical range)
        float(f.get('duration') if f.get('duration') is not None else 0) / 300.0,
        # Key signature as index (0-11) normalized
        float(KEY_NAME_TO_INDEX.get(f.get('key_signature', ''), 0)) / 11.0,
        # Time signature beats normalized
        float(TIME_SIG_TO_BEATS.get(f.get('time_signature', '4/4'), 4.0)) / 7.0,
    ]
    # MFCC means (13 coefficients) - normalize roughly by dividing by 300
    mfcc = f.get('mfcc_mean')
    if mfcc and isinstance(mfcc, list) and len(mfcc) == 13:
        vec.extend([float(x) / 300.0 for x in mfcc])
    elif isinstance(mfcc, str):
        parsed = _parse_json_list(mfcc, 13)
        vec.extend([float(x) / 300.0 for x in parsed])
    else:
        vec.extend([0.0] * 13)
    # Chroma means (12 pitch classes) - already 0-1 range
    chroma = f.get('chroma_mean')
    if chroma and isinstance(chroma, list) and len(chroma) == 12:
        vec.extend([float(x) for x in chroma])
    elif isinstance(chroma, str):
        parsed = _parse_json_list(chroma, 12)
        vec.extend([float(x) for x in parsed])
    else:
        vec.extend([0.0] * 12)
    # Spectral contrast means (7 bands) - normalize by dividing by 50
    sc = f.get('spectral_contrast_mean')
    if sc and isinstance(sc, list) and len(sc) == 7:
        vec.extend([float(x) / 50.0 for x in sc])
    elif isinstance(sc, str):
        parsed = _parse_json_list(sc, 7)
        vec.extend([float(x) / 50.0 for x in parsed])
    else:
        vec.extend([0.0] * 7)
    return vec

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
                    "genreCluster": data.get('genre_cluster', 'Unknown'),
                    "mood": data.get('mood', 'Unknown'),
                    "spectralCentroid": data.get('spectral_centroid', 1500),
                    "spectralRolloff": data.get('spectral_rolloff', 3000),
                    "zeroCrossingRate": data.get('zero_crossing_rate', 0.05),
                    "spectralBandwidth": data.get('spectral_bandwidth', 1500),
                    "onsetRate": data.get('onset_rate', 2.0),
                    "harmonicRatio": data.get('harmonic_ratio', 0.5),
                    "percussiveRatio": data.get('percussive_ratio', 0.5),
                    "keySignature": data.get('key_signature'),
                    "timeSignature": data.get('time_signature'),
                    "duration": data.get('duration', 0)
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
                    "genreCluster": data.get('genre_cluster', 'Unknown'),
                    "mood": data.get('mood', 'Unknown'),
                    "spectralCentroid": data.get('spectral_centroid', 1500),
                    "spectralRolloff": data.get('spectral_rolloff', 3000),
                    "zeroCrossingRate": data.get('zero_crossing_rate', 0.05),
                    "spectralBandwidth": data.get('spectral_bandwidth', 1500),
                    "onsetRate": data.get('onset_rate', 2.0),
                    "harmonicRatio": data.get('harmonic_ratio', 0.5),
                    "percussiveRatio": data.get('percussive_ratio', 0.5),
                    "keySignature": data.get('key_signature'),
                    "timeSignature": data.get('time_signature'),
                    "duration": data.get('duration', 0)
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
        # Cache Check: Before doing anything, it checks if the machine learning audio_features_cache 
        # is loaded into memory. If it isn't (e.g., if the server just restarted), it attempts to 
        # warm up the cache "lazy-loaded" style. This cache stores pre-calculated features of all 
        # known songs so the database doesn't need to be queried constantly
        if not ml_service.cache_loaded or not ml_service.audio_features_cache:
            try:
                await ml_service.startup_cache()
            except Exception as cache_err:
                console.log(f"⚠️ Lazy cache warmup failed in unified recommendations: {cache_err}")

        # Converts the incoming current_product_id to an integer safely
        current_id_str = str(request.current_product_id)
        current_id_int = 0
        try:
             current_id_int = int(current_id_str)
        except:
             pass

        # Discover Fallback: If the request came from the "Discover" page and the ID is
        # missing/invalid, it calls a helper function _resolve_discover_product_id() that 
        # searches the database for a song ID matching the preview_url.
        source_lower = (request.source or "").lower()
        if "discover" in source_lower and current_id_int <= 0:
            resolved_pid = _resolve_discover_product_id(current_id_str, request.preview_url)
            if resolved_pid > 0:
                current_id_int = resolved_pid
                current_id_str = str(resolved_pid)
                console.log(f"✅ Resolved discover ProductID from preview_url: {resolved_pid}")
             
        clean_current_id = clean_id_str(current_id_str)

        # 1. Determine or Extract Features for Target Song
        target_features = None
        cached_features = None
        
        
        # Cascading fallback system to get the audio features (tempo, energy, etc.) 
        # of the song you are currently playing.

        # PRIORITY 1: Check Cache (High Quality ML Features)
        if current_id_int != 0:          
            # Checks negative (iTunes) variants of the ID in the cache.
            neg_id = -abs(current_id_int)
            if neg_id in ml_service.audio_features_cache:
                
                # If negative id is found, it makes a copy of those features.
                cached_features = ml_service.audio_features_cache[neg_id]
            
            # Checks positive (local library) variants of the ID in the cache.
            elif abs(current_id_int) in ml_service.audio_features_cache:
                
                # If positive id is found, it makes a copy of those features.
                cached_features = ml_service.audio_features_cache[abs(current_id_int)]
             
             
        # Checks if the cached_features variable holds any data.
        if cached_features:
            
            # To avoid mutating the original data source 
            # (the application's global cache). .copy() is used to creates a new,
            # independent dictionary for  target_features so any modifications 
            # made later in this request don't corrupt the actual cached data for future users.
            target_features = cached_features.copy()
            console.log(f"✅ Using CACHED audio features for {clean_current_id} as BASE")
            
            # Checks whether the client frontend sent any real-time audio features 
            # (request.audio_features) inside the API request payload.
            if request.audio_features:
                # assigns request.audio_features to a shorter, more convenient variable name 
                # req_f to make the next few lines cleaner.
                req_f = request.audio_features
                
                # Gets the playback_rate from the live frontend features.
                # But, if playback_rate is missing or None, default to 1.0 (normal speed).
                rate = req_f.playback_rate if req_f.playback_rate else 1.0
                
                # This checks if the song is being played at a modified speed. 
                # If the rate is exactly 1.0, nothing needs to change. 
                # If it's anything else (e.g., 1.5 for 50% faster, or 0.8 for 20% slower), 
                # you enter the block.
                if rate != 1.0:
                    
                    # Gets the tempo inside target_features (falling back to a default 120 BPM if it happens to be missing). 
                    # It then multiplies that base tempo by the rate to update the target song's tempo.
                    target_features['tempo'] = target_features.get('tempo', 120) * rate


        # PRIORITY 2: Live Extraction from Preview URL (Fallback)
        # If Priorities 1 fails to find features but a URL was provided, download and extract live.
        if not target_features and request.preview_url:
            console.log(f"🔍 Extracting features for {request.source} from {request.preview_url}")
            
            # String check: If it contains "apple.com", it's an iTunes preview snippet.
            is_itunes = 'apple.com' in request.preview_url
            
            # If the snippet is from Apple, or we're in an iTunes-centric view, use synchronous threaded worker.
            if is_itunes or request.source in ['top_charts', 'similar_songs']:
                
                # Grabs the fastAPI async event loop to manage background tasks.
                loop = asyncio.get_event_loop()
                
                # Because librosa is a heavy, synchronous CPU task, offload it to a thread pool (executor) 
                # so the entire Python server doesn't freeze for other users during extraction.
                target_features = await loop.run_in_executor(
                    executor,
                    extract_audio_features_from_preview,
                    request.preview_url,
                    current_id_int
                )
            else:
                # S3 / Discover extraction: If it's a native DB song, use the specialized async generator.
                target_features = await extract_features_for_product_async(current_id_int, request.preview_url)
        
        
        # 3. Select Candidates based on Source and Request Data
        candidates = []

        # Explicit Candidates Condition: If the frontend sends an array of specific songs 
        # (e.g., the user searched for "Drake" and we only want to rank those 10 results).
        if request.candidates and len(request.candidates) > 0:
            console.log(f"✅ Using {len(request.candidates)} provided comparison songs")
            
            # Limit to 20 max: Processing audio takes ~2 seconds per song. Even multithreaded, 
            # allowing the user to send 500 songs would cause the server request to timeout.
            songs_to_process = request.candidates[:20]
            
            # This list will hold the asynchronous execution tasks.
            tasks = []
            
            for song in songs_to_process:                                                     
                # Check 1: Try to find this explicit candidate in the pre-computed Cache.
                # First, we need its tracking ID.
                tid_raw = song.trackId
                tid_res = None
                try:
                    # Safely attempt to convert string IDs like "1050" to integer 1050.
                    tid_res = int(tid_raw)
                except:
                    pass
                
                found_features = None
                if tid_res is not None:
                    # Check Negative ID: iTunes/Apple Music tracks are stored as negatives.
                    if -abs(tid_res) in ml_service.audio_features_cache:
                        found_features = ml_service.audio_features_cache[-abs(tid_res)]
                    
                    # Check Positive ID: User-uploaded DB library tracks are stored as positives.
                    elif abs(tid_res) in ml_service.audio_features_cache:
                        found_features = ml_service.audio_features_cache[abs(tid_res)]
                        
                if found_features:
                    # Cache Hit: Copy the dictionary to prevent mutating the global store.
                    safe_features = found_features.copy()
                    
                    # Wrap it as a unified dummy async task, just like we did with frontend features.
                    tasks.append(asyncio.sleep(0, result=safe_features))
                
                
                # Check 3: Not provided by frontend, and not in the cache. 
                # We must download and analyze the candidate song on-the-fly.
                elif song.previewUrl:
                    loop = asyncio.get_event_loop()
                    
                    # Queue the CPU-bound extraction into a background thread executor so it doesn't block.
                    # We append this heavy operation to our `tasks` list.
                    tasks.append(loop.run_in_executor(
                        executor, extract_audio_features_from_preview, song.previewUrl, tid_raw
                    ))
                else:
                    # If it has no features, no cache, and no usable URL, it's impossible to grade.
                    # Return a dead payload (None) so we don't crash the asyncio gatherer.
                    tasks.append(asyncio.sleep(0, result=None))
                 
                      
            # Execution Block: This single line runs all tasks in parallel simultaneously.
            if tasks:
                # return_exceptions=True means if one song fails to download, it returns the Exception string instead 
                # of throwing it and crashing the whole list of 20 successful songs.
                results = await asyncio.gather(*tasks, return_exceptions=True)
            else:
                results = []
                 
            # Iterate through the parallel task results mapped 1-to-1 with the original requested songs.
            for i, res in enumerate(results):
                 song = songs_to_process[i]
                 
                 # Self-exclusion: If the candidate song equals the song we are currently playing, skip it.
                 # The exception is 'search_component', where self-matching is perfectly fine.
                 if str(song.trackId) == clean_current_id and request.source != 'search_component':
                      continue
                      
                 # Error Handling: Check if the background task returned actual dictionary data, 
                 # or if it returned a raw Python Exception (e.g. from a 404 URL).
                 features = None
                 if isinstance(res, dict):
                      features = res
                      
                 # If extraction was successful, append the flattened normalized data to our `candidates` array.
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
                           'spectral_bandwidth': features.get('spectral_bandwidth', 1500.0),
                           'spectral_contrast_mean': features.get('spectral_contrast_mean', [0.0] * 7),
                           'rms_energy': features.get('rms_energy', 0.02),
                           'onset_rate': features.get('onset_rate', 2.0),
                           'harmonic_ratio': features.get('harmonic_ratio', 0.5),
                           'percussive_ratio': features.get('percussive_ratio', 0.5),
                           'genre_cluster': features.get('genre_cluster', ''),
                           # The `_meta` field passes along UI info (title, image) so we don't have to hit iTunes later.
                           '_meta': song 
                      })
            
        else:
            # Fallback to pure cache iteration: If no specific candidates were passed by the frontend, 
            # the engine will mathematically evaluate the target against EVERY single song loaded in the global cache.
            all_cached = ml_service.audio_features_cache.items()
            
            # Candidate Context Filtering Logic: We want to restrict the pool of songs based on where 
            # the user currently is in the app to avoid mixing "pro" Apple songs and user-uploaded library songs.
            if request.source in ['top_charts', 'similar_songs', 'search_component']:
                # The user is in an "Artist" or "Global" context. We build a fresh candidate list.
                candidates = []
                for pid, p in all_cached:
                     # For purely commercial views (TopCharts, SimilarSongs), ONLY allow Artist/iTunes Songs.
                     # Since Library songs are stored as positive DB IDs, if `pid >= 0`, we skip them.
                     if request.source in ['top_charts', 'similar_songs'] and pid >= 0:
                         continue

                     # Strict self-exclusion #1: String comparison to prevent recommending the track you are already playing.
                     if str(pid) == clean_current_id or pid == current_id_int:
                          continue
                     
                     # Strict self-exclusion #2: Handle accidental string/integer typing mismatches safely.
                     try:
                          if int(pid) == int(clean_current_id) or int(pid) == current_id_int:
                               continue
                     except: pass

                     # Strict self-exclusion #3: Handle negative/positive mapping collisions.
                     # If the DB song (ID 5) somehow shares traits with the iTunes song mapped to ID -5, skip it.
                     try:
                         if abs(int(pid)) == abs(int(clean_current_id)):
                             continue
                     except: pass

                     # If it passes all exclusions, add it to the valid pool.
                     candidates.append(p)
                     
                console.log(f"🔎 Filtered Candidates: {len(candidates)} from {len(all_cached)} cached items")

            elif request.source == 'discover_page':
                # The user is heavily browsing the user-uploaded Portfolio/Library "Discover" feed.
                candidates = []
                for pid, p in all_cached:
                    # Positive IDs ONLY: Completely block all iTunes/Apple tracks natively (pid < 0).
                    if pid > 0:
                         # Apply basic self-exclusion so the same playing track doesn't show up.
                         if str(pid) == clean_current_id or pid == current_id_int:
                              continue
                         try:
                             if int(pid) == int(clean_current_id): continue
                         except: pass
                         # Add valid Library DB tracks.
                         candidates.append(p)

                # Diagnostic alert: If the discover match pool yielded absolutely nothing.
                if not candidates:
                    console.log("⚠️ Discover candidate pool is empty (positive ProductIDs only)")
                         
            else:
                 # Catch-all: For unknown app views (e.g. Visualizers or raw debug hits), 
                 # accept both Apple & Library tracks freely, just doing a flat string self-exclusion removal.
                 candidates = [p for pid, p in all_cached if str(pid) != clean_current_id]

        console.log(f"🔎 Candidate Pool Size: {len(candidates)}")


        # 3. Calculate Similarity
        if not candidates:
             # Fast fail: If there are absolutely zero candidate tracks to process, return empty array immediately.
             return {"status": "success", "recommendations": []}

        # Initialize an empty array to track the fully validated and sanitized pool of candidate tracks.
        filtered_candidates = []
        
        # Loop through every collected candidate track from step 2 for final strict evaluation.
        for c in candidates:
            # A. Robust Self-Filtering
            # Get the candidate's ID directly from its dictionary payload.
            candidate_id_raw = c.get('id')
            
            # Initialize a flag defaulted to False indicating if the track matches the currently playing song
            is_self = False
            
            # Extract out any potential whitespace around the string ID for safe direct text comparison
            clean_candidate_id = str(candidate_id_raw).strip() if candidate_id_raw is not None else ""
            
            # String matching check: evaluate if the trimmed candidate ID matches the trimmed target ID
            if clean_candidate_id and clean_candidate_id == clean_current_id:
                is_self = True
            
            # Integer matching check: If string matching fails, we try mathematical ID comparisons
            if not is_self and candidate_id_raw is not None:
                try:
                    # Attempt to parse the raw candidate ID string into an integer format.
                    candidate_id_int = int(candidate_id_raw)
                    
                    # If integer parsing succeeded, check if the two numerical IDs match exactly.
                    if candidate_id_int == current_id_int:
                        is_self = True
                        
                    # Absolute match check: iTunes songs use negative IDs (-100), if the target is 
                    # library (100) mathematically match their absolute sizes as they refer to the same song
                    elif current_id_int != 0 and abs(candidate_id_int) == abs(current_id_int):
                         is_self = True
                except:
                    # If conversion to int fails entirely (UUID string like "absc123"), do nothing and keep is_self untouched
                    pass
            
            # If the candidate song was successfully flagged as matching the target song, don't grade it.
            if is_self:
                continue

            # B. Source Context Enforcement

            # We need to know where the recommendation request is coming from (Sidebar, Discover etc).
            # Convert the source to pure lowercase characters for consistent substring matching.
            source_lower = (request.source or '').lower()
            
            # Define words that indicate the user expects to see professional iTunes music
            artist_context_keywords = ['chart', 'similar', 'visual', 'side', 'search']
            
            # Cross-reference the user's current request location against the list to toggle artist mode True/False
            is_artist_context = any(kw in source_lower for kw in artist_context_keywords)
            
            # Explicit Override: If the request originated from the User portfolio views, firmly disable artist mode.
            if 'discover' in source_lower or 'library' in source_lower:
                is_artist_context = False

            # If the user is currently looking at an Artist view (e.g., Top Charts list).
            if is_artist_context:
                try:
                    # Retrieve the candidate track's integer ID
                    candidate_id_int = int(candidate_id_raw)
                    
                    # Positive IDs under 1,000,000 belong to User Library songs, not iTunes tracks.
                    if candidate_id_int > 0 and candidate_id_int < 1000000:
                        
                        # However, check if the song we are currently playing is ALSO a User Library song.
                        is_current_library = current_id_int > 0 and current_id_int < 1000000
                        
                        # If the currently playing song is NOT from a user library, drop the user library candidate track.
                        if not is_current_library:
                            continue # Skip Library Song
                except:
                    # UUIDs are permitted to bypass
                    pass 

            # Only candidates that have passed the is_self and source-context checks make it to the final array
            filtered_candidates.append(c)
        
        
        # Replaces the original, unfiltered list of potential matching songs with the new list 
        # (filtered_candidates) that just successfully passed the rigorous context filtering 
        # (like removing the target song itself and keeping user/iTunes boundaries where applicable)
        candidates = filtered_candidates
        console.log(f"🔎 Final Filtered Candidates: {len(candidates)} (Artist Only Filter: {is_artist_context})")

        # Checks if the strict filtering accidently removed every single candidate song. 
        # This acts as a failsafe so the server doesn't return an empty list entirely. 
        # It only triggers if the user isn't in the strict 'Discover' view
        if not candidates and request.source != 'discover_page':
            # temporary empty list to hold the fallback candidates.
            relaxed_candidates = []
            
            # Loops through the entirety of the global machine-learning cache again.
            for pid, p in ml_service.audio_features_cache.items():
                
                # Compares the sanitized ID of the current loop iteration against the target song.
                if str(pid).strip() == clean_current_id:
                    # If the track is the target song, it skips it to prevent self-recommendation.
                    continue
                
                # Adds the track to the relaxed pool. This essentially ignores all source context rules, 
                # keeping only the "do not recommend the current song" rule.
                relaxed_candidates.append(p)
                
            # Overwrites the candidates variable with this emergency backup list of songs.
            candidates = relaxed_candidates
            console.log(f"⚠️ Relaxed fallback candidate pool: {len(candidates)}")
  
        
        # A final circuit breaker if even the relaxed fallback found absolutely nothing 
        # (e.g., the cache is completely empty minus the target song).
        if not candidates:         
            # Instantly exits the endpoint, returning a valid JSON success payload but with an empty recommendations array.
            return {"status": "success", "recommendations": []}


        # Vectorization: Passes the target song's raw properties dictionary into a helper. 
        # The helper flattens all properties (tempo, energy, MFCCs, Chroma) 
        # into a single straight line array composed of 51 floating-point numbers where 
        # all ranges are scaled down strictly between 0 and 1.
        target_vector = _build_similarity_vector(target_features)
        
        # An array to hold the mathematically flattened arrays of 51 floats for the candidate songs.
        candidate_vectors = []
        
        # Parallel array to hold the full Python dictionary objects for those candidate songs
        candidate_objs = []
        
        # Iterates through the finalized pool of candidate tracks.
        for p in candidates:
            # Converts the current candidate's properties into the flattened 51-float math array.
            vec = _build_similarity_vector(p)
            
            # Stores the math array
            candidate_vectors.append(vec)
            
            # Stores the raw dictionary in exactly the same index position as the math array
            candidate_objs.append(p)
             
        if not candidate_vectors:
            return {"status": "success", "recommendations": []}

        # 4. Pure cosine similarity on manually-normalized vectors
        # Converts the target's standard Python list into a high-performance C-based NumPy matrix. 
        # The .reshape(1, -1) forces it into a 2D matrix representing 1 row and 51 columns, 
        # a strict requirement for the sklearn Cosine calculation.
        target_arr = np.array(target_vector).reshape(1, -1)
        
        # Converts the entire list of candidate arrays into a massive 2D NumPy matrix where rows are 
        # songs and columns are the 51 features.
        candidates_arr = np.array(candidate_vectors)
        
        # Uses scikit-learn to calculate the mathematical angle distance (cosine similarity)
        # between the 1 target row and all the candidate rows simultaneously. 
        # It results in a matrix of scores ranging from -1.0 (opposites) to 1.0 (identical). 
        # The [0] accesses the first (and only) row of the returned 2D calculation 
        # matrix to give us a simple 1D array of scores.
        sims = cosine_similarity(target_arr, candidates_arr)[0]
        
        
        # Prepares an empty list to assemble the final response objects
        recommendations = []
        
        # Loops through the list of raw cosine similarity scores calculated by the ML engine
        for i, score in enumerate(sims):
            
            # Uses the index i to grab the original un-flattened dictionary data for that specific candidate song
            p = candidate_objs[i]
            
            # Calculates absolute difference in BPM, caps it at 100, scales to percentage and subtracts from 1.0
            tempo_match=1.0 - min(abs(target_features.get('tempo',120) - (p.get('tempo') or 120)), 100)/100
            
            # Calculates absolute mathematical distance between target's energy and candidate's energy
            energy_match=1.0 - abs(target_features.get('energy',0.5) - (p.get('energy') or 0.5))
            
            # Calculates mood match using standard valence mapping (0.0 sad, 1.0 happy)
            mood_match=1.0 - abs(target_features.get('valence',0.5) - (p.get('valence') or 0.5))
            
            # Calculates danceability match, defaulting to 0.5 if keys are missing
            dance_match=1.0 - abs(target_features.get('danceability',0.5) - (p.get('danceability') or 0.5))

            # Compresses the cosine similarity score from [-1, 1] into a strict [0, 1] percentage band
            cosine_norm = max(0.0, min(1.0, (float(score) + 1.0) / 2.0))
            
            # Sums the 4 human-audible traits using set perceptual weights (e.g. Energy 30%, Tempo 25%)
            # This ensures high-dimensional abstract AI matches (Cosine) don't override the 
            # fact that a user just wants a musically-similar Tempo and Energy.
            core_match = (
                tempo_match * 0.25
                + energy_match * 0.30
                + mood_match * 0.20
                + dance_match * 0.25
            )
            
            # Creates an array of tuples holding Identifier, Match Score, and Contextual String tag
            matches = [
                ('tempo', tempo_match, f"Matching rhythm ({p.get('tempo', 0):.0f} BPM)"),
                ('energy', energy_match, f"Similar intensity ({p.get('energy', 0):.0%})"),
                ('mood', mood_match, f"Similar mood"),
                ('dance', dance_match, f"Comparable groove")
            ]

            # Ensure Pydantic receives a strict bool for genre_match.
            target_genre = str(target_features.get('genre') or '').strip().lower()
            cand_genre = str(p.get('genre') or '').strip().lower()
            genre_match = bool(target_genre and cand_genre and target_genre == cand_genre)

            # Also check ML genre cluster match (e.g. "Cluster 0" == "Cluster 0")
            target_cluster = str(target_features.get('genre_cluster') or '').strip().lower()
            cand_cluster = str(p.get('genre_cluster') or '').strip().lower()
            cluster_match = bool(target_cluster and cand_cluster and target_cluster == cand_cluster)

            # Include genre in the reason selection when genres match
            if genre_match:
                matches.append(('genre', 1.0, f"Same genre ({p.get('genre', '')})"))

            # Scans array and targets the tuple possessing the highest Match Score for the output reason
            best_match = max(matches, key=lambda x: x[1])
            
            # Attempts to grab textual metadata if pre-resolved and embedded in cache dictionary
            meta = p.get('_meta') 
            

            # Master algorithm: merges AI space match (45%), linear human-audible traits (55%), and genre adjustment
            blended_score = (cosine_norm * 0.45) + (core_match * 0.55)

            # Genre bonus: boost songs that share the same real genre (e.g. Electronic, Pop)
            # so that Aphex Twin songs rank higher when another Aphex Twin track is playing
            if genre_match:
                blended_score += 0.08
            # Smaller bonus for ML cluster match (catches songs the classifier groups together)
            elif cluster_match:
                blended_score += 0.04
            
            # Locks the final score into a ceiling of 0.999 and floor 0.0 to prevent glitch overflows
            blended_score = max(0.0, min(0.999, blended_score))

            # Concatenates target song id and candidate song id to create a predictable unique string
            seed_str = f"{clean_current_id}:{p.get('id', '')}"
            
            # Uses standard string hashing to generate a sub-decimal value for tie-breaking
            tie_jitter = (abs(hash(seed_str)) % 1000) / 1_000_000.0
            
            # Adds jitter bit forcing absolute math ties to have arbitrary differences so sorting isn't pure random
            blended_score = max(0.0, min(0.999, blended_score + tie_jitter))
            
            
            # Instantiates response model mapping calculation values to 3 decimal places out for readability
            result = AudioSimilarityResult(
                product_id=p['id'],
                similarity_score=round(float(blended_score), 3),
                tempo_match=round(tempo_match, 3),
                energy_match=round(energy_match, 3),
                mood_match=round(mood_match, 3),
                danceability_match=round(dance_match, 3),
                dance_match=round(dance_match, 3), 
                genre_match=genre_match,
                reason=best_match[2],
                
                # Populates the raw attributes back out so front-end debug visualizers can display them
                tempo=p.get('tempo'),
                energy=p.get('energy'),
                valence=p.get('valence'),
                danceability=p.get('danceability'),
                acousticness=p.get('acousticness'),
                instrumentalness=p.get('instrumentalness'),
                speechiness=p.get('speechiness'),
                
                # Hydrates textual names and image metadata strings if available from cache obj
                trackName=meta.trackName if meta else None,
                artistName=meta.artistName if meta else None,
                albumTitle=meta.collectionName if meta else None,
                collectionName=meta.collectionName if meta else None,
                artworkUrl100=meta.artworkUrl100 if meta else None,
                previewUrl=meta.previewUrl if meta else None
            )
            # Stores the fully calculated candidate into the list ready to ship to the user
            recommendations.append(result)
            
        # List comprehension completely deleting any tracks that mathematically dropped to 0.0 or less
        recommendations = [r for r in recommendations if r.similarity_score > 0]
            
        # Executes an in-place sort using the blended score with reverse=True pushing highest matches to index 0
        recommendations.sort(key=lambda x: x.similarity_score, reverse=True)
        
        
        # Respect client-requested limit (e.g. 150 for SimilarSongs full grid)
        limit_count = int(request.limit) if request.limit and int(request.limit) > 0 else 20
        
        # Slices array cutting off the tail end to retain only the highest matches relative to the boundary limit
        top_recommendations = recommendations[:limit_count]
        
        # 5. Hydrate Data from Database and iTunes for Cached Items
        # Tracks pulled from cache only contain math stats. We need text names and image URLs.
        # Scans tracks and aggregates ones missing a trackName into this new array for dynamic hydration
        missing_meta_ids = [r for r in top_recommendations if not r.trackName]
        
        if missing_meta_ids:
             try:
                 all_ids = []
                 for r in missing_meta_ids:
                      try:
                           all_ids.append(int(r.product_id))
                      except:
                           pass

                 # A. Hydrate from Products table for BOTH positive and negative cached IDs.
                 db_meta_map = {}
                 if all_ids:
                     unique_ids = list(dict.fromkeys(all_ids))
                     placeholders = ",".join(["%s"] * len(unique_ids))
                     with get_db_connection() as conn:
                         if conn:
                             with conn.cursor() as cursor:
                                 sql = f"""
                                    SELECT ProductID, AlbumTitle, AlbumPrice, albumCoverImageUrl, preview_url, file_url
                                    FROM Products
                                    WHERE ProductID IN ({placeholders})
                                 """
                                 cursor.execute(sql, unique_ids)
                                 rows = cursor.fetchall() or []
                                 db_meta_map = {int(row['ProductID']): row for row in rows if row.get('ProductID') is not None}

                 unresolved_itunes_abs_ids = []
                 for r in top_recommendations:
                     try:
                         pid_int = int(r.product_id)
                     except:
                         continue

                     data = db_meta_map.get(pid_int)
                     if data:
                         title = data.get('AlbumTitle')
                         if title:
                             r.trackName = title
                             r.albumTitle = title

                         if not r.artistName and pid_int > 0:
                             r.artistName = "Library Artist"

                         raw_cover = data.get('albumCoverImageUrl')
                         if raw_cover:
                             cover = generate_presigned_url(raw_cover)
                             r.artworkUrl100 = cover
                             r.albumCoverImageUrl = cover

                         raw_preview = data.get('file_url') or data.get('preview_url')
                         if raw_preview:
                             playable = generate_presigned_url(raw_preview)
                             r.previewUrl = playable
                             r.fileUrl = playable

                         if data.get('AlbumPrice') is not None:
                             r.price = float(data.get('AlbumPrice') or 0.0)
                             r.albumPrice = r.price
                     else:
                         # B. If unresolved and looks like a real iTunes track id, try Apple lookup.
                         if pid_int < 0 and abs(pid_int) >= 1_000_000:
                             unresolved_itunes_abs_ids.append(abs(pid_int))

                 if unresolved_itunes_abs_ids:
                     lookup_ids = ",".join(str(i) for i in list(dict.fromkeys(unresolved_itunes_abs_ids))[:50])
                     itunes_map = {}
                     try:
                         async with httpx.AsyncClient(timeout=5.0) as client:
                             resp = await client.get(f"{ITUNES_API_BASE_URL}/lookup", params={"id": lookup_ids})
                             if resp.status_code == 200:
                                 results = resp.json().get('results', [])
                                 for item in results:
                                     track_id = item.get('trackId')
                                     if track_id is not None:
                                         itunes_map[-int(track_id)] = item
                     except Exception as ex:
                         console.log(f"iTunes hydration failed: {ex}")

                     for r in top_recommendations:
                         try:
                             pid_int = int(r.product_id)
                         except:
                             continue

                         if pid_int < 0 and pid_int in itunes_map:
                             data = itunes_map[pid_int]
                             r.trackName = data.get('trackName')
                             r.artistName = data.get('artistName')
                             r.albumTitle = data.get('collectionName')
                             r.collectionName = data.get('collectionName')
                             r.artworkUrl100 = data.get('artworkUrl100')
                             r.previewUrl = data.get('previewUrl')

             except Exception as rx:
                 console.log(f"Error hydrating metadata: {rx}")

        # Final metadata sanitization to prevent blank visualizer cards.
        for r in top_recommendations:
            pid_int = 0
            try:
                pid_int = int(r.product_id)
            except Exception:
                pid_int = 0

            if not r.trackName:
                r.trackName = r.albumTitle or r.collectionName or f"Track {r.product_id}"
            if not r.artistName:
                r.artistName = "Library Artist" if pid_int > 0 else "Unknown Artist"
            if not r.albumTitle:
                r.albumTitle = r.collectionName or r.trackName

            # If artwork points to audio/video media, clear it so frontend fallback image is used.
            art = str(r.artworkUrl100 or "").lower()
            if art and any(ext in art for ext in [".mp3", ".wav", ".flac", ".ogg", ".mp4", ".mov", ".webm", ".m4v", ".wmv"]):
                r.artworkUrl100 = None
                try:
                    r.albumCoverImageUrl = None
                except Exception:
                    pass
        
        # Output generation: Prepare "Live" extraction features for the frontend visualizer.
        # This allows the frontend web-audio canvas to jump and react even if the actual math 
        # used High-Quality cached features.
        response_features = target_features
        if request.audio_features:
             # If we have live data from the frontend, use that as the base format for displaying
             response_features = request.audio_features.dict()
             
             # Fill any missing gaps with our calculation features (defaults or cache)
             for k, v in target_features.items():
                  if k not in response_features or response_features[k] is None:
                       response_features[k] = v
        
        # Return a final dictionary response to FastAPI representing our success JSON payload.
        return {
            "status": "success", 
            "recommendations": top_recommendations,
            "target_features": response_features
        }
            
    except Exception as e:
        # Logs fatal errors to prevent blind server crashes and issues an HTTP 500 alert.
        console.log(f"Error in unified recommendations: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

def clean_id_str(s: str) -> str:
    """Helper to handle IDs like '-123' vs '123' matching strings"""
    return s.strip()


# ============================================
# MIDI-DRIVEN TARGET RECOMMENDATIONS ENDPOINT
# ============================================

@router.post("/api/audio/midi-recommendations")
async def get_midi_recommendations(request: MidiTargetRequest):
    """
    Accept an arbitrary target feature profile (e.g. from MIDI knobs)
    and return the closest songs from the audio features cache.
    Unlike unified-recommendations this does NOT require a current song —
    the target is entirely user-defined.
    """
    try:
        if not ml_service.cache_loaded or not ml_service.audio_features_cache:
            raise HTTPException(status_code=503, detail="Audio features cache not loaded yet")

        tf = request.target_features

        # Build a synthetic target dict from MIDI knob values
        target = {
            'tempo':             float(tf.get('tempo', 0.5)) * 200,   # de-normalise to BPM
            'energy':            float(tf.get('energy', 0.5)),
            'valence':           float(tf.get('valence', 0.5)),
            'danceability':      float(tf.get('danceability', 0.5)),
            'acousticness':      float(tf.get('acousticness', 0.5)),
            'spectral_centroid': float(tf.get('spectral_centroid', 0.3)) * 5000,
            'spectral_rolloff':  float(tf.get('spectral_centroid', 0.3)) * 10000,
            'zero_crossing_rate':float(tf.get('zero_crossing_rate', 0.05)),
            'instrumentalness':  float(tf.get('instrumentalness', 0.5)),
            'loudness':          float(tf.get('loudness', 0.5)) * 60 - 60,
            'speechiness':       float(tf.get('speechiness', 0.1)),
        }

        # Use ONLY the 11 core features the MIDI knobs actually control.
        # _build_similarity_vector adds 28 extra dimensions (duration, key, time_sig,
        # 13 MFCC, 12 chroma) that are all zero/default for the MIDI target but have
        # real values for cached songs — this noise drowns out the knob signal and
        # causes every slider change to just re-order the same songs slightly.
        def _midi_vector(f: dict) -> list:
            return [
                float(f.get('tempo') if f.get('tempo') is not None else 120) / 200.0,
                float(f.get('energy') if f.get('energy') is not None else 0.5),
                float(f.get('valence') if f.get('valence') is not None else 0.5),
                float(f.get('danceability') if f.get('danceability') is not None else 0.5),
                float(f.get('acousticness') if f.get('acousticness') is not None else 0.5),
                float(f.get('spectral_centroid') if f.get('spectral_centroid') is not None else 1500.0) / 5000.0,
                float(f.get('spectral_rolloff') if f.get('spectral_rolloff') is not None else 3000.0) / 10000.0,
                float(f.get('zero_crossing_rate') if f.get('zero_crossing_rate') is not None else 0.05) * 10.0,
                float(f.get('instrumentalness') if f.get('instrumentalness') is not None else 0.5),
                float((f.get('loudness') if f.get('loudness') is not None else -60.0) + 60.0) / 60.0,
                float(f.get('speechiness') if f.get('speechiness') is not None else 0.1),
            ]

        target_vector = _midi_vector(target)

        # Gather candidates: filter to allowed_ids if provided,
        # otherwise only library songs (positive IDs < 1000)
        # and TopCharts/artist songs (negative IDs)
        allowed_set = set(request.allowed_ids) if request.allowed_ids else None
        candidate_vectors = []
        candidate_objs = []
        for pid, data in ml_service.audio_features_cache.items():
            if allowed_set is not None:
                if pid not in allowed_set:
                    continue
            elif not (pid < 0 or (0 < pid < 1000)):
                continue  # skip ephemeral/live iTunes songs with large positive IDs
            vec = _midi_vector(data)
            candidate_vectors.append(vec)
            candidate_objs.append((pid, data))

        if not candidate_vectors:
            return {"status": "success", "recommendations": [], "target_features": tf}

        target_arr = np.array(target_vector).reshape(1, -1)
        cand_arr = np.array(candidate_vectors)
        sims = cosine_similarity(target_arr, cand_arr)[0]

        scored = []
        for idx, score in enumerate(sims):
            pid, data = candidate_objs[idx]
            tempo_match = 1.0 - min(abs(target.get('tempo', 120) - (data.get('tempo') or 120)), 100) / 100
            energy_match = 1.0 - abs(target.get('energy', 0.5)  - (data.get('energy') or 0.5))
            mood_match   = 1.0 - abs(target.get('valence', 0.5) - (data.get('valence') or 0.5))
            dance_match  = 1.0 - abs(target.get('danceability', 0.5) - (data.get('danceability') or 0.5))

            matches = [
                ('tempo', tempo_match,  f"Matching rhythm ({data.get('tempo', 0):.0f} BPM)"),
                ('energy', energy_match, f"Similar intensity ({data.get('energy', 0):.0%})"),
                ('mood', mood_match,     "Similar mood"),
                ('dance', dance_match,   "Comparable groove")
            ]
            best_match = max(matches, key=lambda x: x[1])

            scored.append({
                'product_id': pid,
                'similarity_score': round(float(score), 3),
                'tempo_match': round(tempo_match, 3),
                'energy_match': round(energy_match, 3),
                'mood_match': round(mood_match, 3),
                'danceability_match': round(dance_match, 3),
                'reason': best_match[2],
                'tempo': data.get('tempo'),
                'energy': data.get('energy'),
                'valence': data.get('valence'),
                'danceability': data.get('danceability'),
                'acousticness': data.get('acousticness'),
                'genre': data.get('genre', 'Unknown'),
                'genreCluster': data.get('genre_cluster', 'Unknown'),
                'mood': data.get('mood', 'Unknown'),
            })

        scored = [s for s in scored if s['similarity_score'] > 0]
        scored.sort(key=lambda x: x['similarity_score'], reverse=True)
        top = scored[:request.limit]

        # Hydrate metadata from DB / cache
        if top:
            db_ids = [s['product_id'] for s in top if isinstance(s['product_id'], int) and s['product_id'] > 0]
            itunes_ids = [s['product_id'] for s in top if isinstance(s['product_id'], int) and s['product_id'] < 0]

            name_map = {}
            if db_ids:
                placeholders_str = ",".join(["%s"] * len(db_ids))
                with get_db_connection() as conn:
                    if conn:
                        with conn.cursor() as cursor:
                            cursor.execute(f"SELECT ProductID, AlbumTitle, albumCoverImageUrl, preview_url, file_url FROM Products WHERE ProductID IN ({placeholders_str})", db_ids)
                            for row in cursor.fetchall():
                                name_map[row['ProductID']] = row

            if itunes_ids:
                placeholders_str = ",".join(["%s"] * len(itunes_ids))
                with get_db_connection() as conn:
                    if conn:
                        with conn.cursor() as cursor:
                            cursor.execute(f"SELECT ProductID, AlbumTitle, albumCoverImageUrl, preview_url FROM Products WHERE ProductID IN ({placeholders_str})", itunes_ids)
                            for row in cursor.fetchall():
                                name_map[row['ProductID']] = row

            for s in top:
                meta = name_map.get(s['product_id'])
                if meta:
                    s['trackName'] = meta.get('AlbumTitle')
                    s['artworkUrl100'] = generate_presigned_url(meta.get('albumCoverImageUrl'))
                    raw_prev = meta.get('preview_url')
                    s['previewUrl'] = generate_presigned_url(raw_prev) if raw_prev else None
                    if meta.get('file_url'):
                        s['fileUrl'] = generate_presigned_url(meta.get('file_url'))
                    s['isLibrary'] = s['product_id'] > 0

        console.log(f"🎛️ MIDI recs: {len(top)} results for target {tf}")

        return {
            "status": "success",
            "count": len(top),
            "target_features": tf,
            "recommendations": top
        }

    except HTTPException:
        raise
    except Exception as e:
        console.log(f"Error in midi-recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _normalize_dist(values: list[float]) -> list[float]:
    if not values:
        return []
    arr = np.array([max(0.0, float(v)) for v in values], dtype=float)
    s = float(np.sum(arr))
    if s <= 1e-9:
        return [0.0 for _ in arr.tolist()]
    return (arr / s).tolist()


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    aa = np.array(a, dtype=float)
    bb = np.array(b, dtype=float)
    na = float(np.linalg.norm(aa))
    nb = float(np.linalg.norm(bb))
    if na <= 1e-9 or nb <= 1e-9:
        return 0.0
    return float(np.dot(aa, bb) / (na * nb))


def _top_indices(values: list[float], n: int = 6) -> list[int]:
    return [i for i, _ in sorted(enumerate(values), key=lambda x: x[1], reverse=True)[:n]]


def _order_agreement(a: list[int], b: list[int]) -> float:
    if not a or not b:
        return 0.0
    pos = {v: i for i, v in enumerate(b)}
    compared = 0
    in_order = 0
    for i, v in enumerate(a):
        if v not in pos:
            continue
        compared += 1
        if abs(i - pos[v]) <= 1:
            in_order += 1
    if compared == 0:
        return 0.0
    return float(in_order) / float(compared)

# Analyzes a sequence of MIDI notes played by a user and extracts structural 
# and musical features (like pitch, rhythm, tempo, and playing energy) to match against a library of songs.
def _extract_played_profile(note_events: list[dict]) -> Optional[dict]:
    
    # Checks if the input is empty or has fewer than 4 note events. If so, it returns None, 
    # as there isn't enough data to extract a meaningful musical profile.
    if not note_events or len(note_events) < 4:
        return None

    # Initializes an empty list to store successfully parsed notes.
    notes = []
    
    # loops through only the last 80 note events, ensuring the profile is built on the most recently played 
    # notes (preventing very long sessions from blurring the profile).
    for ev in note_events[-80:]:
        try:
            # Extracts the MIDI pitch number (e.g., 60 = Middle C).
            n = int(ev.get("note"))
            
            # Extracts the MIDI velocity (how hard the key was struck), defaulting to 100.
            v = int(ev.get("velocity") or 100)
            
            # Extracts the timestamp of the event, defaulting to 0.
            ts = int(ev.get("ts") or 0)
            
            # Stores this clean data in the notes list.
            notes.append({"note": n, "velocity": v, "ts": ts})
        except Exception:
            # If a key is missing or malformed, it skips it (continue).
            continue

    # if after cleaning up the malformed events 
    # we have fewer than 4 valid notes, it bails out.
    if len(notes) < 4:
        return None

    # Creates a list of 12 zeroes to count occurrences of the 12 chromatic musical notes (C, C#, D, etc.).
    pitch_hist = [0.0] * 12
    
    # Creates a list of 12 zeroes to count the musical intervals (the distance between two consecutive notes).
    interval_hist = [0.0] * 12
    
    # Initializes counters for "melodic contour" — whether the next note went higher (up), lower (down), or stayed the same (rep)
    up = down = rep = 0.0

    # Loops through the clean parsed notes.
    for i, n in enumerate(notes):
        pc = ((int(n["note"]) % 12) + 12) % 12
        pitch_hist[pc] += 1.0
        if i == 0:
            continue
        diff = int(notes[i]["note"]) - int(notes[i - 1]["note"])
        interval_hist[abs(diff) % 12] += 1.0
        if diff > 0:
            up += 1.0
        elif diff < 0:
            down += 1.0
        else:
            rep += 1.0

    # Pulls out all the velocity values and calculates their average (falling back to 90.0 if empty).
    vels = [float(n["velocity"]) for n in notes]
    avg_vel = float(np.mean(vels)) if vels else 90.0

    # iois stands for "Inter-Onset Intervals" (the time between the start of one note and the next).
    iois = []
    # Loops through the notes and calculates the time difference dt between consecutive timestamps.
    for i in range(1, len(notes)):
        # Strictly enforces a minimum difference of 1 millisecond.
        dt = max(1, int(notes[i]["ts"]) - int(notes[i - 1]["ts"]))
        iois.append(dt)
        
    # Calculates the average time between notes.
    avg_ioi = float(np.mean(iois)) if iois else 250.0
    # Converts this average millisecond gap into a 0.0 to 1.0 proxy relative to 200 BPM. 
    tempo_proxy = max(0.0, min(1.0, (60000.0 / (4.0 * avg_ioi)) / 200.0))

    # Calculates the total number of melodic movements.
    contour_total = up + down + rep
    if contour_total <= 0:
        # Uses a fallback balanced state to avoid dividing by zero if the total is 0.
        contour_vec = [0.33, 0.33, 0.34]
    else:
        # Converts the raw up, down, rep tallies into a distribution spanning 1.0.
        contour_vec = [up / contour_total, down / contour_total, rep / contour_total]

    # Passes the pitch and interval buckets into a helper function to limit their values so they sum precisely to 1.0.
    pitch_norm = _normalize_dist(pitch_hist)
    interval_norm = _normalize_dist(interval_hist)

    # Returns a dictionary packing all extracted features into a normalized standard.
    return {
        "pitch": pitch_norm, # Normalized pitch distribution
        "interval": interval_norm, # Normalized interval distribution
        "contour": contour_vec, # Melodic contour distribution (up/down/rep)
        "order": _top_indices(pitch_norm, 6), # Indicates which 6 pitches were played the most heavily
        "tempo": tempo_proxy, # The estimated 0.0-1.0 rhythmic speed
        "energy": max(0.0, min(1.0, avg_vel / 127.0)), # The average playing velocity mapped to a 0.0-1.0 score
        "note_count": len(notes), # Total clean notes processed
    }


# Converts a database/cached song's audio features into a comparable "proxy" format 
# that matches the structure of the played MIDI profile.
def _song_proxy_from_cached(data: dict) -> dict:
    # Extracts the chroma feature (12-bucket pitch class distribution) from the cached data.
    chroma = data.get("chroma_mean")
    if isinstance(chroma, str):
        # Parses the chroma feature if it's stored as a JSON string.
        chroma = _parse_json_list(chroma, 12)
    if not isinstance(chroma, list) or len(chroma) != 12:
        # Falls back to an even distribution if chroma is invalid or missing.
        chroma = [1.0 / 12.0] * 12

    # Normalizes the chroma pitch distribution so it adds up to 1.0.
    pitch = _normalize_dist([float(x) for x in chroma])

    # Retrieves the key signature index (0-11 for C, C#, etc.).
    key_idx = KEY_NAME_TO_INDEX.get(data.get("key_signature") or "", None)
    # Initializes a 12-element list with 0.0 for the key vector.
    key_vec = [0.0] * 12
    if key_idx is not None:
        # Sets the specific key index to 1.0 to represent a sharp "one-hot" encoding of the key.
        key_vec[int(key_idx)] = 1.0

    # Normalizes the tempo mapping it to a 0.0-1.0 range (relative to 200 BPM).
    tempo = max(0.0, min(1.0, float(data.get("tempo") or 120.0) / 200.0))
    # Extracts the energy feature, bounding it between 0.0 and 1.0.
    energy = max(0.0, min(1.0, float(data.get("energy") or 0.5)))

    # Pack and return the proxy profile.
    return {
        "pitch": pitch,
        "order": _top_indices(pitch, 6),
        "key_vec": key_vec,
        "key_idx": key_idx,
        "tempo": tempo,
        "energy": energy,
    }


# Calculates a score measuring how well the played notes "fit inside" the base song's musical structure.
def _score_containment(played: dict, song: dict) -> float:
    # Computes the cosine similarity between the played pitch distribution and the song's pitch distribution.
    pitch_overlap = max(0.0, min(1.0, _cosine(played["pitch"], song["pitch"])))
    
    # Starts with a neutral 0.5 score for key agreement.
    key_agree = 0.5
    if song.get("key_idx") is not None:
        # Checks how much of the played pitches fall directly into the song's root note.
        key_agree = max(0.0, min(1.0, float(played["pitch"][int(song["key_idx"])] * 2.0)))
        
    # Calculates how close the played tempo proxy is to the song's tempo proxy.
    tempo_agree = max(0.0, min(1.0, 1.0 - abs(float(played["tempo"]) - float(song["tempo"]))))
    
    # Calculates how close the played striking energy is to the song's energy.
    energy_agree = max(0.0, min(1.0, 1.0 - abs(float(played["energy"]) - float(song["energy"]))))
    
    # Returns a blended weighted final score favoring pitch matching the most.
    return max(0.0, min(1.0, (pitch_overlap * 0.55) + (key_agree * 0.2) + (tempo_agree * 0.15) + (energy_agree * 0.10)))


# Re-scores a song specifically looking for whether it uses the SAME notes but in a DIFFERENT primary order.
# This helps find good "alternative" melody matches.
def _score_diff_order(played: dict, song: dict, seed: dict) -> float:
    # Evaluates raw pitch overlap between the player and the evaluated song.
    overlap = max(0.0, min(1.0, _cosine(played["pitch"], song["pitch"])))
    
    # Checks how similar the top 6 notes of this song are to the top 6 notes of the BEST/seed match.
    seed_order_agree = max(0.0, min(1.0, _order_agreement(song["order"], seed["order"])))
    
    # Checks how similar the top 6 notes of this song are to the original played notes.
    played_order_agree = max(0.0, min(1.0, _order_agreement(song["order"], played["order"])))
    
    # Calculates an "order difference" penalty—a higher score means the order is intentionally different 
    # from both the best sequence and the direct player sequence.
    order_diff = 1.0 - ((seed_order_agree * 0.6) + (played_order_agree * 0.4))
    
    # Calculates how close the played tempo proxy is to the song's tempo proxy.
    tempo_agree = max(0.0, min(1.0, 1.0 - abs(float(played["tempo"]) - float(song["tempo"]))))
    
    # Returns a blended weighted score encouraging pitch overlap but also different note emphasis (order_diff).
    return max(0.0, min(1.0, (overlap * 0.65) + (order_diff * 0.25) + (tempo_agree * 0.10)))


def _hydrate_song_metadata(rows: list[dict]):
    if not rows:
        return
    ids = [int(r["product_id"]) for r in rows if isinstance(r.get("product_id"), int)]
    if not ids:
        return

    placeholders = ",".join(["%s"] * len(ids))
    try:
        with get_db_connection() as conn:
            if not conn:
                return
            with conn.cursor() as cursor:
                cursor.execute(
                    f"SELECT ProductID, AlbumTitle, albumCoverImageUrl, preview_url, file_url FROM Products WHERE ProductID IN ({placeholders})",
                    ids,
                )
                db_rows = cursor.fetchall() or []
    except Exception:
        return

    meta = {int(r.get("ProductID")): r for r in db_rows if r.get("ProductID") is not None}
    for item in rows:
        m = meta.get(int(item["product_id"]))
        if not m:
            continue
        item["trackName"] = m.get("AlbumTitle")
        item["artworkUrl100"] = generate_presigned_url(m.get("albumCoverImageUrl"))
        
        raw_preview = m.get("preview_url")
        item["previewUrl"] = generate_presigned_url(raw_preview) if raw_preview else None
        
        if m.get("file_url"):
            item["fileUrl"] = generate_presigned_url(m.get("file_url"))


@router.post("/api/audio/melody-finder")
async def melody_finder(request: MelodyFinderRequest):
    """Find best melody match for played notes and alternatives with reordered note emphasis."""
    try:
        if not ml_service.cache_loaded or not ml_service.audio_features_cache:
            raise HTTPException(status_code=503, detail="Audio features cache not loaded yet")

        played = _extract_played_profile([n.model_dump() for n in request.notes])
        if not played:
            return {
                "status": "success",
                "message": "Need at least 4 notes",
                "seed_match": None,
                "alternatives": [],
            }

        allowed = set(request.allowed_ids or [])
        candidates_filter = set(request.candidate_ids or [])

        scored = []
        for pid, data in ml_service.audio_features_cache.items():
            if allowed and pid not in allowed:
                continue
            if candidates_filter and pid not in candidates_filter:
                continue

            song = _song_proxy_from_cached(data)
            containment = _score_containment(played, song)
            scored.append(
                {
                    "product_id": int(pid),
                    "melody_match": round(float(containment), 3),
                    "song_proxy": song,
                }
            )

        if not scored:
            return {
                "status": "success",
                "seed_match": None,
                "alternatives": [],
            }

        scored.sort(key=lambda x: x["melody_match"], reverse=True)
        seed = scored[0]

        seed_proxy = seed["song_proxy"]
        alternatives = []
        for item in scored[1:]:
            diff_score = _score_diff_order(played, item["song_proxy"], seed_proxy)
            if diff_score < 0.35:
                continue
            alternatives.append(
                {
                    "product_id": item["product_id"],
                    "melody_match": item["melody_match"],
                    "different_order_score": round(float(diff_score), 3),
                }
            )

        alternatives.sort(key=lambda x: x["different_order_score"], reverse=True)
        alternatives = alternatives[: max(1, int(request.similar_limit))]

        seed_match = {
            "product_id": seed["product_id"],
            "melody_match": seed["melody_match"],
        }

        # Attach metadata used by frontend cards/buttons.
        hydration_rows = [seed_match, *alternatives]
        _hydrate_song_metadata(hydration_rows)

        console.log(
            f"🎼 Melody finder: notes={played.get('note_count')} seed={seed_match.get('product_id')} "
            f"score={seed_match.get('melody_match')} alternatives={len(alternatives)}"
        )

        return {
            "status": "success",
            "seed_match": seed_match,
            "alternatives": alternatives,
        }
    except HTTPException:
        raise
    except Exception as e:
        console.log(f"Error in melody-finder: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# LIBRARY MATCH ENDPOINT (Reverse Search)
# ============================================

@router.post("/api/audio/match-library", response_model=Dict)
async def match_library_songs(request: LibraryMatchRequest):
    """
    Match external comparison songs against a cached target pool.

    By default this searches the positive-ID library cache. When target_ids are supplied,
    the matcher restricts scoring to that explicit set, including imported iTunes/TopCharts
    songs whose cached ProductIDs are stored as negative IDs.
    """
    try:
        if not ml_service.cache_loaded or not ml_service.audio_features_cache:
            # Try to trigger load if empty
            await ml_service.startup_cache()
            
        # 1. Get cached target songs.
        # If target_ids are supplied, only compare against that explicit set.
        # Otherwise preserve legacy behavior and compare against positive-ID library songs.
        target_set = _expand_match_target_ids(request.target_ids)
        
        library_songs = []
        for pid, features in ml_service.audio_features_cache.items():
            try: 
                pid_int = int(pid)
                if target_set is not None:
                    if pid_int not in target_set:
                        continue
                elif pid_int <= 0:
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

            # Fast path: frontend may provide normalized audio features from unified results.
            if getattr(candidate, 'audio_features', None):
                try:
                    candidate_features = candidate.audio_features.model_dump()
                except Exception:
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

            # Build the same richer feature vector used by the main ML similarity routes.
            c_vec = _build_similarity_vector(candidate_features)
            
            best_match = None
            best_score = -1.0
            
            # Compare against all library songs
            for lib_song in library_songs:
                l_vec = _build_similarity_vector(lib_song)
                
                # Blend the full-vector cosine score with musically legible core traits,
                # matching the main recommendation pipeline more closely.
                cosine_raw = float(cosine_similarity([c_vec], [l_vec])[0][0])
                cosine_norm = max(0.0, min(1.0, (cosine_raw + 1.0) / 2.0))

                tempo_match = 1.0 - min(abs(candidate_features.get('tempo', 120) - lib_song.get('tempo', 120)), 100) / 100
                energy_match = 1.0 - abs(candidate_features.get('energy', 0.5) - lib_song.get('energy', 0.5))
                mood_match = 1.0 - abs(candidate_features.get('valence', 0.5) - lib_song.get('valence', 0.5))
                dance_match = 1.0 - abs(candidate_features.get('danceability', 0.5) - lib_song.get('danceability', 0.5))

                core_match = (
                    tempo_match * 0.25
                    + energy_match * 0.30
                    + mood_match * 0.20
                    + dance_match * 0.25
                )

                blended_score = (cosine_norm * 0.45) + (core_match * 0.55)
                blended_score = max(0.0, min(0.999, blended_score))

                seed_str = f"{candidate.trackId}:{lib_song.get('id', '')}"
                tie_jitter = (abs(hash(seed_str)) % 1000) / 1_000_000.0
                blended_score = max(0.0, min(0.999, blended_score + tie_jitter))
                
                if blended_score > best_score:
                    best_score = blended_score
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


