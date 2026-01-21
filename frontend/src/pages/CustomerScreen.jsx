import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';

import { productService, accountService } from '../redux/services';
import SongCard from '../components/SongCard';
import Loader from '../components/Loader';
import Error from '../components/Error';
import SmartRecommendationVisualizer from '../components/SmartRecommendationVisualizer';
import { setActiveSong, playPause } from '../redux/features/playerSlice';



const CustomerScreen = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const viewMode = searchParams.get('mode') || 'discover'; // 'discover' or 'visualizer'

  const setViewMode = (mode) => {
    if (mode === 'visualizer') {
      setSearchParams({ mode: 'visualizer' });
    } else {
      setSearchParams({});
    }
  };

  const dispatch = useDispatch();
  const { activeSong, isPlaying } = useSelector((state) => state.player);

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
        
        // Fetch user account details
        const userData = await accountService.login(email, password);
        setUser(userData);
        
        // Fetch products
        const productData = await productService.getAllProducts(email, password);
        setProducts(productData);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <Loader title="Loading products..." />;
  if (error) return <Error />;


  const games = products.filter(product => product.gameTitle);
  const music = products.filter(product => product.albumTitle);

  // Generate a session ID for recommendations
  const sessionId = `session-${Date.now()}`;

  // In visualizer mode, show full-width visualizer
  if (viewMode === 'visualizer') {
    return (
      <div className="w-full overflow-x-hidden">
        {/* Back button */}
        <div className="mb-4">
          <button onClick={() => setViewMode('discover')} className="px-4 py-2 rounded-full text-sm font-medium transition-all bg-white/10 text-white hover:bg-white/20">
            ← Back to Discover
          </button>
        </div>
        
        {/* Full-width Visualizer */}
        <div className="w-full">
          {activeSong?.albumTitle ? (
            <SmartRecommendationVisualizer 
              currentProduct={activeSong}
              products={music}
              sessionId={sessionId}
              onRecommendationClick={(product) => {
                dispatch(setActiveSong({ song: product, data: music, i: music.findIndex(p => p.id === product.id) }));
                dispatch(playPause(true));
              }}
            />
          ) : (
            <div className="bg-gradient-to-br from-gray-900 to-black p-5 rounded-lg border border-gray-800">
              <p className="text-gray-400 text-center">Play a song to see audio-based recommendations</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4 sm:mb-8">
        <h1 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-4 sm:mb-6">Music Information and Multimedia Store</h1>
      </div>

      <div className="mb-4 sm:mb-6">
        <h2 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-4 sm:mb-6">Welcome, {user?.firstName || 'Customer'}!</h2>
        <p className="text-gray-400 text-sm sm:text-base">Explore our collection of games and electronic music</p>
      </div>

      {/* View Mode Buttons */}
      <div className="mb-6 flex flex-wrap gap-3">
        <button onClick={() => setViewMode('discover')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'discover' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
          Discover
        </button>
        <button onClick={() => setViewMode('visualizer')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'visualizer' ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white' : 'bg-white/10 text-white hover:bg-gradient-to-r hover:from-cyan-500/30 hover:to-blue-500/30'}`}>
          <span className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 animate-pulse"></span>
          Visualiser
        </button>
      </div>

      {/* Games Section */}
      <div className="mb-6 sm:mb-8">
        <h2 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-4 sm:mb-6">Games</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {games.map((product, i) => (
            <SongCard
              key={product.id || `game-${i}`}
              product={product}
              data={games}
              i={i}
              user={user}
              email={email}
              password={password}
            />
          ))}
        </div>
      </div>

      {/* Music Section */}
      <div>
        <h2 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-4 sm:mb-6">Music</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {music.map((product, i) => (
            <SongCard
              key={product.id || `music-${i}`}
              product={product}
              data={music}
              i={i}
              user={user}
              email={email}
              password={password}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomerScreen;
