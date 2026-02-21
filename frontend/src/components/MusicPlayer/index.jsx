import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { nextSong, prevSong, playPause, songEnded, toggleQuantumMode } from '../../redux/features/playerSlice';
import { useRecordInteractionMutation } from '../../redux/services/apiService';
import globalAudioContext from '../../utils/globalAudioContext';
import Controls from './Controls';
import Player from './Player';
import Seekbar from './Seekbar';
import Track from './Track';
import VolumeBar from './VolumeBar';

const MusicPlayer = () => {
  const { activeSong, currentSongs, currentIndex, isActive, isPlaying, playbackRate, quantumMode } = useSelector((state) => state.player);
  const [duration, setDuration] = useState(0);
  const [seekTime, setSeekTime] = useState(0);
  const [appTime, setAppTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [volume, setVolume] = useState(0.3);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [quantumState, setQuantumState] = useState(null); // Current collapsed qubit state for UI
  const dispatch = useDispatch();
  
  // Track play interactions
  const [recordInteraction] = useRecordInteractionMutation();
  const wasPlayingRef = useRef(false); // Track previous playing state

  // Detect device type from user agent
  const getDeviceType = () => {
    const ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
    return 'desktop';
  };

  useEffect(() => {
    if (currentSongs.length) dispatch(playPause(true));
  }, [currentIndex]);

  // Record play interaction when playback STARTS (transitions from paused to playing)
  useEffect(() => {
    // Support both ProductID (from backend) and productId (from API response)
    const songProductId = activeSong?.productId || activeSong?.ProductID || activeSong?.id;
    
    // Only record when transitioning from NOT playing to playing
    const justStartedPlaying = isPlaying && !wasPlayingRef.current;
    
    // Update the ref for next render
    wasPlayingRef.current = isPlaying;
    
    // Record if we just started playing and have a valid song
    if (justStartedPlaying && activeSong && songProductId) {
      // Fire and forget - don't wait for response or let errors affect playback
      // Calculate completion percentage from current playback position
      const completionPct = duration > 0 ? parseFloat((appTime / duration).toFixed(4)) : 0.0;

      try {
        recordInteraction({
          account_id: 1,
          product_id: songProductId,
          interaction_type: 'play',
          duration_seconds: Math.floor(duration),
          completion_percentage: completionPct,
          device_type: getDeviceType(),
          session_id: sessionStorage.getItem('sessionId') || `session-${Date.now()}`
        });
      } catch {
        // Silently ignore interaction recording errors
      }
    }
  }, [isPlaying, activeSong?.productId, activeSong?.ProductID, activeSong?.id, recordInteraction, duration]);

  // Sync quantum mode state with globalAudioContext and register onset handler
  useEffect(() => {
    globalAudioContext.setQuantumMode(quantumMode);

    if (!quantumMode) {
      setQuantumState(null);
      return;
    }

    // When quantum mode is ON, apply quantum panning on every transient hit
    const handleQuantumOnset = (onset) => {
      globalAudioContext.applyQuantumState(onset);
    };

    globalAudioContext.onOnset(handleQuantumOnset);

    // Listen for quantum state changes to update UI
    const handleQuantumStateChange = (state) => {
      setQuantumState(state);
    };
    globalAudioContext.onQuantumState(handleQuantumStateChange);

    return () => {
      globalAudioContext.offOnset(handleQuantumOnset);
      globalAudioContext.offQuantumState(handleQuantumStateChange);
    };
  }, [quantumMode]);

  const handleQuantumToggle = useCallback(() => {
    dispatch(toggleQuantumMode());
  }, [dispatch]);

  const handlePlayPause = () => {
    if (!isActive) return;

    if (isPlaying) {
      dispatch(playPause(false));
    } else {
      dispatch(playPause(true));
    }
  };

  const handleNextSong = () => {
    dispatch(playPause(false));
    dispatch(songEnded()); // Notify that song ended

    if (!shuffle) {
      dispatch(nextSong((currentIndex + 1) % currentSongs.length));
    } else {
      dispatch(nextSong(Math.floor(Math.random() * currentSongs.length)));
    }
  };

  const handlePrevSong = () => {
    if (currentIndex === 0) {
      dispatch(prevSong(currentSongs.length - 1));
    } else if (shuffle) {
      dispatch(prevSong(Math.floor(Math.random() * currentSongs.length)));
    } else {
      dispatch(prevSong(currentIndex - 1));
    }
  };

  return (
    <div className="relative px-2 sm:px-4 md:px-8 w-full flex items-center justify-between gap-2 sm:gap-4">
      <Track isPlaying={isPlaying} isActive={isActive} activeSong={activeSong} />
      <div className="flex-1 flex flex-col items-center justify-center min-w-0">
        <Controls
          isPlaying={isPlaying}
          isActive={isActive}
          repeat={repeat}
          setRepeat={setRepeat}
          shuffle={shuffle}
          setShuffle={setShuffle}
          currentSongs={currentSongs}
          handlePlayPause={handlePlayPause}
          handlePrevSong={handlePrevSong}
          handleNextSong={handleNextSong}
          quantumMode={quantumMode}
          handleQuantumToggle={handleQuantumToggle}
          quantumState={quantumState}
        />
        <Seekbar
          value={appTime}
          min="0"
          max={duration}
          onInput={(event) => {
            setAppTime(parseFloat(event.target.value));
            setSeekTime(parseFloat(event.target.value));
          }}
          setSeekTime={setSeekTime}
          appTime={appTime}
          onSeekStart={() => setIsSeeking(true)}
          onSeekEnd={() => setIsSeeking(false)}
        />
        <Player
          activeSong={activeSong}
          volume={volume}
          isPlaying={isPlaying}
          seekTime={seekTime}
          repeat={repeat}
          playbackRate={playbackRate}
          currentIndex={currentIndex}
          onEnded={handleNextSong}
          onTimeUpdate={(event) => {
            if (!isSeeking) {
              setAppTime(event.target.currentTime);
            }
          }}
          onLoadedData={(event) => setDuration(event.target.duration)}
        />
      </div>
      <VolumeBar value={volume} min="0" max="1" onChange={(event) => setVolume(event.target.value)} setVolume={setVolume} />
    </div>
  );
};

export default MusicPlayer;
