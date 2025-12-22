import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

/**
 * SmartRecommendationVisualizer (formerly PersonalRecommendations)
 * Displays real-time audio-based recommendations with visual similarity indicators
 */
const SmartRecommendationVisualizer = ({ 
  currentProduct, 
  audioFeatures, 
  products,
  sessionId,
  onRecommendationClick 
}) => {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hoveredRec, setHoveredRec] = useState(null);
  const lastFetchRef = useRef(0);
  const isInitialLoad = useRef(true);

  // Fetch recommendations every 5 seconds while playing
  useEffect(() => {
    if (!currentProduct || !audioFeatures || !sessionId) return;

    // Throttle: minimum 5 seconds between fetches
    const now = Date.now();
    if (now - lastFetchRef.current < 5000) {
      return;
    }

    fetchRecommendations();
    lastFetchRef.current = now;
  }, [currentProduct?.id, audioFeatures, sessionId]);

  const fetchRecommendations = async () => {
    if (!currentProduct || !audioFeatures) return;
    
    try {
      // Only show loading spinner on initial load, not refreshes
      if (isInitialLoad.current || recommendations.length === 0) {
        setLoading(true);
      }
      
      const response = await axios.post('http://localhost:5000/api/audio/realtime-recommendations', {
        current_product_id: currentProduct.id,
        audio_features: audioFeatures,
        session_id: sessionId,
        limit: 5
      });

      setRecommendations(response.data.recommendations);
      isInitialLoad.current = false;
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

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
    const product = products?.find(p => p.id === productId || p.productId === productId);
    if (!product) {
      console.warn(`Product not found for ID: ${productId}. Available IDs:`, products?.slice(0, 5).map(p => p.id || p.productId));
    }
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
      <div className="bg-gradient-to-br from-gray-900 to-black p-6 rounded-lg border border-gray-800">
        <p className="text-gray-400 text-center">Play a song to see audio-based recommendations</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-900 to-black p-6 rounded-lg border border-gray-800 shadow-xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">
          Smart Audio Recommendations
        </h2>
        <p className="text-sm text-gray-400">
          Real-time suggestions based on <span className="text-cyan-400 font-semibold">{currentProduct.albumTitle}</span>'s audio features
        </p>
      </div>

      {/* Audio Features Display */}
      {audioFeatures && (
        <div className="mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="text-base font-medium text-white mb-3">Current Track Analysis</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <FeatureBadge label="Tempo" value={`${audioFeatures.tempo} BPM`} />
            <FeatureBadge label="Energy" value={`${(audioFeatures.energy * 100).toFixed(0)}%`} />
            <FeatureBadge label="Mood" value={`${(audioFeatures.valence * 100).toFixed(0)}%`} />
            <FeatureBadge label="Dance" value={`${(audioFeatures.danceability * 100).toFixed(0)}%`} />
          </div>
        </div>
      )}

      {/* Loading State - Only show spinner if no recommendations yet */}
      {loading && recommendations.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      )}

      {/* Recommendations List - Show even while refreshing */}
      <AnimatePresence mode="sync">
        {recommendations.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {recommendations.map((rec, index) => {
              const product = getRecommendedProduct(rec.product_id);
              if (!product) return null;

              return (
                <motion.div
                  key={rec.product_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onMouseEnter={() => setHoveredRec(rec.product_id)}
                  onMouseLeave={() => setHoveredRec(null)}
                  onClick={() => onRecommendationClick?.(product)}
                  className="relative p-4 bg-gray-800/70 hover:bg-gray-700/70 rounded-lg border border-gray-700 hover:border-cyan-500 transition-all cursor-pointer group"
                >
                  {/* Similarity Score Badge */}
                  <div className="absolute top-2 right-2">
                    <div 
                      className="px-2 py-1 rounded-full text-xs font-bold"
                      style={{ 
                        backgroundColor: getMoodColor(rec.similarity_score),
                        color: 'white'
                      }}
                    >
                      {(rec.similarity_score * 100).toFixed(0)}% Match
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    {/* Album Cover */}
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 border-gray-600 group-hover:border-cyan-500 transition-colors">
                      <AlbumCover url={product.albumCoverImageUrl} title={product.albumTitle} productId={rec.product_id} />
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white font-semibold truncate group-hover:text-cyan-400 transition-colors">
                        {product.albumTitle}
                      </h4>
                      <p className="text-sm text-gray-400 mb-2">{rec.reason}</p>
                      
                      {/* Feature Matches - Always visible, updates with current features */}
                      <div className="flex gap-2 flex-wrap">
                        <MatchIndicator 
                          label="Tempo" 
                          value={rec.tempo_match} 
                        />
                        <MatchIndicator 
                          label="Energy" 
                          value={rec.energy_match} 
                        />
                        <MatchIndicator 
                          label="Mood" 
                          value={rec.mood_match} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Connection Line Animation */}
                  {hoveredRec === rec.product_id && (
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 origin-left"
                    />
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {!loading && recommendations.length === 0 && audioFeatures && (
        <div className="text-center py-8">
          <p className="text-gray-400">No similar tracks found. Keep listening!</p>
        </div>
      )}

      {/* Algorithm Info */}
      <div className="mt-4 pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-500 text-center">
          Powered by real-time audio feature similarity matching
        </p>
      </div>
    </div>
  );
};

// Helper Components
const FeatureBadge = ({ label, value }) => (
  <div className="bg-gray-700/50 px-3 py-2 rounded-lg">
    <div className="text-xs text-gray-400">{label}</div>
    <div className="text-sm font-bold text-white">{value}</div>
  </div>
);

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

const MatchIndicator = ({ label, value }) => {
  const percentage = (value * 100).toFixed(0);
  const color = value >= 0.7 ? 'bg-green-500' : value >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';
  
  return (
    <motion.div
      key={`${label}-${percentage}`}
      initial={{ opacity: 0.5, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex items-center gap-1 text-xs"
    >
      <span className="text-gray-400">{label}:</span>
      <div className={`${color} text-white px-2 py-0.5 rounded-full font-semibold`}>
        {percentage}%
      </div>
    </motion.div>
  );
};

export default SmartRecommendationVisualizer;