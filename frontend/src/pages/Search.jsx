import { useState, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';

import Loader from '../components/Loader';
import AudioReactiveVideo from '../components/AudioReactiveVideo';
import { useAudioFeatures } from '../context/AudioFeaturesContext';
import { setActiveSong, playPause, setPlaybackRate } from '../redux/features/playerSlice';
import { addToCart } from '../redux/features/cartSlice';
import { addToWishlistLocal, removeFromWishlistLocal, addWishlistItem, removeWishlistItem } from '../redux/features/wishlistSlice';
import { useAuth } from '../context/AuthContext';
import { auth as firebaseAuth } from '../firebase';
import { productService } from '../redux/services';
import { FaPauseCircle, FaPlayCircle, FaStar, FaRegStar } from 'react-icons/fa';
import { FiShoppingCart, FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import envConfig from '../config/environment';
import blissImage from '../assets/bliss.png';

const ARTISTS = ['Aphex Twin', 'Boards of Canada', 'Squarepusher'];

const getArtistBadgeColor = (artist) => {
  if (artist?.toLowerCase().includes('aphex')) return 'bg-purple-500';
  if (artist?.toLowerCase().includes('boards')) return 'bg-orange-500';
  if (artist?.toLowerCase().includes('squarepusher')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');

// Helper function for mood-based colors - same as SmartRecommendationVisualizer
const getFeatureColor = (label, value) => {
  const numericValue = parseInt(value);
  
  if (label === 'Tempo') {
    if (numericValue < 90) return { bg: 'bg-blue-900/50', text: 'text-blue-300', border: 'border-blue-500/50' };
    if (numericValue < 130) return { bg: 'bg-green-900/50', text: 'text-green-300', border: 'border-green-500/50' };
    return { bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-500/50' };
  }
  
  if (numericValue >= 70) return { bg: 'bg-green-900/50', text: 'text-green-300', border: 'border-green-500/50' };
  if (numericValue >= 50) return { bg: 'bg-yellow-900/50', text: 'text-yellow-300', border: 'border-yellow-500/50' };
  return { bg: 'bg-red-900/50', text: 'text-red-300', border: 'border-red-500/50' };
};

// Feature Badge Component - with dynamic colors (compact)
const FeatureBadge = ({ label, value }) => {
  const colors = getFeatureColor(label, value);
  return (
    <div className={`rounded-md px-1 py-1 text-center border ${colors.bg} ${colors.border}`}>
      <div className="text-[12px] text-gray-400 leading-tight">{label}</div>
      <div className={`text-[12px] font-bold leading-tight ${colors.text}`}>{value}</div>
    </div>
  );
};

const SongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index, onSongNameClick, onArtistClick, onAlbumClick, playbackRate }) => {
  const dispatch = useDispatch();
  const isThisSongActive = activeSong?.id === song.id;
  
  // Prioritize the song's own artwork. Only use matched DB song's cover if the main song has none (unlikely for iTunes)
  // And definitely do NOT override artwork with a video from a matched song for the card display.
  const albumArt = song.albumCoverImageUrl || song.artworkUrl100?.replace('100x100', '600x600') || fallbackImage;
  
  // Enable video only for database songs (discover page style)
  const isVideo = song.source === 'database' && albumArt && albumArt.toLowerCase().includes('.mp4');
  const coverMedia = albumArt;
  const isLibrarySong = song.source === 'database';
  
  const [isHovered, setIsHovered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Discount logic matching CustomerScreen SongCard (even IDs get 50% off)
  const songPrice = song.matchedDbSong?.albumPrice || song.price || 0;
  const songId = song.matchedDbSong?.id || song.id;
  const hasDiscount = isLibrarySong && songId != null && songId % 2 === 0;
  const discountedPrice = hasDiscount ? songPrice / 2 : null;

  // Wishlist support
  const { items: wishlistItems } = useSelector((state) => state.wishlist);
  const { currentUser } = useAuth();
  const isWishlisted = isLibrarySong && wishlistItems.some(
    (item) => item.productId === songId || item.product?.id === songId
  );

  const handleToggleWishlist = async (e) => {
    e.stopPropagation();
    if (!currentUser || !isLibrarySong) return;
    const accountId = currentUser.id;
    const email = currentUser.email || currentUser.accountEmailAddress;
    const password = currentUser.password;
    const isFirebaseUser = !!currentUser.firebaseUid;
    let authParams = {};
    if (isFirebaseUser && firebaseAuth.currentUser) {
      try {
        const token = await firebaseAuth.currentUser.getIdToken();
        authParams = { email, firebaseToken: token };
      } catch (err) { console.warn('Failed to get Firebase token for wishlist:', err); }
    } else if (email && password) {
      authParams = { email, password };
    }
    const hasAuth = !!(authParams.password || authParams.firebaseToken);
    if (isWishlisted) {
      const entry = wishlistItems.find((item) => item.productId === songId || item.product?.id === songId);
      if (entry) {
        dispatch(removeFromWishlistLocal({ productId: songId, accountId }));
        if (hasAuth) dispatch(removeWishlistItem({ id: entry.id, ...authParams }));
      }
    } else {
      dispatch(addToWishlistLocal({ ...(song.matchedDbSong || song), accountId }));
      if (hasAuth) dispatch(addWishlistItem({ wishlistData: { accountId, productId: songId }, ...authParams }));
    }
  };

  // Handle playback rate change for videos
  const handlePlaybackRateChange = (e) => {
    const newRate = parseFloat(e.target.value);
    dispatch(setPlaybackRate(newRate));
  };

  // Handle clicking on song name - navigate to details
  const handleSongNameClick = (e) => {
    e.stopPropagation();
    if (onSongNameClick) {
      onSongNameClick(song);
    }
  };

  // Handle clicking on artist name - navigate to artist details
  const handleArtistClick = (e) => {
    e.stopPropagation();
    if (onArtistClick) {
      onArtistClick(song.artistName);
    }
  };

  // Handle clicking on album name - navigate to album details
  const handleAlbumClick = (e) => {
    e.stopPropagation();
    if (onAlbumClick && song.collectionName) {
      onAlbumClick(song.collectionName, song);
    }
  };

  return (
    <div className="flex flex-col p-4 bg-white/5 backdrop-blur-sm animate-slideup rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      <div 
        className="relative w-full aspect-square rounded-lg overflow-hidden outline-none border-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >      
        {/* Album Art or Video */}
        {isVideo ? (
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

        {/* Artist Badge - only show for songs with valid artist names (not database songs) */}
        {song.artistName && song.artistName !== 'Unknown Artist' && song.source !== 'database' && (
          <div className={`absolute top-2 left-2 px-2 py-1 ${getArtistBadgeColor(song.artistName)} rounded-full text-[12px] font-bold text-white shadow-lg max-w-[calc(100%-5rem)] truncate`}>
            {song.artistName}
          </div>
        )}

        {/* Similarity Badge - for artist songs with similarity score */}
        {song.similarity && song.source !== 'database' && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-cyan-500/90 rounded-full text-[12px] font-bold text-white shadow-lg">
            {(song.similarity * 100).toFixed(0)}%
          </div>
        )}

        {/* Maximise button for video cards - top right */}
        {isVideo && (
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

      {/* Tempo Slider - shown on all video cards for consistent row height, only interactive for the active song */}
      {isVideo && (
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

      {/* Fullscreen video overlay portal */}
      {isVideo && isFullscreen && createPortal(
        <div className="fixed inset-0 bg-black flex flex-col items-center justify-center" style={{ zIndex: 99999 }}>
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/80 to-transparent z-10">
            <h3 className="text-white font-semibold text-lg truncate">{song.trackName || song.albumTitle}</h3>
            <button onClick={() => setIsFullscreen(false)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all hover:scale-110" title="Minimise video">
              <FiMinimize2 className="w-6 h-6 text-white" />
            </button>
          </div>
          <div className="absolute inset-0 w-full h-full">
            <AudioReactiveVideo src={coverMedia} alt={song.trackName} className="w-full h-full object-contain" isPlaying={isPlaying && isThisSongActive} isActive={isThisSongActive} playbackRate={isThisSongActive ? (playbackRate || 1.0) : 1.0} />
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
                    ${songPrice.toFixed(2)}
                  </p>
                  <p className="text-sm font-bold text-green-400">
                    ${discountedPrice.toFixed(2)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm font-bold text-white">
                ${songPrice.toFixed(2)}
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
          {/* Matched to library section - like SimilarSongs page */}
          {song.matchedDbSong && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <p className="text-[10px] text-cyan-400">Matched to library:</p>
              <p className="text-xs text-white truncate">{song.matchedDbSong.albumTitle}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const Search = () => {
  const { searchTerm } = useParams();
  const [loading, setLoading] = useState(true);
  const [songs, setSongs] = useState([]);
  const [dbSongs, setDbSongs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recommendationPool, setRecommendationPool] = useState([]); // Pool of all artist songs for visualizer
  const [displayedFeatures, setDisplayedFeatures] = useState(null);
  const [displayedPlaybackRate, setDisplayedPlaybackRate] = useState(1);
  const [cachedAudioFeatures, setCachedAudioFeatures] = useState({}); // Real features from DB
  const [analyzing, setAnalyzing] = useState(false);
  const matchStartedRef = useRef(false);
  
  const intervalRef = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { activeSong, isPlaying, playbackRate } = useSelector((state) => state.player);
  
  // Get audio features from shared context
  const { audioFeatures } = useAudioFeatures();
  
  // Store values in refs so interval always has latest value without triggering re-renders
  const audioFeaturesRef = useRef(audioFeatures);
  audioFeaturesRef.current = audioFeatures;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  // Reset match flag when search term changes
  useEffect(() => {
    matchStartedRef.current = false;
  }, [searchTerm]);

  // Initial data fetch - searches database songs and iTunes artist songs based on searchTerm
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
      
      try {
        // Fetch database songs
        const products = await productService.getAllProducts();
        // Only include actual store products (positive IDs), exclude cached iTunes songs
        const musicProducts = products.filter(p => p.albumTitle && p.fileUrl && p.id > 0);
        setDbSongs(musicProducts);
        
        // Also fetch iTunes songs for the 3 artists (same as TopCharts)
        const allArtistSongs = [];
        
        // Loop through the 3 specific artists (Not the user's search term)
        for (let i = 0; i < ARTISTS.length; i++) {
          const artist = ARTISTS[i];
          try {
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Search iTunes for THE ARTIST, not the user's typed word
            const response = await fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&media=music&entity=song&limit=200`,
              { signal: abortController.signal }
            );

            // process results into allArtistSongs
            const data = await response.json();
            
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
        const filteredDbSongs = musicProducts.filter(song => {
          const albumMatch = song.albumTitle?.toLowerCase().includes(searchLower);
          const artistMatch = song.artistName?.toLowerCase().includes(searchLower);
          const nameMatch = song.productName?.toLowerCase().includes(searchLower);
          const genreMatch = song.genre?.toLowerCase().includes(searchLower);
          return albumMatch || artistMatch || nameMatch || genreMatch;
        }).map((song, index) => ({
          id: song.productId || `db-${index}`,
          trackId: song.productId || `db-${index}`,
          trackName: song.albumTitle || song.productName,
          albumTitle: song.albumTitle || song.productName,
          artistName: song.artistName || 'Unknown Artist',
          collectionName: song.albumTitle,
          artworkUrl100: song.albumCoverImageUrl || song.coverImage || fallbackImage,
          albumCoverImageUrl: song.albumCoverImageUrl || song.coverImage,
          previewUrl: song.fileUrl,
          fileUrl: song.fileUrl,
          price: song.unitPrice || 1.29,
          primaryGenreName: song.genre || 'Electronic',
          trackTimeMillis: song.duration || 0,
          matchedDbSong: song,
          source: 'database'
        }));
        
        // NOW filter that pool by the user's search word
        // fetches all products from the database and filters them locally to see if 
        // the typed word is in the song name, Album Title, Artist Name, or Genre.
        const filteredArtistSongs = allArtistSongs.filter(song => {
          // If song is already in matchedArtistSongs (which contains DB matches), exclude it
          // Actually we haven't matched yet.
          
          const trackMatch = song.trackName?.toLowerCase().includes(searchLower);
          const artistMatch = song.artistName?.toLowerCase().includes(searchLower);
          const albumMatch = song.collectionName?.toLowerCase().includes(searchLower);
          const genreMatch = song.primaryGenreName?.toLowerCase().includes(searchLower);
          return trackMatch || artistMatch || albumMatch || genreMatch;
        });
        
        // Combine results and calculate relevance scores
        const allResults = [...filteredDbSongs, ...filteredArtistSongs].map(song => {
          let relevance = 0.5;
          const title = (song.trackName || song.albumTitle || '').toLowerCase();
          const artist = (song.artistName || '').toLowerCase();
          
          // Boost exact matches
          if (title === searchLower) relevance = 1.0;
          else if (artist === searchLower) relevance = 0.95;
          else if (title.startsWith(searchLower)) relevance = 0.9;
          else if (artist.startsWith(searchLower)) relevance = 0.85;
          else if (title.includes(searchLower)) relevance = 0.75;
          else if (artist.includes(searchLower)) relevance = 0.7;
          
          // Database songs get a small boost
          if (song.source === 'database') relevance += 0.05;
          
          // Use relevance as the main sorting score, but DO NOT assign it to 'similarity'
          // 'similarity' is reserved for AUDIO similarity (Real ML)
          // This ensures we don't show "95%" badges for text matches
          return { ...song, relevance, similarity: undefined };
        });
        
        // Remove duplicates (prefer database version)
        const seen = new Set();
        const uniqueResults = allResults.filter(song => {
          // Create a distinctive key that avoids conflating different songs with similar names
          // Include source to ensure we don't accidentally deduce duplicates across different systems unless identical
          const key = `${song.trackName?.toLowerCase().trim()}-${song.artistName?.toLowerCase().trim()}`;
          
          if (seen.has(key)) {
             // If we already have this song, but the current one is from database and the previous was from iTunes (unlikely given order), keep database.
             // Given allResults = [...filteredDbSongs, ...matchedArtistSongs], DB songs come first.
             // So if we see it again (iTunes version matches DB name), we skip the iTunes version. This is CORRECT behavior.
             return false;
          }
          seen.add(key);
          return true;
        });
        
        // Sort by relevance
        uniqueResults.sort((a, b) => b.relevance - a.relevance);
        setSongs(uniqueResults);
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
  useEffect(() => {
    const fetchCachedFeatures = async () => {
      try {
        const audioServiceUrl = envConfig.getApiBaseUrl();
        const response = await fetch(`${audioServiceUrl}/api/audio/cached-features?artist_only=false`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'success' && data.features) {
            // Backend returns a dictionary/object mapped by ID, use it directly
            setCachedAudioFeatures(data.features);
            console.log(`✅ Loaded ${data.count} cached audio features for artist songs`);
          }
        }
      } catch (err) {
        console.warn('Could not fetch cached audio features for similarity matching:', err.message);
      }
    };

    fetchCachedFeatures();
  }, []); // Fetch once on mount

  // Match iTunes songs to Library songs using New Bulk Endpoint
  useEffect(() => {
    // Need songs and dbSongs to proceed
    if (loading || songs.length === 0 || dbSongs.length === 0) return;
    
    // Check if we already started matching to avoid infinite loop
    if (matchStartedRef.current) return;

    // Check if there are any candidate songs (non-database songs that haven't been matched yet)
    // We filter for songs that are NOT from database.
    const candidates = songs.filter(s => s.source !== 'database' && !s.matchedDbSong);
    
    if (candidates.length === 0) {
        // Nothing to match
        return; 
    }

    matchStartedRef.current = true;
    setAnalyzing(true);

    const matchSongsUsingBulkEndpoint = async () => {
        const apiBaseUrl = envConfig.getApiBaseUrl();
        // console.log(`[Search] Matching ${candidates.length} iTunes songs to Library using Bulk Match...`);
        
        // Split songs into smaller batches to allow for on-the-fly feature extraction
        const BATCH_SIZE = 10; 
        const batches = [];
        for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
            batches.push(candidates.slice(i, i + BATCH_SIZE));
        }

        // Limit DB songs IDs to send to backend (ensure we compare against exactly these 47)
        const targetIds = dbSongs.map(s => s.id);

        for (const batch of batches) {
             const payload = {
                candidates: batch.map(s => ({
                    trackId: String(s.trackId || s.id),
                    trackName: String(s.trackName || s.albumTitle || 'Unknown'),
                    artistName: String(s.artistName),
                    previewUrl: String(s.previewUrl || s.fileUrl || '')
                })),
                target_ids: targetIds,
                limit: BATCH_SIZE
             };
             
             try {
                const response = await fetch(`${apiBaseUrl}/api/audio/match-library`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const matches = data.matches || [];
                    
                    if (matches.length > 0) {
                        setSongs(currentSongs => {
                            const newSongs = [...currentSongs];
                            let updated = false;
                            
                            matches.forEach(match => {
                                const index = newSongs.findIndex(s => String(s.trackId || s.id) === String(match.input_track_id));
                                if (index !== -1) {
                                    newSongs[index] = {
                                        ...newSongs[index],
                                        similarity: match.similarity_score,
                                        similarity_score: match.similarity_score,
                                        match_reason: match.match_reason,
                                        tempo_match: match.tempo_match,
                                        energy_match: match.energy_match,
                                        mood_match: match.mood_match,
                                        dance_match: match.dance_match,
                                        matchedDbSong: {
                                            id: match.matched_product_id,
                                            albumTitle: match.matched_product_name || `Track ${match.matched_product_id}`,
                                            // Add extra fields if necessary (price, etc. if available from DB list)
                                            ...dbSongs.find(d => String(d.id) === String(match.matched_product_id))
                                        }
                                    };
                                    updated = true;
                                }
                            });

                            if (updated) {
                                // Sort by Relevance (Primary) then Similarity (Secondary)
                                // This ensures songs "stay in place" (relevance) but are ordered by score where relevance is equal
                                newSongs.sort((a, b) => {
                                    const relA = a.relevance || 0;
                                    const relB = b.relevance || 0;
                                    if (Math.abs(relB - relA) > 0.05) return relB - relA;
                                    return (b.similarity_score || 0) - (a.similarity_score || 0);
                                });
                            }
                            
                            return updated ? newSongs : currentSongs;
                        });
                    }
                }
             } catch (e) {
                 console.warn("Bulk match failed", e);
             }
             
             // Tiny delay
             await new Promise(r => setTimeout(r, 50));
        }
        
        setAnalyzing(false);
    };

    matchSongsUsingBulkEndpoint();
  }, [loading, dbSongs, songs]); // React to changes in songs list (e.g. from new search)

  // Single useEffect to handle all recommendation updates (Visualizer logic commented out)
  /*
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!activeSong || songs.length === 0) {
      setRecommendations([]);
      return;
    }

    // Helper function to update recommendations
    const updateRecs = async () => {
      try {
        const apiBaseUrl = envConfig.getApiBaseUrl();
        // Unified endpoint handles pool selection based on source
        
        // Note: displayedSongs was likely intended to be filteredSongs or songs, check variable scope if restoring
        const candidateSource = songs; // Fallback if displayedSongs was unavailable

        const payload = {
            source: 'search_component',
            current_product_id: String(activeSong.trackId || activeSong.id),
            preview_url: String(activeSong.previewUrl || activeSong.fileUrl || ''),
            audio_features: audioFeaturesRef.current ? {
                 tempo: Number(audioFeaturesRef.current.tempo),
                 energy: Number(audioFeaturesRef.current.energy),
                 valence: Number(audioFeaturesRef.current.valence),
                 danceability: Number(audioFeaturesRef.current.danceability),
                 acousticness: Number(audioFeaturesRef.current.acousticness),
                 effective_tempo: audioFeaturesRef.current.tempo ? (Number(audioFeaturesRef.current.tempo) * Number(playbackRateRef.current || 1)) : null,
                 playback_rate: Number(playbackRateRef.current || 1)
            } : null,
            limit: 5,
            // Compare against top 15 results to prevent backend timeout from feature extraction
            // Strict casting to prevent 422 errors
            candidates: candidateSource.slice(0, 15).map(s => ({
                trackId: String(s.trackId || s.id || 0),
                trackName: String(s.trackName || s.albumTitle || 'Unknown Track'),
                artistName: String(s.artistName || 'Unknown Artist'),
                collectionName: s.collectionName || s.albumTitle ? String(s.collectionName || s.albumTitle) : null,
                artworkUrl100: s.artworkUrl100 || s.coverImage ? String(s.artworkUrl100 || s.coverImage) : null,
                previewUrl: s.previewUrl || s.fileUrl ? String(s.previewUrl || s.fileUrl) : null
                // Removed extra fields (price, genre, duration) to avoid validation errors if backend is stale
            })),
            limit: 5
        };

        console.log('[Search] Sending Unified Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(`${apiBaseUrl}/api/audio/unified-recommendations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
           const data = await response.json();
           if (data.recommendations) {
               setRecommendations(data.recommendations);
           }
           if (data.target_features) {
               setDisplayedFeatures({
                   tempo: data.target_features.tempo,
                   energy: data.target_features.energy,
                   valence: data.target_features.valence,
                   danceability: data.target_features.danceability
               });
           }
        }
      } catch (err) {
         // console.warn("ML Similarity update failed", err);
      }
    };

    // Immediate update
    setRecLoading(true);
    updateRecs();
    setRecLoading(false);

    // Set up polling interval (3 seconds) - same as SmartRecommendationVisualizer
    intervalRef.current = setInterval(updateRecs, 3000);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeSong?.id, recommendationPool, songs]);
  */

  const filteredSongs = useMemo(() => {
    if (filter === 'all') return songs;
    return songs.filter(song => song.artistName?.toLowerCase().includes(filter.toLowerCase()));
  }, [songs, filter]);

  const handlePlay = (song, index) => {
    if (song.fileUrl) {
      dispatch(setActiveSong({ song, data: filteredSongs, i: index }));
      dispatch(playPause(true));
    }
  };

  const handlePause = () => {
    dispatch(playPause(false));
  };

  // Handle clicking on a song name - navigate to song details page
  const handleSongNameClick = (song) => {
    // For database songs, navigate like Discover page with full product data
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
      // For artist songs, navigate with iTunes data - only use songs from the 3 main artists for similarity
      const mainArtistSongs = songs.filter(s => {
        if (s.id === song.id) return false; // Exclude current song
        const artistLower = (s.artistName || '').toLowerCase();
        return artistLower.includes('aphex') || 
               artistLower.includes('boards of canada') || 
               artistLower.includes('squarepusher');
      });
      
      navigate(`/songs/${song.trackId || song.id}`, {
        state: {
          song: song,
          artistSongs: mainArtistSongs, // Only pass songs from the 3 main artists
          fromDiscover: true // Use all passed songs for similarity (not filtered by artist)
        }
      });
    }
  };

  // Handle clicking on artist name - navigate to artist details page
  const handleArtistClick = (artistName) => {
    const slug = artistName.toLowerCase().replace(/\s+/g, '-');
    navigate(`/artists/${slug}`);
  };

  // Handle clicking on album name - navigate to album details page
  const handleAlbumClick = (albumName, song) => {
    navigate(`/albums/${encodeURIComponent(albumName)}`, {
      state: {
        // Pass artist name to filter album songs by artist
        artistName: song.artistName,
        albumArtwork: song.artworkUrl100?.replace('100x100', '600x600')
      }
    });
  };

  // Handle clicking on a recommended artist song
  const handleRecommendationClick = (song) => {
    if (song?.fileUrl) {
      const index = songs.findIndex(s => s.id === song.id);
      dispatch(setActiveSong({ song, data: songs, i: index }));
      dispatch(playPause(true));
    }
  };

  if (loading) return <Loader title={searchTerm ? `Searching for "${searchTerm}"...` : "Loading..."} />;
  
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

  // Show no results state
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
    <div className="flex flex-col lg:flex-row gap-6 scrollbar-hide overflow-x-hidden">
      {/* Main Content */}
      <div className={`flex-1 min-w-0`}>
        <div className="mb-4 sm:mb-6">
          <h1 className="font-bold text-xl sm:text-2xl md:text-3xl text-white mb-2">
            Search Results for "{searchTerm}"
          </h1>
          <p className="text-gray-400">Found {songs.length} {songs.length === 1 ? 'song' : 'songs'} matching your search</p>
          <div className="flex flex-col sm:flex-row gap-2 mt-1">
            <p className="text-xs text-cyan-400">Powered by iTunes API - Preview songs before purchasing</p>
            {analyzing && (
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-yellow-500 font-semibold animate-pulse">Analyzing audio & matching... scores update live</span>
                </div>
            )}
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${filter === 'all' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            All Results ({songs.length})
          </button>
          
          {/* Visualiser button commented out
          <button onClick={() => setFilter('visualizer')} className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${filter === 'visualizer' ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white' : 'bg-white/10 text-white hover:bg-gradient-to-r hover:from-cyan-500/30 hover:to-blue-500/30'}`}>
            <span className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 animate-pulse"></span>
            Visualiser
          </button>
          */}
        </div>

        {/* Song Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredSongs.map((song, i) => (
            <SongCard key={song.id} song={song} isPlaying={isPlaying} activeSong={activeSong} onPlay={handlePlay} onPause={handlePause} index={i} onSongNameClick={handleSongNameClick} onArtistClick={handleArtistClick} onAlbumClick={handleAlbumClick} playbackRate={playbackRate} />
          ))}
        </div>
      </div>

      {/* Right Sidebar - Real-time Recommendations with Audio Feature Badges */}
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
          <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800 overflow-x-hidden">
            <h3 className="text-sm font-bold text-white mb-1">Now Playing - Audio Analysis</h3>
            <p className="text-[12px] text-gray-400 leading-tight mb-3">
              Analyzing <span className="text-cyan-400 font-semibold truncate">{activeSong.trackName || activeSong.albumTitle}</span>
            </p>

            {/* Current Track Analysis */}
            <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                {/* Spinning Album Cover - handle video covers like SmartRecommendationVisualizer */}
                {(() => {
                  const coverMedia = activeSong.albumCoverImageUrl || activeSong.artworkUrl100?.replace('100x100', '200x200');
                  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
                  
                  return (
                    <div className="relative w-16 h-16 flex-shrink-0">
                      <img 
                        key={coverMedia || 'search-cover-1'}
                        src={isVideo ? blissImage : (coverMedia || fallbackImage)}
                        alt={activeSong.trackName || activeSong.albumTitle}
                        className={`w-16 h-16 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                        style={{ animationDuration: '3s' }}
                        onError={(e) => { e.target.src = fallbackImage; }}
                      />
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
              
              {/* Audio Feature Badges - Larger for single song view */}
              {displayedFeatures && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-700/50 rounded-lg p-2 border border-gray-600">
                    <div className="text-xs text-gray-400">Tempo</div>
                    <div className="text-xl font-bold text-cyan-400">{Math.round((displayedFeatures.tempo || 0) * (displayedPlaybackRate || 1))} BPM</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-2 border border-gray-600">
                    <div className="text-xs text-gray-400">Energy</div>
                    <div className="text-xl font-bold text-green-400">{Math.round((displayedFeatures.energy || 0) * 100)}%</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-2 border border-gray-600">
                    <div className="text-xs text-gray-400">Mood</div>
                    <div className="text-xl font-bold text-yellow-400">{Math.round((displayedFeatures.valence || 0) * 100)}%</div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-2 border border-gray-600">
                    <div className="text-xs text-gray-400">Danceability</div>
                    <div className="text-xl font-bold text-purple-400">{Math.round((displayedFeatures.danceability || 0) * 100)}%</div>
                  </div>
                </div>
              )}
              
              {!displayedFeatures && (
                <p className="text-sm text-gray-500 text-center py-4">Analyzing audio features...</p>
              )}
            </div>
            
            <p className="text-xs text-gray-500 mt-3 text-center">Only one result found - showing audio analysis only</p>
          </div>
        )}
        
        {/* Empty State - when no song is playing */}
        {(!activeSong || Object.keys(activeSong).length === 0) && (
          <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800">
            <p className="text-gray-400 text-center text-sm">Play a song to see {songs.length === 1 ? 'audio analysis' : 'recommendations'}</p>
          </div>
        )}

        {/* Active State - when a song is playing AND more than 1 result */}
        {activeSong && Object.keys(activeSong).length > 0 && songs.length > 1 && (
        <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-lg border border-gray-800 overflow-x-hidden">
          <h3 className="text-sm font-bold text-white mb-1">Similar Artist Tracks</h3>
          <p className="text-[12px] text-gray-400 leading-tight">
            Based on <span className="text-cyan-400 font-semibold truncate">{activeSong.trackName || activeSong.albumTitle}</span>
          </p>

          {/* Current Track Analysis */}
            <div className="mb-3 p-2 bg-gray-800/50 rounded-lg border border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                {/* Spinning Album Cover - handle video covers like SmartRecommendationVisualizer */}
                {(() => {
                  const coverMedia = activeSong.albumCoverImageUrl || activeSong.artworkUrl100?.replace('100x100', '200x200');
                  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
                  
                  return (
                    <div className="relative w-12 h-16 flex-shrink-0">
                      <img 
                        key={coverMedia || 'search-cover-2'}
                        src={isVideo ? blissImage : (coverMedia || fallbackImage)}
                        alt={activeSong.trackName || activeSong.albumTitle}
                        className={`w-12 h-12 rounded-full object-cover border-2 border-cyan-500/50 ${isPlaying ? 'animate-spin' : ''}`}
                        style={{ animationDuration: '3s' }}
                        onError={(e) => { e.target.src = fallbackImage; }}
                      />
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
                <p className="text-[17px] text-gray-500 text-center">Analyzing audio features...</p>
              )}
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
                      <div className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 border border-gray-600 group-hover:border-cyan-500 transition-colors">
                        {rec.albumCoverImageUrl || rec.artworkUrl100 ? (
                           <img 
                             src={rec.albumCoverImageUrl || rec.artworkUrl100} 
                             alt={rec.trackName} 
                             className="w-full h-full object-cover"
                             onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                           />
                        ) : null}
                         <div className="w-full h-full bg-gradient-to-br from-cyan-600 via-purple-600 to-pink-600 flex items-center justify-center" style={{ display: (rec.albumCoverImageUrl || rec.artworkUrl100) ? 'none' : 'flex' }}>
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
                          <span className={`px-1.5 py-0.5 rounded-full text-[12px] font-bold text-white flex-shrink-0 ${
                            rec.similarity_score >= 0.7 ? 'bg-green-500' : 
                            rec.similarity_score >= 0.5 ? 'bg-yellow-500' : 
                            'bg-red-500'
                          }`}>
                            {Math.round(rec.similarity_score * 100)}%
                          </span>
                        </div>
                        <p className="text-[12px] text-gray-400 truncate">{rec.match_reason}</p>
                        
                        {/* Feature Matches */}
                        <div className="flex gap-1 mt-1 flex-wrap">
                          <span className={`px-1 py-0.5 rounded text-[12px] ${
                            rec.tempo_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.tempo_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Tempo:{Math.round(rec.tempo_match * 100)}%
                          </span>
                          <span className={`px-1 py-0.5 rounded text-[12px] ${
                            rec.energy_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.energy_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Energy:{Math.round(rec.energy_match * 100)}%
                          </span>
                          <span className={`px-1 py-0.5 rounded text-[12px] ${
                            rec.mood_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.mood_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Mood:{Math.round(rec.mood_match * 100)}%
                          </span>
                          <span className={`px-1 py-0.5 rounded text-[12px] ${
                            rec.dance_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                            rec.dance_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                            'bg-red-500/30 text-red-300'
                          }`}>
                            Dance:{Math.round(rec.dance_match * 100)}%
                          </span>
                        </div>
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
              <p className="text-xs text-gray-500 mt-2">Analyzing audio features</p>
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
