/* eslint-disable jsx-a11y/media-has-caption */
import React, { useRef, useEffect } from 'react';

const Player = ({ activeSong, isPlaying, volume, seekTime, onEnded, onTimeUpdate, onLoadedData, repeat }) => {
  const ref = useRef(null);
  
  useEffect(() => {
    if (ref.current) {
      console.log('Player state:', { isPlaying, activeSong: activeSong?.albumTitle, fileUrl: activeSong?.fileUrl });
      
      if (isPlaying) {
        const playPromise = ref.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('Audio playing successfully');
            })
            .catch(error => {
              console.error('Error playing audio:', error);
            });
        }
      } else {
        ref.current.pause();
      }
    }
  }, [isPlaying, activeSong]);

  useEffect(() => {
    if (ref.current) {
      ref.current.volume = volume;
    }
  }, [volume]);
  
  useEffect(() => {
    if (ref.current && seekTime !== undefined && !isNaN(seekTime)) {
      ref.current.currentTime = seekTime;
    }
  }, [seekTime]);

  if (!activeSong?.fileUrl) {
    console.log('No fileUrl available');
    return null;
  }

  return (
    <audio
      src={activeSong.fileUrl}
      ref={ref}
      loop={repeat}
      onEnded={onEnded}
      onTimeUpdate={onTimeUpdate}
      onLoadedData={(e) => {
        console.log('Audio loaded, duration:', e.target.duration);
        onLoadedData(e);
      }}
      onError={(e) => {
        console.error('Audio loading error:', e.target.error);
      }}
    />
  );
};

export default Player;
