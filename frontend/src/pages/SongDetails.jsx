import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { FaPauseCircle, FaPlayCircle, FaArrowLeft, FaMusic, FaStar, FaRegStar } from 'react-icons/fa';
import { FiShoppingCart, FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import { useRef } from 'react';
import { createPortal } from 'react-dom';

import { setActiveSong, playPause, setPlaybackRate } from '../redux/features/playerSlice';
import { addToCart } from '../redux/features/cartSlice';
import { addToWishlistLocal, removeFromWishlistLocal, addWishlistItem, removeWishlistItem } from '../redux/features/wishlistSlice';
import { useAuth } from '../context/AuthContext';
import { auth as firebaseAuth } from '../firebase';
import Loader from '../components/Loader';
import AudioReactiveVideo from '../components/AudioReactiveVideo';
import OnsetImageCard from '../components/OnsetImageCard';
import envConfig from '../config/environment';
import { productService } from '../redux/services';
import { useAudioFeatures } from '../context/AudioFeaturesContext';
import { fixTextDeep } from '../utils/fixText';

// Fallback image for missing album art
const fallbackImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="250" height="250" viewBox="0 0 250 250"><rect width="250" height="250" fill="#374151"/><circle cx="125" cy="125" r="80" fill="#4B5563"/><circle cx="125" cy="125" r="30" fill="#374151"/><circle cx="125" cy="125" r="10" fill="#6B7280"/></svg>');

const isBadImageUrl = (url) => /\.(mp4|m4v|mov|webm|wmv|wav|mp3|flac|ogg)(\?|$)/i.test(String(url || ''));

const getSafeCoverUrl = (song, size = '600x600') => {
  const artwork = song?.artworkUrl100 && !isBadImageUrl(song.artworkUrl100)
    ? String(song.artworkUrl100).replace('100x100', size)
    : null;
  const albumCover = song?.albumCoverImageUrl && !isBadImageUrl(song.albumCoverImageUrl)
    ? song.albumCoverImageUrl
    : null;
  const imageUrl = song?.imageUrl && !isBadImageUrl(song.imageUrl) ? song.imageUrl : null;
  const image = song?.image && !isBadImageUrl(song.image) ? song.image : null;
  return artwork || albumCover || imageUrl || image || fallbackImage;
};

// Artist badge colors
const getArtistBadgeColor = (artist) => {
  if (artist?.toLowerCase().includes('aphex')) return 'bg-purple-500';
  if (artist?.toLowerCase().includes('boards')) return 'bg-orange-500';
  if (artist?.toLowerCase().includes('squarepusher')) return 'bg-cyan-500';
  return 'bg-gray-500';
};

const isLibraryContextSong = (song) => {
  if (!song) return false;
  if (song.source === 'database') return true;
  const numericId = Number(song.trackId || song.id);
  // Library DB IDs are small positive sequences. iTunes IDs are > 1,000,000
  return Number.isFinite(numericId) && numericId > 0 && numericId < 1000000;
};

const normalizeArtistName = (artistName) => {
  const name = String(artistName || '').trim();
  if (!name) return '';
  const lower = name.toLowerCase();
  if (lower === 'unknown artist' || lower === 'library artist') return '';
  return name;
};

const firstRealArtistName = (...values) => {
  for (const value of values) {
    const normalized = normalizeArtistName(value);
    if (normalized) return normalized;
  }
  return '';
};

// Similar Song Card Component
const SimilarSongCard = ({ song, isPlaying, activeSong, onPlay, onPause, rank, playbackRate, allSimilarSongs }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isThisSongActive = (activeSong?.trackId && String(activeSong.trackId) === String(song.trackId)) || 
                           (activeSong?.id && String(activeSong.id) === String(song.trackId));
  const albumArt = getSafeCoverUrl(song, '600x600');
  const coverMedia = song.albumCoverImageUrl || song.artworkUrl100 || '';
  const [isHovered, setIsHovered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Check if the cover media is a video
  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
  const simSongTitle = song.trackName || song.albumTitle || '';
  const simIsTeddyEmotion = simSongTitle.toLowerCase().includes('teddy emotion');
  const simUseOnsetImages = isVideo && !simIsTeddyEmotion;
  const isLibrarySong = isLibraryContextSong(song);

  // Discount logic matching CustomerScreen SongCard (even IDs get 50% off)
  const songPrice = song.price || song.albumPrice || 0;
  const songId = song.trackId || song.id;
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
      dispatch(addToWishlistLocal({ ...song, id: songId, accountId }));
      if (hasAuth) dispatch(addWishlistItem({ wishlistData: { accountId, productId: songId }, ...authParams }));
    }
  };

  // Handle playback rate change for videos
  const handlePlaybackRateChange = (e) => {
    const newRate = parseFloat(e.target.value);
    dispatch(setPlaybackRate(newRate));
  };

  return (
    <div className="flex flex-col p-4 bg-white/5 backdrop-blur-sm rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      <div 
        className="relative w-full aspect-square rounded-lg overflow-hidden"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {simUseOnsetImages ? (
          <OnsetImageCard
            songTitle={simSongTitle}
            songId={song.trackId || song.id}
            className="w-full h-full object-cover"
            isPlaying={isPlaying && isThisSongActive}
            isActive={isThisSongActive}
          />
        ) : isVideo ? (
          <AudioReactiveVideo
            src={coverMedia}
            alt={song.trackName}
            className="w-full h-full object-cover"
            isPlaying={isPlaying && isThisSongActive}
            isActive={isThisSongActive}
            playbackRate={isThisSongActive ? playbackRate : 1.0}
          />
        ) : (
          <img 
            src={albumArt} 
            alt={song.trackName} 
            className="w-full h-full object-cover" 
            onError={(e) => { e.target.src = fallbackImage; }} 
          />
        )}
        
        {/* Play/Pause overlay */}
        {(song.previewUrl || song.fileUrl) && (
          <div 
            className={`absolute inset-0 rounded-lg flex justify-center items-center z-20 ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={(e) => {
              e.stopPropagation();
              setIsHovered(false);
              if (isPlaying && isThisSongActive) {
                onPause();
              } else {
                onPlay(song);
              }
            }}
          >
            {isPlaying && isThisSongActive ? (
              <FaPauseCircle size={45} className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform" />
            ) : (
              <FaPlayCircle size={45} className="text-white drop-shadow-lg cursor-pointer hover:scale-110 transition-transform" />
            )}
          </div>
        )}

        {/* Rank badge */}
        <div className="absolute top-2 left-2 w-7 h-7 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-lg border-2 border-white/30">
          {rank}
        </div>

        {/* Maximise button for video cards - beside wishlist */}
        {isVideo && (
          <button
            onClick={(e) => { e.stopPropagation(); setIsFullscreen(true); }}
            className="absolute top-2 right-13 z-20 p-1.5 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-all hover:scale-110"
            title="Maximise video"
          >
            <FiMaximize2 className="w-5 h-5 text-white/80 hover:text-white drop-shadow-lg transition-colors" />
          </button>
        )}

        {/* Wishlist Star - top right, beside maximise button */}
        {isLibrarySong && (
          <button
            onClick={handleToggleWishlist}
            className={`absolute ${(isVideo || simUseOnsetImages) ? 'top-2' : 'top-2'} right-2 z-20 p-1.5 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-all hover:scale-110`}
            title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
          >
            {isWishlisted ? (
              <FaStar className="w-5 h-5 text-yellow-400 drop-shadow-lg" />
            ) : (
              <FaRegStar className="w-5 h-5 text-white/80 hover:text-yellow-400 drop-shadow-lg transition-colors" />
            )}
          </button>
        )}

        {/* Playing indicator */}
        {isThisSongActive && isPlaying && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-green-500/90 px-2 py-1 rounded-full">
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
            <h3 className="text-white font-semibold text-lg truncate">{song.trackName}</h3>
            <button onClick={() => setIsFullscreen(false)} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all hover:scale-110" title="Minimise video">
              <FiMinimize2 className="w-6 h-6 text-white" />
            </button>
          </div>
          <div className="absolute inset-0 w-full h-full">
            {simUseOnsetImages ? (
              <OnsetImageCard songTitle={simSongTitle} songId={song.trackId || song.id} className="w-full h-full object-contain" isPlaying={isPlaying && isThisSongActive} isActive={isThisSongActive} />
            ) : (
              <AudioReactiveVideo src={coverMedia || albumArt} alt={song.trackName} className="w-full h-full object-contain" isPlaying={isPlaying && isThisSongActive} isActive={isThisSongActive} playbackRate={isThisSongActive ? (playbackRate || 1.0) : 1.0} />
            )}
          </div>
        </div>,
        document.body
      )}

      <div className="mt-3 flex flex-col gap-1">
        <p
          className="font-semibold text-[17px] text-gray-300 truncate leading-tight hover:text-cyan-400 transition-colors cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            const id = song.trackId || song.id;
            navigate(`/songs/${id}`, {
              state: {
                song,
                artistSongs: allSimilarSongs || [],
                fromDiscover: true,
              },
            });
          }}
        >
          {song.trackName}
        </p>
        {!isLibrarySong && song.artistName && (
          <p
            className="text-xs text-gray-400 truncate hover:text-cyan-400 transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              const slug = song.artistName.toLowerCase().replace(/\s+/g, '-');
              navigate(`/artists/${slug}`);
            }}
            title="Click to view artist details"
          >
            {song.artistName}
          </p>
        )}
        {!isLibrarySong && (song.collectionName || song.albumTitle) && (
          <p
            className="text-xs text-gray-500 truncate hover:text-cyan-400 transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/albums/${encodeURIComponent(song.collectionName || song.albumTitle)}`, {
                state: {
                  song,
                  albumArtwork: (song.artworkUrl100 || song.albumCoverImageUrl || '').replace('100x100', '600x600'),
                },
              });
            }}
            title="Click to view album details"
          >
            {song.collectionName || song.albumTitle}
          </p>
        )}

      </div>

      {/* Price and Add to Cart for library songs */}
      {isLibrarySong && (
        <div className="mt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm text-white">Music</p>
              {hasDiscount ? (
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 bg-green-500/90 rounded text-[10px] font-bold text-white">
                    50% OFF
                  </span>
                  <p className="text-sm text-gray-400 line-through">${songPrice.toFixed(2)}</p>
                  <p className="text-sm font-bold text-green-400">${discountedPrice.toFixed(2)}</p>
                </div>
              ) : (
                <p className="text-sm font-bold text-white">${songPrice.toFixed(2)}</p>
              )}
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                const cartProduct = hasDiscount
                  ? { ...song, id: songId, albumPrice: discountedPrice, albumTitle: song.trackName }
                  : { ...song, id: songId, albumPrice: songPrice, albumTitle: song.trackName };
                dispatch(addToCart(cartProduct));
              }}
              className="px-3 py-2 bg-blue-700 hover:bg-blue-800 rounded font-semibold text-white text-sm leading-none flex items-center gap-2"
            >
              <FiShoppingCart />
              Add to Cart
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

