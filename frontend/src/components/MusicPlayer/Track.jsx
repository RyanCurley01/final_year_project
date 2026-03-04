import React, { useRef, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import placeholders from '../../utils/placeholderImage';
import OnsetImageCard from '../OnsetImageCard';

const Track = ({ isPlaying, isActive, activeSong }) => {
  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState(false);
  const { songEnded } = useSelector((state) => state.player);
  
  // Support both database songs (albumCoverImageUrl) and iTunes songs (artworkUrl100)
  const getCoverMedia = () => {
    // First check direct album cover (from Discover page database songs)
    if (activeSong?.albumCoverImageUrl) return activeSong.albumCoverImageUrl;
    // Then fall back to iTunes artwork
    if (activeSong?.artworkUrl100) return activeSong.artworkUrl100.replace('100x100', '400x400');
    return null;
  };
  
  const coverMedia = getCoverMedia();
  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
  const songTitle = activeSong?.albumTitle || activeSong?.trackName || '';
  const isTeddyEmotion = songTitle.toLowerCase().includes('teddy emotion');
  const useOnsetImages = isVideo && !isTeddyEmotion;
  
  // Reset video error when song changes
  useEffect(() => {
    setVideoError(false);
  }, [coverMedia]);

  // Sync video with player state
  useEffect(() => {
    if (videoRef.current && isVideo && !videoError) {
      if (isPlaying && isActive) {
        videoRef.current.loop = true;
        videoRef.current.play().catch(() => {
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
      videoRef.current.play().catch(() => {});
    }
  }, [songEnded, isActive, isVideo, videoError]);

  return (
  <div className="flex items-center justify-start flex-shrink-0">
    <div className={`${isPlaying && isActive ? 'animate-spin' : ''} block h-12 w-12 sm:h-16 sm:w-16 mr-2 sm:mr-4 flex-shrink-0`} style={{ animationDuration: '3s' }}>
      {useOnsetImages ? (
        <div className="rounded-full overflow-hidden w-full h-full">
          <OnsetImageCard
            songTitle={songTitle}
            songId={activeSong?.id || activeSong?.productId}
            className="w-full h-full object-cover"
            isPlaying={isPlaying && isActive}
            isActive={isActive}
          />
        </div>
      ) : isVideo && !videoError ? (
        <video
          ref={videoRef}
          src={coverMedia}
          crossOrigin="anonymous"
          alt="cover art"
          className="rounded-full object-cover w-full h-full"
          muted
          playsInline
          preload="auto"
          style={{ willChange: 'transform' }}
          onError={(e) => {
            setVideoError(true);
          }}
        />
      ) : null}
      {!isVideo || videoError ? (
        <img 
          key={coverMedia}
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
    <div className="min-w-0">
      <p className="text-white font-bold text-sm sm:text-base truncate">
        {activeSong?.trackName || activeSong?.albumTitle || 'No active Song'}
      </p>
      <p className="text-gray-300 text-xs sm:text-sm truncate">
        {activeSong?.artistName === 'Unknown Artist' || (activeSong?.source === 'database') ? ' ' : (activeSong?.artistName || 'Select a song')}
      </p>
    </div>
  </div>
  );
};

export default Track;
