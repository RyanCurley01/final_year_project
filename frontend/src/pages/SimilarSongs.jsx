import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { productService } from '../redux/services';
import SongCard from '../components/SongCard';
import Loader from '../components/Loader';
import Error from '../components/Error';
import SmartRecommendationVisualizer from '../components/SmartRecommendationVisualizer';
import AudioAnalyzer from '../components/AudioAnalyzer';
import { setActiveSong, playPause } from '../redux/features/playerSlice';

const SimilarSongs = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [audioFeatures, setAudioFeatures] = useState(null);
  const [sessionId] = useState(`similar_session_${Date.now()}`);

  const dispatch = useDispatch();
  const { activeSong, isPlaying } = useSelector((state) => state.player);

  // Get audio element for analyzer
  const audioElement = typeof document !== 'undefined' ? document.querySelector('audio') : null;

  /*
  * Change this store these login detail in local storage 
  * after the login screen is implemented
  */ 
  const email = 'john.smith@store.com';
  const password = 'password';

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch products from database
        const productData = await productService.getAllProducts(email, password);
        setProducts(productData);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Handle audio features extraction
  const handleFeaturesExtracted = (features) => {
    setAudioFeatures(features);
  };

  // Handle recommendation click from visualizer
  const handleRecommendationClick = (product) => {
    const musicProducts = products.filter(p => p.albumTitle);
    const index = musicProducts.findIndex(p => p.id === product.id);
    if (index !== -1) {
      dispatch(setActiveSong({ song: musicProducts[index], data: musicProducts, i: index }));
      dispatch(playPause(true));
    }
  };

  if (loading) return <Loader title="Loading songs..." />;
  if (error) return <Error />;

  // Filter for music products only
  const music = products.filter(product => product.albumTitle);

  return (
    <div className="flex flex-col xl:flex-row gap-6">
      {/* Audio Analyzer - Headless component */}
      <AudioAnalyzer 
        audioElement={audioElement}
        onFeaturesExtracted={handleFeaturesExtracted}
        isPlaying={isPlaying}
      />

      {/* Main Content */}
      <div className="flex-1">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-bold text-3xl text-white mb-2">
            Similar Songs
          </h1>
          <p className="text-gray-400">
            Discover songs based on audio similarity - play a track to see recommendations
          </p>
        </div>

        {/* Music Section */}
        <div>
          <h2 className="font-bold text-2xl text-white mb-6">
            🎵 All Music
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {music.map((product, i) => (
              <SongCard
                key={product.id || `music-${i}`}
                product={product}
                data={music}
                i={i}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Smart Recommendations Visualizer */}
      <div className="xl:w-[400px] 2xl:w-[500px]">
        {activeSong && audioFeatures ? (
          <SmartRecommendationVisualizer 
            currentProduct={activeSong}
            audioFeatures={audioFeatures}
            products={music}
            sessionId={sessionId}
            onRecommendationClick={handleRecommendationClick}
          />
        ) : (
          <div className="bg-gradient-to-br from-gray-900 to-black p-6 rounded-lg border border-gray-800 sticky top-6">
            <div className="text-center">
              <div className="text-6xl mb-4">🎧</div>
              <h3 className="text-xl font-bold text-white mb-2">Smart Recommendations</h3>
              <p className="text-gray-400">
                Play a song to see audio-based recommendations powered by real-time analysis
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimilarSongs;
