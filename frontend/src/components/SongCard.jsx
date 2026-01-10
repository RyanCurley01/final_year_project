import {Link } from 'react-router-dom';
import {useDispatch, useSelector } from 'react-redux';
import { useRef, useEffect, useState } from 'react';
import { MdFullscreen } from 'react-icons/md';
import { FiShoppingCart } from 'react-icons/fi';

import PlayPause from './PlayPause';
import AudioReactiveVideo from './AudioReactiveVideo';
import { useVideoModal } from '../context/VideoModalContext';
import { playPause, setActiveSong, setPlaybackRate } from '../redux/features/playerSlice';
import { addToCart } from '../redux/features/cartSlice';
import placeholders from '../utils/placeholderImage';

const SongCard = ({ product, payment, i, data }) => {
  // Determine if it's a game or music based on which fields are populated
  const isMusic = product.albumTitle !== null && product.albumTitle !== undefined;
  const isGame = product.gameTitle !== null && product.gameTitle !== undefined;
  const isPaid = payment !== null && payment !== undefined;

  const productName = isMusic ? product.albumTitle : product.gameTitle;
  const price = isMusic ? product.albumPrice : product.gamePrice;
  const coverMedia = isMusic ? product.albumCoverImageUrl : product.gameCoverImageUrl;

  // Check if the cover media is a video (mp4)
  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
  
  // Debug logging
  if (i === 0) {
    console.log('First product:', { productName, coverMedia, isVideo, isMusic, isGame });
  }

  // Check if current song is a playable song 
  const isPlayableSong = isMusic && product.albumTitle !== 'Selected Electronic Works';

  const dispatch = useDispatch();
  const { activeSong, isPlaying, songEnded, playbackRate } = useSelector((state) => state.player);
  const { openModal } = useVideoModal();
  
  // Handle playback rate change - dispatch to Redux for recommendations update
  const handlePlaybackRateChange = (e) => {
    const newRate = parseFloat(e.target.value);
    dispatch(setPlaybackRate(newRate));
  };
  
  // Check if this card's song is currently active
  const isThisSongActive = activeSong?.albumTitle === product.albumTitle;

  const handleMaximizeClick = (e) => {
    e.stopPropagation();
    openModal({
      videoSrc: coverMedia,
      title: productName,
      isPlaying,
      isActive: isThisSongActive
    });
  };

  const handlePauseClick = () => {
    console.log('🔴 Pause clicked for:', product.albumTitle);
    dispatch(playPause(false));
  };

  const handlePlayClick = () => {
    console.log('▶️ Play clicked for:', product.albumTitle, 'fileUrl:', product.fileUrl);
    dispatch(setActiveSong({ song: product, data, i }));
    dispatch(playPause(true));
  };

  const handleAddToCart = () => {
    dispatch(addToCart(product));
    // Optional: Show a toast notification
    console.log('Added to cart:', productName);
  };


  return (
    /**
     * Shows the cover image with song and game details
     */
    <div className="flex flex-col p-4 bg-white/5 
    bg-opacity-80 backdrop-blur-sm animate-slideup
    rounded-lg cursor-pointer">
      <div className="relative w-full aspect-square group">
        {isVideo ? (
          <>
            <AudioReactiveVideo
              src={coverMedia}
              alt={productName}
              className="w-full h-full rounded-lg object-cover"
              isPlaying={isPlaying}
              isActive={isThisSongActive}
              playbackRate={isThisSongActive ? playbackRate : 1.0}
              onError={(e) => {
                console.error('Video failed to load:', coverMedia, e);
              }}
            />
            {/* Maximize button - always visible for videos */}
            <button
              onClick={handleMaximizeClick}
              className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black/90 rounded-md 
                       transition-all duration-200 z-50 shadow-lg"
              title="Fullscreen"
            >
              <MdFullscreen className="text-white text-2xl" />
            </button>
          </>
        ) : (
          <img
            src={coverMedia || placeholders.large}
            alt={productName}
            className="w-full h-full rounded-lg object-cover"
            onError={(e) => {
              if (e.target.src !== placeholders.large) {
                e.target.src = placeholders.large;
              }
            }}
          />
        )}
        <div className={`group-hover:flex absolute rounded-lg inset-0 justify-center items-center
           bg-black bg-opacity-50 z-10 ${isPlayableSong ? 'flex bg-black bg-opacity-50' : 'hidden'}
            ${isPlayableSong ? 'hidden' : 'flex bg-black bg-opacity-50'}`}>
          {isPlayableSong && (
            <PlayPause 
              isPlaying={isPlaying && activeSong?.albumTitle === product.albumTitle}
              activeSong={activeSong}
              handlePause={handlePauseClick}
              handlePlay={handlePlayClick}
              song={product}
            />
          )}
        </div>

        {/* Playing indicator - bottom right */}
        {isThisSongActive && isPlaying && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-green-500/90 px-2 py-1 rounded-full z-20">
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
        <p className="font-semibold text-lg text-white">
          {isGame ? (
            <Link
              to={`/games/${product.id}`}
              title={productName || 'Unknown'}
              className="block break-words"
            >
              {productName || 'Unknown'}
            </Link>
          ) : (
            <span className="block break-words">
              {productName || 'Unknown'}
            </span>
          )}
        </p>
        <div className="flex justify-between items-center mt-2">
          <p className="text-sm text-white">
            {isMusic ? 'Music' : 'Game'}
          </p>
          <p className="text-sm font-bold text-white">
            ${price?.toFixed(2) || '0.00'}
          </p>
        </div>
        {isGame && (
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-white">
              {product.platform ? `Platform: ${product.platform}` : ''}
            </p>
            <button 
              onClick={handleAddToCart}
              className="px-3 py-2 bg-blue-700 hover:bg-blue-800 rounded font-semibold text-white text-sm leading-none flex items-center justify-center gap-2"
            >
              <FiShoppingCart />
              Add to Cart
            </button>
          </div>
        )}
        {isMusic && (
          <button 
            onClick={handleAddToCart}
            className="mt-2 w-full px-3 py-2 bg-blue-700 hover:bg-blue-800 rounded font-semibold text-white text-sm leading-none flex items-center justify-center gap-2"
          >
            <FiShoppingCart />
            Add to Cart
          </button>
        )}
      </div>
    </div>
  );
};

export default SongCard;
