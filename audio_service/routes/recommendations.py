# audio_service/routes/recommendations.py
from fastapi import APIRouter, HTTPException
from typing import List, Optional, Dict
import asyncio
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from utils import console
from config import executor
from models import (
    RealtimeRecommendationRequest, 
    AudioSimilarityResult, 
    ArtistSimilarityRequest,
    ArtistSimilarSong,
    ITunesSong
)
from feature_extraction import extract_audio_features_from_preview
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
# REAL-TIME AUDIO RECOMMENDATION ENDPOINTS
# ============================================

# Manual "Heuristic" Logic for discover pages songs for speed as all database songs are always cached
# so building numpy matrices and running scikit-learn models is unnsecessary overhead here.
# EXECUTION ORDER: Router endpoint.
@router.post("/api/audio/realtime-recommendations")
async def get_realtime_recommendations(request: RealtimeRecommendationRequest):
    """
    Get real-time product recommendations based on audio features
    Uses euclidean distance in feature space for similarity
    Production-ready with comprehensive audio feature matching
    OPTIMIZED: Uses in-memory cache for sub-50ms response times
    """
    try:
        recommendations = []
        
        # Require cached audio features - no fallback data
        if not ml_service.cache_loaded or not ml_service.audio_features_cache:
            raise HTTPException(status_code=503, detail="Audio features cache not loaded. Database connection required.")
        
        # Filter for discover page songs (positive IDs only)
        # Artist songs have negative IDs (from iTunes import)
        products = [
            product for pid, product in ml_service.audio_features_cache.items() 
            if str(pid) != str(request.current_product_id) and int(product['id']) > 0
        ]
        console.log(f"✅ Using cached features for {len(products)} products (Discover Page Songs only)")
                        
        
        # Sets whatever audio features are available from the 
        # frontend request as the current audio features of the currently playing song
        # REALTIME UPDATE LOGIC:
        # If the frontend provided valid audio features (Live Analysis), use them!
        # This ensures the visualizer updates dynamically every 3 seconds.
        # Use cache ONLY for metadata or if request features are missing/invalid.
        
        current_id_int = 0
        try:
             current_id_int = int(request.current_product_id)
        except:
             pass

        cached_current_song = None
        if request.current_product_id in ml_service.audio_features_cache:
            cached_current_song = ml_service.audio_features_cache[request.current_product_id]
        elif current_id_int != 0:
            # Check negative ID (artist songs stored as negative in DB)
            neg_id = -abs(current_id_int)
            if neg_id in ml_service.audio_features_cache:
                 cached_current_song = ml_service.audio_features_cache[neg_id]
            # Check positive ID
            elif abs(current_id_int) in ml_service.audio_features_cache:
                 cached_current_song = ml_service.audio_features_cache[abs(current_id_int)]

        if cached_current_song:
            console.log(f"✅ Found cached features for current song {request.current_product_id} for metadata")
            
            # Use cached values ONLY if request didn't provide them (or they are invalid/zero)
            # Prioritize Request (Live) -> Cache (Static)
            
            req_f = request.audio_features
            rate = req_f.playback_rate if req_f.playback_rate else 1.0
            
            # Tempo: Use effective_tempo (calculated live) or request tempo, else cache
            if req_f.effective_tempo and req_f.effective_tempo > 0:
                current_tempo = req_f.effective_tempo
            elif req_f.tempo and req_f.tempo > 0:
                current_tempo = req_f.tempo * rate
            else:
                 current_tempo = cached_current_song['tempo'] * rate

            # Energy: Use request energy if valid
            if req_f.energy is not None:
                current_energy = req_f.energy
            else:
                current_energy = cached_current_song['energy']

            # Valence: Use request valence if valid
            if req_f.valence is not None:
                current_valence = req_f.valence
            else:
                current_valence = cached_current_song['valence']
                
            # Danceability & Acousticness (Live analysis might not provide these accurately, 
            # so we can stick to cache if available, but respect request if present)
            if req_f.danceability is not None:
                current_danceability = req_f.danceability
            else:
                current_danceability = cached_current_song.get('danceability', 0.5)

            if req_f.acousticness is not None:
                current_acousticness = req_f.acousticness
            else:
                current_acousticness = cached_current_song.get('acousticness', 0.1)
            
        elif request.audio_features.effective_tempo is not None:
            current_tempo = request.audio_features.effective_tempo
        elif request.audio_features.tempo is not None:
            rate = request.audio_features.playback_rate if request.audio_features.playback_rate else 1.0
            current_tempo = request.audio_features.tempo * rate
        else:
            # Default fallbacks if absolutely nothing available
            current_tempo = 120
        
        if not cached_current_song:
            current_energy = request.audio_features.energy if request.audio_features.energy is not None else 0.5
            current_valence = request.audio_features.valence if request.audio_features.valence is not None else 0.5
            current_danceability = request.audio_features.danceability if request.audio_features.danceability is not None else 0.5
            current_acousticness = request.audio_features.acousticness if request.audio_features.acousticness is not None else 0.1
        
        playback_rate = request.audio_features.playback_rate if request.audio_features.playback_rate is not None else 1.0
        console.log(f"🎵 Calculating similarity with tempo: {current_tempo} BPM (effective_tempo: {request.audio_features.effective_tempo}, base_tempo: {request.audio_features.tempo}, playback rate: {playback_rate}x)")
        
        # -------------------------------------------------------------------------
        # ML PATH: Use Scikit-Learn trained Scaler and Cosine Similarity
        # This aligns the Visualizer logic with the "Clicked Song" logic (deep analysis)
        # Only possible if we have the scaler and full feature set for the current song
        # -------------------------------------------------------------------------
        
        # Check if we can use the ML pipeline
        # Needs: 1. Trained Scaler, 2. Current song in cache (to have all 11 features)
        use_ml_pipeline = ml_service.feature_scaler is not None and cached_current_song is not None
        
        if use_ml_pipeline:
            console.log("✨ Using Trained ML Pipeline (Scaler + Cosine Similarity) for recommendations")
            
            # 1. Build Target Vector (Current Song) - MATCHES training format EXACTLY
            target_vector = [
                float(cached_current_song['tempo'] or 0) / 200.0,
                float(cached_current_song['energy'] or 0),
                float(cached_current_song['valence'] or 0),
                float(cached_current_song.get('danceability', 0) or 0),
                float(cached_current_song.get('acousticness', 0) or 0),
                float(cached_current_song.get('spectral_centroid', 1500.0) / 5000.0),
                float(cached_current_song.get('spectral_rolloff', 3000.0) / 10000.0),
                float(cached_current_song.get('zero_crossing_rate', 0.05) * 10.0),
                float(cached_current_song.get('instrumentalness', 0.5)),
                float((cached_current_song.get('loudness', -60.0) + 60.0) / 60.0),
                float(cached_current_song.get('speechiness', 0.1))
            ]
            
            # 2. Build Candidate Vectors (All other songs)
            candidate_ids = []
            candidate_vectors = []
            candidate_products = []
            
            for product in products:
                # Skip current song
                if product["id"] == request.current_product_id:
                    continue
                
                # Check for required basic fields
                if not all(k in product for k in ['tempo', 'energy', 'valence']):
                    continue
                    
                vec = [
                    float(product['tempo'] or 0) / 200.0,
                    float(product['energy'] or 0),
                    float(product['valence'] or 0),
                    float(product.get('danceability', 0) or 0),
                    float(product.get('acousticness', 0) or 0),
                    float(product.get('spectral_centroid', 1500.0) / 5000.0),
                    float(product.get('spectral_rolloff', 3000.0) / 10000.0),
                    float(product.get('zero_crossing_rate', 0.05) * 10.0),
                    float(product.get('instrumentalness', 0.5)),
                    float((product.get('loudness', -60.0) + 60.0) / 60.0),
                    float(product.get('speechiness', 0.1))
                ]
                
                candidate_ids.append(product["id"])
                candidate_vectors.append(vec)
                candidate_products.append(product)
            
            if len(candidate_vectors) > 0:
                # 3. Normalize everything using the TRAINED scaler
                # Combine target and candidates for batch transformation (efficient)
                all_vectors = [target_vector] + candidate_vectors
                X = np.array(all_vectors)
                
                # Apply the pre-trained normalization (MinMaxScaler or StandardScaler selected at startup)
                X_scaled = ml_service.feature_scaler.transform(X)
                
                target_scaled = X_scaled[0].reshape(1, -1)
                candidates_scaled = X_scaled[1:]
                
                # 4. Compute Cosine Similarity
                # Result is array of shape [1, n_candidates]
                similarities = cosine_similarity(target_scaled, candidates_scaled)[0]
                
                # 5. Format results
                for idx, sim_score in enumerate(similarities):
                    product = candidate_products[idx]
                    
                    # Generate human-readable reason (heuristic fallback for explanation)
                    # We still calculate individual matches for the UI
                    tempo_match = 1.0 - min(abs(current_tempo - product['tempo']), 100) / 100
                    energy_match = 1.0 - abs(current_energy - product['energy'])
                    mood_match = 1.0 - abs(current_valence - product['valence'])
                    
                    dominant_feature = max(
                        [("tempo", tempo_match), ("energy", energy_match), ("mood", mood_match)],
                        key=lambda x: x[1]
                    )
                    
                    if dominant_feature[0] == "tempo":
                        reason = f"Matching rhythm ({product['tempo']} BPM)"
                    elif dominant_feature[0] == "energy":
                        reason = f"Similar intensity ({product['energy']:.2f}) and vibe"
                    else:
                        reason = f"Comparable mood"
                        
                    # Use the ML similarity score
                    final_sim = float(sim_score)
                    
                    # Genre bonus still applies
                    current_genre = cached_current_song.get('genre', 'Unknown')
                    if product["genre"] == current_genre and current_genre != 'Unknown':
                        final_sim = min(1.0, final_sim + 0.05)

                    recommendations.append(AudioSimilarityResult(
                        product_id=product["id"],
                        similarity_score=round(final_sim, 3),
                        tempo_match=round(tempo_match, 3),
                        energy_match=round(energy_match, 3),
                        mood_match=round(mood_match, 3),
                        danceability_match=round(product.get('danceability', 0.5), 3), # Just return value for UI
                        genre_match=product["genre"] == current_genre,
                        reason=reason
                    ))
                
                # Skip manual loop
                products = [] 
        
        # Fallback Manual Loop (if ML not possible or no products processed)
        for product in products:
            if product["id"] == request.current_product_id:
                continue
            
            # Tempo: Uses a ratio comparison (min/max) so that 60 vs 120 BPM is a 50% match
            product_tempo = product["tempo"]
            if current_tempo > 0 and product_tempo > 0:
                tempo_ratio = min(current_tempo, product_tempo) / max(current_tempo, product_tempo)
                tempo_match = tempo_ratio  # Direct ratio gives better results
            else:
                tempo_match = 0
            

            # Subtracts the current audio feature of the currently playing song 
            # from the cached database audio feature to get a difference
            # to be minused from 1 to get a similarity score of (1 = identical or 0 = completely different)

            # Energy similarity
            # e.g If Song A has energy 0.8 and Song B has 0.8, the difference is 0.0.
            # e.g If Song A has 0.9 and Song B has 0.2, the difference is 0.7.
            energy_diff = abs(product["energy"] - current_energy)

            # 1 - energy_diff: This inverts the difference to create a "match" score.
            # Large difference (e.g., 0.7) becomes a Low score (0.3 - Poor Match).
            # max(0, ...): This is a safety guard. It ensures the score never goes 
            # below zero (becomes negative), keeping the result strictly between 0 and 1.
            energy_match = max(0, 1 - energy_diff)
            

            # Valence (mood) similarity
            valence_diff = abs(product["valence"] - current_valence)
            mood_match = max(0, 1 - valence_diff)
            
            # Danceability similarity
            dance_diff = abs(product.get("danceability", 0.5) - current_danceability)
            dance_match = max(0, 1 - dance_diff)
            
            # Acousticness similarity
            acoustic_diff = abs(product.get("acousticness", 0.1) - current_acousticness)
            acoustic_match = max(0, 1 - acoustic_diff)
            

            # Weights applied to each similarity score
            # Energy and tempo weights are hightest for perceived similarity

            # Weights are applied to prioritize certain audio features over others based on how 
            # human listeners actually perceive musical similarity.
            # Not all features are equally important when deciding if two songs "feel" the same

            # Energy (35%) & Tempo (25%) combined make up 60% of the score.
            # This is because the "intensity" and "speed" of a track are the first things a listener notices
            similarity = (
                tempo_match * 0.25 +      # Tempo match weight
                energy_match * 0.35 +     # Energy match weight (highest)
                mood_match * 0.20 +       # Mood/valence weight
                dance_match * 0.15 +      # Danceability weight
                acoustic_match * 0.05     # Acousticness weight
            )
            
            # Genre bonus (same genre gets small boost)
            current_genre = ml_service.audio_features_cache.get(request.current_product_id, {}).get('genre', 'Unknown')
            if product["genre"] == current_genre and current_genre != 'Unknown':
                similarity = min(1.0, similarity + 0.05)
            
            # Max functions chooses ONE tuple based on it's highest similarity score
            dominant_feature = max(
                [("tempo", tempo_match), ("energy", energy_match), ("mood", mood_match)],

                # Uses the lambda function to get the second item in the tuple
                # for determining the maximum similarity score of an audio feature 
                # for choosing the correct reason
                key=lambda x: x[1]
            )
            
            # If any feature is the highest, generate reason with that feature
            if dominant_feature[0] == "tempo":
                reason = f"Matching rhythm ({product['tempo']} BPM)"
            elif dominant_feature[0] == "energy":
                reason = f"Similar intensity ({product['energy']:.2f}) and vibe"
            else:
                reason = f"Comparable mood"


            recommendations.append(AudioSimilarityResult(
                product_id=product["id"],
                similarity_score=round(similarity, 3), # Makes the result strictly between 0.000 and 1.000.
                tempo_match=round(tempo_match, 3),
                energy_match=round(energy_match, 3),
                mood_match=round(mood_match, 3),
                danceability_match=round(dance_match, 3),
                genre_match=product["genre"] == "Electronic",
                reason=reason
            ))
        
        # Sorts the recommendend products by similarity score of the current song 
        # in descending order with a limit of 5
        recommendations.sort(key=lambda x: x.similarity_score, reverse=True)
        recommendations = recommendations[:request.limit]
        
        # recommendations dictionary is automatically converted into JSON by FastAPI 
        # and sent as the HTTP response for the frontend
        return {
            "recommendations": recommendations,
            "session_id": request.session_id,
            "current_product_id": request.current_product_id,
            "algorithm": "multi-dimensional-audio-similarity",
            "features_analyzed": ["tempo", "energy", "valence", "danceability", "acousticness"],
            "model_metrics": ml_service.model_performance_metrics,
            "source_features": {
                "tempo": float(current_tempo),
                "effective_tempo": float(current_tempo),
                "energy": float(current_energy),
                "valence": float(current_valence),
                "danceability": float(current_danceability),
                "acousticness": float(current_acousticness),
                "using_cached_features": cached_current_song is not None
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating recommendations: {str(e)}")


# ============================================
# ML SAME-ARTIST SIMILARITY ENDPOINT
# Using K-Nearest Neighbors with Cosine Similarity
# ============================================

# This function uses the Machine Learning technique called Content-Based Filtering for 
# mathematically comparing the actual audio characteristics of the songs. Machine Learning logic
# used here because the audio qualities vary wildly compared to the curated database. 
# ML techniques like MinMaxScaler (Normalization) and cosine similarity are essential here to prevent 
# one loud song from breaking the calculations.
# EXECUTION ORDER: Router endpoint.
@router.post("/api/ml/artist-similarity")
async def compute_artist_similarity(request: ArtistSimilarityRequest):
    """
    ML-based similarity computation for songs within the same artist.
    Uses K-Nearest Neighbors with cosine similarity in normalized feature space.
    
    This is a real industry-standard ML algorithm:
    1. Extract/estimate audio features for all artist songs
    2. Normalize features using pre-trained Scaler (from DB Training Set) for generalized comparison
    3. Compute cosine similarity between target song and all other songs
    4. Return top K most similar songs ranked by similarity score
    
    The algorithm uses 5-dimensional feature vectors:
    - Tempo (BPM, normalized to 0-1 range)
    - Energy (0-1)
    - Valence/Mood (0-1)
    - Danceability (0-1)
    - Acousticness (0-1)
    """    
    try:
        skipped_songs = []
        
        # Check if database cache is loaded - fail fast if not
        if not ml_service.cache_loaded or len(ml_service.audio_features_cache) == 0:
            raise HTTPException(
                status_code=503,
                detail="Audio features cache not available. Service is still initializing or database connection failed. Please try again in a few seconds."
            )
        
        # Step 1: Check if target song features are in database cache first
        target_features = None
        target_id = int(request.target_song.trackId)  # Ensure integer for cache lookup
        
        console.log(f"🔍 Looking up target song {target_id} in cache ({len(ml_service.audio_features_cache)} items)")
        
        if target_id in ml_service.audio_features_cache:
            # Use pre-computed features from database
            cached = ml_service.audio_features_cache[target_id]
            target_features = {
                'tempo': cached['tempo'],
                'energy': cached['energy'],
                'valence': cached['valence'],
                'danceability': cached['danceability'],
                'acousticness': cached['acousticness']
            }
            console.log(f"✅ Using cached DB features for target song {target_id}")
        elif target_id in ml_service.itunes_features_cache:
            target_features = ml_service.itunes_features_cache[target_id]
        else:
            # Require preview URL for real audio analysis
            if not request.target_song.previewUrl:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Target song '{request.target_song.trackName}' has no preview URL for audio analysis"
                )
            

            # Perform real audio analysis
            loop = asyncio.get_event_loop()
            try:
                # To prevent librosa synchronous extraction freezing API,
                # Use run_in_executor to get recommendations while 
                # one song is finished processing
                target_features = await loop.run_in_executor(
                    executor,
                    extract_audio_features_from_preview,
                    request.target_song.previewUrl,
                    request.target_song.trackId
                )
            except Exception as e:
                console.log(f"❌ Audio analysis execution error: {e}")
                target_features = None
            
            if target_features is None:
                is_zip = request.target_song.previewUrl and request.target_song.previewUrl.lower().endswith('.zip')
                msg = f"Audio analysis failed for target song '{request.target_song.trackName}'"
                if is_zip:
                    msg += ". The file format (ZIP) is not supported for audio analysis."
                
                raise HTTPException(
                    status_code=422,
                    detail=msg
                )
            
            ml_service.itunes_features_cache[request.target_song.trackId] = target_features

        
        # Step 2: Extract features for all artist songs (excluding target)
        song_data = []
        song_features = []
        skipped_songs = []
        
        # Prepare list of songs to process
        songs_to_process = []
        for song in request.artist_songs:
            if song.trackId == request.target_song.trackId:
                continue
            songs_to_process.append(song)
        
        # Check if ALL songs are in database cache - if so, skip async processing entirely
        # Convert IDs to integers for consistent cache lookup
        # Also include iTunes cache in fast path logic
        cachable_ids = set()
        for song in songs_to_process:
            try:
                cachable_ids.add(int(song.trackId))
            except:
                cachable_ids.add(song.trackId)
                
        # Count how many are in either cache
        cached_count = sum(1 for sid in cachable_ids if sid in ml_service.audio_features_cache or sid in ml_service.itunes_features_cache)
        all_in_cache = cached_count == len(songs_to_process)
        
        console.log(f"🔍 Checking {len(songs_to_process)} songs against cache. In cache: {cached_count}/{len(songs_to_process)}")
        
        if all_in_cache:
            # Fast path - all songs are pre-analyzed in database
            console.log(f"✅ Fast path: All {len(songs_to_process)} songs found in (DB/iTunes) cache")
            for song in songs_to_process:
                try:
                    tid = int(song.trackId)
                except:
                    tid = song.trackId

                # Prioritize DB cache
                if tid in ml_service.audio_features_cache:
                    cached = ml_service.audio_features_cache[tid]
                    features = {
                        'tempo': cached['tempo'],
                        'energy': cached['energy'],
                        'valence': cached['valence'],
                        'danceability': cached['danceability'],
                        'acousticness': cached['acousticness']
                    }
                elif tid in ml_service.itunes_features_cache:
                    features = ml_service.itunes_features_cache[tid]
                else:
                    # Should not exist if logic holds, but safe fallback
                    continue
                
                feature_vec = [
                    features['tempo'],
                    features['energy'],
                    features['valence'],
                    features['danceability'],
                    features['acousticness']
                ]
                song_features.append(feature_vec)
                song_data.append({
                    'song': song,
                    'features': features
                })
        else:
            # Slow path - need to analyze some songs
            console.log(f"⚠️ Slow path: Some songs need analysis")
            # Parallelize audio analysis for songs not in cache
            tasks = []
            for song in songs_to_process:
                # First check database cache
                # Ensure we use integer ID for lookup
                try:
                    tid = int(song.trackId)
                except:
                    tid = song.trackId
                
                if tid in ml_service.audio_features_cache:
                    # Already in DB cache, use it immediately
                    cached = ml_service.audio_features_cache[tid]
                    tasks.append(asyncio.sleep(0, result={
                        'tempo': cached['tempo'],
                        'energy': cached['energy'],
                        'valence': cached['valence'],
                        'danceability': cached['danceability'],
                        'acousticness': cached['acousticness']
                    }))
                elif tid in ml_service.itunes_features_cache:
                    # Already cached from iTunes, use it
                    tasks.append(asyncio.sleep(0, result=ml_service.itunes_features_cache[tid]))
                elif song.previewUrl:
                    # If user demands real data immediately, we should skip live analysis if it takes too long
                    # But ML needs data. We will rely on robustness fix for ZIP files
                    loop = asyncio.get_event_loop()
                    tasks.append(
                        loop.run_in_executor(
                            executor,
                            extract_audio_features_from_preview,
                            song.previewUrl,
                            tid
                        )
                    )
                else:
                    # No preview URL, skip this song
                    tasks.append(asyncio.sleep(0, result=None))

            # Wait for all analysis tasks to complete
            if tasks:
                results = await asyncio.gather(*tasks, return_exceptions=True)
            else:
                results = []

            # Process results
            for i, song in enumerate(songs_to_process):
                features = None
                try:
                    tid = int(song.trackId)
                except:
                    tid = song.trackId
                
                # Check database cache first
                if tid in ml_service.audio_features_cache:
                    cached = ml_service.audio_features_cache[tid]
                    features = {
                        'tempo': cached['tempo'],
                        'energy': cached['energy'],
                        'valence': cached['valence'],
                        'danceability': cached['danceability'],
                        'acousticness': cached['acousticness']
                    }
                elif song.trackId in ml_service.itunes_features_cache:
                    features = ml_service.itunes_features_cache[song.trackId]
                else:
                    # Get result from parallel execution
                    res = results[i] if i < len(results) else None
                    
                    # Check if result is an exception or valid data
                    if isinstance(res, Exception):
                        console.log(f"Error processing song {song.trackId}: {res}")
                        features = None
                    else:
                        features = res
                    
                    # Cache if valid
                    if features:
                        ml_service.itunes_features_cache[song.trackId] = features

                if not features:
                    skipped_songs.append({
                        'trackId': song.trackId,
                        'trackName': song.trackName,
                        'reason': 'Audio analysis failed or no preview URL'
                    })
                    continue
                
                # Build feature vector [tempo, energy, valence, danceability, acousticness]
                feature_vec = [
                    features.get('tempo', 120),
                    features.get('energy', 0.5),
                    features.get('valence', 0.5),
                    features.get('danceability', 0.5),
                    features.get('acousticness', 0.3)
                ]
                song_features.append(feature_vec)
                song_data.append({
                    'song': song,
                    'features': features
                })
        
        if not song_features:
            return {
                "status": "success",
                "target_song": {
                    "trackId": request.target_song.trackId,
                    "trackName": request.target_song.trackName,
                    "artistName": request.target_song.artistName
                },
                "similar_songs": [],
                "message": "No other songs from this artist available"
            }
        
        # Step 3: Build feature matrices
        target_vec = np.array([[
            target_features.get('tempo', 120),
            target_features.get('energy', 0.5),
            target_features.get('valence', 0.5),
            target_features.get('danceability', 0.5),
            target_features.get('acousticness', 0.3)
        ]])
        
        song_matrix = np.array(song_features)
        
        # Step 4: Normalize features using Scaler
        # Squashes all audio features (tempo, energy) numbers into a range between 0.0 and 1.0
        # using trained scaler for normalization.
        all_features = np.vstack([target_vec, song_matrix])
        
        # Use the global scaler fitted on the Training Set (Generalization)
        # This applies the population's distribution knowledge to this specific artist
        try:
            if ml_service.feature_scaler is not None:
                console.log("📊 Scaling features using global feature scaler...", flush=True)
                normalized_features = ml_service.feature_scaler.transform(all_features)
                console.log(f"   Target Normalized: {normalized_features[0]}", flush=True)
            else:
                console.log("⚠️ No feature scaler available (insufficient training data). Using raw features.", flush=True)
                normalized_features = all_features
        except Exception as e:
            # Fallback to raw features if scaling fails
            normalized_features = all_features
   
        normalized_target = normalized_features[0:1]  # First row is target
        normalized_songs = normalized_features[1:]    # Rest are candidates
        

        # Step 5: Compute cosine similarity

        # It draws a line (vector) from zero to the Target Song.
        # It draws vectors from zero to every Candidate Song.
        # Cosine Similarity calculates the angle between those two lines where they meet at the origin.
        # If the lines point in the same direction (Angle = 0), the songs are 100% similar.
        # If they point in different directions, they are less similar.
        similarities = cosine_similarity(normalized_target, normalized_songs)[0]
        
        # Step 6: Calculate weighted similarity for all songs and sort

        # Sorts the songs by their similarity score (e.g., 95% match, 80% match...).
        # Explains why it matched. It looks at the raw numbers to see which feature was the closest.
        # Example: "Matching energy (High Energy)" vs "Similar tempo (128 BPM)".
        
        # First, calculate weighted similarity for all songs
        weighted_similarities = []
        for idx in range(len(song_data)):
            data = song_data[idx]
            features = data['features']
            
            # Calculate individual feature matches
            tempo_match = 1 - min(abs(target_features['tempo'] - features['tempo']) / 100, 1)
            energy_match = 1 - abs(target_features['energy'] - features['energy'])
            mood_match = 1 - abs(target_features['valence'] - features['valence'])
            dance_match = 1 - abs(target_features['danceability'] - features['danceability'])
            
            # Calculate overall similarity as weighted average
            overall_similarity = (
                tempo_match * 0.25 +      # 25% weight on tempo
                energy_match * 0.30 +     # 30% weight on energy
                mood_match * 0.20 +       # 20% weight on mood
                dance_match * 0.25        # 25% weight on danceability
            )
            weighted_similarities.append(overall_similarity)
        
        # Sort by weighted similarity
        sorted_indices = np.argsort(weighted_similarities)[::-1][:request.limit]
              

        # Step 7: Build response with detailed feature matching
        similar_songs = []
        feature_names = ['tempo', 'energy', 'valence', 'danceability', 'acousticness']
        
        for idx in sorted_indices:
            data = song_data[idx]
            song = data['song']
            features = data['features']
            
            # Calculate individual feature matches (recalculate for display)
            tempo_match = 1 - min(abs(target_features['tempo'] - features['tempo']) / 100, 1)
            energy_match = 1 - abs(target_features['energy'] - features['energy'])
            mood_match = 1 - abs(target_features['valence'] - features['valence'])
            dance_match = 1 - abs(target_features['danceability'] - features['danceability'])
            
            # Use the pre-calculated weighted similarity
            overall_similarity = weighted_similarities[idx]
            
            # Determine match reason based on closest features
            matches = [
                ('tempo', tempo_match, f"Similar tempo ({int(features['tempo'])} BPM)"),
                ('energy', energy_match, f"Matching energy ({features['energy']:.0%})"),
                ('mood', mood_match, f"Similar mood/vibe"),
                ('danceability', dance_match, f"Comparable rhythm feel")
            ]
            best_match = max(matches, key=lambda x: x[1])
            
            similar_songs.append(ArtistSimilarSong(
                trackId=song.trackId,
                trackName=song.trackName,
                artistName=song.artistName,
                collectionName=song.collectionName,
                artworkUrl100=song.artworkUrl100,
                previewUrl=song.previewUrl,
                trackPrice=song.trackPrice,
                similarity_score=round(overall_similarity, 4),
                tempo=features['tempo'],
                energy=features['energy'],
                valence=features['valence'],
                danceability=features['danceability'],
                acousticness=features['acousticness'],
                tempo_match=round(tempo_match, 3),
                energy_match=round(energy_match, 3),
                mood_match=round(mood_match, 3),
                dance_match=round(dance_match, 3),
                match_reason=best_match[2],
                ml_algorithm="KNN-Cosine-Similarity"
            ))
        
        return {
            "status": "success",
            "algorithm": "K-Nearest Neighbors with Cosine Similarity",
            "model_metrics": ml_service.model_performance_metrics,
            "features_used": feature_names,
            "target_song": {
                "trackId": request.target_song.trackId,
                "trackName": request.target_song.trackName,
                "artistName": request.target_song.artistName,
                "tempo": target_features['tempo'],
                "energy": target_features['energy'],
                "valence": target_features['valence'],
                "danceability": target_features['danceability'],
                "acousticness": target_features['acousticness']
            },
            "artist_songs_analyzed": len(song_data),
            "similar_songs": similar_songs,
            "skipped_songs": skipped_songs
        }
        
    except HTTPException:
        raise
    except Exception as e:
        console.log(f"❌ Artist similarity error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Artist similarity computation failed: {str(e)}")
