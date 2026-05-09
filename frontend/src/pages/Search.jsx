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
import { fixTextDeep } from '../utils/fixText';
import { useActionToast } from '../components/CartToast';

const ARTISTS = ['Aphex Twin', 'Boards of Canada', 'Squarepusher'];

const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');

const MATCH_PENDING_STATE = {
  id: null,
  albumTitle: 'Matching library...',
};

const MATCH_NOT_FOUND_STATE = {
  id: null,
  albumTitle: 'No similar library track found',
};

const MATCH_WARMING_STATE = {
  id: null,
  albumTitle: 'Loading song matches...',
};

const MATCH_STATUS = {
  pending: 'pending',
  resolved: 'resolved',
  warming: 'warming',
  notFound: 'not_found',
};

const SongCard = ({ song, isPlaying, activeSong, onPlay, onPause, index, onSongNameClick, onArtistClick, onAlbumClick, playbackRate }) => {
  const dispatch = useDispatch();
  const [showActionToast, ActionToast] = useActionToast();
  const isThisSongActive = activeSong?.id === song.id;
  
  const albumArt = song.albumCoverImageUrl || song.artworkUrl100?.replace('100x100', '600x600') || fallbackImage;
  
  const isVideo = song.source === 'database' && albumArt && albumArt.toLowerCase().includes('.mp4');
  const coverMedia = albumArt;
  
  const isLibrarySong = song.source === 'database';
  
  const songTitle = song.trackName || song.albumTitle || '';
  const isTeddyEmotion = songTitle.toLowerCase().includes('teddy emotion');
  const useOnsetImages = isVideo && !isTeddyEmotion;
  
  const [isHovered, setIsHovered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const songPrice = song.matchedDbSong?.albumPrice || song.price || 0;
  const songId = song.matchedDbSong?.id || song.id;
  const hasDiscount = isLibrarySong && songId != null && songId % 2 === 0;
  const discountedPrice = hasDiscount ? songPrice / 2 : null;

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
      dispatch(removeFromWishlistLocal({ productId: songId, accountId }));
      dispatch(removeWishlistByProduct({ accountId, productId: songId, ...authParams }));
      showActionToast(songTitle, 'wish-remove');
    } else {
      dispatch(addToWishlistLocal({ ...(song.matchedDbSong || song), accountId }));
      if (hasAuth) dispatch(addWishlistItem({ wishlistData: { accountId, productId: songId }, ...authParams }));
      showActionToast(songTitle, 'wish-add');
    }
  };

  const handlePlaybackRateChange = (e) => {
    const newRate = parseFloat(e.target.value);
    dispatch(setPlaybackRate(newRate));
  };

  const handleSongNameClick = (e) => {
    e.stopPropagation();
    if (onSongNameClick) {
      onSongNameClick(song);
    }
  };

  const handleArtistClick = (e) => {
    e.stopPropagation();
    if (onArtistClick) {
      onArtistClick(song.artistName);
    }
  };

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
        
        {/* Play/Pause overlay */}
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

        {/* Maximise button for video/onset cards */}
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

      {/* Tempo Slider */}
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

      {/* Song Info */}
      {song.source === 'database' ? (
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

          {/* Library match footer — shown for all iTunes songs that have any matchStatus */}
          {(song.matchedLibraryTrack ||
            song.matchStatus === MATCH_STATUS.pending ||
            song.matchStatus === MATCH_STATUS.warming ||
            song.matchStatus === MATCH_STATUS.resolved ||
            song.matchStatus === MATCH_STATUS.notFound) && (
            <div className="mt-2 pt-2 border-t border-gray-700/50">
              <p className="text-[10px] text-cyan-400">Matched via library track:</p>
              {(song.matchStatus === MATCH_STATUS.warming || song.matchStatus === MATCH_STATUS.notFound) ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="w-2.5 h-2.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-[11px] text-yellow-400 truncate font-medium">
                    {MATCH_WARMING_STATE.albumTitle}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-white truncate font-medium">
                  {song.matchStatus === MATCH_STATUS.pending
                    ? MATCH_PENDING_STATE.albumTitle
                    : song.matchedLibraryTrack}
                </p>
              )}
              {song.matchStatus === MATCH_STATUS.resolved && song.matchedDbSong?.tempo_match != null && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  <span className={`px-1 py-0.5 rounded text-[10px] ${
                    song.matchedDbSong.tempo_match >= 0.7 ? 'bg-green-500/30 text-green-300' :
                    song.matchedDbSong.tempo_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' :
                    'bg-red-500/30 text-red-300'
                  }`}>
                    Tempo:{Math.round(song.matchedDbSong.tempo_match * 100)}%
                  </span>
                  <span className={`px-1 py-0.5 rounded text-[10px] ${
                    song.matchedDbSong.energy_match >= 0.7 ? 'bg-green-500/30 text-green-300' :
                    song.matchedDbSong.energy_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' :
                    'bg-red-500/30 text-red-300'
                  }`}>
                    Energy:{Math.round(song.matchedDbSong.energy_match * 100)}%
                  </span>
                  <span className={`px-1 py-0.5 rounded text-[10px] ${
                    song.matchedDbSong.mood_match >= 0.7 ? 'bg-green-500/30 text-green-300' :
                    song.matchedDbSong.mood_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' :
                    'bg-red-500/30 text-red-300'
                  }`}>
                    Mood:{Math.round(song.matchedDbSong.mood_match * 100)}%
                  </span>
                  <span className={`px-1 py-0.5 rounded text-[10px] ${
                    song.matchedDbSong.dance_match >= 0.7 ? 'bg-green-500/30 text-green-300' :
                    song.matchedDbSong.dance_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' :
                    'bg-red-500/30 text-red-300'
                  }`}>
                    Dance:{Math.round(song.matchedDbSong.dance_match * 100)}%
                  </span>
                </div>
              )}
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
  const [recommendationPool, setRecommendationPool] = useState([]);
  const [songMatchData, setSongMatchData] = useState(new Map());

  const intervalRef = useRef(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { activeSong, isPlaying, playbackRate } = useSelector((state) => state.player);
  
  const { audioFeatures } = useAudioFeatures();

  const audioFeaturesRef = useRef(audioFeatures);
  audioFeaturesRef.current = audioFeatures;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  useEffect(() => {
    const abortController = new AbortController();
    
    const fetchSearchResults = async () => {
      setLoading(true);
      setError(null);
      
      if (!searchTerm || searchTerm.trim() === '') {
        setSongs([]);
        setLoading(false);
        return;
      }
      
      const searchLower = searchTerm.toLowerCase().trim();
      const normalize = (s) => s?.toLowerCase().replace(/[''`]/g, '') || '';
      
      try {
        const products = await productService.getAllProducts();
        const musicProducts = products.filter(p => p.albumTitle && p.fileUrl && p.id > 0);

        const libraryTargetSongs = musicProducts
          .filter((product, index, self) =>
            index === self.findIndex((candidate) => (
              candidate.albumTitle === product.albumTitle && candidate.artistName === product.artistName
            ))
          )
          .slice(0, 47);
        setDbSongs(libraryTargetSongs);

        const targetIds = libraryTargetSongs
          .map(s => Number(s.id))
          .filter(id => Number.isFinite(id) && id > 0);
        
        const allArtistSongs = [];
        const audioApiUrl = envConfig.getApiBaseUrl();
        
        for (let i = 0; i < ARTISTS.length; i++) {
          const artist = ARTISTS[i];
          try {
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            const response = await fetch(
              `${audioApiUrl}/api/itunes/search?term=${encodeURIComponent(artist)}&media=music&entity=song&limit=200`,
              { signal: abortController.signal }
            );

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
                source: 'itunes',
              }));
            
            allArtistSongs.push(...artistSongs);
          } catch (artistErr) {
            if (artistErr.name !== 'AbortError') {
              console.warn(`Error fetching ${artist}:`, artistErr);
            }
          }
        }
        
        setRecommendationPool(allArtistSongs);
        
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

        const filteredArtistSongs = allArtistSongs.filter(song => {
          const trackMatch = normalize(song.trackName).includes(searchNorm);
          const artistMatch = normalize(song.artistName).includes(searchNorm);
          const albumMatch = normalize(song.collectionName).includes(searchNorm);
          const genreMatch = normalize(song.primaryGenreName).includes(searchNorm);
          return trackMatch || artistMatch || albumMatch || genreMatch;
        });
        
        const allResults = [...filteredDbSongs, ...filteredArtistSongs].map(song => {
          let relevance = 0.5;
          const title = normalize(song.trackName || song.albumTitle || '');
          const artist = normalize(song.artistName || '');
          
          if (title === searchNorm) relevance = 1.0;
          else if (artist === searchNorm) relevance = 0.95;
          else if (title.startsWith(searchNorm)) relevance = 0.9;
          else if (artist.startsWith(searchNorm)) relevance = 0.85;
          else if (title.includes(searchNorm)) relevance = 0.75;
          else if (artist.includes(searchNorm)) relevance = 0.7;
          
          if (song.source === 'database') relevance += 0.05;
          
          return { ...song, relevance, similarity: undefined };
        });
        
        const seen = new Set();
        const uniqueResults = allResults.filter(song => {
          const key = `${song.trackName?.toLowerCase().trim()}-${song.artistName?.toLowerCase().trim()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        
        uniqueResults.sort((a, b) => b.relevance - a.relevance);

        // Separate iTunes songs for targeted matching
        const itunesSongs = uniqueResults.filter(s => s.source === 'itunes');

        // Build the warming map BEFORE setSongs so both state updates land in the
        // same React batch. Songs are kept clean (no matchStatus stamped on them) —
        // the map is the single source of truth for all card status. filteredSongs
        // depends on songMatchData so it recomputes whenever the map changes, which
        // is what propagates warming → resolved/notFound updates to the cards.
        const initialMatchMap = new Map();
        itunesSongs.forEach(s => {
          initialMatchMap.set(String(s.trackId || s.id), { matchStatus: MATCH_STATUS.warming });
        });

        // Both calls in the same synchronous block — React batches into one render.
        setSongMatchData(initialMatchMap);
        setSongs(uniqueResults);

        // Yield to the renderer so the cards paint with spinners before the
        // match-library fetch (which can take several seconds on Railway) blocks.
        await new Promise(resolve => setTimeout(resolve, 0));

        if (itunesSongs.length > 0) {
          try {
            const candidates = itunesSongs.map(s => ({
              trackId: String(s.trackId || s.id),
              trackName: s.trackName || '',
              artistName: s.artistName || '',
              previewUrl: s.previewUrl || s.fileUrl || '',
            }));

            const matchPayload = {
              candidates,
              limit: itunesSongs.length,
              ...(targetIds.length > 0 && { target_ids: targetIds }),
            };

            const matchResp = await fetch(`${audioApiUrl}/api/audio/match-library`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(matchPayload),
              signal: abortController.signal,
            });

            // Helper: build a map covering every iTunes song, resolving each to
            // notFound by default. Entries from the API response overwrite the default.
            // This guarantees no song is ever left in the 'warming' state permanently —
            // even if the backend silently drops a song from its response.
            const buildFullResolvedMap = (matches) => {
              const matchMap = new Map();
              matches.forEach(m => {
                matchMap.set(String(m.input_track_id), m);
              });

              const resolvedMap = new Map();
              // Seed every iTunes song as notFound first
              itunesSongs.forEach(s => {
                resolvedMap.set(String(s.trackId || s.id), { matchStatus: MATCH_STATUS.notFound });
              });
              // Overwrite with real results where the backend returned a match
              itunesSongs.forEach(s => {
                const key = String(s.trackId || s.id);
                const matched = matchMap.get(key);
                if (matched && matched.matched_product_name) {
                  resolvedMap.set(key, {
                    matchedLibraryTrack: matched.matched_product_name,
                    matchStatus: MATCH_STATUS.resolved,
                    matchedDbSong: {
                      tempo_match: matched.tempo_match ?? null,
                      energy_match: matched.energy_match ?? null,
                      mood_match: matched.mood_match ?? null,
                      dance_match: matched.dance_match ?? null,
                    },
                    tempo_match: matched.tempo_match ?? null,
                    energy_match: matched.energy_match ?? null,
                    mood_match: matched.mood_match ?? null,
                    dance_match: matched.dance_match ?? null,
                  });
                }
              });
              return resolvedMap;
            };

            if (matchResp.ok) {
              const matchData = fixTextDeep(await matchResp.json());
              setSongMatchData(buildFullResolvedMap(matchData.matches || []));
            } else {
              console.warn('[Search] match-library returned', matchResp.status);
              setSongMatchData(buildFullResolvedMap([]));
            }
          } catch (matchErr) {
            if (matchErr.name !== 'AbortError') {
              console.warn('[Search] Library match lookup failed:', matchErr.message);
              // Resolve all to notFound so no card spins forever.
              const notFoundMap = new Map();
              itunesSongs.forEach(s => {
                notFoundMap.set(String(s.trackId || s.id), { matchStatus: MATCH_STATUS.notFound });
              });
              setSongMatchData(notFoundMap);
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
  }, [searchTerm]);

  const filteredSongs = useMemo(() => {
    if (filter === 'all') return songs;
    return songs.filter(song => song.artistName?.toLowerCase().includes(filter.toLowerCase()));
  }, [songs, filter, songMatchData]);

  const handlePlay = (song, index) => {
    if (song.fileUrl) {
      dispatch(setActiveSong({ song, data: filteredSongs, i: index }));
      dispatch(playPause(true));
    }
  };

  const handlePause = () => {
    dispatch(playPause(false));
  };

  const handleSongNameClick = (song) => {
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
      const mainArtistSongs = songs.filter(s => {
        if (s.id === song.id) return false;
        const artistLower = (s.artistName || '').toLowerCase();
        return artistLower.includes('aphex') || 
               artistLower.includes('boards of canada') || 
               artistLower.includes('squarepusher');
      });
      
      navigate(`/songs/${song.trackId || song.id}`, {
        state: {
          song: song,
          artistSongs: mainArtistSongs,
          fromDiscover: true
        }
      });
    }
  };

  const handleArtistClick = (artistName) => {
    const slug = artistName.toLowerCase().replace(/\s+/g, '-');
    navigate(`/artists/${slug}`);
  };

  const handleAlbumClick = (albumName, song) => {
    navigate(`/albums/${encodeURIComponent(albumName)}`, {
      state: {
        artistName: song.artistName,
        albumArtwork: song.artworkUrl100?.replace('100x100', '600x600')
      }
    });
  };

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
      <div className={`flex-1 min-w-0`}>
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
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${filter === 'all' ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            All Results ({songs.length})
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {filteredSongs.map((song, i) => {
            const key = String(song.trackId || song.id);
            const matchData = songMatchData.get(key);
            // matchData overrides when present; song itself carries warming status as fallback
            // so the footer and spinner are always visible from the very first render.
            const songWithMatch = matchData ? { ...song, ...matchData } : song;
            return (
              <SongCard
                key={song.id}
                song={songWithMatch}
                isPlaying={isPlaying}
                activeSong={activeSong}
                onPlay={handlePlay}
                onPause={handlePause}
                index={i}
                onSongNameClick={handleSongNameClick}
                onArtistClick={handleArtistClick}
                onAlbumClick={handleAlbumClick}
                playbackRate={playbackRate}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Search;
