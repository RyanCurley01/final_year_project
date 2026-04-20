// React router and state management hooks.
import { useSelector, useDispatch } from 'react-redux';
import { Route, Routes, useLocation, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';

// Main layout UI components.
import { Searchbar, Sidebar, MusicPlayer, TopPlay } from './components';

// Page-level components used in Routing.
import { ArtistDetails, Discover, Search, SongDetails, TopCharts, SimilarSongs, MLVisualization, SpectrogramCreator, Login, Register, WishlistPage, MidiExplorer } from './pages';
import AlbumDetails from './pages/AlbumDetails';
import Cart from './pages/Cart';
import PurchaseHistory from './pages/PurchaseHistory';
import DiscoverVisualizer from './components/DiscoverVisualizer';

// Global Context Providers for feature-specific state that doesn't live in Redux.
import { VideoModalProvider, useVideoModal } from './context/VideoModalContext';
import { AudioFeaturesProvider } from './context/AudioFeaturesContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SpectrogramLiveProvider } from './context/SpectrogramLiveContext';

// Modal UI and Redux Actions/Services.
import VideoModal from './components/VideoModal';
import { productService } from './redux/services';
import { setActiveSong, playPause as playPauseAction } from './redux/features/playerSlice';

// AuthenticatedApp Component: Renders the core layout and routing ONLY if the user is successfully logged in.
const AuthenticatedApp = () => {
  // Pulls standard music player state plus the special 'quantumMode' flag.
  const { activeSong, isPlaying, quantumMode } = useSelector((state) => state.player);
  
  // Custom hook controlling a global video overlay modal.
  const { modalState, closeModal } = useVideoModal();
  
  const dispatch = useDispatch();
  const location = useLocation(); // Gets current URL path to conditional logic (hiding elements on certain pages).
  
  // Generates a unique anonymous session ID to track user interactions for ML recommendations.
  const [sessionId] = useState(`session_${Date.now()}`);
  
  // Local state to store fetched product data to pass into the recommendation engine.
  const [products, setProducts] = useState([]);
  const { currentUser } = useAuth();

  // --- Quantum Animation Logic ---
  // Tracks the background visual transition state: completely off, animating down, fully on, animating up.
  const [quantumBg, setQuantumBg] = useState('off');
  
  // useRef holds the previous quantumMode boolean without causing re-renders itself.
  const prevQuantumMode = useRef(quantumMode);

  // Effect to trigger slide down/up background animations when quantumMode toggles.
  useEffect(() => {
    // Prevent animation from firing purely on initial page load if quantumMode is already false.
    if (quantumMode === prevQuantumMode.current) return;
    prevQuantumMode.current = quantumMode;

    if (quantumMode) {
      setQuantumBg('sliding-down');
      // After CSS animation completes (600ms), lock the state to 'on' so the background stays visible.
      const timer = setTimeout(() => setQuantumBg('on'), 600);
      return () => clearTimeout(timer); // Cleanup timeout on unmount
    } else {
      setQuantumBg('sliding-up');
      const timer = setTimeout(() => setQuantumBg('off'), 600);
      return () => clearTimeout(timer);
    }
  }, [quantumMode]);
  
  // useEffect: On mount (or when user changes), asynchronously fetch all store products for the recommendation engine.
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const productData = await productService.getAllProducts();
        setProducts(productData);
      } catch (error) {
        // Error fetching products handled silently.
      }
    };

    fetchProducts();
  }, [currentUser]);

  // handleRecommendationClick: Fires when a user clicks a node in the ML visualizer.
  const handleRecommendationClick = (product) => {
    // Filters out pure software/merch down to just audio tracks.
    const music = products.filter(p => {
       const isAudio = p.fileUrl && !p.fileUrl.toLowerCase().includes('.zip');
       return p.albumTitle && isAudio;
    });
    
    // Finds where the clicked song exists in the filtered music array.
    const index = music.findIndex(p => p.id === product.id);
    
    // If found, update the global Redux player state to immediately begin playing that specific recommended song.
    if (index !== -1) {
      dispatch(setActiveSong({ song: product, data: music, i: index }));
      dispatch(playPauseAction(true));
    }
  };

  // Pre-filters products strictly for passing as context to the ML visualizer component. 
  const musicProducts = products.filter(p => {
     const isAudio = p.fileUrl && !p.fileUrl.toLowerCase().includes('.zip');
     return p.albumTitle && isAudio;
  });

  return (
    // Outer responsive flex container that fills viewport.
    <div className="relative flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Base blue background container spanning the main content area. */}
        <div className="absolute inset-0 bg-linear-to-br from-[#041529] to-[#2970c2]" />
        
        {/* Conditional Quantum Background overlay implementation. */}
        {quantumBg !== 'off' && (
          <div
            className="absolute inset-0 bg-linear-to-br from-[#290404] to-[#c22929]"
            style={{
              zIndex: 1, // Sits above blue bg, beneath text content.
              // Dynamic inline style applying the CSS keyframe animations defined elsewhere based on state.
              animation:
                quantumBg === 'sliding-down'
                  ? 'quantum-slide-down 0.6s cubic-bezier(0.4,0,0.2,1) forwards'
                  : quantumBg === 'sliding-up'
                    ? 'quantum-slide-up 0.6s cubic-bezier(0.4,0,0.2,1) forwards'
                    : 'none',
              transform: quantumBg === 'on' ? 'translateY(0)' : undefined,
            }}
          />
        )}
        
        {/* Main Content scrollable area. If song is playing, reduces height to make room for bottom MusicPlayer bar. */}
        <div className={`relative z-2 px-6 flex flex-col lg:flex-row ${(activeSong?.albumTitle) ? 'h-[calc(100vh-7rem)]' : 'h-screen'} overflow-y-auto`}>
          
          {/* Main center column containing the Searchbar and the dynamic Route pages. */}
          <div className="flex-1 pb-4">
            <Searchbar />

            {/* React Router standard mapping: matches URL path to the corresponding Component. */}
            <Routes>
              <Route path="/" element={<Discover />} />
              <Route path="/top-charts" element={<TopCharts />} />
              <Route path="/similar-songs" element={<SimilarSongs />} />
              <Route path="/ml-visualization" element={<MLVisualization />} />
              <Route path="/spectrogram-creator" element={<SpectrogramCreator />} />
              <Route path="/midi-explorer" element={<MidiExplorer />} />
              <Route path="/songs/:songid" element={<SongDetails />} />
              <Route path="/search/:searchTerm" element={<Search />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/wishlist" element={<WishlistPage />} />
              <Route path="/purchase-history" element={<PurchaseHistory />} />
              <Route path="/artists/:artistName" element={<ArtistDetails />} />
              <Route path="/albums/:albumName" element={<AlbumDetails />} />
              
              {/* Catch-all route: If user types random URL, safely redirect them to Home. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            
            {/* Mobile-only view for TopPlay and Visualizer node map (Hidden on LG screens and up) */}
            {location.pathname === '/' && !location.search.includes('mode=visualizer') && (
              <div className="lg:hidden mt-6 pb-4 overflow-x-hidden">
                <div className="mb-4">
                  <TopPlay />
                </div>
                <div className="mb-4">
                  {/* Shows interactive recommendation visualizer ONLY if a song is actively playing, else shows placeholder UI. */}
                  {activeSong?.albumTitle ? (
                    <DiscoverVisualizer currentProduct={activeSong} products={musicProducts} sessionId={sessionId} onRecommendationClick={handleRecommendationClick} />
                  ) : (
                    <div className="bg-linear-to-br from-gray-900 to-black p-5 rounded-lg border border-gray-800">
                      <p className="text-gray-400 text-center">Play a song to see audio-based recommendations</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Desktop Right Sidebar - TopPlay + Visualizer (Hidden on small mobile screens). */}
          {location.pathname === '/' && !location.search.includes('mode=visualizer') && (
            <>
              {/* Invisible spacer `div` to prevent main content from hiding behind the completely fixed position absolute right sidebar. */}
              <div className="hidden lg:block w-[390px] min-w-[390px]"></div>
              
              {/* Fixed Right Sidebar UI container */}
              <div className={`hidden lg:block fixed top-0 right-0 w-[390px] min-w-[390px] ${(activeSong?.albumTitle) ? 'h-[calc(100vh-7rem)]' : 'h-screen'} overflow-y-auto overflow-x-hidden hide-scrollbar z-40 px-4 pt-4 pb-8`}>
                <div className="mb-4">
                  <TopPlay />
                </div>
                <div className="mb-4">
                  {activeSong?.albumTitle ? (
                    <DiscoverVisualizer currentProduct={activeSong} products={musicProducts} sessionId={sessionId} onRecommendationClick={handleRecommendationClick}/>
                  ) : (
                    <div className="bg-linear-to-br from-gray-900 to-black p-5 rounded-lg border border-gray-800">
                      <p className="text-gray-400 text-center">Play a song to see audio-based recommendations</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Global Music Player Bar: Appears fixed at the very bottom of the screen if a song is loaded. */}
      {(activeSong?.albumTitle) && (
        <div className="absolute h-28 bottom-0 left-0 right-0 flex animate-slideup bg-linear-to-br from-white/10 to-[#cf616a] backdrop-blur-lg block-t-3xl z-50">
          <MusicPlayer />
        </div>
      )}
      
      {/* Global Video Modal overlay logic (controlled by Context) */}
      {modalState.isOpen && (
        <VideoModal isOpen={modalState.isOpen} videoSrc={modalState.videoSrc} title={modalState.title} isPlaying={modalState.isPlaying} isActive={modalState.isActive} onClose={closeModal}/>
      )}
    </div>
  );
};

// Route Protection Wrapper Component.
const AppRoutes = () => {
  const { currentUser } = useAuth();
  
  return (
    <Routes>
      {/* If NOT logged in, show Login. If they ARE logged in but hit /login route, bounce them to Home. */}
      <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" />} />
      <Route path="/register" element={!currentUser ? <Register /> : <Navigate to="/" />} />
      
      {/* Protected wildcard route: if they are logged in, load the entirety of the AuthenticatedApp. Default to kicking them to Login otherwise. */}
      <Route path="/*" element={currentUser ? <AuthenticatedApp /> : <Navigate to="/login" />} />
    </Routes>
  );
};

// Root App Export: Wraps the entire application routing stack in your assorted Context Providers.
// This allows deeply nested components to simply call `useAuth()` or `useVideoModal()` without prop drilling.
const App = () => (
  <AuthProvider>
    <VideoModalProvider>
      <AudioFeaturesProvider>
        <SpectrogramLiveProvider>
          <AppRoutes />
        </SpectrogramLiveProvider>
      </AudioFeaturesProvider>
    </VideoModalProvider>
  </AuthProvider>
);

export default App;
