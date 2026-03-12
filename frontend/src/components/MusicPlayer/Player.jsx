/* eslint-disable jsx-a11y/media-has-caption */
import React, { useRef, useEffect } from 'react';
import globalAudioContext from '../../utils/globalAudioContext';

const Player = ({ activeSong, isPlaying, volume, seekTime, onEnded, onTimeUpdate, onLoadedData, repeat, playbackRate = 1 }) => {
  const ref = useRef(null);
  
  // Apply playback rate to audio element AND onset detector
  useEffect(() => {
    if (ref.current) {
      // Preserve pitch when changing speed — time-stretch without altering tonality
      ref.current.preservesPitch = true;
      ref.current.webkitPreservesPitch = true; // Safari fallback
      ref.current.playbackRate = playbackRate;
    }
    // Sync playback rate with onset detector so detection timing matches audio speed
    globalAudioContext.setPlaybackRate(playbackRate);
  }, [playbackRate]);
  
  useEffect(() => {
    if (ref.current) {
      if (isPlaying) {
        const playPromise = ref.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              // Initialize or re-initialize audio context.
              // globalAudioContext.initialize() is idempotent for the same element
              // and handles switching to a new element while preserving callbacks.
              globalAudioContext.initialize(ref.current).catch(() => {
                // Could not initialize onset detection
              });
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