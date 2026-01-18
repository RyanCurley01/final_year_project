import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

import PlayPause from './PlayPause';

const SongBar = ({ song, i, artistId, isPlaying, activeSong, handlePauseClick, handlePlayClick }) => {
  const videoRef = useRef(null);
  const coverMedia = artistId 
    ? song?.attributes?.artwork?.url.replace('{w}', '125').replace('{h}', '125') 
    : (song?.albumCoverImageUrl || song?.images?.coverart);
  const isVideo = coverMedia && coverMedia.toLowerCase().includes('.mp4');
  const isThisSongActive = activeSong?.albumTitle === song?.albumTitle || activeSong?.title === song?.title;
  
  // Sync video playback with audio player
  useEffect(() => {
    if (videoRef.current && isVideo) {
      if (isThisSongActive && isPlaying) {
        videoRef.current.loop = true;
        videoRef.current.play().catch(() => {});
      } else if (isThisSongActive && !isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.loop = false;
        if (videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }
      }
    }
  }, [isThisSongActive, isPlaying, isVideo]);

  return (
  <div className={`w-full flex flex-row items-center hover:bg-[#4c426e] ${activeSong?.title === song?.title ? 'bg-[#4c426e]' : 'bg-transparent'} py-2 p-4 rounded-lg cursor-pointer mb-2`}>
    <h3 className="font-bold text-xs text-white mr-3">{i + 1}.</h3>
    <div className="flex-1 flex flex-row justify-between items-center">
      <div className="relative w-20 h-20">
        {isVideo ? (
          <video
            ref={videoRef}
            src={coverMedia}
            alt={song?.title}
            className="w-full h-full rounded-lg object-cover"
            muted
            playsInline
            preload="auto"

            style={{ willChange: 'transform' }}
            onEnded={() => {
              if (!isThisSongActive || !isPlaying) {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0;
                  videoRef.current.play().catch(() => {});
                }
              }
            }}
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : (
          <img
            className="w-full h-full rounded-lg object-cover"
            src={coverMedia || placeholders.small}
            alt={song?.title}
            onError={(e) => {
              if (e.target.src !== placeholders.small) {
                e.target.src = placeholders.small;
              }
            }}
          />
        )}
      </div>
      <div className="flex-1 flex flex-col justify-center mx-3">
        {!artistId ? (
          <Link to={`/songs/${song.key}`}>
            <p className="text-xs font-bold text-white">
              {song?.title}
            </p>
          </Link>
        ) : (
          <p className="text-xs font-bold text-white">
            {song?.attributes?.name}
          </p>
        )}
        <p className="text-xs text-gray-300 mt-1">
          {artistId ? song?.attributes?.albumName : song?.subtitle}
        </p>
      </div>
    </div>
    {!artistId
      ? (
        <PlayPause
          isPlaying={isPlaying}
          activeSong={activeSong}
          song={song}
          handlePause={handlePauseClick}
          handlePlay={() => handlePlayClick(song, i)}
        />
      )
      : null}
  </div>
  );
};

export default SongBar;