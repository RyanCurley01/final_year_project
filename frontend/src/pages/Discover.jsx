import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams, useNavigate } from 'react-router-dom';

import { accountService } from '../redux/services';
import { useGetAllProductsQuery } from '../redux/services/productsApi';
import SongCard from '../components/SongCard';
import Loader from '../components/Loader';
import Error from '../components/Error';
import SmartRecommendationVisualizer from '../components/SmartRecommendationVisualizer';
import { setActiveSong, playPause } from '../redux/features/playerSlice';



const Discover = () => {
  const [user, setUser] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Check for logged in user
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);

      // Check user role
      if (!['Customer', 'Employee', 'Manager'].includes(parsedUser.accountType)) {
          console.warn('Unknown account type:', parsedUser.accountType);
      }
    }
  }, [navigate]);

  // Construct auth object if user exists (Note: password usually not in localStorage, but if it is, we use it)
  // If not, we pass undefined, and the API calls public endpoint
  const auth = user?.email && user?.password ? { email: user.email, password: user.password } : undefined;

  const { data: productsData, isLoading: loading, error } = useGetAllProductsQuery(auth, {
    refetchOnMountOrArgChange: true,
  });
  
  const products = productsData || [];
  
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

  if (loading) return <Loader title="Loading products..." />;
  if (error) return <Error />;


  const music = products.filter(p => {
    const isAudio = p.fileUrl && !p.fileUrl.toLowerCase().includes('.zip');
    // Only show original store products (positive IDs), filter out imported iTunes songs (negative IDs)
    const isOriginalProduct = p.id > 0;
    return p.albumTitle && isAudio && isOriginalProduct;
  });

  // Generate a session ID for recommendations
  const sessionId = `session-${Date.now()}`;

  // In visualizer mode, show full-width visualizer
  if (viewMode === 'visualizer') {
    return (
      <div className="w-full pb-10 sm:pb-14 overflow-x-hidden">
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
            <div className="bg-linear-to-br from-gray-900 to-black p-5 rounded-lg border border-gray-800">
              <p className="text-gray-400 text-center">Play a song to see audio-based recommendations</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-10 sm:pb-14">
      <div className="mb-4 sm:mb-8">
        <h1 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-4 sm:mb-6">Music Information Store</h1>
      </div>

      <div className="mb-4 sm:mb-6">
        <h2 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-4 sm:mb-6">Welcome, {(user?.accountName?.split(' ')[0]) || user?.firstName || 'Customer'}!</h2>
        <p className="text-gray-400 text-sm sm:text-base">Explore our collection of electronic music</p>
      </div>

      {/* View Mode Buttons */}
      <div className="mb-6 flex flex-wrap gap-3">
        <button onClick={() => setViewMode('discover')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${viewMode === 'discover' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
          Discover
        </button>
        <button onClick={() => setViewMode('visualizer')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'visualizer' ? 'bg-linear-to-r from-cyan-500 to-blue-500 text-white' : 'bg-white/10 text-white hover:bg-linear-to-r hover:from-cyan-500/30 hover:to-blue-500/30'}`}>
          <span className="w-2 h-2 rounded-full bg-linear-to-r from-cyan-400 to-blue-400 animate-pulse"></span>
          Visualiser
        </button>
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
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Discover;
