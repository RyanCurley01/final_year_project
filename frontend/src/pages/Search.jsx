import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';

import Loader from '../components/Loader';
import AudioReactiveVideo from '../components/AudioReactiveVideo';
import OnsetImageCard from '../components/OnsetImageCard';
import { useAudioFeatures } from '../context/AudioFeaturesContext';
import { setActiveSong, playPause, setPlaybackRate } from '../redux/features/playerSlice';
import { addToCart } from '../redux/features/cartSlice';
import { addToWishlistLocal, removeFromWishlistLocal, addWishlistItem, removeWishlistByProduct } from '../redux/features/wishlistSlice';
import { useAuth } from '../context/AuthContext';
import { auth as firebaseAuth } from '../firebase';
import { productService } from '../redux/services';
import { FaPauseCircle, FaPlayCircle, FaStar, FaRegStar } from 'react-icons/fa';
import { FiShoppingCart, FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import envConfig from '../config/environment';
import blissImage from '../assets/bliss.png';
import { fixTextDeep } from '../utils/fixText';
import { useActionToast } from '../components/CartToast';

const ARTISTS = ['Aphex Twin', 'Boards of Canada', 'Squarepusher'];

const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');



const SongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index, onSongNameClick, onArtistClick, onAlbumClick, playbackRate }) => {
  const dispatch = useDispatch();
  const [showActionToast, ActionToast] = useActionToast();
  // Resolves direct identity equality checks verifying global playback pointers against local references.
  const isThisSongActive = activeSong?.id === song.id;
  
  // Evaluates cascading fallback chains determining primary visual boundaries, strictly isolating 
  // embedded metadata graphics to prevent unwanted video allocations overriding static imagery constraints.
  const albumArt = song.albumCoverImageUrl || song.artworkUrl100?.replace('100x100', '600x600') || fallbackImage;
  
  // Imposes database origin requirements restricting rich media rendering loops exclusively 
  // to internally hosted entities containing explicit MP4 references.
  const isVideo = song.source === 'database' && albumArt && albumArt.toLowerCase().includes('.mp4');
  const coverMedia = albumArt;
  
  // Maps definitive origin state booleans routing conditional UI rendering logic.
  const isLibrarySong = song.source === 'database';
  
  // Generates unified identification strings applying lower-case transformations detecting 
  // exact keyword matches mapping custom component overrides natively.
  const songTitle = song.trackName || song.albumTitle || '';
  const isTeddyEmotion = songTitle.toLowerCase().includes('teddy emotion');
  const useOnsetImages = isVideo && !isTeddyEmotion;
  
  // Instantiates local boolean tracking primitives defining CSS visibility classes globally.
  const [isHovered, setIsHovered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Processes modulus calculations extracting uniform deterministic price modifications 
  // binding even-numbered item integers directly towards mathematical discount reductions.
  const songPrice = song.matchedDbSong?.albumPrice || song.price || 0;
  const songId = song.matchedDbSong?.id || song.id;
  const hasDiscount = isLibrarySong && songId != null && songId % 2 === 0;
  const discountedPrice = hasDiscount ? songPrice / 2 : null;

  // Mounts global Redux selectors monitoring remote persistent structural arrays mapping 
  // currently authed user boundaries against strictly internally sourced audio records.
  const { items: wishlistItems } = useSelector((state) => state.wishlist);
  const { currentUser } = useAuth();
  
  // Computes precise intersection booleans returning true exclusively if current properties 
  // reside inside user-specific remote relational tables explicitly.
  const isWishlisted = isLibrarySong && wishlistItems.some(
    (item) => item.productId === songId || item.product?.id === songId
  );


  // Executes asynchronous user authentication checks dispatching complex nested persistence payloads.
  // Performs deterministic fallback evaluations routing distinct HTTP token structures depending 
  // on active session origin types (Firebase vs Standard native identities).
  const handleToggleWishlist = async (e) => {
    e.stopPropagation();
    if (!currentUser || !isLibrarySong) return;
    
    // Normalizes parameter bindings standardizing backend variable shapes natively.
    const accountId = currentUser.id;
    const email = currentUser.email || currentUser.accountEmailAddress;
    const password = currentUser.password;
    const isFirebaseUser = !!currentUser.firebaseUid;
    let authParams = {};
    
    // Injects verified asynchronous Firebase identity strings directly preventing rejected loops 
    // when evaluating secured remote wishlist interfaces.
    if (isFirebaseUser && firebaseAuth.currentUser) {
      try {
        const token = await firebaseAuth.currentUser.getIdToken();
        authParams = { email, firebaseToken: token };
      } catch (err) { console.warn('Failed to get Firebase token for wishlist:', err); }
    } else if (email && password) {
      authParams = { email, password };
    }
    
    // Determines strict boolean gates limiting asynchronous dispatches only if tokens resolved successfully.
    const hasAuth = !!(authParams.password || authParams.firebaseToken);
    
    // Overwrites current relational sets applying explicitly bound structural payloads mapped 
    // against globally available context identifiers executing dual local and remote mutations.
    if (isWishlisted) {
      dispatch(removeFromWishlistLocal({ productId: songId, accountId }));
      dispatch(removeWishlistByProduct({ accountId, productId: songId, ...authParams }));
      showActionToast(songTitle, 'wish-remove');
    } else {
      dispatch(addToWishlistLocal({ ...(song.matchedDbSong || song), accountId }));
      if (hasAuth) dispatch(addWishlistItem({ wishlistData: { accountId, productId: songId }, ...authParams }));
      showActionToast(songTitle, 'wish-add');
    }
  };

  // Parses mathematical string value evaluations capturing numeric user interventions globally.
  // Overrides primary DOM events halting propagation to securely update Redux states.
  const handlePlaybackRateChange = (e) => {
    const newRate = parseFloat(e.target.value);
    dispatch(setPlaybackRate(newRate));
  };

  // Traps strict navigation context hooks capturing bound dataset identities passing parameters 
  // towards parent evaluation routines avoiding default application event bubbling blocks.
  const handleSongNameClick = (e) => {
    e.stopPropagation();
    if (onSongNameClick) {
      onSongNameClick(song);
    }
  };

  // Isolates exact text values executing nested routing invocations dynamically pushing users 
  // into specified detail hierarchies rendering matching records conditionally.
  const handleArtistClick = (e) => {
    e.stopPropagation();
    if (onArtistClick) {
      onArtistClick(song.artistName);
    }
  };

  // Distributes complex application node updates routing users identically towards specialized 
  // views based directly on associated album identifier parameters.
  const handleAlbumClick = (e) => {
    e.stopPropagation();
    if (onAlbumClick && song.collectionName) {
      onAlbumClick(song.collectionName, song);
    }
  };

  return (
    <div className="flex flex-col h-full p-4 bg-white/5 backdrop-blur-sm animate-slideup rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      {ActionToast}
      <div 
        className="relative w-full aspect-square rounded-lg overflow-hidden outline-none border-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >      
        {/* Album Art or Video */}
        {useOnsetImages ? (
          <OnsetImageCard
            songTitle={songTitle}
            songId={song.id}
            className="w-full h-full rounded-lg object-cover"
            isPlaying={isPlaying && isThisSongActive}
            isActive={isThisSongActive}
          />
        ) : isVideo ? (
          <AudioReactiveVideo
            src={coverMedia}
            alt={song.trackName}
            className="w-full h-full rounded-lg object-cover"
            isPlaying={isPlaying && isThisSongActive}
            isActive={isThisSongActive}
            playbackRate={isThisSongActive ? (playbackRate || 1.0) : 1.0}
          />
        ) : (
          <img 
            src={coverMedia} 
            alt={song.trackName} 
            className="w-full h-full rounded-lg object-cover" 
            onError={(e) => { e.target.src = fallbackImage; }} 
          />
        )}
        
        {/* Play/Pause overlay - shows on hover */}
        {song.previewUrl && (
          <div 
            className={`absolute inset-0 rounded-lg flex justify-center items-center z-20 ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={(e) => {
              e.stopPropagation();
              setIsHovered(false);
              if (isPlaying && isThisSongActive) {
                onPause();
              } else {
                onPlay(song, index);
              }
            }}
          >
            {isPlaying && isThisSongActive ? (
              <FaPauseCircle 
                size={45}
                className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
              />
            ) : (
              <FaPlayCircle 
                size={45}
                className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform"
              />
            )}
          </div>
        )}

        {/* Maximise button for video/onset cards - top right */}
        {(isVideo || useOnsetImages) && (
          <button
            onClick={(e) => { e.stopPropagation(); setIsFullscreen(true); }}
            className="absolute top-2 right-10 z-20 p-1.5 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-all hover:scale-110"
            title="Maximise video"
          >
            <FiMaximize2 className="w-5 h-5 text-white/80 hover:text-white drop-shadow-lg transition-colors" />
          </button>
        )}

        {/* Wishlist Star - for library songs */}
        {isLibrarySong && (
          <button
            onClick={handleToggleWishlist}
            className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-all hover:scale-110"
            title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
          >
            {isWishlisted ? (
              <FaStar className="w-5 h-5 text-yellow-400 drop-shadow-lg" />
            ) : (
              <FaRegStar className="w-5 h-5 text-white/80 hover:text-yellow-400 drop-shadow-lg transition-colors" />
            )}
          </button>
        )}

        {isThisSongActive && isPlaying && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-green-500/90 px-2 py-1 rounded-full z-30">
            <div className="flex gap-0.5">
              <span className="w-1 h-3 bg-white rounded-full animate-pulse"></span>
              <span className="w-1 h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1 h-2 bg-white rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}
      </div>

      {/* Tempo Slider - shown on all video/onset cards for consistent row height, only interactive for the active song */}
      {(isVideo || useOnsetImages) && (
        <div className={`mt-2 px-2${isThisSongActive ? '' : ' opacity-40 pointer-events-none'}`}>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-white/70">Playback Speed</label>
            <span className="text-xs text-white font-mono">{isThisSongActive ? (playbackRate || 1.0).toFixed(2) : '1.00'}x</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.05"
            value={isThisSongActive ? (playbackRate || 1.0) : 1.0}
            onChange={handlePlaybackRateChange}
            disabled={!isThisSongActive}
            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer
                     slider-thumb:appearance-none slider-thumb:w-3 slider-thumb:h-3 
                     slider-thumb:bg-blue-500 slider-thumb:rounded-full slider-thumb:cursor-pointer
                     hover:bg-gray-500 transition-colors"
            style={{
              background: isThisSongActive
                ? `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(((playbackRate || 1.0) - 0.1) / 1.9) * 100}%, #4b5563 ${(((playbackRate || 1.0) - 0.1) / 1.9) * 100}%, #4b5563 100%)`
                : '#4b5563'
            }}
          />
          <div className="flex justify-between text-xs text-white/50 mt-0.5">
            <span>0.1x</span>
            <span>1.0x</span>
            <span>2.0x</span>
          </div>
        </div>
      )}

      {/* Fullscreen overlay portal */}
      {(isVideo || useOnsetImages) && isFullscreen && createPortal(
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center" style={{ zIndex: 99999 }}>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 bg-linear-to-b from-black/80 to-transparent z-10">
            <h3 className="text-white font-semibold text-lg truncate">{song.trackName || song.albumTitle}</h3>
            <button onClick={() => setIsFullscreen(false)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all hover:scale-110" title="Minimise">
              <FiMinimize2 className="w-6 h-6 text-white" />
            </button>
          </div>
          <div className="absolute inset-0 w-full h-full">
            {useOnsetImages ? (
              <OnsetImageCard songTitle={songTitle} songId={song.id} className="w-full h-full object-contain" isPlaying={isPlaying && isThisSongActive} isActive={isThisSongActive} />
            ) : (
              <AudioReactiveVideo src={coverMedia} alt={song.trackName} className="w-full h-full object-contain" isPlaying={isPlaying && isThisSongActive} isActive={isThisSongActive} playbackRate={isThisSongActive ? (playbackRate || 1.0) : 1.0} />
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Song Info - Different layout for database songs vs artist songs */}
      {song.source === 'database' ? (
        /* Database song layout - same as Discover page */
        <div className="flex flex-col flex-1 mt-4">
          <p className="font-semibold text-lg text-gray-300 h-7 overflow-hidden">
            <span 
              onClick={handleSongNameClick}
              className="block hover:text-cyan-400 transition-colors cursor-pointer line-clamp-2"
              title={song.trackName || song.albumTitle || 'Unknown'}
            >
              {song.trackName || song.albumTitle || 'Unknown'}
            </span>
          </p>
          <div className="flex justify-between items-end mt-auto pt-2">
            <p className="text-sm text-white">Music</p>
            {hasDiscount ? (
              <div className="flex flex-col items-start gap-1.5">
                <span className="px-1.5 py-0.5 bg-green-500/90 rounded text-[10px] font-bold text-white">
                  50% OFF
                </span>
                <div className="flex flex-row items-center gap-1.5">
                  <p className="text-sm text-gray-400 line-through">
                    €{songPrice.toFixed(2)}
                  </p>
                  <p className="text-sm font-bold text-green-400">
                    €{discountedPrice.toFixed(2)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm font-bold text-white">
                €{songPrice.toFixed(2)}
              </p>
            )}
          </div>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              const cartProduct = hasDiscount
                ? { ...(song.matchedDbSong || song), albumPrice: discountedPrice }
                : (song.matchedDbSong || song);
              dispatch(addToCart(cartProduct));
              showActionToast(song.trackName || song.albumTitle, 'cart-add');
            }}
            className="w-full mt-2 px-3 py-2 bg-blue-700 hover:bg-blue-800 rounded font-semibold text-white text-sm leading-none flex items-center justify-center gap-2"
          >
            <FiShoppingCart />
            Add to Cart
          </button>
        </div>
      ) : (
        /* Artist song layout - with similarity info like SimilarSongs page */
        <>
          <div className="mt-3 flex flex-col gap-1">
            <p 
              className="font-semibold text-sm text-gray-300 truncate leading-tight hover:text-cyan-400 transition-colors cursor-pointer"
              onClick={handleSongNameClick}
              title="Click to see similar songs by this artist"
            >
              {song.trackName || song.albumTitle}
            </p>
            <p 
              className="text-xs text-gray-400 truncate hover:text-cyan-400 transition-colors cursor-pointer"
              onClick={handleArtistClick}
              title="Click to see artist details"
            >
              {song.artistName}
            </p>
            <p 
              className="text-xs text-gray-500 truncate hover:text-cyan-400 transition-colors cursor-pointer"
              onClick={handleAlbumClick}
              title="Click to view album songs and similarity"
            >
              {song.collectionName}
            </p>
          </div>

          {/* Matched library track label for iTunes songs */}
          {song.matchedLibraryTrack && (
            <div className="mt-2 pt-2 border-t border-gray-700/50">
              <p className="text-[10px] text-cyan-400">Matched via library track:</p>
              <p className="text-[11px] text-white truncate font-medium">{song.matchedLibraryTrack}</p>
            </div>
          )}

          {/* Audio Feature Match Badges */}
          {song.tempo_match != null && (
            <div className="flex gap-1 mt-auto pt-2 flex-wrap">
              <span className={`px-1 py-0.5 rounded text-[10px] ${
                song.tempo_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                song.tempo_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                'bg-red-500/30 text-red-300'
              }`}>
                Tempo:{Math.round(song.tempo_match * 100)}%
              </span>
              <span className={`px-1 py-0.5 rounded text-[10px] ${
                song.energy_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                song.energy_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                'bg-red-500/30 text-red-300'
              }`}>
                Energy:{Math.round((song.energy_match || 0) * 100)}%
              </span>
              <span className={`px-1 py-0.5 rounded text-[10px] ${
                song.mood_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                song.mood_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                'bg-red-500/30 text-red-300'
              }`}>
                Mood:{Math.round((song.mood_match || 0) * 100)}%
              </span>
              <span className={`px-1 py-0.5 rounded text-[10px] ${
                (song.dance_match) >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                (song.dance_match) >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                'bg-red-500/30 text-red-300'
              }`}>
                Dance:{Math.round((song.dance_match || 0) * 100)}%
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const Search = () => {
  // Extracts explicit navigational matching strings driving primary search iterations.
  const { searchTerm } = useParams();
  
  // Instantiates local UI boolean handlers defining conditional visual components structurally.
  const [loading, setLoading] = useState(true);
  const [songs, setSongs] = useState([]);
  const [dbSongs, setDbSongs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recommendationPool, setRecommendationPool] = useState([]);

  
  // Maps persistent asynchronous references overcoming React state closure staleness across loops.
  const intervalRef = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { activeSong, isPlaying, playbackRate } = useSelector((state) => state.player);
  
  // Extracts real-time graphical context bindings reflecting global media element matrices natively.
  const { audioFeatures } = useAudioFeatures();

  
  // Caches active analytical node parameters enforcing constant reference access inside unmounted iterations.
  const audioFeaturesRef = useRef(audioFeatures);
  audioFeaturesRef.current = audioFeatures;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  // Executes asynchronous queries resolving cross-platform data joins merging native database objects with iTunes entities.
  useEffect(() => {

    const abortController = new AbortController();
    
    const fetchSearchResults = async () => {
      setLoading(true);
      setError(null);
      
      // If no search term, show empty state
      if (!searchTerm || searchTerm.trim() === '') {
        setSongs([]);
        setLoading(false);
        return;
      }
      
      const searchLower = searchTerm.toLowerCase().trim();
      // Strip apostrophes/punctuation so "teds" matches "Ted's", etc.
      const normalize = (s) => s?.toLowerCase().replace(/[''`]/g, '') || '';
      
      try {
        // Fetch database songs
        const products = await productService.getAllProducts();
        // Only include actual store products (positive IDs), exclude cached iTunes songs.
        const musicProducts = products.filter(p => p.albumTitle && p.fileUrl && p.id > 0);

        // Use the same curated 47-song internal library target pool as SimilarSongs.
        const libraryTargetSongs = musicProducts
          .filter((product, index, self) =>
            index === self.findIndex((candidate) => (
              candidate.albumTitle === product.albumTitle && candidate.artistName === product.artistName
            ))
          )
          .slice(0, 47);
        setDbSongs(libraryTargetSongs);
        
        // Also fetch iTunes songs for the 3 artists (same as TopCharts)
        const allArtistSongs = [];
        const audioApiUrl = envConfig.getApiBaseUrl();
        
        // Loop through the 3 specific artists (Not the user's search term)
        for (let i = 0; i < ARTISTS.length; i++) {
          const artist = ARTISTS[i];
          try {
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Use our own proxy to avoid CORS/ITP issues from client-side calls to iTunes
            const response = await fetch(
              `${audioApiUrl}/api/itunes/search?term=${encodeURIComponent(artist)}&media=music&entity=song&limit=200`,
              { signal: abortController.signal }
            );

            // process results into allArtistSongs
            const data = fixTextDeep(await response.json());
            
            const artistLower = artist.toLowerCase();
            const artistSongs = data.results
              .filter(track => track.previewUrl && track.artistName?.toLowerCase().includes(artistLower))
              .slice(0, 50)
              .map((track, artistIndex) => ({
                id: track.trackId,
                trackId: track.trackId,
                trackName: track.trackName,
                albumTitle: track.trackName,
                artistName: track.artistName,
                collectionName: track.collectionName,
                artworkUrl100: track.artworkUrl100,
                previewUrl: track.previewUrl,
                fileUrl: track.previewUrl,
                price: track.trackPrice || 1.29,
                primaryGenreName: track.primaryGenreName,
                trackTimeMillis: track.trackTimeMillis,
                artistRank: artistIndex + 1,
                popularityScore: 51 - artistIndex,
                source: 'itunes'
              }));
            
            allArtistSongs.push(...artistSongs);
          } catch (artistErr) {
            if (artistErr.name !== 'AbortError') {
              console.warn(`Error fetching ${artist}:`, artistErr);
            }
          }
        }
        
        // Save full iTunes list for Visualiser recommendations (independent of search filter)
        // This ensures sidebar recommends highly relevant artist songs even if they aren't in the search results
        setRecommendationPool(allArtistSongs);
        
        // Filter database songs based on search term
        // ProductResponse fields: id, albumTitle, albumPrice, albumCoverImageUrl, fileUrl, previewUrl
        const searchNorm = normalize(searchLower);
        const filteredDbSongs = musicProducts.filter(song => {
          const albumMatch = normalize(song.albumTitle).includes(searchNorm);
          return albumMatch;
        }).map((song) => ({
          id: song.id,
          trackId: song.id,
          trackName: song.albumTitle,
          albumTitle: song.albumTitle,
          artistName: 'Unknown Artist',
          collectionName: song.albumTitle,
          artworkUrl100: song.albumCoverImageUrl || fallbackImage,
          albumCoverImageUrl: song.albumCoverImageUrl,
          previewUrl: song.fileUrl || song.previewUrl,
          fileUrl: song.fileUrl,
          price: song.albumPrice || 1.29,
          primaryGenreName: 'Electronic',
          trackTimeMillis: 0,
          matchedDbSong: song,
          source: 'database'
        }));

        // Filter iTunes songs by the user's search word
        const filteredArtistSongs = allArtistSongs.filter(song => {
          const trackMatch = normalize(song.trackName).includes(searchNorm);
          const artistMatch = normalize(song.artistName).includes(searchNorm);
          const albumMatch = normalize(song.collectionName).includes(searchNorm);
          const genreMatch = normalize(song.primaryGenreName).includes(searchNorm);
          return trackMatch || artistMatch || albumMatch || genreMatch;
        });
        
        // Include both library and iTunes songs. Library songs are displayed but do not
        // go through the ML matching pipeline — only iTunes songs get matched to library.
        const allResults = [...filteredDbSongs, ...filteredArtistSongs].map(song => {
          let relevance = 0.5;
          const title = normalize(song.trackName || song.albumTitle || '');
          const artist = normalize(song.artistName || '');
          
          // Boost exact matches (using normalized strings so punctuation doesn't break ranking)
          if (title === searchNorm) relevance = 1.0;
          else if (artist === searchNorm) relevance = 0.95;
          else if (title.startsWith(searchNorm)) relevance = 0.9;
          else if (artist.startsWith(searchNorm)) relevance = 0.85;
          else if (title.includes(searchNorm)) relevance = 0.75;
          else if (artist.includes(searchNorm)) relevance = 0.7;
          
          // Keep native library songs slightly ahead in Search ordering.
          if (song.source === 'database') relevance += 0.05;
          
          // Use relevance as the main sorting score, but DO NOT assign it to 'similarity'
          // 'similarity' is reserved for AUDIO similarity (Real ML)
          // This ensures we don't show "95%" badges for text matches
          return { ...song, relevance, similarity: undefined };
        });
        
        // Remove duplicates, preferring library entries over iTunes duplicates.
        const seen = new Set();
        const uniqueResults = allResults.filter(song => {
          const key = `${song.trackName?.toLowerCase().trim()}-${song.artistName?.toLowerCase().trim()}`;
          
          if (seen.has(key)) {
             return false;
          }
          seen.add(key);
          return true;
        });
        
        // Sort by relevance
        uniqueResults.sort((a, b) => b.relevance - a.relevance);
        setSongs(uniqueResults);

        // Match iTunes songs against library to show "Matched via library track" + feature badges
        const itunesSongs = uniqueResults.filter(s => s.source === 'itunes');
        if (itunesSongs.length > 0) {
          try {
            const audioApiUrl = envConfig.getApiBaseUrl();
            const candidates = itunesSongs.map(s => ({
              trackId: String(s.trackId || s.id),
              trackName: s.trackName || '',
              artistName: s.artistName || '',
              previewUrl: s.previewUrl || s.fileUrl || '',
            }));
            const matchResp = await fetch(`${audioApiUrl}/api/audio/match-library`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ candidates, limit: itunesSongs.length }),
              signal: abortController.signal,
            });
            if (matchResp.ok) {
              const matchData = fixTextDeep(await matchResp.json());
              if (matchData.status === 'success' && matchData.matches) {
                const matchMap = new Map();
                matchData.matches.forEach(m => {
                  if (m.matched_product_name || m.similarity_score > 0) {
                    matchMap.set(String(m.input_track_id), m);
                  }
                });
                if (matchMap.size > 0) {
                  setSongs(prev => prev.map(s => {
                    if (s.source !== 'itunes') return s;
                    const key = String(s.trackId || s.id);
                    const matched = matchMap.get(key);
                    if (!matched) return s;
                    return {
                      ...s,
                      matchedLibraryTrack: matched.matched_product_name || null,
                      tempo_match: matched.tempo_match ?? null,
                      energy_match: matched.energy_match ?? null,
                      mood_match: matched.mood_match ?? null,
                      dance_match: matched.dance_match ?? null,
                    };
                  }));
                }
              }
            }
          } catch (matchErr) {
            if (matchErr.name !== 'AbortError') {
              console.warn('[Search] Library match lookup failed:', matchErr.message);
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSearchResults();
    
    return () => {
      abortController.abort();
    };
  }, [searchTerm]); // Re-fetch when search term changes

  // Fetch cached audio features from the backend (REAL extracted features from AudioFeatures table)
  // Calculates deterministic subset parameters routing internal queries matching text 
  // definitions against standardized entity shapes preserving unchanged memory states.
  const filteredSongs = useMemo(() => {
    if (filter === 'all') return songs;
    return songs.filter(song => song.artistName?.toLowerCase().includes(filter.toLowerCase()));
  }, [songs, filter]);

  // Invokes global audio configuration models passing strict component tracking 
  // indicators switching primary UI rendering nodes into active playing context loops.
  const handlePlay = (song, index) => {
    if (song.fileUrl) {
      dispatch(setActiveSong({ song, data: filteredSongs, i: index }));
      dispatch(playPause(true));
    }
  };

  // Traps current active playback nodes issuing deterministic boolean false 
  // signals resetting global state buffers avoiding runtime media collisions.
  const handlePause = () => {
    dispatch(playPause(false));
  };

  // Orchestrates dynamic detail routing constructing parameterized history stacks 
  // isolating explicitly matching components preventing internal layout rendering crashes.
  const handleSongNameClick = (song) => {
    // Processes strict schema translations masking deep nested database objects into 
    // unified surface-level interfaces identical towards standard discovery architectures.
    if (song.source === 'database') {
      const dbSong = song.matchedDbSong || song;
      navigate(`/songs/${dbSong.productId || dbSong.id || song.id}`, {
        state: {
          song: {
            trackId: dbSong.productId || dbSong.id || song.id,
            trackName: dbSong.albumTitle || song.trackName,
            artistName: dbSong.artistName || 'Unknown Artist',
            collectionName: dbSong.albumTitle || song.trackName,
            artworkUrl100: dbSong.albumCoverImageUrl,
            albumCoverImageUrl: dbSong.albumCoverImageUrl,
            previewUrl: dbSong.fileUrl,
            fileUrl: dbSong.fileUrl,
            price: dbSong.albumPrice,
            primaryGenreName: 'Electronic'
          },
          artistSongs: songs.filter(s => s.id !== song.id).map(s => {
            const matched = s.matchedDbSong || s;
            return {
              trackId: matched.productId || matched.id || s.id,
              trackName: matched.albumTitle || s.trackName,
              artistName: matched.artistName || s.artistName || 'Unknown Artist',
              collectionName: matched.albumTitle || s.collectionName,
              artworkUrl100: matched.albumCoverImageUrl || s.artworkUrl100,
              albumCoverImageUrl: matched.albumCoverImageUrl,
              previewUrl: matched.fileUrl || s.previewUrl,
              fileUrl: matched.fileUrl || s.fileUrl,
              price: matched.albumPrice || s.price,
              primaryGenreName: 'Electronic'
            };
          }),
          fromDiscover: true
        }
      });
    } else {
      // Isolates generalized external fallback iterations specifically validating standard 
      // array bounds limiting similarity matrices strictly to predefined query artists.
      const mainArtistSongs = songs.filter(s => {
        if (s.id === song.id) return false;
        const artistLower = (s.artistName || '').toLowerCase();
        return artistLower.includes('aphex') || 
               artistLower.includes('boards of canada') || 
               artistLower.includes('squarepusher');
      });
      
      // Executes standard react router navigations passing localized payload targets.
      navigate(`/songs/${song.trackId || song.id}`, {
        state: {
          song: song,
          artistSongs: mainArtistSongs,
          fromDiscover: true
        }
      });
    }
  };

  // Injects structural text substitutions converting display constants into valid 
  // navigation slugs targeting static predefined sub-router configurations natively.
  const handleArtistClick = (artistName) => {
    const slug = artistName.toLowerCase().replace(/\s+/g, '-');
    navigate(`/artists/${slug}`);
  };

  // Encodes raw string identifiers structuring parameter constraints pushing interface 
  // viewports explicitly into targeted relational list boundaries rendering metadata maps.
  const handleAlbumClick = (albumName, song) => {
    navigate(`/albums/${encodeURIComponent(albumName)}`, {
      state: {
        // Transmits contextual lookup criteria ensuring dynamic filtering logic applies 
        // accurately when resolving disjoint dataset structures within secondary mounted components.
        artistName: song.artistName,
        albumArtwork: song.artworkUrl100?.replace('100x100', '600x600')
      }
    });
  };

  // Traps click propagation overriding localized track arrays binding direct player nodes 
  // triggering autonomous audio decoding natively via store dispatcher endpoints.
  const handleRecommendationClick = (song) => {
    if (song?.fileUrl) {
      const index = songs.findIndex(s => s.id === song.id);
      dispatch(setActiveSong({ song, data: songs, i: index }));
      dispatch(playPause(true));
    }
  };

  if (loading) return <Loader title={searchTerm ? `Searching for "${searchTerm}"...` : 'Loading...'} />;
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-red-400 text-lg mb-4">Error loading songs: {error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600">
          Try Again
        </button>
      </div>
    );
  }

  // Show empty state if no search term
  if (!searchTerm || searchTerm.trim() === '') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Search for Music</h2>
          <p className="text-gray-400 mb-2">Enter a song, artist, or album name in the search bar above</p>
          <p className="text-sm text-gray-500">Try searching for "Aphex Twin", "Boards of Canada", or any artist</p>
        </div>
      </div>
    );
  }

  // Conditionally builds the UX to represent an exhaustive but empty cross-reference search
  if (songs.length === 0 && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-4">No Results Found</h2>
          <p className="text-gray-400 mb-2">No songs found for "{searchTerm}"</p>
          <p className="text-sm text-gray-500">Try searching for a different artist or song</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 pb-10 sm:pb-14 scrollbar-hide overflow-x-hidden">
      {/* Compiles the central structural div housing the primary Search application grid */}
      <div className={`flex-1 min-w-0`}>
        {/* Back navigation */}
        <div className="mb-4">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all flex items-center gap-2"
          >
            ← Back
          </button>
        </div>

        <div className="mb-4 sm:mb-6">
          <h1 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-2">
            Search Results for "{searchTerm}"
          </h1>
          <p className="text-gray-400">Found {songs.length} {songs.length === 1 ? 'song' : 'songs'} matching your search</p>
          <p className="text-xs text-cyan-400 mt-1">Powered by iTunes API - Preview songs before purchasing</p>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${filter === 'all' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            All Results ({songs.length})
          </button>
          
          {/* Visualiser button commented out
          <button onClick={() => setFilter('visualizer')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'visualizer' ? 'bg-linear-to-r from-cyan-500 to-blue-500 text-white' : 'bg-white/10 text-white hover:bg-linear-to-r hover:from-cyan-500/30 hover:to-blue-500/30'}`}>
            <span className="w-2 h-2 rounded-full bg-linear-to-r from-cyan-400 to-blue-400 animate-pulse"></span>
            Visualiser
          </button>
          */}
        </div>

        {/* Instantiates a dynamic mapping pipeline converting nested song objects into distinct interactive SongCards within a Tailwind CSS grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredSongs.map((song, i) => (
            <SongCard key={song.id} song={song} isPlaying={isPlaying} activeSong={activeSong} onPlay={handlePlay} onPause={handlePause} index={i} onSongNameClick={handleSongNameClick} onArtistClick={handleArtistClick} onAlbumClick={handleAlbumClick} playbackRate={playbackRate} />
          ))}
        </div>
      </div>

      {/* Reserves conditionally rendered layout real estate to act as an asynchronous recommendation view context */}
      {false && (
      <div className={`w-full ${filter === 'visualizer' ? 'lg:w-full lg:max-w-full' : 'lg:w-[330px] lg:min-w-[330px]'}`}>
        {/* Back button when in visualizer mode */}
        {filter === 'visualizer' && (
          <div className="mb-4">
            <button onClick={() => setFilter('all')} className="px-4 py-2 rounded-full text-sm font-medium transition-all bg-white/10 text-white hover:bg-white/20">
              ← Back to Search Results
            </button>
          </div>
        )}
        
        {/* Single Song Mode - when only 1 song found, show its analysis only */}
        {songs.length === 1 && activeSong && Object.keys(activeSong).length > 0 && (
          <div className="bg-linear-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800 overflow-x-hidden">
            <h3 className="text-sm font-bold text-white mb-1">Now Playing</h3>
            <p className="text-[12px] text-gray-400 leading-tight mb-3">
              Analyzing <span className="text-cyan-400 font-semibold truncate">{activeSong.trackName || activeSong.albumTitle}</span>
            </p>

            {/* Current Track Analysis */}
            <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                {/* Spinning Album Cover - handle video covers like DiscoverVisualizer */}
                {(() => {
                  const coverMedia = activeSong.albumCoverImageUrl || activeSong.artworkUrl100?.replace('100x100', '200x200');
                  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
                  const isTeddyEmotion = (activeSong.trackName || activeSong.albumTitle || '').toLowerCase().includes('teddy emotion');
                  const useOnsetImages = isVideo && !isTeddyEmotion;
                  
                  return (
                    <div className="relative w-16 h-16 shrink-0">
                      {useOnsetImages ? (
                        <div className={`w-16 h-16 rounded-full overflow-hidden border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }}>
                          <OnsetImageCard
                            songTitle={activeSong.trackName || activeSong.albumTitle}
                            songId={activeSong.id}
                            className="w-full h-full object-cover"
                            isPlaying={isPlaying}
                            isActive={true}
                          />
                        </div>
                      ) : (
                        <img 
                          key={coverMedia || 'search-cover-1'}
                          src={isVideo ? blissImage : (coverMedia || fallbackImage)}
                          alt={activeSong.trackName || activeSong.albumTitle}
                          className={`w-16 h-16 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                          style={{ animationDuration: '3s' }}
                          onError={(e) => { e.target.src = fallbackImage; }}
                        />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-4 h-4 rounded-full bg-gray-900 border border-gray-700"></div>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-white truncate leading-tight">{activeSong.trackName || activeSong.albumTitle}</p>
                  <p className="text-sm text-gray-400 truncate">{activeSong.artistName || 'Unknown Artist'}</p>
                </div>
                {isPlaying && (
                  <div className="flex gap-0.5">
                    <span className="w-1.5 h-3 bg-cyan-400 rounded-full animate-pulse"></span>
                    <span className="w-1.5 h-5 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-3 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
                  </div>
                )}
              </div>
              
              <p className="text-sm text-gray-500 text-center py-4">Similarity updates automatically while playing.</p>
            </div>
            
            <p className="text-xs text-gray-500 mt-3 text-center">Only one result found.</p>
          </div>
        )}
        
        {/* Empty State - when no song is playing */}
        {(!activeSong || Object.keys(activeSong).length === 0) && (
          <div className="bg-linear-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800">
            <p className="text-gray-400 text-center text-sm">Play a song to see recommendations</p>
          </div>
        )}

        {/* Active State - when a song is playing AND more than 1 result */}
        {activeSong && Object.keys(activeSong).length > 0 && songs.length > 1 && (
        <div className="bg-linear-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800 overflow-x-hidden">
          <h3 className="text-sm font-bold text-white mb-1">Similar Artist Tracks</h3>
          <p className="text-[12px] text-gray-400 leading-tight">
            Based on <span className="text-cyan-400 font-semibold truncate">{activeSong.trackName || activeSong.albumTitle}</span>
          </p>

          {/* Current Track Analysis */}
            <div className="mb-3 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                {/* Spinning Album Cover - handle video covers like DiscoverVisualizer */}
                {(() => {
                  const coverMedia = activeSong.albumCoverImageUrl || activeSong.artworkUrl100?.replace('100x100', '200x200');
                  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
                  const isTeddyEmotion = (activeSong.trackName || activeSong.albumTitle || '').toLowerCase().includes('teddy emotion');
                  const useOnsetImages = isVideo && !isTeddyEmotion;
                  
                  return (
                    <div className="relative w-12 h-16 shrink-0">
                      {useOnsetImages ? (
                        <div className={`w-12 h-12 rounded-full overflow-hidden border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }}>
                          <OnsetImageCard
                            songTitle={activeSong.trackName || activeSong.albumTitle}
                            songId={activeSong.id}
                            className="w-full h-full object-cover"
                            isPlaying={isPlaying}
                            isActive={true}
                          />
                        </div>
                      ) : (
                        <img 
                          key={coverMedia || 'search-cover-2'}
                          src={isVideo ? blissImage : (coverMedia || fallbackImage)}
                          alt={activeSong.trackName || activeSong.albumTitle}
                          className={`w-12 h-12 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                          style={{ animationDuration: '3s' }}
                          onError={(e) => { e.target.src = fallbackImage; }}
                        />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-4">
                        <div className="w-3 h-3 rounded-full bg-gray-900 border border-gray-700"></div>
                      </div>
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-white truncate leading-tight">{activeSong.trackName || activeSong.albumTitle}</p>
                  <p className="text-xs text-gray-400 truncate -mt-3">
                    {activeSong.source === 'database' || !activeSong.artistName || activeSong.artistName === 'Unknown Artist' ? ' ' : activeSong.artistName}
                  </p>
                </div>
                {isPlaying && (
                  <div className="flex gap-0.5">
                    <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                    <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
                  </div>
                )}
              </div>
              
              <p className="text-[12px] text-gray-500 text-center">Similarity updates automatically while playing.</p>
            </div>

          {/* Recommendations List */}
          {activeSong && recommendations.length > 0 && (
            <>
              {/* <p className="text-[12px] text-gray-500 mb-2">{recommendations.length} matches • Updates 3s</p> */}
              <div className="space-y-2">
                {recommendations.map((rec) => {
                  return (
                  <div 
                    key={rec.id}
                    onClick={() => handleRecommendationClick(rec)}
                    className="relative p-2 bg-gray-800/70 hover:bg-gray-700/70 rounded-lg border border-gray-700 hover:border-cyan-500 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      {/* Album Cover - Use real cover if available, otherwise gradient matches Discover page */}
                      <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 border border-gray-600 group-hover:border-cyan-500 transition-colors">
                        {(() => {
                          const recMedia = rec.albumCoverImageUrl || rec.artworkUrl100;
                          const recIsVideo = recMedia && recMedia.toLowerCase().includes('.mp4');
                          const recIsTeddy = (rec.trackName || rec.albumTitle || '').toLowerCase().includes('teddy emotion');
                          const recUseOnset = recIsVideo && !recIsTeddy;
                          if (recUseOnset) {
                            return (
                              <OnsetImageCard
                                songTitle={rec.trackName || rec.albumTitle}
                                songId={rec.id}
                                className="w-full h-full object-cover"
                                isPlaying={false}
                                isActive={false}
                              />
                            );
                          }
                          if (recMedia) {
                            return (
                              <img 
                                src={recMedia} 
                                alt={rec.trackName} 
                                className="w-full h-full object-cover"
                                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                              />
                            );
                          }
                          return null;
                        })()}
                         <div className="w-full h-full bg-linear-to-br from-cyan-600 via-purple-600 to-pink-600 flex items-center justify-center" style={{ display: (rec.albumCoverImageUrl || rec.artworkUrl100) ? 'none' : 'flex' }}>
                          <svg className="w-8 h-8 text-blue-900" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                          </svg>
                        </div>
                      </div>

                      {/* Product Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-white font-semibold truncate group-hover:text-cyan-400 transition-colors text-[12px]">
                            {rec.trackName}
                          </h4>
                          <span className={`px-1.5 py-0.5 rounded-full text-[12px] font-bold text-white shrink-0 ${
                            rec.similarity_score >= 0.7 ? 'bg-green-500' : 
                            rec.similarity_score >= 0.5 ? 'bg-yellow-500' : 
                            'bg-red-500'
                          }`}>
                            {Math.round(rec.similarity_score * 100)}%
                          </span>
                        </div>
                        <p className="text-[12px] text-gray-400 truncate">{rec.collectionName || rec.albumTitle || 'Unknown Album'}</p>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          )}

          {/* No matches state */}
          {!recLoading && recommendations.length === 0 && (
            <div className="text-center py-6">
              <p className="text-gray-400 text-sm">Finding similar artist tracks...</p>
              <p className="text-xs text-gray-500 mt-2">Preparing recommendations</p>
            </div>
          )}
        </div>
        )}
      </div>
      )}
    </div>
  );
};

export default Search;
