/* eslint-disable jsx-a11y/media-has-caption */
import React, { useRef, useEffect } from 'react';
import globalAudioContext from '../../utils/globalAudioContext';

const Player = ({ activeSong, isPlaying, volume, seekTime, onEnded, onTimeUpdate, onLoadedData, repeat }) => {
  const ref = useRef(null);
  const audioContextInitialized = useRef(false);
  const lastSongRef = useRef(null);
  
  useEffect(() => {
    if (ref.current) {
      // Check if song changed - reset detector state
      const currentSongId = activeSong?.id || activeSong?.albumTitle;
      if (currentSongId && currentSongId !== lastSongRef.current) {
        lastSongRef.current = currentSongId;
        // Reset onset detector state for the new song
        globalAudioContext.resetDetector();
      }
      
      if (isPlaying && activeSong?.fileUrl) {
        const playPromise = ref.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              if (!audioContextInitialized.current) {
                globalAudioContext.initialize(ref.current).catch(() => {});
                audioContextInitialized.current = true;
              }
              // Always resume after play succeeds to ensure onset detection is running
              globalAudioContext.resume();
            })
            .catch(() => {});
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
      onLoadedData={onLoadedData}
      onError={() => {}}
    />
  );
};

export default Player;
