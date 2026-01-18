import { useSelector, useDispatch } from 'react-redux';
import { Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

import { Searchbar, Sidebar, MusicPlayer, TopPlay } from './components';
import { ArtistDetails, CustomerScreen, Search, SongDetails, TopCharts, SimilarSongs } from './pages';
import Cart from './pages/Cart';
import PurchaseHistory from './pages/PurchaseHistory';
import SmartRecommendationVisualizer from './components/SmartRecommendationVisualizer';
import { VideoModalProvider, useVideoModal } from './context/VideoModalContext';
import { AudioFeaturesProvider } from './context/AudioFeaturesContext';
import VideoModal from './components/VideoModal';
import { productService } from './redux/services';
import { setActiveSong, playPause as playPauseAction } from './redux/features/playerSlice';

const AppContent = () => {
  const { activeSong, isPlaying } = useSelector((state) => state.player);
  const { modalState, closeModal } = useVideoModal();
  const dispatch = useDispatch();
  const location = useLocation();
  const [sessionId] = useState(`session_${Date.now()}`);
  const [products, setProducts] = useState([]);
  
  // Authentication credentials (hardcoded for demo)
  const email = 'john.smith@store.com';
  const password = 'password';
  const user = { accountId: 1, email }; // Mock user object

  // Fetch products for recommendations
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const productData = await productService.getAllProducts(email, password);
        setProducts(productData);
      } catch (error) {
        // Error fetching products
      }
    };

    fetchProducts();
  }, []);

  // Handle recommendation click
  const handleRecommendationClick = (product) => {
    const music = products.filter(p => p.albumTitle);
    const index = music.findIndex(p => p.id === product.id);
    
    if (index !== -1) {
      dispatch(setActiveSong({ song: product, data: music, i: index }));
      dispatch(playPauseAction(true));
    }
  };

  const musicProducts = products.filter(product => product.albumTitle);

  return (
    <div className="relative flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col bg-gradient-to-br from-[#041529] to-[#2970c2] overflow-hidden">
        <div className={`px-6 flex flex-col lg:flex-row ${(activeSong?.albumTitle || activeSong?.gameTitle) ? 'h-[calc(100vh-7rem)]' : 'h-screen'} overflow-y-auto`}>
          <div className="flex-1 pb-4">
            <Searchbar />

            <Routes>
              <Route path="/" element={<CustomerScreen />} />
              <Route path="/top-charts" element={<TopCharts />} />
              <Route path="/similar-songs" element={<SimilarSongs />} />
              <Route path="/artists/:id" element={<ArtistDetails />} />
              <Route path="/songs/:songid" element={<SongDetails />} />
              <Route path="/search/:searchTerm" element={<Search />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/purchase-history" element={<PurchaseHistory />} />
              {/* Catch-all route for removed/invalid paths */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            
            {/* Mobile Visualizer - at bottom of content on mobile only */}
            {location.pathname === '/' && (
              <div className="lg:hidden mt-6 pb-4">
                {/* TopPlay - hidden in visualizer mode */}
                {!location.search.includes('mode=visualizer') && (
                <div className="mb-4">
                  <TopPlay />
                </div>
                )}
                {/* Visualizer */}
                <div className="mb-4">
                  {activeSong?.albumTitle ? (
                    <SmartRecommendationVisualizer 
                      currentProduct={activeSong}
                      products={musicProducts}
                      sessionId={sessionId}
                      onRecommendationClick={handleRecommendationClick}
                    />
                  ) : (
                    <div className="bg-gradient-to-br from-gray-900 to-black p-5 rounded-lg border border-gray-800">
                      <p className="text-gray-400 text-center">Play a song to see audio-based recommendations</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Right Sidebar - TopPlay + Visualizer - only on home page, desktop only */}
          {location.pathname === '/' && (
            <>
              {/* Spacer for fixed sidebar - desktop only */}
              <div className="hidden lg:block w-[390px] min-w-[390px]"></div>
              
              {/* Fixed sidebar - desktop only */}
              <div className={`hidden lg:block fixed top-0 right-0 w-[390px] min-w-[390px] ${(activeSong?.albumTitle || activeSong?.gameTitle) ? 'h-[calc(100vh-7rem)]' : 'h-screen'} overflow-y-auto hide-scrollbar z-40 px-4 pt-4 pb-8`}>
                {/* TopPlay - hidden in visualizer mode */}
                {!location.search.includes('mode=visualizer') && (
                <div className="mb-4">
                  <TopPlay />
                </div>
                )}
                {/* Visualizer */}
                <div className="mb-4">
                  {activeSong?.albumTitle ? (
                    <SmartRecommendationVisualizer 
                      currentProduct={activeSong}
                      products={musicProducts}
                      sessionId={sessionId}
                      onRecommendationClick={handleRecommendationClick}
                    />
                  ) : (
                    <div className="bg-gradient-to-br from-gray-900 to-black p-5 rounded-lg border border-gray-800">
                      <p className="text-gray-400 text-center">Play a song to see audio-based recommendations</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Music Player - Fixed at bottom */}
      {(activeSong?.albumTitle || activeSong?.gameTitle) && (
        <div className="absolute h-28 bottom-0 left-0 right-0 flex animate-slideup bg-gradient-to-br from-white/10 to-[#cf616a] backdrop-blur-lg block-t-3xl z-50">
          <MusicPlayer />
        </div>
      )}
      
      {/* Video Modal */}
      {modalState.isOpen && (
        <VideoModal 
          isOpen={modalState.isOpen}
          videoSrc={modalState.videoSrc}
          title={modalState.title}
          isPlaying={modalState.isPlaying}
          isActive={modalState.isActive}
          onClose={closeModal}
        />
      )}
    </div>
  );
};

const App = () => (
  <VideoModalProvider>
    <AudioFeaturesProvider>
      <AppContent />
    </AudioFeaturesProvider>
  </VideoModalProvider>
);

export default App;
