import React, { useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';

const Track = ({ isPlaying, isActive, activeSong }) => {
  const videoRef = useRef(null);
  const { songEnded } = useSelector((state) => state.player);
  const coverMedia = activeSong?.albumCoverImageUrl || activeSong?.gameCoverImageUrl;
  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
  
  // Sync video with player state
  useEffect(() => {
    if (videoRef.current && isVideo) {
      if (isPlaying && isActive) {
        videoRef.current.loop = true;
        videoRef.current.play().catch(e => console.error('Track video play error:', e));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, isActive, isVideo]);
  
  // Restart video when song ends
  useEffect(() => {
    if (videoRef.current && isVideo && songEnded && isActive) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(e => console.error('Video restart error:', e));
    }
  }, [songEnded, isActive, isVideo]);

  return (
  <div className="flex-1 flex items-center justify-start">
    <div className={`${isPlaying && isActive ? 'animate-[spin_3s_linear_infinite]' : ''} hidden sm:block h-16 w-16 mr-4`}>
      {isVideo ? (
        <video
          ref={videoRef}
          src={coverMedia}
          alt="cover art"
          className="rounded-full object-cover w-full h-full"
          muted
          playsInline
          preload="auto"
          crossOrigin="anonymous"
          style={{ willChange: 'transform' }}
          onError={(e) => {
            console.error('Track video failed to load:', coverMedia, e);
            e.target.style.display = 'none';
            e.target.nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      {!isVideo || true ? (
        <img 
          src={coverMedia || 'https://via.placeholder.com/64'} 
          alt="cover art" 
          className={`rounded-full object-cover w-full h-full ${isVideo ? 'hidden' : ''}`}
          onError={(e) => {
            e.target.src = 'https://via.placeholder.com/64';
          }}
        />
      ) : null}
    </div>
    <div className="w-[50%]">
      <p className="truncate text-white font-bold text-lg">
        {activeSong?.albumTitle || activeSong?.gameTitle || 'No active Song'}
      </p>
      <p className="truncate text-gray-300">
        {activeSong?.albumPrice ? `$${activeSong.albumPrice.toFixed(2)}` : activeSong?.gamePrice ? `$${activeSong.gamePrice.toFixed(2)}` : 'Select a song'}
      </p>
    </div>
  </div>
  );
};

export default Track;
