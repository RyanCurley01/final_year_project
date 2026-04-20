import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useRef, useState } from 'react';
import { FiShoppingCart, FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import { FaPauseCircle, FaPlayCircle, FaStar, FaRegStar, FaDownload } from 'react-icons/fa';
import { createPortal } from 'react-dom';

import AudioReactiveVideo from './AudioReactiveVideo';
import OnsetImageCard from './OnsetImageCard';
import { playPause, setActiveSong, setPlaybackRate } from '../redux/features/playerSlice';
import { addToCart } from '../redux/features/cartSlice';
import { addToWishlistLocal, removeFromWishlistLocal, addWishlistItem, removeWishlistByProduct } from '../redux/features/wishlistSlice';
import { useAuth } from '../context/AuthContext';
import { auth as firebaseAuth } from '../firebase';
import placeholders from '../utils/placeholderImage';
import envConfig from '../config/environment';
import { useActionToast } from './CartToast';

const SongCard = ({ product, payment, i, data, onWishlistToggle }) => {
  const isPaid = payment !== null && payment !== undefined;

  const productName = product.albumTitle;
  const price = product.albumPrice;
  const coverMedia = product.albumCoverImageUrl;

  // Checks if a product id exists and has a exactly even id
  const hasDiscount = product.id != null && product.id % 2 === 0;
  
  // If hasDiscount is true, discountedPrice is half of price
  // else, no discounted price
  const discountedPrice = hasDiscount ? price / 2 : null;

  // Check if the cover media is a video (mp4)
  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
  
  // Teddy Emotion keeps the sky video; all other songs use onset images
  const isTeddyEmotion = productName && productName.toLowerCase().includes('teddy emotion');
  const useOnsetImages = isVideo && !isTeddyEmotion;
  
  // Check if current song is a playable song 
  const isPlayableSong = product.albumTitle !== 'Selected Electronic Works';
  
  // Hover state for showing play button
  const [isHovered, setIsHovered] = useState(false);
  // Fullscreen state for video cards
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDownloadingPoolVideo, setIsDownloadingPoolVideo] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState('idle');
  const [downloadLoadedBytes, setDownloadLoadedBytes] = useState(0);
  const [downloadTotalBytes, setDownloadTotalBytes] = useState(0);
  const downloadControllerRef = useRef(null);
  const downloadChunksRef = useRef([]);
  const downloadLoadedRef = useRef(0);
  const downloadTotalRef = useRef(0);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { activeSong, isPlaying, songEnded, playbackRate } = useSelector((state) => state.player);
  const { items: wishlistItems } = useSelector((state) => state.wishlist);
  const { currentUser } = useAuth();
  const currentUserEmail = (currentUser?.email || currentUser?.accountEmailAddress || '').toLowerCase();
  const currentUserUid = currentUser?.firebaseUid || currentUser?.uid || '';
  const videoExportUser = envConfig.getPoolVideoExportUser();
  const canDownloadPoolVideo =
    useOnsetImages &&
    currentUserEmail === videoExportUser.email &&
    currentUserUid === videoExportUser.firebaseUid;

  const canStopDownload = isDownloadingPoolVideo && (downloadStatus === 'downloading' || downloadStatus === 'resuming');
  const canResumeDownload = downloadStatus === 'paused';

  useEffect(() => {
    return () => {
      if (downloadControllerRef.current) {
        try {
          downloadControllerRef.current.abort();
        } catch (_) {
          // ignore abort failures during unmount
        }
      }
    };
  }, []);

  // Check if this product is in the wishlist
  const isWishlisted = wishlistItems.some(
    (item) => item.productId === product.id || item.product?.id === product.id
  );
  
  // Handle playback rate change - dispatch to Redux for recommendations update
  const handlePlaybackRateChange = (e) => {
    const newRate = parseFloat(e.target.value);
    dispatch(setPlaybackRate(newRate));
  };
  
  // Check if this card's song is currently active
  // Product id from backend is 'id', compare that and albumTitle as fallback
  const isThisSongActive = Boolean(
    activeSong && product && (
      (activeSong.id && product.id && activeSong.id === product.id) ||
      (activeSong.albumTitle && product.albumTitle && activeSong.albumTitle === product.albumTitle)
    )
  );

  const handlePauseClick = () => {
    dispatch(playPause(false));
    setIsHovered(false); // Hide overlay after clicking
  };

  const handlePlayClick = () => {
    console.log("▶️ Playing song:", product.albumTitle);
    // Resume same active song without re-dispatching setActiveSong,
    // which resets playbackRate in the player slice.
    if (!isThisSongActive) {
      dispatch(setActiveSong({ song: product, data, i }));
    }
    dispatch(playPause(true));
    setIsHovered(false); // Hide overlay after clicking
  };

  const handleAddToCart = () => {
    // Pass discounted price to cart if applicable
    const cartProduct = hasDiscount
      
      // If hasDiscount is true:
      // A shallow copy of product is made with ...product.
      // Then albumPrice is overridden with discountedPrice
      ? { ...product, albumPrice: discountedPrice }

      // If hasDiscount is false, 
      // cartProduct is just the original product object unchanged.
      : product;

    // This sends an action to Redux.
    // addToCart is the action creator imported from the cart slice.
    // dispatch forwards that action to the reducer so the cart state updates 
    // (add item or increase quantity, then recalc totals) in cartSlice.js:13.
    dispatch(addToCart(cartProduct));
    showActionToast(product.albumTitle || product.trackName, 'cart-add');
  };

  const handleToggleWishlist = async (e) => {
    e.stopPropagation();
    if (!currentUser) return;

    const accountId = currentUser.id;
    const email = currentUser.email || currentUser.accountEmailAddress;
    const password = currentUser.password; // may be undefined for Firebase users
    const isFirebaseUser = !!currentUser.firebaseUid;

    // Get auth params (Firebase token preferred, Basic Auth fallback for legacy users)
    let authParams = {};
    if (isFirebaseUser && firebaseAuth.currentUser) {
      try {
        const token = await firebaseAuth.currentUser.getIdToken();
        authParams = { email, firebaseToken: token };
      } catch (err) {
        console.warn('Failed to get Firebase token for wishlist:', err);
      }
    } else if (email && password) {
      authParams = { email, password };
    }
    const hasAuth = !!(authParams.password || authParams.firebaseToken);

    if (isWishlisted) {
      // Remove all entries for this product (handles duplicates)
      dispatch(removeFromWishlistLocal({ productId: product.id, accountId }));
      dispatch(removeWishlistByProduct({ accountId, productId: product.id, ...authParams }));
      if (onWishlistToggle) {
        onWishlistToggle(product, 'wish-remove');
      } else {
        showActionToast(product.albumTitle || product.trackName, 'wish-remove');
      }
    } else {
      dispatch(addToWishlistLocal({ ...product, accountId }));
      // Only attempt backend sync when credentials exist
      if (hasAuth) {
        dispatch(
          addWishlistItem({
            wishlistData: { accountId, productId: product.id },
            ...authParams,
          })
        );
      }
      if (onWishlistToggle) {
        onWishlistToggle(product, 'wish-add');
      } else {
        showActionToast(product.albumTitle || product.trackName, 'wish-add');
      }
    }
  };

  // Handle song title click for music items
  const handleSongTitleClick = async () => {
    // Navigate to SongDetails with product data and all music products for similarity
    navigate(`/songs/${product.id}`, {
      state: {
        song: {
          trackId: product.id,
          trackName: product.albumTitle,
          artistName: 'Selected Electronic Works',
          collectionName: product.albumTitle,
          artworkUrl100: product.albumCoverImageUrl,
          previewUrl: product.fileUrl,
          fileUrl: product.fileUrl,
          price: product.albumPrice,
          primaryGenreName: 'Electronic'
        },
        artistSongs: data.filter(p => p.id !== product.id).map(p => ({
          trackId: p.id,
          trackName: p.albumTitle,
          artistName: 'Selected Electronic Works',
          collectionName: p.albumTitle,
          artworkUrl100: p.albumCoverImageUrl,
          previewUrl: p.fileUrl,
          fileUrl: p.fileUrl,
          price: p.albumPrice,
          primaryGenreName: 'Electronic'
        })),
        fromDiscover: true
      }
    });
  };

  const streamPoolVideo = async ({ startByte = 0, existingChunks = [], knownTotal = 0 }) => {
    if (!product?.id) return;

    const apiBaseUrl = envConfig.getApiBaseUrl();
    const title = productName || `song-${product.id}`;
    const endpoint = `${apiBaseUrl}/api/images/pool-video?song_id=${encodeURIComponent(product.id)}&song_title=${encodeURIComponent(title)}&audio_url=${encodeURIComponent(product.fileUrl || '')}`;
    const controller = new AbortController();
    downloadControllerRef.current = controller;

    setIsDownloadingPoolVideo(true);
    setDownloadStatus(startByte > 0 ? 'resuming' : 'downloading');

    const headers = {
      Accept: 'video/mp4',
    };
    if (startByte > 0) {
      headers.Range = `bytes=${startByte}-`;
    }

    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Video export failed (${response.status})`);
    }

    const totalFromRange = (() => {
      const contentRange = response.headers.get('content-range');
      if (!contentRange) return 0;
      const match = contentRange.match(/bytes\s+\d+-\d+\/(\d+)/i);
      return match ? Number(match[1]) || 0 : 0;
    })();

    const responseLength = Number(response.headers.get('content-length')) || 0;
    const total = totalFromRange || (startByte > 0 ? (knownTotal || startByte + responseLength) : responseLength);

    if (total > 0) {
      setDownloadTotalBytes(total);
      downloadTotalRef.current = total;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Download stream is unavailable');
    }

    const shouldResetToFull = startByte > 0 && response.status === 200;
    const chunks = shouldResetToFull ? [] : [...existingChunks];
    let loaded = shouldResetToFull ? 0 : startByte;
    setDownloadLoadedBytes(loaded);
    downloadLoadedRef.current = loaded;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      loaded += value.byteLength;
      downloadChunksRef.current = chunks;
      setDownloadLoadedBytes(loaded);
      downloadLoadedRef.current = loaded;
      if (total > 0) {
        setDownloadProgress(Math.min(100, (loaded / total) * 100));
      }
    }

    downloadControllerRef.current = null;

    const blob = new Blob(chunks, { type: 'video/mp4' });
    const objectUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeTitle = String(title)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `song-${product.id}`;

    a.href = objectUrl;
    a.download = `${safeTitle}-image-pool.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(objectUrl);

    setDownloadProgress(100);
    setDownloadStatus('completed');
    setIsDownloadingPoolVideo(false);
    downloadChunksRef.current = [];
    downloadLoadedRef.current = 0;
    downloadTotalRef.current = 0;
    setTimeout(() => {
      setDownloadStatus('idle');
      setDownloadLoadedBytes(0);
      setDownloadTotalBytes(0);
      setDownloadProgress(0);
    }, 3000);
  };

  const handleDownloadPoolVideo = async (e) => {
    e.stopPropagation();
    if (!canDownloadPoolVideo || !product?.id || isDownloadingPoolVideo) return;

    try {
      downloadChunksRef.current = [];
      downloadLoadedRef.current = 0;
      downloadTotalRef.current = 0;
      setDownloadLoadedBytes(0);
      setDownloadTotalBytes(0);
      setDownloadProgress(0);
      await streamPoolVideo({ startByte: 0, existingChunks: [], knownTotal: 0 });
    } catch (err) {
      if (err?.name === 'AbortError') {
        setDownloadStatus('paused');
        setIsDownloadingPoolVideo(false);
        return;
      }
      console.error('Failed to download image pool video:', err);
      setDownloadStatus('error');
      setIsDownloadingPoolVideo(false);
      alert('Failed to generate/download image pool video. Please try again.');
    }
  };

  const handleStopDownload = async (e) => {
    e.stopPropagation();
    if (downloadControllerRef.current) {
      try {
        downloadControllerRef.current.abort();
      } catch (_) {
        // ignore
      }
      downloadControllerRef.current = null;
    }
    setDownloadStatus('paused');
    setIsDownloadingPoolVideo(false);
  };

  const handleResumeDownload = async (e) => {
    e.stopPropagation();
    if (!canResumeDownload || isDownloadingPoolVideo) return;
    try {
      await streamPoolVideo({
        startByte: downloadLoadedRef.current,
        existingChunks: downloadChunksRef.current,
        knownTotal: downloadTotalRef.current || downloadTotalBytes,
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        setDownloadStatus('paused');
        setIsDownloadingPoolVideo(false);
        return;
      }
      console.error('Failed to resume image pool video download:', err);
      setDownloadStatus('error');
      setIsDownloadingPoolVideo(false);
      alert('Failed to resume download. Please try again.');
    }
  };


  const [showActionToast, ActionToast] = useActionToast();

  return (
    /**
     * Shows the cover image with song and game details
     */
    <>
    {ActionToast}
    <div className="flex flex-col h-full p-4 bg-white/5 backdrop-blur-sm animate-slideup rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      <div 
        className="relative w-full aspect-square rounded-lg overflow-hidden outline-none border-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {useOnsetImages ? (
          <OnsetImageCard
            songTitle={productName}
            songId={product.id}
            className="w-full h-full object-cover"
            isPlaying={isPlaying && isThisSongActive}
            isActive={isThisSongActive}
          />
        ) : isVideo ? (
          <AudioReactiveVideo
            src={coverMedia}
            alt={productName}
            className="w-full h-full object-cover"
            isPlaying={isPlaying && isThisSongActive}
            isActive={isThisSongActive}
            playbackRate={isThisSongActive ? playbackRate : 1.0}
          />
        ) : (
          <img
            src={coverMedia || placeholders.large}
            alt={productName}
            className="w-full h-full object-cover"
            onError={(e) => {
              if (e.target.src !== placeholders.large) {
                e.target.src = placeholders.large;
              }
            }}
          />
        )}
        
        {/* Play/Pause overlay - shows on hover */}
        {isPlayableSong && (
          <div 
            className={`absolute inset-0 rounded-lg flex justify-center items-center ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ 
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 10
            }}
          >
            <div
              className="cursor-pointer"
              style={{ pointerEvents: 'auto' }}
              onClick={(e) => {
                e.stopPropagation();
                if (isPlaying && isThisSongActive) {
                  handlePauseClick();
                } else {
                  handlePlayClick();
                }
              }}
            >
              {isPlaying && isThisSongActive ? (
                <FaPauseCircle 
                  size={45}
                  className="text-white drop-shadow-lg hover:scale-110 transition-transform"
                />
              ) : (
                <FaPlayCircle 
                  size={45}
                  className="text-white drop-shadow-lg hover:scale-110 transition-transform"
                />
              )}
            </div>
          </div>
        )}

        {/* Maximise button for video/onset cards - top right */}
        {(isVideo || useOnsetImages) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen(true);
            }}
            className="absolute top-2 right-10 z-20 p-1.5 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-all hover:scale-110"
            title="Maximise video"
          >
            <FiMaximize2 className="w-5 h-5 text-white/80 hover:text-white drop-shadow-lg transition-colors" />
          </button>
        )}

        {canDownloadPoolVideo && (
          <button
            onClick={handleDownloadPoolVideo}
            disabled={isDownloadingPoolVideo}
            className="absolute top-2 left-2 z-20 px-2 py-1.5 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-all hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
            title="Download image pool as video"
          >
            <FaDownload className="w-3.5 h-3.5 text-white/90" />
            <span className="text-[11px] text-white/90 font-semibold">
              {isDownloadingPoolVideo ? 'Downloading...' : 'Pool Video'}
            </span>
          </button>
        )}

        {/* Wishlist Star - top right */}
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

        {/* Playing indicator - bottom right */}
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
            <span className="text-xs text-white font-mono">{isThisSongActive ? playbackRate.toFixed(2) : '1.00'}x</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.05"
            value={isThisSongActive ? playbackRate : 1.0}
            onChange={handlePlaybackRateChange}
            disabled={!isThisSongActive}
            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer
                     slider-thumb:appearance-none slider-thumb:w-3 slider-thumb:h-3 
                     slider-thumb:bg-blue-500 slider-thumb:rounded-full slider-thumb:cursor-pointer
                     hover:bg-gray-500 transition-colors"
            style={{
              background: isThisSongActive
                ? `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((playbackRate - 0.1) / 1.9) * 100}%, #4b5563 ${((playbackRate - 0.1) / 1.9) * 100}%, #4b5563 100%)`
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
        <div
          className="fixed inset-0 bg-black flex flex-col items-center justify-center"
          style={{ zIndex: 99999 }}
        >
          {/* Header bar with title and minimise button */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 bg-linear-to-b from-black/80 to-transparent z-10">
            <h3 className="text-white font-semibold text-lg truncate">{productName}</h3>
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-all hover:scale-110"
              title="Minimise"
            >
              <FiMinimize2 className="w-6 h-6 text-white" />
            </button>
          </div>

          {/* Fullscreen content */}
          <div className="absolute inset-0 w-full h-full">
            {useOnsetImages ? (
              <OnsetImageCard
                songTitle={productName}
                songId={product.id}
                className="w-full h-full object-contain"
                isPlaying={isPlaying && isThisSongActive}
                isActive={isThisSongActive}
              />
            ) : (
              <AudioReactiveVideo
                src={coverMedia}
                alt={productName}
                className="w-full h-full object-contain"
                isPlaying={isPlaying && isThisSongActive}
                isActive={isThisSongActive}
                playbackRate={isThisSongActive ? playbackRate : 1.0}
              />
            )}
          </div>
        </div>,
        document.body
      )}

      <div className="flex flex-col flex-1 mt-4">
        <p className="font-semibold text-lg text-gray-300 h-7 overflow-hidden">
          <span 
            onClick={handleSongTitleClick}
            className="block hover:text-cyan-400 transition-colors cursor-pointer line-clamp-2"
            title={productName || 'Unknown'}
          >
            {productName || 'Unknown'}
          </span>
        </p>
        <div className="flex justify-between items-end mt-auto pt-2">
          <p className="text-sm text-white">
            Music
          </p>
          {hasDiscount ? (
            <div className="flex flex-col items-start gap-1.5">
              <span className="px-1.5 py-0.5 bg-green-500/90 rounded text-[10px] font-bold text-white">
                50% OFF
              </span>
              <div className="flex flex-row items-center gap-1.5">
                <p className="text-sm text-gray-400 line-through">
                  ${price?.toFixed(2) || '0.00'}
                </p>
                <p className="text-sm font-bold text-green-400">
                  ${discountedPrice?.toFixed(2)}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold invisible">
                &nbsp;
              </span>
              <p className="text-sm font-bold text-white">
                ${price?.toFixed(2) || '0.00'}
              </p>
            </div>
          )}
        </div>
        <button 
          onClick={handleAddToCart}
          className="w-full mt-2 px-3 py-2 bg-blue-700 hover:bg-blue-800 rounded font-semibold text-white text-sm leading-none flex items-center justify-center gap-2"
        >
          <FiShoppingCart />
          Add to Cart
        </button>

        {canDownloadPoolVideo && downloadStatus !== 'idle' && (
          <div className="mt-3 rounded-md bg-black/25 border border-white/10 p-2">
            <div className="flex items-center justify-between text-[11px] text-white/80 mb-1">
              <span>
                {downloadStatus === 'completed' ? 'Download complete' : downloadStatus === 'paused' ? 'Download paused' : downloadStatus === 'error' ? 'Download failed' : 'Downloading video'}
              </span>
              <span>{downloadProgress.toFixed(0)}%</span>
            </div>

            <div className="w-full h-2 rounded bg-white/10 overflow-hidden">
              <div
                className="h-full bg-cyan-400 transition-all duration-150"
                style={{ width: `${Math.max(0, Math.min(100, downloadProgress))}%` }}
              />
            </div>

            <div className="mt-1 text-[10px] text-white/60">
              {downloadTotalBytes > 0
                ? `${(downloadLoadedBytes / (1024 * 1024)).toFixed(2)} MB / ${(downloadTotalBytes / (1024 * 1024)).toFixed(2)} MB`
                : `${(downloadLoadedBytes / (1024 * 1024)).toFixed(2)} MB downloaded`}
            </div>

            <div className="mt-2 flex gap-2">
              <button
                onClick={handleStopDownload}
                disabled={!canStopDownload}
                className="px-2 py-1 text-[11px] rounded bg-red-500/80 hover:bg-red-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Stop
              </button>
              <button
                onClick={handleResumeDownload}
                disabled={!canResumeDownload}
                className="px-2 py-1 text-[11px] rounded bg-emerald-500/80 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Resume
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default SongCard;
