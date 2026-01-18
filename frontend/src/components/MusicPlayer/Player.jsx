/* eslint-disable jsx-a11y/media-has-caption */
import React, { useRef, useEffect } from 'react';
import globalAudioContext from '../../utils/globalAudioContext';

const Player = ({ activeSong, isPlaying, volume, seekTime, onEnded, onTimeUpdate, onLoadedData, repeat, playbackRate = 1 }) => {
  const ref = useRef(null);
  const audioContextInitialized = useRef(false);
  
  // Apply playback rate
  useEffect(() => {
    if (ref.current) {
      ref.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);
  
  useEffect(() => {
    if (ref.current) {
      if (isPlaying) {
        const playPromise = ref.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // Initialize audio context ONLY on very first play ever
              if (!audioContextInitialized.current) {
                globalAudioContext.initialize(ref.current).catch(() => {
                  // Could not initialize onset detection
                });
                audioContextInitialized.current = true;
              } else {
                globalAudioContext.resume();
              }
            })
            .catch(() => {
              // Error playing audio
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
    if (ref.current && seekTime !== undefined && seekTime !== null) {
      const time = parseFloat(seekTime);
      if (!isNaN(time) && isFinite(time)) {
        ref.current.currentTime = time;
      }
    }
  }, [seekTime]);

  if (!activeSong?.fileUrl) {
    return null;
  }

  return (
    <audio
      src={activeSong.fileUrl}
      ref={ref}
      crossOrigin="anonymous"
      loop={repeat}
      onEnded={onEnded}
      onTimeUpdate={onTimeUpdate}
      onLoadedData={(e) => {
        onLoadedData(e);
      }}
      onError={(e) => {
        // Audio loading error
      }}
    />
  );
};

export default Player;