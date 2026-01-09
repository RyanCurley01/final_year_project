/* eslint-disable jsx-a11y/media-has-caption */
import React, { useRef, useEffect } from 'react';
import globalAudioContext from '../../utils/globalAudioContext';

const Player = ({ activeSong, isPlaying, volume, seekTime, onEnded, onTimeUpdate, onLoadedData, repeat }) => {
  const ref = useRef(null);
  const audioContextInitialized = useRef(false);
  
  useEffect(() => {
    if (ref.current) {
      console.log('Player state:', { isPlaying, activeSong: activeSong?.albumTitle, fileUrl: activeSong?.fileUrl });
      
      if (isPlaying && activeSong?.fileUrl) {
        const playPromise = ref.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('Audio playing successfully');
              
              // Initialize audio context ONLY on very first play ever
              if (!audioContextInitialized.current) {
                console.log('🎤 Initializing audio context for the first time');
                globalAudioContext.initialize(ref.current).catch(err => {
                  console.warn('Could not initialize onset detection:', err);
                });
                audioContextInitialized.current = true;
              } else {
                console.log('🔊 Resuming existing audio context');
                globalAudioContext.resume();
              }
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

  // IMPORTANT: Always render the audio element to keep it persistent
  // This prevents the element from being destroyed/recreated which breaks
  // the Web Audio API connection (createMediaElementSource can only be called once)
  return (
    <audio
      src={activeSong?.fileUrl || ''}
      ref={ref}
      crossOrigin="anonymous"
      loop={repeat}
      onEnded={onEnded}
      onTimeUpdate={onTimeUpdate}
      onLoadedData={(e) => {
        console.log('Audio loaded, duration:', e.target.duration);
        onLoadedData(e);
      }}
      onError={(e) => {
        // Only log real errors, not empty src errors
        if (activeSong?.fileUrl) {
          console.error('Audio loading error:', e.target.error);
        }
      }}
    />
  );
};

export default Player;
