import {Link } from 'react-router-dom';
import {useDispatch, useSelector } from 'react-redux';
import { useRef, useEffect } from 'react';

import PlayPause from './PlayPause';
import { playPause, setActiveSong } from '../redux/features/playerSlice';

const SongCard = ({ product, i, data }) => {
  const videoRef = useRef(null);
  
  // Determine if it's a game or music based on which fields are populated
  const isMusic = product.albumTitle !== null && product.albumTitle !== undefined;
  const isGame = product.gameTitle !== null && product.gameTitle !== undefined;
  
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
  const { activeSong, isPlaying, songEnded } = useSelector((state) => state.player);
  
  // Check if this card's song is currently active
  const isThisSongActive = activeSong?.albumTitle === product.albumTitle;
  
  // Sync video playback with audio player
  useEffect(() => {
    if (videoRef.current && isVideo) {
      if (isThisSongActive && isPlaying) {
        // Song is playing - video should loop continuously
        videoRef.current.loop = true;
        videoRef.current.play().catch(e => console.error('Video play error:', e));
      } else if (isThisSongActive && !isPlaying) {
        // Song is paused
        videoRef.current.pause();
      } else {
        // Not the active song - just let it loop on its own
        videoRef.current.loop = true;
        if (videoRef.current.paused) {
          videoRef.current.play().catch(e => console.error('Video play error:', e));
        }
      }
    }
  }, [isThisSongActive, isPlaying, isVideo]);
  
  // Restart video when song ends
  useEffect(() => {
    if (videoRef.current && isVideo && isThisSongActive && songEnded) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(e => console.error('Video restart error:', e));
    }
  }, [songEnded, isThisSongActive, isVideo]);

  const handlePauseClick = () => {
    dispatch(playPause(false));
  };

  const handlePlayClick = () => {
    dispatch(setActiveSong({ song: product, data, i }));
    dispatch(playPause(true));
  };


  return (
    /**
     * Shows the cover image with song and game details
     */
    <div className="flex flex-col w-[250px] p-4 bg-white/5 
    bg-opacity-80 backdrop-blur-sm animate-slideup
    rounded-lg cursor-pointer">
      <div className="relative w-full h-[160px] group">
        {isVideo ? (
          <video
            ref={videoRef}
            src={coverMedia}
            alt={productName}
            className="w-full h-full rounded-lg object-cover"
            muted
            playsInline
            preload="auto"
            crossOrigin="anonymous"
            style={{ willChange: 'transform' }}
            onError={(e) => {
              console.error('Video failed to load:', coverMedia, e);
              e.target.style.display = 'none';
              e.target.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        {!isVideo || true ? (
          <img
            src={coverMedia || 'https://via.placeholder.com/250x224?text=No+Image'}
            alt={productName}
            className={`w-full h-full rounded-lg object-cover ${isVideo ? 'hidden' : ''}`}
            onError={(e) => {
              e.target.src = 'https://via.placeholder.com/250x224?text=No+Image';
            }}
          />
        ) : null}
        <div className={`group-hover:flex absolute rounded-lg inset-0 justify-center items-center
           bg-black bg-opacity-50 ${isPlayableSong ? 'flex bg-black bg-opacity-50' : 'hidden'}
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
      </div>

      <div className="flex flex-col mt-4">
        <p className="font-semibold text-lg text-white">
          {isGame ? (
            <Link
              to={`/games/${product.productId}`}
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
            <button className="px-2 py-1 bg-blue-700 hover:bg-blue-800 rounded font-semibold text-white text-[15px] leading-none flex items-center justify-center">
              Add to Cart
            </button>
          </div>
        )}
        {isMusic && (
            <button className="px-2 py-1 bg-blue-700 hover:bg-blue-800 rounded font-semibold text-white text-[15px] leading-none flex items-center justify-center">
              Add to Cart
            </button>
        )}
      </div>
    </div>
  );
};

export default SongCard;
