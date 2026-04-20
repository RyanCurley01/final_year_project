import { useEffect, useState, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useAudioFeatures } from '../context/AudioFeaturesContext';
import placeholders from '../utils/placeholderImage';
import fixText from '../utils/fixText';
import envConfig from '../config/environment';
import blissImage from '../assets/bliss.png';
import OnsetImageCard from './OnsetImageCard';

const toFiniteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * DiscoverVisualizer displays real-time audio-based recommendations with visual similarity indicators
 * that uses shared AudioFeaturesContext for audio features
 */
const DiscoverVisualizer = ({ 
  currentProduct, 
  products,
  sessionId,
  onRecommendationClick 
}) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noMatchFound, setNoMatchFound] = useState(false);
  const [displayedFeatures, setDisplayedFeatures] = useState(null);
  const [displayedPlaybackRate, setDisplayedPlaybackRate] = useState(1);
  const [hoveredRec, setHoveredRec] = useState(null);
  const [cachedAudioFeatures, setCachedAudioFeatures] = useState(null);
  const isInitialLoad = useRef(true);
  const intervalRef = useRef(null);
  const lastSongIdRef = useRef(null);
  
  // Get location to detect page changes
  const location = useLocation();
  
  // Get audio features from shared context
  const { audioFeatures } = useAudioFeatures();
  
  // Get playbackRate, isPlaying, and activeSong from Redux
  const { playbackRate, isPlaying, activeSong } = useSelector((state) => state.player);
  
  // Store playbackRate in ref so interval always has latest value
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;
  
  // Store audioFeatures in ref so interval always has latest value without triggering re-renders
  const audioFeaturesRef = useRef(audioFeatures);
  audioFeaturesRef.current = audioFeatures;

  // Store cachedAudioFeatures in ref so interval always has latest value
  const cachedAudioFeaturesRef = useRef(cachedAudioFeatures);
  cachedAudioFeaturesRef.current = cachedAudioFeatures;

  // Get current song ID for comparison
  const currentSongId = activeSong?.id || activeSong?.productId || activeSong?.trackId;
  const currentSongTitle = fixText(currentProduct?.albumTitle || currentProduct?.trackName || '');

  // RECOMMENDATION VISUALIZER LOGIC:
  // Subscribes directly to `activeSong` Redux pointer. Whenever the user clicks a
  // new song across the app, this hook fires. It drops stale recommendations, shows the
  // Loader `loading: true`, and prepares to call the Audio Features context to map a radar cluster.
  // Reset state when active song changes (including from other pages)
  useEffect(() => {
    // Only reset if song actually changed
    if (currentSongId !== lastSongIdRef.current) {
      lastSongIdRef.current = currentSongId;
      setRecommendations([]); // Clear old recommendations
      setNoMatchFound(false); // Reset no match state
      setDisplayedFeatures(null); // Clear displayed features
      setLoading(true); // Show loading state
      isInitialLoad.current = true;
    }
  }, [currentSongId, location.pathname]);

  const fetchRecommendations = async (product, features, rate, session, forceRefresh = false) => {
    // Guard against undefined product or product.id
    const productId = product?.id || product?.productId || product?.ProductID;
    if (!product || !productId || !features) {
      return;
    }

    
    try {
      // Only show loading spinner on initial load (when no recommendations exist)
      if (isInitialLoad.current && recommendations.length === 0) {
        setLoading(true);
      }
      // Don't reset noMatchFound here - wait for response
      
      // Constructs a sanitized dictionary of the live-extracted client-side audio features ensuring strict numeric types
      const adjustedFeatures = {
         tempo: Number(features.tempo),
         energy: Number(features.energy),
         valence: Number(features.valence),
         danceability: Number(features.danceability),
         acousticness: Number(features.acousticness),
         // Pre-computes the perceived "effective" tempo by directly multiplying base BPM by the UI playback rate slider
         effective_tempo: features.tempo ? (Number(features.tempo) * rate) : null,
         // Sends the exact playback rate to the server so it can track user interaction states
         playback_rate: rate
      };
      

      // Initializes a default context flag routing recommendations against the entire user library
      let source = 'discover_page'; 
      
      // Evaluates current browser URL path. If in Top Charts, switches flag to enforce iTunes-only matching rules on backend
      if (location.pathname.includes('/top-charts')) source = 'top_charts';
      
      // Evaluates if user is specifically traversing the Similar Songs specific component route
      else if (location.pathname.includes('/similar-songs')) source = 'similar_songs';
      
      // Evaluates if user triggered recommendations via global Search component, keeping search-bounded context
      else if (location.pathname.includes('/search')) source = 'search_component';
      
      // Packages the structured REST payload required by the unified-recommendations FastAPI endpoint
      const payload = {
        // Injects the context flag (e.g. 'discover_page' or 'top_charts') for the strict backend evaluator loop
        source: source,
        
        // Safely converts whatever ID is playing into a guaranteed string representing the current Target 
        current_product_id: String(productId),
        
        // Chains safe fallbacks to extract the audio preview snippet URL from various possible source schemas
        preview_url: String(product.previewUrl || product.fileUrl || product.hub?.actions?.[1]?.uri || ''),
        
        // Passes the fully numerical, rate-adjusted property object for Priority 2 live-extraction fallback
        audio_features: adjustedFeatures, 
        
        // Requests exactly 5 responses to cap network payload sizes and prevent UI visual clutter
        limit: 5
      };

      console.log('[Visualizer] Sending Unified Payload:', JSON.stringify(payload, null, 2));

      const response = await axios.post(`${envConfig.getApiBaseUrl()}/api/audio/unified-recommendations`, payload);

      console.log("🎵 Backend Response (Recommendations):", response.data);
      
      if (response.data.model_metrics) {
        console.log("🧪 Model Selection Scores:", response.data.model_metrics);
      }

      // Grabs the array of recommended songs from the backend's JSON response.
      // Keep the payload untouched so the render path uses the same frontend
      // scoring flow as TopCharts and SimilarSongs.
      const recs = response.data.recommendations || [];
      
        // Reads the exact audio feature mathematical values (Tempo, Energy, etc.) 
        // the backend used as its "Target".
        // Only use backend target_features as fallback if no live features available
        const backendFeatures = response.data.target_features;

        if (backendFeatures && !audioFeaturesRef.current) {
          setDisplayedFeatures(prev => ({
            ...backendFeatures,
            using_cached: backendFeatures.using_cached_features
          }));
      }

      // Overwrites the main React state recommendations with the fresh extracted recommendations array.
      // Forces React to repaint the screen and draw the new recommendation cards.
      setRecommendations(recs);

      // If the backend returned 0 tracks, this resolves to true, switching the 
      // noMatchFound state to true and causing the UI to bring up the red 
      // "🎵❌ No Match Found" error box. If there are tracks, it resolves to false, 
      // hiding the error box.
      setNoMatchFound(recs.length === 0);
      
      // Next time the 3-second background polling interval happens, the app remembers 
      // this isn't the first load, preventing the massive screen-blocking loading spinner 
      // from interrupting the user's experience.
      isInitialLoad.current = false;

    } catch (error) {
      setNoMatchFound(true);
    } finally {
      setLoading(false);
    }
  };

  // Fetch cached audio features from the backend (REAL extracted features from AudioFeatures table)
  useEffect(() => {
    const fetchCachedFeatures = async () => {
      try {
        const audioServiceUrl = envConfig.getApiBaseUrl();
        // Fetch ALL features (both artist and discover songs) so visualizer works for everything
        const response = await fetch(`${audioServiceUrl}/api/audio/cached-features?artist_only=false`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success' && data.features) {
            // Backend returns a dictionary/object mapped by ID, use it directly
            setCachedAudioFeatures(data.features);
            console.log(`[Visualizer] Loaded ${data.count} cached audio features`);
          }
        }
      } catch (err) {
        console.warn('Could not fetch cached audio features:', err.message);
        // Mark as loaded (empty) so hooks can proceed without waiting forever.
        setCachedAudioFeatures({});
      }
    };

    fetchCachedFeatures();
  }, []); // Fetch once on mount

  // Single useEffect to handle all recommendation updates
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!currentProduct || !sessionId) {
      return;
    }

    // Get product ID (support different field names)
    const productId = currentProduct?.id || currentProduct?.productId || currentProduct?.ProductID;
    if (!productId) {
      return;
    }

    // Helper function to fetch recommendations
    const doFetch = (forceRefresh = false) => {
      const liveFeatures = audioFeaturesRef.current;
      const rate = playbackRateRef.current;
      const cachedFeatures = cachedAudioFeaturesRef.current;
      
      const songId = currentProduct?.id || currentProduct?.productId || currentProduct?.ProductID;
      console.log(`[Visualizer] doing fetch for song ${songId}.`);

      // Update displayed playback rate
      setDisplayedPlaybackRate(rate);

      // Blend displayed features: use cached (librosa) tempo for accuracy since
      // Web Audio estimates tempo from energy (inaccurate), but use LIVE
      // energy/valence/danceability so the badges update dynamically during playback.
      const songIdStr = String(songId);
      const cachedForDisplay = cachedFeatures?.[songIdStr] || cachedFeatures?.[String(-Math.abs(Number(songIdStr)))];
      if (cachedForDisplay && liveFeatures) {
        setDisplayedFeatures({
          tempo: cachedForDisplay.tempo ? Number(cachedForDisplay.tempo) : (liveFeatures.tempo ? Number(liveFeatures.tempo) : null),
          energy: liveFeatures.energy != null ? Number(liveFeatures.energy) : (cachedForDisplay.energy ? Number(cachedForDisplay.energy) : null),
          valence: liveFeatures.valence != null ? Number(liveFeatures.valence) : (cachedForDisplay.valence ? Number(cachedForDisplay.valence) : null),
          danceability: liveFeatures.danceability != null ? Number(liveFeatures.danceability) : (cachedForDisplay.danceability ? Number(cachedForDisplay.danceability) : null),
        });
      } else if (cachedForDisplay) {
        setDisplayedFeatures({
          tempo: cachedForDisplay.tempo ? Number(cachedForDisplay.tempo) : null,
          energy: cachedForDisplay.energy ? Number(cachedForDisplay.energy) : null,
          valence: cachedForDisplay.valence ? Number(cachedForDisplay.valence) : null,
          danceability: cachedForDisplay.danceability ? Number(cachedForDisplay.danceability) : null,
        });
      } else if (liveFeatures) {
        setDisplayedFeatures({
          tempo: liveFeatures.tempo ? Number(liveFeatures.tempo) : null,
          energy: liveFeatures.energy ? Number(liveFeatures.energy) : null,
          valence: liveFeatures.valence ? Number(liveFeatures.valence) : null,
          danceability: liveFeatures.danceability ? Number(liveFeatures.danceability) : null,
        });
      }

      // Determine features to send to backend for similarity scoring.
      // Prefer full cached features for stable recommendations.
      let featuresToUse = null;
      const cached = cachedFeatures?.[songIdStr] || cachedFeatures?.[String(-Math.abs(Number(songIdStr)))];

      if (cached) {
        featuresToUse = {
          ...cached,
          tempo: Number(cached.tempo),
          energy: Number(cached.energy),
          valence: Number(cached.valence),
          danceability: Number(cached.danceability),
          acousticness: Number(cached.acousticness),
          playback_rate: 1,
        };
      } else if (liveFeatures) {
        featuresToUse = {
          ...liveFeatures,
          tempo: liveFeatures.tempo ? parseFloat(liveFeatures.tempo) : null,
          energy: liveFeatures.energy ? parseFloat(liveFeatures.energy) : null,
          valence: liveFeatures.valence ? parseFloat(liveFeatures.valence) : null,
          danceability: liveFeatures.danceability ? parseFloat(liveFeatures.danceability) : null,
          acousticness: liveFeatures.acousticness ? parseFloat(liveFeatures.acousticness) : null,
          effective_tempo: liveFeatures.tempo ? (parseFloat(liveFeatures.tempo) * rate) : null,
          playback_rate: rate,
        };
      } else if (songId) {
        // Try cache one more time as absolute fallback
        const fallbackCached = cachedFeatures?.[songIdStr] || cachedFeatures?.[String(-Math.abs(songId))];
        if (fallbackCached) {
          featuresToUse = {
            ...fallbackCached,
            tempo: Number(fallbackCached.tempo),
            energy: Number(fallbackCached.energy),
            valence: Number(fallbackCached.valence),
            using_cached: true,
          };
        }
      }

      // If we have no features at all (no live, no cache), we can't do anything
      if (!featuresToUse) {
         console.log('[Visualizer] No features available to send');
         return;
      }
      
      fetchRecommendations(currentProduct, featuresToUse, rate, sessionId, forceRefresh);
    };

    // Immediate fetch if features available
    // OR if we just loaded cached features (even if live features aren't ready)
    if (audioFeaturesRef.current || (cachedAudioFeaturesRef.current && Object.keys(cachedAudioFeaturesRef.current).length > 0)) {
      doFetch(true);
    }

    // Set up polling interval (3 seconds)
    intervalRef.current = setInterval(() => doFetch(false), 3000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [currentProduct, sessionId, currentSongId, location.pathname, cachedAudioFeatures]); 

  
  // Helper function: Calculates visually responsive, live match percentages that instantly update 
  // without needing a backend refresh when the user drags the playback speed slider.
  const calculateLiveMatch = (rec) => {
    
    // Determines if we should use the confirmed backend features (displayedFeatures)
    // or fall back to the raw client-side extracted features (audioFeatures)
    const featuresToUse = displayedFeatures || audioFeatures;

    // Failsafe: If absolutely no math features are available locally, simply return 
    // the static, pre-calculated match arrays that were originally sent by the backend.
    if (!featuresToUse) {
       return {
         tempo_match: rec.tempo_match,
         energy_match: rec.energy_match,
         mood_match: rec.mood_match,
         danceability_match: rec.danceability_match || rec.dance_match,
         similarity_score: rec.similarity_score
       };
    }

    // Fetches the current playback rate multiplier from the audio state (e.g. 1.25x speed)
    const rateToUse = displayedPlaybackRate || 1;
    
    // Initializes the user's current perceived tempo, defaulting to a standard 120 BPM
    let currentTempo = 120;
    // Checks if the backend explicitly computed and provided an "effective tempo" already factored for playback rate
    if (featuresToUse.effective_tempo) {
        // Locks in the backend's effective tempo
        currentTempo = featuresToUse.effective_tempo;
    } else if (featuresToUse.tempo) {
        // If no pre-computed effective tempo, mathematically scales the base tempo by the slider's multiplier in real-time
        currentTempo = Number(featuresToUse.tempo) * rateToUse;
    }
    
    // Only recompute live percentages when the backend actually returned a full
    // candidate feature vector for this specific recommendation. Falling back to
    // shared defaults here makes every card collapse onto the same percentages.
    const targetTempo = toFiniteNumber(rec.tempo);
    const targetEnergy = toFiniteNumber(rec.energy);
    const targetValence = toFiniteNumber(rec.valence);
    const targetDanceability = toFiniteNumber(rec.danceability);
    
    // Calculates Absolute Difference: Finds exactly how many BPM apart the two tracks are currently playing
    const tempoDiff = Math.abs(targetTempo - currentTempo);
    
    // Scales the difference out of 100 BPM max, subtracts from 1.0 to formulate a match percentage, bounding at minimum 0
    const tempoMatch = Math.max(0, 1 - Math.min(tempoDiff / 100.0, 1.0));
    
    // Real-Time Energy Math: Normalizes client-side extraction energy, gets distance from candidate energy, bounding 0 to 1
    const energyMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.energy) || 0.5) - targetEnergy));
    
    // Real-Time Mood Math: Normalizes client-side valence, calculates difference from candidate valence target
    const moodMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.valence) || 0.5) - targetValence));
    
    // Real-Time Danceability Math: Calculates difference between current active rhythm constraints and candidate track groove
    const danceabilityMatch = Math.max(0, 1 - Math.abs((Number(featuresToUse.danceability) || 0.5) - targetDanceability));

    // Reconstructs the master linear scoring algorithm identically to the backend service calculation weighting
    // Tempo (25%), Energy (30%), Mood (20%), Danceability (25%) representing human-audible importance
    let score = (
      tempoMatch * 0.25 +
      energyMatch * 0.30 +
      moodMatch * 0.20 +
      danceabilityMatch * 0.25
    );
    
    // Caps the visual UI meter at a strict 99% max to prevent mathematical float overflow rendering errors
    if (score > 0.99) score = 0.99;
    
    // Returns a re-calculated metrics block that immediately overrides the React component's UI radar bars
    return {
      tempo_match: tempoMatch,
      energy_match: energyMatch,
      mood_match: moodMatch,
      danceability_match: danceabilityMatch,
      similarity_score: score
    };
  };

  // Lookup Mapping Function: Acts as the primary bridge connecting the raw mathematical IDs returned by the backend 
  // to the rich, fully-hydrated playable song objects loaded globally in the frontend's Redux "products" store.
  const getRecommendedProduct = (productId) => {
    // Scans through the massive frontend Redux array (products) attempting to locate the matching song.
    // Handles database architectural inconsistencies by checking multiple potential ID property locations 
    // and forcefully casting variables to Strings to prevent strict-equivalence (===) failures across types.
    const product = products?.find(p => 
      p.id === productId || 
      p.productId === productId ||
      p.id === String(productId) ||
      String(p.id) === String(productId)
    );
    // Returns the matched master React object containing audio URLs, images, titles, etc. (or undefined if missing).
    return product;
  };

  const getMoodColor = (moodMatch) => {
    if (moodMatch >= 0.8) return '#10b981'; // green
    if (moodMatch >= 0.6) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  if (!currentProduct) {
    return (
      <div className="bg-linear-to-br from-gray-900 to-black p-5 rounded-lg border border-gray-800">
        <p className="text-gray-400 text-center">Play a song to see audio-based recommendations</p>
      </div>
    );
  }

  return (
    <div className="bg-linear-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800 overflow-x-hidden">
      {/* Header */}
      <div className="mb-3">
        <h5 className="text-sm font-bold text-white mb-1">Smart Audio Recommendations</h5>
        <p className="text-[12px] text-gray-400 leading-tight">
          Based on <span className="text-cyan-400 font-semibold truncate">{currentProduct.albumTitle}</span>
        </p>
      </div>
      
      {/* Current Track Analysis */}
      <div className="mb-3 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="flex items-center gap-2 mb-2">
          {/* Spinning Album Cover */}
          {(() => {
            const coverMedia = currentProduct.albumCoverImageUrl || currentProduct.artworkUrl100?.replace('100x100', '200x200');
            const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
            const prodIsLibrary = (currentProduct?.source === 'database') || (Number(currentProduct?.id) > 0 && Number(currentProduct?.id) < 1000000);
            const hasValidImage = coverMedia && !isVideo;
            const useCloudCover = isVideo || (prodIsLibrary && !hasValidImage);
            
            return (
              <div className="relative w-12 h-16 shrink-0">
                <img 
                  key={useCloudCover ? `cloud-${currentProduct.id}` : (coverMedia || 'no-cover')}
                  src={useCloudCover ? '/cloud-cover.webp' : (coverMedia || placeholders.music)}
                  alt={currentProduct.trackName || currentProduct.albumTitle}
                  className={`w-12 h-12 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                  style={{ animationDuration: '3s' }}
                  onError={(e) => { e.target.src = placeholders.music; }}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-4">
                  <div className="w-3 h-3 rounded-full bg-gray-900 border border-gray-700"></div>
                </div>
              </div>
            );
          })()}
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-semibold text-white truncate leading-tight">{currentSongTitle}</p>
            <p className="text-[12px] text-gray-400 truncate -mt-3">{currentProduct?.artistName && currentProduct.artistName !== 'Unknown Artist' ? currentProduct.artistName : (currentProduct?.albumTitle || 'Selected Electronic Works')}</p>
          </div>
          {isPlaying && (
            <div className="flex gap-0.5">
              <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
              <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
            </div>
          )}
        </div>

        {/* Audio Feature Badges */}
        {displayedFeatures && (
          <div className="grid grid-cols-4 gap-1">
            <FeatureBadge label="Tempo" value={`${Math.round((displayedFeatures.tempo || 0) * (displayedPlaybackRate || 1))}`} />
            <FeatureBadge label="Energy" value={`${Math.round((displayedFeatures.energy || 0) * 100)}%`} />
            <FeatureBadge label="Mood" value={`${Math.round((displayedFeatures.valence || 0) * 100)}%`} />
            <FeatureBadge label="Dance" value={`${Math.round((displayedFeatures.danceability || 0) * 100)}%`} />
          </div>
        )}
        
        {!displayedFeatures && (
          <p className="text-[12px] text-gray-500 text-center">Analyzing audio features...</p>
        )}
        
        {displayedPlaybackRate && displayedPlaybackRate !== 1.0 && currentProduct && (activeSong?.albumTitle === currentProduct.albumTitle || activeSong?.id === currentProduct.id) && (
          <p className="text-[12px] text-yellow-400 mt-2">
            ⚡ Tempo adjusted for {displayedPlaybackRate.toFixed(2)}x speed
          </p>
        )}
      </div>

      {/* Loading State - Only show spinner if no recommendations yet */}
      {loading && recommendations.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      )}

      {/* No Match Found State */}
      {!loading && noMatchFound && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 bg-red-900/30 border border-red-500/50 rounded-lg text-center"
        >
          <div className="text-4xl mb-3">🎵❌</div>
          <h3 className="text-[12px] font-bold text-red-400 mb-2">No Match Found</h3>
          <p className="text-gray-400 text-[12px]">
            {(audioFeatures?.tempo * playbackRate < 40 || audioFeatures?.tempo * playbackRate > 300) ? (
              <>Tempo {Math.round(audioFeatures?.tempo * playbackRate)} BPM is outside realistic range (40-300 BPM). Adjust the playback speed.</>
            ) : recommendations.length === 0 ? (
              <>No songs in the library have matching audio features.</>
            ) : (
              <>All available songs have very low similarity (below 15%). No close matches found.</>
            )}
          </p>
          <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
            <p className="text-[12px] text-gray-500">
              Current features: Tempo <span className={audioFeatures?.tempo * playbackRate < 40 || audioFeatures?.tempo * playbackRate > 300 ? 'text-red-400 font-bold' : ''}>{Math.round(audioFeatures?.tempo * playbackRate || 0)} BPM</span>, 
              Energy {Math.min(100, Math.max(0, ((audioFeatures?.energy || 0) * 100 * (playbackRate > 1 ? 1 + (playbackRate - 1) * 0.2 : 1 - (1 - playbackRate) * 0.1)))).toFixed(0)}%, 
              Mood {Math.min(100, Math.max(0, ((audioFeatures?.valence || 0) * 100 * (playbackRate > 1 ? 1 + (playbackRate - 1) * 0.15 : 1 - (1 - playbackRate) * 0.25)))).toFixed(0)}%
            </p>
          </div>
        </motion.div>
      )}

      {/* Recommendations List - Show only when matches found */}
      <AnimatePresence mode="sync">
        {!noMatchFound && recommendations.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2 overflow-x-hidden"
          >          
            {recommendations
            .map(rec => {
              const liveMatch = calculateLiveMatch(rec);

              return {
                ...rec,
                similarity_score: liveMatch ? liveMatch.similarity_score : rec.similarity_score,
                tempo_match: liveMatch ? liveMatch.tempo_match : rec.tempo_match,
                energy_match: liveMatch ? liveMatch.energy_match : rec.energy_match,
                mood_match: liveMatch ? liveMatch.mood_match : rec.mood_match,
                danceability_match: liveMatch ? liveMatch.danceability_match : (rec.danceability_match || rec.dance_match)
              };
            })
            .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0))
            // 2nd Map: The actual visual rendering loop for the UI cards mapping backend IDs to frontend components
            .map((rec, index) => {
              
              // 1. EXECUTE MAPPING: Feeds the backend math ID (rec.product_id) into our specific lookup function
              const product = getRecommendedProduct(rec.product_id);
              
              // 2. FALLBACK RESOLUTION: 
              // If the frontend store found the song, grab its rich title.
              // If it could not find it (maybe an iTunes track not loaded), gracefully fallback to the ID string.
              const displayTitle = fixText(rec.trackName || rec.albumTitle || product?.albumTitle || `Track ID: ${rec.product_id}`);
              
              // Resolve cover art from multiple sources: product store, then backend rec fields
              const rawCoverUrl = product?.albumCoverImageUrl
                || product?.artworkUrl100?.replace('100x100', '200x200')
                || product?.imageUrl
                || product?.image
                || rec.artworkUrl100?.replace('100x100', '200x200')
                || rec.albumCoverImageUrl
                || null;
              // Library songs (low positive IDs) without a usable image should show the music icon gradient
              const isLibrarySong = rec.product_id > 0 && rec.product_id < 1000000;
              const isBadUrl = rawCoverUrl && /\.(mp4|m4v|mov|webm|wmv|wav|mp3|flac|ogg)(\?|$)/i.test(rawCoverUrl);
              const displayUrl = (isLibrarySong && (!rawCoverUrl || isBadUrl)) ? 'library' : rawCoverUrl;

              return (
                // 3. APPLY TO UI: Generates the actual visual Framer Motion card wrapper
                <motion.div
                  key={rec.product_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onMouseEnter={() => setHoveredRec(rec.product_id)}
                  onMouseLeave={() => setHoveredRec(null)}
                  // INTERACTION TRIGGER: Checks if the product mapping was actually successful (product &&). 
                  // If true, passes the full, rich frontend object up to the parent component to command the Redux audio player.
                  onClick={() => product && onRecommendationClick?.(product)}
                  className="relative p-2 bg-gray-800/70 hover:bg-gray-700/70 rounded-lg border border-gray-700 hover:border-cyan-500 transition-all cursor-pointer group"
                >
                  {/* Similarity Score Badge */}
                  <div className="absolute top-1 right-1">
                    <div 
                      className="px-2.5 py-0.5 rounded-full text-[12px] font-bold"
                      style={{ 
                        backgroundColor: getMoodColor(rec.similarity_score),
                        color: 'white'
                      }}
                    >
                      {(rec.similarity_score * 100).toFixed(0)}%
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    {/* Album Cover */}
                    <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-gray-600 group-hover:border-cyan-500 transition-colors">
                      <AlbumCover url={displayUrl} title={displayTitle} productId={rec.product_id} />
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0 pr-8">
                      <h5 className="font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">
                        {displayTitle}
                      </h5>
                      <p className="text-[12px] text-gray-400 truncate mb-1">{rec.reason || rec.match_reason}</p>
                      
                      {/* Feature Matches */}
                      <div className="flex gap-1 flex-wrap">
                        <span className={`px-1 py-0.5 rounded text-[12px] ${
                          (rec.tempo_match || 0) >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                          (rec.tempo_match || 0) >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                          'bg-red-500/30 text-red-300'
                        }`}>Tempo:{(rec.tempo_match * 100).toFixed(0)}%</span>
                        <span className={`px-1 py-0.5 rounded text-[12px] ${
                          (rec.energy_match || 0) >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                          (rec.energy_match || 0) >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                          'bg-red-500/30 text-red-300'
                        }`}>Energy:{(rec.energy_match * 100).toFixed(0)}%</span>
                        <span className={`px-1 py-0.5 rounded text-[12px] ${
                          (rec.mood_match || 0) >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                          (rec.mood_match || 0) >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                          'bg-red-500/30 text-red-300'
                        }`}>Mood:{(rec.mood_match * 100).toFixed(0)}%</span>
                        <span className={`px-1 py-0.5 rounded text-[12px] ${
                          (rec.danceability_match || 0) >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                          (rec.danceability_match || 0) >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                          'bg-red-500/30 text-red-300'
                        }`}>Danceability:{((rec.danceability_match || 0) * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* No matches state */}
      {!loading && recommendations.length === 0 && audioFeatures && (
        <div className="text-center py-6">
          <p className="text-gray-400 text-sm">Finding similar artist tracks...</p>
          <p className="text-xs text-gray-500 mt-2">Analyzing audio features</p>
        </div>
      )}
    </div>
  );
};

  // Helper function for mood-based colors
  const getFeatureColor = (label, value) => {
    // Extract numeric value from string like "120 BPM" or "75%"
    const numericValue = parseInt(value);
    
    if (label === 'Tempo') {
      // Tempo coloring: slow (blue), medium (green), fast (red)
      if (numericValue < 90) return { bg: 'bg-blue-900/50', text: 'text-blue-300', border: 'border-blue-500/50' };
      if (numericValue < 130) return { bg: 'bg-green-900/50', text: 'text-green-300', border: 'border-green-500/50' };
      return { bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-500/50' };
    }
    
    // Percentage-based features (Energy, Mood, Dance) - same thresholds as match indicators
    if (numericValue >= 70) return { bg: 'bg-green-900/50', text: 'text-green-300', border: 'border-green-500/50' };
    if (numericValue >= 50) return { bg: 'bg-yellow-900/50', text: 'text-yellow-300', border: 'border-yellow-500/50' };
    return { bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-500/50' };
  };

  // Helper Components
  const FeatureBadge = ({ label, value, isAdjusted = false }) => {
  const colors = getFeatureColor(label, value);
  
  return (
    <motion.div 
      key={`${label}-${value}`}
      initial={{ scale: 0.9, opacity: 0.5 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`px-1 py-1 rounded text-center border ${colors.bg} ${colors.border}`}
    >
      <div className="text-[12px] text-gray-400 leading-tight">{label}</div>
      <div className={`text-[12px] font-bold leading-tight ${colors.text}`}>
        {value}
        {isAdjusted && <span className="text-cyan-500 ml-0.5">⚡</span>}
      </div>
    </motion.div>
  );
};

const AlbumCover = ({ url, title, productId }) => {
  const [error, setError] = useState(false);
  
  // Library songs or video URLs: show purple/pink gradient music note
  if (!url || url === 'library' || error || (url && /\.(mp4|m4v|mov|webm|wmv|wav|mp3|flac|ogg)(\?|$)/i.test(url))) {
    return (
      <div className="w-full h-full bg-linear-to-br from-cyan-600 via-purple-600 to-pink-600 flex items-center justify-center">
        <svg className="w-8 h-8 text-blue-900" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
        </svg>
      </div>
    );
  }
  
  return (
    <img 
      src={url} 
      alt={title}
      className="w-full h-full object-cover"
      onError={() => setError(true)}
    />
  );
};

export default DiscoverVisualizer;