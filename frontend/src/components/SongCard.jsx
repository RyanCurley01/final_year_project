import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useState } from 'react';
import { FiShoppingCart } from 'react-icons/fi';
import { FaPauseCircle, FaPlayCircle, FaStar, FaRegStar } from 'react-icons/fa';

import AudioReactiveVideo from './AudioReactiveVideo';
import { playPause, setActiveSong, setPlaybackRate } from '../redux/features/playerSlice';
import { addToCart } from '../redux/features/cartSlice';
import { addToWishlistLocal, removeFromWishlistLocal, addWishlistItem, removeWishlistItem } from '../redux/features/wishlistSlice';
import { useAuth } from '../context/AuthContext';
import { auth as firebaseAuth } from '../firebase';
import placeholders from '../utils/placeholderImage';

const SongCard = ({ product, payment, i, data }) => {
  const isPaid = payment !== null && payment !== undefined;

  const productName = product.albumTitle;
  const price = product.albumPrice;
  const coverMedia = product.albumCoverImageUrl;

  // Check if the cover media is a video (mp4)
  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
  
  // Check if current song is a playable song 
  const isPlayableSong = product.albumTitle !== 'Selected Electronic Works';
  
  // Hover state for showing play button
  const [isHovered, setIsHovered] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { activeSong, isPlaying, songEnded, playbackRate } = useSelector((state) => state.player);
  const { items: wishlistItems } = useSelector((state) => state.wishlist);
  const { currentUser } = useAuth();

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
    dispatch(setActiveSong({ song: product, data, i }));
    dispatch(playPause(true));
    setIsHovered(false); // Hide overlay after clicking
  };

  const handleAddToCart = () => {
    dispatch(addToCart(product));
  };

  const handleToggleWishlist = async (e) => {
    e.stopPropagation();
    if (!currentUser) return;

    const accountId = currentUser.id;
    const email = currentUser.email || currentUser.accountEmailAddress;
    const password = currentUser.password; // may be undefined for Firebase users
    const isFirebaseUser = !!currentUser.firebaseUid;

    // Get auth params (Basic Auth or Firebase token)
    let authParams = {};
    if (email && password) {
      authParams = { email, password };
    } else if (isFirebaseUser && firebaseAuth.currentUser) {
      try {
        const token = await firebaseAuth.currentUser.getIdToken();
        authParams = { email, firebaseToken: token };
      } catch (err) {
        console.warn('Failed to get Firebase token for wishlist:', err);
      }
    }
    const hasAuth = !!(authParams.password || authParams.firebaseToken);

    if (isWishlisted) {
      // Find the wishlist entry for this product
      const entry = wishlistItems.find(
        (item) => item.productId === product.id || item.product?.id === product.id
      );
      if (entry) {
        dispatch(removeFromWishlistLocal({ productId: product.id, accountId }));
        // Only attempt backend sync when credentials exist
        if (hasAuth) {
          dispatch(removeWishlistItem({ id: entry.id, ...authParams }));
        }
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


  return (
    /**
     * Shows the cover image with song and game details
     */
    <div className="flex flex-col p-4 bg-white/5 backdrop-blur-sm animate-slideup rounded-lg cursor-pointer hover:bg-white/10 transition-all">
      <div 
        className="relative w-full aspect-square rounded-lg overflow-hidden outline-none border-none"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isVideo ? (
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

      {/* Tempo Slider - shown only for videos when this song is active */}
      {isVideo && isThisSongActive && (
        <div className="mt-2 px-2">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-white/70">Playback Speed</label>
            <span className="text-xs text-white font-mono">{playbackRate.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.05"
            value={playbackRate}
            onChange={handlePlaybackRateChange}
            className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer
                     slider-thumb:appearance-none slider-thumb:w-3 slider-thumb:h-3 
                     slider-thumb:bg-blue-500 slider-thumb:rounded-full slider-thumb:cursor-pointer
                     hover:bg-gray-500 transition-colors"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((playbackRate - 0.1) / 1.9) * 100}%, #4b5563 ${((playbackRate - 0.1) / 1.9) * 100}%, #4b5563 100%)`
            }}
          />
          <div className="flex justify-between text-xs text-white/50 mt-0.5">
            <span>0.1x</span>
            <span>1.0x</span>
            <span>2.0x</span>
          </div>
        </div>
      )}

      <div className="flex flex-col mt-4">
        <p className="font-semibold text-lg text-gray-300">
          <span 
            onClick={handleSongTitleClick}
            className="block break-words hover:text-cyan-400 transition-colors cursor-pointer"
            title="Click to see 20 most similar songs"
          >
            {productName || 'Unknown'}
          </span>
        </p>
        <div className="flex justify-between items-center mt-2">
          <p className="text-sm text-white">
            Music
          </p>
          <p className="text-sm font-bold text-white">
            ${price?.toFixed(2) || '0.00'}
          </p>
        </div>
        <button 
          onClick={handleAddToCart}
          className="mt-2 w-full px-3 py-2 bg-blue-700 hover:bg-blue-800 rounded font-semibold text-white text-sm leading-none flex items-center justify-center gap-2"
        >
          <FiShoppingCart />
          Add to Cart
        </button>
      </div>
    </div>
  );
};

export default SongCard;