const SongDetails = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { songid } = useParams();
  const location = useLocation();
  const { activeSong, isPlaying, playbackRate } = useSelector((state) => state.player);
  const { audioFeatures } = useAudioFeatures();
  const audioFeaturesRef = useRef(audioFeatures);
  audioFeaturesRef.current = audioFeatures;
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [targetSong, setTargetSong] = useState(null);
  const [artistSongs, setArtistSongs] = useState([]);
  const [similarSongs, setSimilarSongs] = useState([]);
  const [cachedAudioFeatures, setCachedAudioFeatures] = useState({});
  const [targetFeatures, setTargetFeatures] = useState(null);
  const [mlInfo, setMlInfo] = useState(null);
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);

  // Use deterministic cached features so SongDetails ranking matches SimilarSongs/TopCharts.
  useEffect(() => {
    const fetchCachedFeatures = async () => {
      try {
        const audioApiUrl = envConfig.getApiBaseUrl();
        // SongDetails prefers the shared cache before triggering any fresh analysis so the
        // ranking here stays aligned with SimilarSongs/Search and does not drift because of
        // repeated live extraction noise or slightly different feature rounding.
        const response = await fetch(`${audioApiUrl}/api/audio/cached-features?artist_only=false`);
        if (response.ok) {
          const data = fixTextDeep(await response.json());
          setCachedAudioFeatures(data.features || {});
        }
      } catch (err) {
        console.warn('[SongDetails] Could not fetch cached audio features:', err.message);
      }
    };

    fetchCachedFeatures();
  }, []);

  // Parse song data from URL state or fetch it
  useEffect(() => {
    const initializePage = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Get song data from location state (passed from SimilarSongs/TopCharts/Discover)
        let songData = location.state?.song;
        
        // If no state (direct navigation), fetch from API
        if (!songData && songid) {
           try {
              // Public fetch
              const fetchedSong = await productService.getProductById(songid);
              if (fetchedSong) {
                  // Normalize DB product to Song format
                  songData = {
                      id: fetchedSong.id || fetchedSong.productId,
                      trackId: fetchedSong.id || fetchedSong.productId,
                      trackName: fetchedSong.albumTitle,
                      artistName: fetchedSong.artistName,
                      collectionName: fetchedSong.albumTitle,
                      artworkUrl100: fetchedSong.albumCoverImageUrl,
                      previewUrl: fetchedSong.fileUrl,
                      fileUrl: fetchedSong.fileUrl,
                      price: fetchedSong.albumPrice,
                      source: 'database'
                  };
              }
           } catch (e) {
               console.warn("Failed to fetch song by ID:", e);
           }
        }
        
        const allArtistSongsData = location.state?.artistSongs || [];
        const fromDiscover = location.state?.fromDiscover || false;
        
        if (!songData) {
          setError('Song not found.');
          setLoading(false);
          return;
        }
        
        setTargetSong(songData);
        
        if (fromDiscover) {
          // Filter out zip files and non-audio content
          const validSongs = allArtistSongsData.filter(s => {
             const url = s.previewUrl || s.fileUrl;
             return url && !url.toLowerCase().includes('.zip');
          });

          const targetUrl = songData.previewUrl || songData.fileUrl;
          const isTargetAudio = targetUrl && !targetUrl.toLowerCase().includes('.zip');

          setArtistSongs(validSongs);
          if (validSongs.length > 0 && isTargetAudio) {
            await computeMLSimilarity(songData, validSongs);
          } else {
            console.log("Skipping ML similarity: Target is not audio or no valid comparison songs");
            if (isTargetAudio) {
                await computeMLSimilarity(songData, []);
            } else {
                setLoading(false);
            }
          }
        } else {
          // Filter artist songs to only include songs from the same artist
          const artistName = songData.artistName?.toLowerCase() || '';
          const filteredArtistSongs = allArtistSongsData.filter(s => {
            const url = s.previewUrl || s.fileUrl;
            const isAudio = url && !url.toLowerCase().includes('.zip');
            const isSameArtist = s.artistName?.toLowerCase().includes(artistName.split(' ')[0]);
            
            return isAudio && isSameArtist && s.trackId !== songData.trackId;
          });
          
          setArtistSongs(filteredArtistSongs);

          const targetUrl = songData.previewUrl || songData.fileUrl;
          const isTargetAudio = targetUrl && !targetUrl.toLowerCase().includes('.zip');
          
          // Compute ML similarity if we have artist songs
          if (filteredArtistSongs.length > 0 && isTargetAudio) {
            await computeMLSimilarity(songData, filteredArtistSongs);
          } else {
             // If no context, just try to get features for the target song
             if (isTargetAudio) {
                 await computeMLSimilarity(songData, []);
             } else {
                 console.log("Skipping ML similarity: Target is not audio");
                 setLoading(false);
             }
          }
        }
      } catch (err) {
        console.error('Error initializing page:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    initializePage();
  }, [songid, location.state]);
  

  // Compute ML similarity using the backend
  // Central ranking pipeline for SongDetails. This function tries very hard to keep the
  // result set deterministic: first use cached extracted features, then fall back to live
  // analyser features, then normalize the backend response into one consistent song shape
  // regardless of whether the recommendation came from the local library or iTunes data.
  const computeMLSimilarity = async (targetSong, comparisonSongs, overrideFeatures = null) => {
    const apiBaseUrl = envConfig.getApiBaseUrl();
    
    try {
      const liveFeatures = overrideFeatures || audioFeaturesRef.current;
      const isDiscoverRequest = isLibraryContextSong(targetSong);
      const songIdStr = String(targetSong.trackId || targetSong.id);
      // Check both the raw ID and the negative imported-ID form because the same logical
      // song can appear in frontend state under a positive/display ID while its extracted
      // feature row is stored in the backend cache under the imported negative ProductID.
      let cached =
        cachedAudioFeatures[songIdStr] ||
        cachedAudioFeatures[String(-Math.abs(Number(songIdStr)))];

      if (!cached) {
        try {
          const audioApiUrl = envConfig.getApiBaseUrl();
          // One lazy re-fetch gives SongDetails a second chance to find a deterministic
          // cached vector before falling back to live audio features. This avoids using
          // volatile analyser state when the backend cache simply had not been loaded into
          // this page yet.
          const cacheResp = await fetch(`${audioApiUrl}/api/audio/cached-features?artist_only=false`);
          if (cacheResp.ok) {
            const cacheData = fixTextDeep(await cacheResp.json());
            const features = cacheData.features || {};
            cached = features[songIdStr] || features[String(-Math.abs(Number(songIdStr)))];
            setCachedAudioFeatures(features);
          }
        } catch {
          // Non-fatal: fall back to live features below.
        }
      }

      // The backend receives exactly one target feature vector. Cached vectors win because
      // they are stable across page loads; live analyser features are only used as a last
      // resort so the details page can still function when cache coverage is incomplete.
      let featuresToSend = null;
      if (cached) {
        featuresToSend = {
          ...cached,
          tempo: Number(cached.tempo),
          energy: Number(cached.energy),
          valence: Number(cached.valence),
          danceability: Number(cached.danceability),
          acousticness: Number(cached.acousticness),
          playback_rate: 1,
        };
      } else if (liveFeatures) {
        featuresToSend = {
          tempo: Number(liveFeatures.tempo) || null,
          energy: Number(liveFeatures.energy) || null,
          valence: Number(liveFeatures.valence) || null,
          danceability: Number(liveFeatures.danceability) || null,
          acousticness: Number(liveFeatures.acousticness) || null,
          playback_rate: Number(playbackRate || 1),
        };
      }

      const payload = {
          source: isDiscoverRequest ? 'discover_page' : 'similar_songs',
          current_product_id: String(targetSong.trackId || targetSong.id),
          preview_url: String(targetSong.previewUrl || targetSong.fileUrl || ''),
            // Request the same pool size as SimilarSongs, then SongDetails renders top 20.
            limit: 150,
          audio_features: featuresToSend
      };

      // Only log if not an update loop to avoid spam
      if (!overrideFeatures) {
         console.log('[SongDetails] Sending Unified Payload:', JSON.stringify(payload, null, 2));
      }

      const response = await fetch(`${apiBaseUrl}/api/audio/unified-recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`ML Service Error: ${response.status}`);
      }

      const data = fixTextDeep(await response.json());
      
      if (data.status === 'success') {
        // Build a lookup table from the comparison songs that were already available in the
        // page context. Backend recommendations sometimes return partial metadata, so this
        // map lets us rehydrate missing names, artwork, preview URLs, and source flags from
        // the richer frontend song objects we already have.
        const comparisonMetaById = new Map();
        (comparisonSongs || []).forEach((s) => {
          const rawId = s.trackId || s.id;
          const key = String(rawId ?? '');
          if (key) comparisonMetaById.set(key, s);
          const numeric = Number(rawId);
          if (Number.isFinite(numeric)) {
            comparisonMetaById.set(String(Math.abs(numeric)), s);
          }
        });

        const validRecommendations = (data.recommendations || [])
            .filter(song => song.similarity_score > 0)
            .map(song => {
                const recId = String(song.product_id ?? song.trackId ?? song.id ?? '');
                const recNumeric = Number(song.product_id ?? song.trackId ?? song.id);
                const comparisonMeta =
                  comparisonMetaById.get(recId) ||
                  (Number.isFinite(recNumeric) ? comparisonMetaById.get(String(Math.abs(recNumeric))) : null) ||
                  {};
                const numericProductId = Number(song.product_id);
                const isLibraryRecommendation =
                  String(song.source || '').toLowerCase() === 'database' ||
                  String(comparisonMeta.source || '').toLowerCase() === 'database' ||
                  (isDiscoverRequest && Number.isFinite(numericProductId) && numericProductId > 0 && numericProductId < 1000000);

                const normalizedArtwork =
                  song.artworkUrl100 ||
                  song.albumCoverImageUrl ||
                  song.album_cover_image_url ||
                  comparisonMeta.artworkUrl100 ||
                  comparisonMeta.albumCoverImageUrl ||
                  comparisonMeta.imageUrl ||
                  comparisonMeta.image ||
                  song.imageUrl ||
                  song.image ||
                  null;

                const normalizedPreview =
                  song.previewUrl ||
                  song.fileUrl ||
                  song.preview_url ||
                  song.file_url ||
                  comparisonMeta.previewUrl ||
                  comparisonMeta.fileUrl ||
                  null;

                return {
                    ...song,
                    trackId: song.product_id,
                    id: song.product_id,
                    isLibrary: isLibraryRecommendation,
                    trackName: song.trackName || comparisonMeta.trackName || song.albumTitle || comparisonMeta.albumTitle || song.productName || `Track ${song.product_id}`,
                    artistName: isLibraryRecommendation
                      ? ''
                      : firstRealArtistName(song.artistName, comparisonMeta.artistName),
                    collectionName: comparisonMeta.collectionName || song.collectionName || song.albumTitle || comparisonMeta.albumTitle || '',
                    albumTitle: song.albumTitle || comparisonMeta.albumTitle || song.collectionName || comparisonMeta.collectionName || song.trackName || comparisonMeta.trackName || '',
                    primaryGenreName: song.primaryGenreName || comparisonMeta.primaryGenreName || null,
                    trackTimeMillis: song.trackTimeMillis || comparisonMeta.trackTimeMillis || null,
                    artworkUrl100: normalizedArtwork,
                    albumCoverImageUrl: song.albumCoverImageUrl || normalizedArtwork,
                    previewUrl: normalizedPreview,
                    fileUrl: song.fileUrl || normalizedPreview,
                    source: song.source || (isLibraryRecommendation ? 'database' : 'itunes'),
                };
            });

        let hydratedRecommendations = validRecommendations;
        const needsLibraryArtworkHydration = validRecommendations.some((song) => {
          const pid = Number(song.trackId || song.id);
          const hasArtwork = !!(song.artworkUrl100 || song.albumCoverImageUrl || song.imageUrl || song.image);
          return Number.isFinite(pid) && pid > 0 && pid < 1000000 && !hasArtwork;
        });

        if (needsLibraryArtworkHydration) {
          try {
            // Discover-origin requests can produce strong library matches that have the
            // right ProductID and score but no cover art attached in the recommendation
            // payload. In that case, hydrate from the products API so the details grid
            // renders polished library cards instead of blank artwork placeholders.
            const products = await productService.getAllProducts();
            const productsById = new Map(
              (products || []).map((p) => [Number(p.id || p.productId), p])
            );

            hydratedRecommendations = validRecommendations.map((song) => {
              const pid = Number(song.trackId || song.id);
              const isLibrarySongById = Number.isFinite(pid) && pid > 0 && pid < 1000000;
              if (!isLibrarySongById) {
                return song;
              }

              const hasArtwork = !!(song.artworkUrl100 || song.albumCoverImageUrl || song.imageUrl || song.image);
              if (hasArtwork) {
                return song;
              }

              const product = productsById.get(pid);
              if (!product) {
                return song;
              }

              const productArtwork =
                product.albumCoverImageUrl ||
                product.imageUrl ||
                product.image ||
                null;
              const productMedia = product.fileUrl || song.previewUrl || song.fileUrl || null;

              return {
                ...song,
                trackName: song.trackName || product.albumTitle || product.productName || song.trackName,
                artistName: '',
                collectionName: song.collectionName || product.albumTitle || song.collectionName,
                albumTitle: song.albumTitle || product.albumTitle || song.albumTitle,
                artworkUrl100: song.artworkUrl100 || productArtwork,
                albumCoverImageUrl: song.albumCoverImageUrl || productArtwork,
                previewUrl: song.previewUrl || productMedia,
                fileUrl: song.fileUrl || productMedia,
              };
            });
          } catch (hydrateErr) {
            console.warn('[SongDetails] Failed to hydrate library artwork from products API:', hydrateErr);
          }
        }

        const rankedRecommendations = [...hydratedRecommendations].sort(
          (a, b) => (b.similarity_score ?? 0) - (a.similarity_score ?? 0)
        );

        setSimilarSongs(rankedRecommendations.slice(0, 20));
        
        if (data.target_features) {
          setTargetFeatures(data.target_features);
            
            // Construct ML info for display
            setMlInfo({
                algorithm: "Hybrid Audio Analysis",
            features: data.target_features
            });
        }
      } else {
        throw new Error(data.message || 'Failed to analyze songs');
      }
    } catch (err) {
      console.error('ML Similarity error:', err);
      // Don't set global error if just ML fails, allow basic display
      if (!targetFeatures) {
         // Fallback if we completely failed
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle play
  const handlePlay = (song) => {
    const songToPlay = {
      id: song.trackId || song.id,
      trackId: song.trackId || song.id,
      trackName: song.trackName,
      albumTitle: song.trackName,
      artistName: song.artistName,
      artworkUrl100: song.artworkUrl100,
      albumCoverImageUrl: song.albumCoverImageUrl || song.artworkUrl100?.replace('100x100', '600x600'),
      previewUrl: song.previewUrl || song.fileUrl,
      fileUrl: song.previewUrl || song.fileUrl,
      collectionName: song.collectionName
    };
    
    dispatch(setActiveSong({ song: songToPlay, data: similarSongs.map(s => ({
      id: s.trackId,
      trackId: s.trackId,
      trackName: s.trackName,
      albumTitle: s.trackName,
      artistName: s.artistName,
      artworkUrl100: s.artworkUrl100,
      albumCoverImageUrl: s.albumCoverImageUrl || s.artworkUrl100?.replace('100x100', '600x600'),
      previewUrl: s.previewUrl || s.fileUrl,
      fileUrl: s.previewUrl || s.fileUrl,
      collectionName: s.collectionName
    })), i: similarSongs.findIndex(s => s.trackId === song.trackId) }));
    dispatch(playPause(true));
  };

  // Handle pause
  const handlePause = () => {
    dispatch(playPause(false));
  };

  // Handle play target song
  const handlePlayTarget = () => {
    if (!targetSong) return;
    
    const songToPlay = {
      id: targetSong.trackId || targetSong.id,
      trackId: targetSong.trackId || targetSong.id,
      trackName: targetSong.trackName || targetSong.albumTitle,
      albumTitle: targetSong.trackName || targetSong.albumTitle,
      artistName: targetSong.artistName,
      artworkUrl100: targetSong.artworkUrl100,
      albumCoverImageUrl: targetSong.albumCoverImageUrl || targetSong.artworkUrl100?.replace('100x100', '600x600'),
      previewUrl: targetSong.previewUrl || targetSong.fileUrl,
      fileUrl: targetSong.previewUrl || targetSong.fileUrl,
      collectionName: targetSong.collectionName
    };
    
    dispatch(setActiveSong({ song: songToPlay, data: [songToPlay], i: 0 }));
    dispatch(playPause(true));
  };

  const isTargetPlaying = activeSong?.trackId === (targetSong?.trackId || targetSong?.id) || 
                          activeSong?.id === (targetSong?.trackId || targetSong?.id);

  if (loading) {
    return <Loader title="Computing ML similarity..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <FaMusic className="text-gray-500 text-6xl mb-4" />
        <p className="text-red-400 text-lg mb-4 text-center">{error}</p>
        <button 
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-10 sm:pb-14">
      {/* Back navigation */}
      <div className="mb-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
        >
          ← Back
        </button>

        {/* Header Section - Target Song */}
        <div className="bg-gradient-to-r from-gray-900/80 to-gray-800/50 rounded-xl p-6 border border-gray-700">
          <div className="flex flex-col md:flex-row gap-1">
            {/* Song Info */}
            <div className="flex-1">
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                {targetSong?.trackName || targetSong?.albumTitle}
              </h1>
              <p className="text-gray-400 mb-1">{targetSong?.collectionName}</p>
            </div>

            {/* Album Art with Play */}
            <div 
              className="relative w-48 h-48 flex-shrink-0 mx-auto md:mx-0"
              onMouseEnter={() => setIsHeaderHovered(true)}
              onMouseLeave={() => setIsHeaderHovered(false)}
            >
              {(() => {
                const coverMedia = targetSong?.albumCoverImageUrl || targetSong?.artworkUrl100 || '';
                const albumArtSafe = getSafeCoverUrl(targetSong, '600x600');
                const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
                const detailTitle = targetSong?.trackName || targetSong?.albumTitle || '';
                const detailIsTeddy = detailTitle.toLowerCase().includes('teddy emotion');
                const detailUseOnset = isVideo && !detailIsTeddy;
                
                return detailUseOnset ? (
                  <OnsetImageCard
                    songTitle={detailTitle}
                    songId={targetSong?.trackId || targetSong?.id}
                    className="w-full h-full rounded-lg object-cover shadow-xl"
                    isPlaying={isPlaying && isTargetPlaying}
                    isActive={isTargetPlaying}
                  />
                ) : isVideo ? (
                  <AudioReactiveVideo
                    src={coverMedia}
                    alt={targetSong?.trackName}
                    className="w-full h-full rounded-lg object-cover shadow-xl"
                    isPlaying={isPlaying && isTargetPlaying}
                    isActive={isTargetPlaying}
                    playbackRate={playbackRate}
                  />
                ) : (
                  <img 
                    src={albumArtSafe}
                    alt={targetSong?.trackName}
                    className="w-full h-full rounded-lg object-cover shadow-xl"
                    onError={(e) => { e.target.src = fallbackImage; }}
                  />
                );
              })()}
              {/* Play button overlay - only shows on hover */}
              {isHeaderHovered && (
                <div 
                  className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg cursor-pointer hover:bg-black/50 transition-colors z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsHeaderHovered(false);
                    if (isPlaying && isTargetPlaying) {
                      handlePause();
                    } else {
                      handlePlayTarget();
                    }
                  }}
                >
                  {isPlaying && isTargetPlaying ? (
                    <FaPauseCircle size={45} className="text-white drop-shadow-lg hover:scale-110 transition-transform" />
                  ) : (
                    <FaPlayCircle size={45} className="text-white drop-shadow-lg hover:scale-110 transition-transform" />
                  )}
                </div>
              )}
              {/* Artist badge */}
              <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 ${getArtistBadgeColor(targetSong?.artistName)} rounded-full text-[12px] font-bold text-white shadow-lg whitespace-nowrap`}>
                {targetSong?.artistName}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Similar Songs Section */}
      <div>
        <div className="mb-4">
          <h2 className="text-xl md:text-2xl font-bold text-white">
            Top {similarSongs.length} Most Similar Songs by {targetSong?.artistName}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Ranked by ML cosine similarity in normalized audio feature space (tempo, energy, valence, danceability, acousticness)
          </p>
        </div>

        {similarSongs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {similarSongs.map((song, index) => (
              <SimilarSongCard
                key={`${song.trackId}-${index}`}
                song={song}
                isPlaying={isPlaying}
                activeSong={activeSong}
                onPlay={handlePlay}
                onPause={handlePause}
                rank={index + 1}
                playbackRate={playbackRate}
                allSimilarSongs={similarSongs}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <FaMusic className="text-gray-600 text-5xl mx-auto mb-4" />
            <p className="text-gray-400">No similar songs found from this artist.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SongDetails;
