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
  // Check if artworkUrl100 is a .mp4 (happens when library songs are played from recommendation sidebar)
  const artworkIsVideo = activeSong?.artworkUrl100 && activeSong.artworkUrl100.toLowerCase().includes('.mp4');
  // Library songs (positive ID < 1000000, source=database) with video covers or no valid image should show cloud cover
  const isLibrarySong = (activeSong?.source === 'database') || (Number(activeSong?.id) > 0 && Number(activeSong?.id) < 1000000);
  const hasNoValidImage = !coverMedia || isVideo || artworkIsVideo;
  const showCloudCover = isVideo || artworkIsVideo || (isLibrarySong && hasNoValidImage);
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
  <div className="flex items-center justify-start shrink-0 w-[100px] sm:w-[200px] overflow-hidden">
    <div className="relative h-12 w-12 sm:h-16 sm:w-16 mr-2 sm:mr-4 shrink-0">
      <div className={`${isPlaying && isActive ? 'animate-spin' : ''} block h-full w-full`} style={{ animationDuration: '3s' }}>
        {showCloudCover ? (
          <img 
            key={`cloud-${activeSong?.id}`}
            src="/cloud-cover.webp"
            alt="cover art"
            className="rounded-full object-cover w-full h-full border-2 border-cyan-500/50"
            onError={(e) => {
              if (e.target.src !== placeholders.small) {
                e.target.src = placeholders.small;
              }
            }}
          />
        ) : null}
        {!showCloudCover ? (
          <img 
            key={coverMedia}
            src={coverMedia || placeholders.small} 
            alt="cover art" 
            className={`rounded-full object-cover w-full h-full border-2 border-cyan-500/50`}
            onError={(e) => {
              if (e.target.src !== placeholders.small) {
                e.target.src = placeholders.small;
              }
            }}
          />
        ) : null}
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-3 h-3 rounded-full bg-gray-900 border border-gray-700"></div>
      </div>
    </div>
    <div className="min-w-0 flex-1 overflow-hidden">
      <p className="text-white font-bold text-xs sm:text-base truncate">
        {activeSong?.trackName || activeSong?.albumTitle || 'No active Song'}
      </p>
      <p className="text-gray-300 text-[10px] sm:text-sm truncate">
        {activeSong?.artistName && activeSong.artistName !== 'Unknown Artist' && activeSong?.source !== 'database'
          ? activeSong.artistName
          : isLibrarySong && activeSong?.albumTitle
            ? 'Library Song'
            : ''}
      </p>
    </div>
    {isPlaying && isActive && (
      <div className="flex gap-0.5 ml-2 shrink-0">
        <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
        <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
        <span className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
      </div>
    )}
  </div>
  );
};

export default Track;
