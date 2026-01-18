import { useEffect, useState, useRef } from 'react';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { useAudioFeatures } from '../context/AudioFeaturesContext';
import placeholders from '../utils/placeholderImage';
import envConfig from '../config/environment';
import blissImage from '../assets/bliss.png';

/**
 * SmartRecommendationVisualizer (formerly PersonalRecommendations)
 * Displays real-time audio-based recommendations with visual similarity indicators
 * Now uses shared AudioFeaturesContext for audio features
 */
const SmartRecommendationVisualizer = ({ 
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
  const isInitialLoad = useRef(true);
  const intervalRef = useRef(null);
  
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

  // Reset state when current product changes
  useEffect(() => {
    setRecommendations([]); // Clear old recommendations
    setNoMatchFound(false); // Reset no match state
    isInitialLoad.current = true;
  }, [currentProduct?.id, currentProduct?.productId, currentProduct?.ProductID]);

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
      
      // Include playback rate for tempo-adjusted recommendations
      const adjustedFeatures = {
        ...features,
        effective_tempo: features.tempo ? features.tempo * rate : null,
        playback_rate: rate
      };
      
      const response = await axios.post(`${envConfig.getApiBaseUrl()}/api/audio/realtime-recommendations`, {
        current_product_id: productId,
        audio_features: adjustedFeatures,
        session_id: session,
        limit: 5,
        playback_rate: rate
      });

      const recs = response.data.recommendations || [];
      
      setRecommendations(recs);
      setNoMatchFound(recs.length === 0);
      
      isInitialLoad.current = false;
    } catch (error) {
      setNoMatchFound(true);
    } finally {
      setLoading(false);
    }
  };

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
      const features = audioFeaturesRef.current;
      const rate = playbackRateRef.current;
      
      if (!features) return;
      
      setDisplayedFeatures(features);
      setDisplayedPlaybackRate(rate);
      fetchRecommendations(currentProduct, features, rate, sessionId, forceRefresh);
    };

    // Immediate fetch
    doFetch(true);

    // Set up polling interval (3 seconds)
    intervalRef.current = setInterval(() => doFetch(false), 3000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [currentProduct?.id, currentProduct?.productId, currentProduct?.ProductID, sessionId]);

  // Calculate real-time match values based on current audio features
  const calculateLiveMatch = (recProductId) => {
    if (!audioFeatures) return null;
    
    // Find product's stored features from recommendations or estimate
    const rec = recommendations.find(r => r.product_id === recProductId);
    if (!rec) return null;

    // The rec already has match scores from the API, but we can show live features
    return {
      tempo_match: rec.tempo_match,
      energy_match: rec.energy_match,
      mood_match: rec.mood_match,
      similarity_score: rec.similarity_score
    };
  };

  const getRecommendedProduct = (productId) => {
    // Products might use 'id' or 'productId' depending on source
    // Also try matching as string in case of type mismatch
    const product = products?.find(p => 
      p.id === productId || 
      p.productId === productId ||
      p.id === String(productId) ||
      String(p.id) === String(productId)
    );
    return product;
  };

  const getMoodColor = (moodMatch) => {
    if (moodMatch >= 0.8) return '#10b981'; // green
    if (moodMatch >= 0.6) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  const getSimilarityLabel = (score) => {
    if (score >= 0.8) return 'Highly Similar';
    if (score >= 0.6) return 'Similar';
    if (score >= 0.4) return 'Somewhat Similar';
    return 'Different Vibe';
  };

  if (!currentProduct) {
    return (
      <div className="bg-gradient-to-br from-gray-900 to-black p-5 rounded-lg border border-gray-800">
        <p className="text-gray-400 text-center">Play a song to see audio-based recommendations</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800 overflow-x-hidden">
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
            
            return (
              <div className="relative w-12 h-16 flex-shrink-0">
                {isVideo ? (
                  <img 
                    src={blissImage}
                    alt="Album cover"
                    className={`w-12 h-12 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                    style={{ animationDuration: '3s' }}
                  />
                ) : (
                  <img 
                    src={coverMedia || placeholders.music}
                    alt={currentProduct.trackName || currentProduct.albumTitle}
                    className={`w-12 h-12 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                    style={{ animationDuration: '3s' }}
                    onError={(e) => { e.target.src = placeholders.music; }}
                  />
                )}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-4">
                  <div className="w-3 h-3 rounded-full bg-gray-900 border border-gray-700"></div>
                </div>
              </div>
            );
          })()}
          <div className="flex-1 min-w-0">
            <p className="text-[17px] font-semibold text-white truncate leading-tight">{currentProduct.albumTitle || currentProduct.trackName}</p>
            <p className="text-[12px] text-gray-400 truncate -mt-3">Selected Electronic Works</p>
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
            {/* Matches count */}
            <p className="text-[12px] text-gray-500 mb-2">
              {recommendations.length} {recommendations.length === 1 ? 'match' : 'matches'} • Updates 3s
            </p>
            
            {recommendations.map((rec, index) => {
              const product = getRecommendedProduct(rec.product_id);
              // Show recommendation even if product not found locally - use rec data as fallback
              const displayTitle = product?.albumTitle || `Track ID: ${rec.product_id}`;
              const displayUrl = product?.albumCoverImageUrl || null;

              return (
                <motion.div
                  key={rec.product_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onMouseEnter={() => setHoveredRec(rec.product_id)}
                  onMouseLeave={() => setHoveredRec(null)}
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
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-gray-600 group-hover:border-cyan-500 transition-colors">
                      <AlbumCover url={displayUrl} title={displayTitle} productId={rec.product_id} />
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0 pr-8">
                      <h5 className="font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">
                        {displayTitle}
                      </h5>
                      <p className="text-[12px] text-gray-400 truncate mb-1">{rec.reason}</p>
                      
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
  
  if (error || !url) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl bg-gray-700">
        🎵
      </div>
    );
  }
  
  // For videos, show a gradient placeholder instead of loading multiple video instances
  // (Chrome has cache issues with multiple video elements loading the same signed URL)
  if (url.includes('.mp4')) {
    return (
      <div className="w-full h-full bg-gradient-to-br from-cyan-600 via-purple-600 to-pink-600 flex items-center justify-center">
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

export default SmartRecommendationVisualizer;