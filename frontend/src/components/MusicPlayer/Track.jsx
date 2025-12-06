import React, { useRef, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import placeholders from '../../utils/placeholderImage';

const Track = ({ isPlaying, isActive, activeSong }) => {
  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState(false);
  const { songEnded } = useSelector((state) => state.player);
  const coverMedia = activeSong?.albumCoverImageUrl || activeSong?.gameCoverImageUrl;
  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
  
  // Reset video error when song changes
  useEffect(() => {
    setVideoError(false);
  }, [coverMedia]);

  // Sync video with player state
  useEffect(() => {
    if (videoRef.current && isVideo && !videoError) {
      if (isPlaying && isActive) {
        videoRef.current.loop = true;
        videoRef.current.play().catch(e => {
          console.error('Track video play error:', e);
          // If play fails (e.g. not loaded), we might want to fallback? 
          // But usually play() fails due to interruption or permissions.
        });
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, isActive, isVideo, videoError]);
  
  // Restart video when song ends
  useEffect(() => {
    if (videoRef.current && isVideo && songEnded && isActive && !videoError) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(e => console.error('Video restart error:', e));
    }
  }, [songEnded, isActive, isVideo, videoError]);

  return (
  <div className="flex-1 flex items-center justify-start">
    <div className={`${isPlaying && isActive ? 'animate-[spin_3s_linear_infinite]' : ''} hidden sm:block h-16 w-16 mr-4`}>
      {isVideo && !videoError ? (
        <video
          ref={videoRef}
          src={coverMedia}
          alt="cover art"
          className="rounded-full object-cover w-full h-full"
          muted
          playsInline
          preload="auto"
          style={{ willChange: 'transform' }}
          onError={(e) => {
            console.error('Track video failed to load:', coverMedia, e);
            setVideoError(true);
          }}
        />
      ) : null}
      {!isVideo || videoError ? (
        <img 
          src={coverMedia || placeholders.small} 
          alt="cover art" 
          className={`rounded-full object-cover w-full h-full`}
          onError={(e) => {
            if (e.target.src !== placeholders.small) {
              e.target.src = placeholders.small;
            }
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
