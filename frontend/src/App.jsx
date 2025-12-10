import { useSelector, useDispatch } from 'react-redux';
import { Route, Routes } from 'react-router-dom';
import { useState, useEffect } from 'react';

import { Searchbar, Sidebar, MusicPlayer, TopPlay } from './components';
import { ArtistDetails, TopArtists, AroundYou, CustomerScreen, Search, SongDetails, TopCharts } from './pages';
import SmartRecommendationVisualizer from './components/SmartRecommendationVisualizer';
import AudioAnalyzer from './components/AudioAnalyzer';
import { VideoModalProvider, useVideoModal } from './context/VideoModalContext';
import VideoModal from './components/VideoModal';
import { productService } from './redux/services';
import { setActiveSong, playPause as playPauseAction } from './redux/features/playerSlice';

const AppContent = () => {
  const { activeSong, isPlaying } = useSelector((state) => state.player);
  const { modalState, closeModal } = useVideoModal();
  const dispatch = useDispatch();
  const [audioFeatures, setAudioFeatures] = useState(null);
  const [sessionId] = useState(`session_${Date.now()}`);
  const [products, setProducts] = useState([]);

  // Fetch products for recommendations
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const email = 'john.smith@store.com';
        const password = 'password';
        const productData = await productService.getAllProducts(email, password);
        setProducts(productData);
      } catch (error) {
        console.error('Error fetching products:', error);
      }
    };

    fetchProducts();
  }, []);

  // Get audio element for analyzer
  const audioElement = typeof document !== 'undefined' ? document.querySelector('audio') : null;

  // Handle audio features extraction
  const handleFeaturesExtracted = (features) => {
    setAudioFeatures(features);
  };

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
      {/* Audio Analyzer - Headless component */}
      <AudioAnalyzer 
        audioElement={audioElement}
        onFeaturesExtracted={handleFeaturesExtracted}
        isPlaying={isPlaying}
      />
      
      <Sidebar />
      <div className="flex-1 flex flex-col bg-gradient-to-br from-[#041529] to-[#2970c2]">
        <div className="px-6 h-full overflow-y-scroll flex xl:flex-row flex-col-reverse">
          <div className="flex-1 h-fit pb-40">
            <Searchbar />

            <Routes>
              <Route path="/" element={<CustomerScreen />} />
              <Route path="/top-artists" element={<TopArtists />} />
              <Route path="/top-charts" element={<TopCharts />} />
              <Route path="/around-you" element={<AroundYou />} />
              <Route path="/artists/:id" element={<ArtistDetails />} />
              <Route path="/songs/:songid" element={<SongDetails />} />
              <Route path="/search/:searchTerm" element={<Search />} />
            </Routes>
          </div>
          {/* Right sidebar with increased width and right alignment */}
          <div className="relative top-0 h-fit py-10 xl:w-[500px] 2xl:w-[600px]">
            <TopPlay />
            <div className="w-full px-8 py-8 mt-4 ml-5">
              {/* Smart Recommendation Visualizer */}
              {isPlaying && activeSong?.albumTitle ? (
                <SmartRecommendationVisualizer 
                  currentProduct={activeSong}
                  audioFeatures={audioFeatures}
                  products={musicProducts}
                  sessionId={sessionId}
                  onRecommendationClick={handleRecommendationClick}
                />
              ) : (
                <div className="bg-gradient-to-br from-gray-900 to-black p-6 rounded-lg border border-gray-800">
                  <p className="text-gray-400 text-center">Play a song to see audio-based recommendations</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Music Player - Fixed at bottom */}
      {(activeSong?.albumTitle || activeSong?.gameTitle) && (
        <div className="absolute h-28 bottom-0 left-0 right-0 flex animate-slideup bg-gradient-to-br from-white/10 to-[#cf616a] backdrop-blur-lg rounded-t-3xl z-10">
          <MusicPlayer />
        </div>
      )}
      
      {/* Video Modal */}
      {modalState.isOpen && (
        <VideoModal 
          url={modalState.url}
          title={modalState.title}
          onClose={closeModal}
        />
      )}
    </div>
  );
};

const App = () => (
  <VideoModalProvider>
    <AppContent />
  </VideoModalProvider>
);

export default App;
