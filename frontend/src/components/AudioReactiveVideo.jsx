/**
 * Audio-Reactive Video Component
 * Combines sky segmentation with onset detection for reactive visuals
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import SkySegmentation from '../utils/skySegmentation';
import globalAudioContext from '../utils/globalAudioContext';
import { useVideoModal } from '../context/VideoModalContext';

// Vibrant color palette for sky changes (defined outside to avoid re-creation)
const SKY_COLORS = [
  [135, 206, 235], // Sky blue
  [255, 105, 180], // Hot pink
  [138, 43, 226],  // Blue violet
  [255, 215, 0],   // Gold
  [0, 255, 255],   // Cyan
  [255, 99, 71],   // Tomato red
  [50, 205, 50],   // Lime green
  [255, 140, 0],   // Dark orange
  [147, 112, 219], // Medium purple
  [64, 224, 208]   // Turquoise
];

const AudioReactiveVideo = ({ 
  src, 
  alt, 
  className, 
  isPlaying, 
  isActive,
  playbackRate = 1.0,
  onError,
  ...props 
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [skySegmentation] = useState(() => new SkySegmentation());
  const [localSkyColor, setLocalSkyColor] = useState([135, 206, 235]); // Local color for inactive videos
  const currentSkyColorRef = useRef([135, 206, 235]); // Ref for animation loop
  const animationFrameRef = useRef(null);
  const isPlayingRef = useRef(isPlaying); // Track current playing state
  const isActiveRef = useRef(isActive); // Track current active state
  const { volume } = useSelector((state) => state.player);
  const { currentSkyColor: globalSkyColor, setCurrentSkyColor: setGlobalSkyColor } = useVideoModal();
  
  // Glitch effect state
  const [isGlitching, setIsGlitching] = useState(false);
  const [glitchType, setGlitchType] = useState(null);
  const glitchTimeoutRef = useRef(null);
  
  // Video load error state - fallback to showing video directly
  const [videoLoadError, setVideoLoadError] = useState(false);
  
  // Video ready state
  const [videoReady, setVideoReady] = useState(false);
  
  // Callback ID refs for proper cleanup
  const onsetCallbackIdRef = useRef(null);
  const glitchCallbackIdRef = useRef(null);
  
  // Keep refs in sync with props
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    isActiveRef.current = isActive;
  }, [isPlaying, isActive]);
  
  // Use the presigned URL directly from backend - DO NOT strip AWS signature parameters
  // The backend generates presigned URLs with proper authentication
  const cleanVideoUrl = useMemo(() => {
    return src;
  }, [src]);
  
  // Check if this is the cloud animation background video (doesn't need CORS for sky segmentation)
  const isCloudAnimation = useMemo(() => {
    return src?.toLowerCase().includes('cloud-animation');
  }, [src]);
  
  // Determine which color to use: global if active (regardless of playing state), local if not
  const currentSkyColor = isActive ? globalSkyColor : localSkyColor;
  
  // Update ref when color changes
  useEffect(() => {
    currentSkyColorRef.current = currentSkyColor;
  }, [currentSkyColor]);
  
  // Reset colors when active state changes
  useEffect(() => {
    if (isActive) {
      // Reset global color to default when this video becomes active (new song)
      setGlobalSkyColor([135, 206, 235]);
    } else {
      // Reset local color when becoming inactive
      setLocalSkyColor([135, 206, 235]);
    }
  }, [isActive, setGlobalSkyColor]);
  
  // Listen for drum hits from global audio context (ONLY when this video is active)
  // Register callback whenever active - the callback itself checks if playing
  // This avoids race conditions when isActive and isPlaying update separately
  useEffect(() => {
    // Always cleanup previous callback first
    if (onsetCallbackIdRef.current !== null) {
      globalAudioContext.offOnset(onsetCallbackIdRef.current);
      onsetCallbackIdRef.current = null;
    }
    
    // Register callback when active - it will be called on drum hits
    if (isActive) {
      const handleOnset = () => {
        // Use ref to check current playing state
        if (!isPlayingRef.current || !isActiveRef.current) return;
        const randomColor = SKY_COLORS[Math.floor(Math.random() * SKY_COLORS.length)];
        setGlobalSkyColor(randomColor);
      };
      
      onsetCallbackIdRef.current = globalAudioContext.onOnset(handleOnset);
    }
    
    return () => {
      if (onsetCallbackIdRef.current !== null) {
        globalAudioContext.offOnset(onsetCallbackIdRef.current);
        onsetCallbackIdRef.current = null;
      }
    };
  }, [isActive, setGlobalSkyColor]);
  
  // Listen for glitch sounds (register when active, not dependent on isPlaying)
  useEffect(() => {
    if (glitchCallbackIdRef.current !== null) {
      globalAudioContext.offGlitch(glitchCallbackIdRef.current);
      glitchCallbackIdRef.current = null;
    }
    
    if (isActive) {
      const handleGlitch = () => {
        // Use ref to check current playing state
        if (!isPlayingRef.current || !isActiveRef.current) return;
        const chosenEffect = Math.random() < 0.25 ? 'flip' : 'stutter';
        setGlitchType(chosenEffect);
        setIsGlitching(true);
        
        if (glitchTimeoutRef.current) {
          clearTimeout(glitchTimeoutRef.current);
        }
        
        glitchTimeoutRef.current = setTimeout(() => {
          setIsGlitching(false);
          setGlitchType(null);
        }, 150);
      };
      
      glitchCallbackIdRef.current = globalAudioContext.onGlitch(handleGlitch);
    }
    
    return () => {
      if (glitchCallbackIdRef.current !== null) {
        globalAudioContext.offGlitch(glitchCallbackIdRef.current);
        glitchCallbackIdRef.current = null;
      }
    };
  }, [isActive]);
  
  // Render initial frame when video loads (so we see a preview even when not playing)
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const renderInitialFrame = async () => {
      // Wait for video to have loaded enough data
      if (videoRef.current && videoRef.current.readyState >= 2) {
        setVideoReady(true);
        await skySegmentation.processFrame(
          videoRef.current,
          canvasRef.current,
          currentSkyColor
        );
      }
    };
    
    const handleCanPlay = () => {
      setVideoReady(true);
      renderInitialFrame();
    };
    
    const handleLoadedData = () => {
      setVideoReady(true);
    };
    
    if (videoRef.current && videoRef.current.readyState >= 2) {
      setVideoReady(true);
      renderInitialFrame();
    } else if (videoRef.current) {
      videoRef.current.addEventListener('canplay', handleCanPlay, { once: true });
      videoRef.current.addEventListener('loadeddata', handleLoadedData, { once: true });
    }
    
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('canplay', handleCanPlay);
        videoRef.current.removeEventListener('loadeddata', handleLoadedData);
      }
    };
  }, [src, skySegmentation, currentSkyColor]);
  
  // Process video frames with sky segmentation (throttled to ~30fps)
  useEffect(() => {
    let lastFrameTime = 0;
    let lastVideoTime = -1;
    const targetFrameRate = 30; // Target 30fps for better performance
    const frameInterval = 1000 / targetFrameRate;
    let loopRunning = true;
    
    const processFrames = async (timestamp) => {
      // Check if loop should stop
      if (!loopRunning) return;
      
      // If refs are not available, try again next frame
      if (!videoRef.current || !canvasRef.current) {
        animationFrameRef.current = requestAnimationFrame(processFrames);
        return;
      }
      
      // Use refs for current state (not stale closure values)
      if (!isPlayingRef.current || !isActiveRef.current) {
        // Keep loop alive but don't process - check again next frame
        animationFrameRef.current = requestAnimationFrame(processFrames);
        return;
      }
      
      // Wait for video to be ready (readyState >= 2 means HAVE_CURRENT_DATA)
      if (videoRef.current.readyState < 2) {
        animationFrameRef.current = requestAnimationFrame(processFrames);
        return;
      }
      
      // Throttle to target frame rate
      if (timestamp - lastFrameTime < frameInterval) {
        animationFrameRef.current = requestAnimationFrame(processFrames);
        return;
      }
      
      // Only update if video time has changed (video is actually playing)
      const currentVideoTime = videoRef.current.currentTime;
      if (currentVideoTime !== lastVideoTime) {
        await skySegmentation.processFrame(
          videoRef.current,
          canvasRef.current,
          currentSkyColorRef.current
        );
        
        // Apply glitch effect if active - EITHER flip video OR stutter clouds (not both)
        if (isGlitching && canvasRef.current && videoRef.current && glitchType) {
          const ctx = canvasRef.current.getContext('2d');
          const width = canvasRef.current.width;
          const height = canvasRef.current.height;
          
          if (glitchType === 'flip') {
            // FLIP EFFECT: Mirror the video horizontally
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Copy current canvas to temp
            tempCtx.drawImage(canvasRef.current, 0, 0);
            
            // Clear main canvas and draw flipped
            ctx.clearRect(0, 0, width, height);
            ctx.save();
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.restore();
            // Video flips back to normal automatically when isGlitching becomes false
          } else if (glitchType === 'stutter') {
            // STUTTER EFFECT: Rapid cloud movement repeat
            const currentTime = videoRef.current.currentTime;
            videoRef.current.currentTime = Math.max(0, currentTime - 0.08);
            videoRef.current.playbackRate = 15.0; // Very fast playback for stutter effect
          }
        } else if (videoRef.current && playbackRate) {
          // Restore normal playback rate when not glitching
          const rate = parseFloat(playbackRate);
          if (!isNaN(rate) && isFinite(rate) && rate > 0) {
            videoRef.current.playbackRate = Math.max(0.1, Math.min(2.0, rate));
          }
        }
        
        lastVideoTime = currentVideoTime;
      }
      
      lastFrameTime = timestamp;
      animationFrameRef.current = requestAnimationFrame(processFrames);
    };
    
    // Always start the loop - it will check refs for active state
    animationFrameRef.current = requestAnimationFrame(processFrames);
    
    return () => {
      loopRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [skySegmentation, isGlitching, glitchType, playbackRate]);
  
  // Sync volume
  useEffect(() => {
    if (videoRef.current && volume !== undefined && volume !== null) {
      const numericVolume = parseFloat(volume);
      if (!isNaN(numericVolume) && isFinite(numericVolume)) {
        videoRef.current.volume = Math.max(0, Math.min(1, numericVolume));
      }
    }
  }, [volume]);
  
  // Sync playback rate
  useEffect(() => {
    if (videoRef.current && playbackRate !== undefined && playbackRate !== null) {
      const rate = parseFloat(playbackRate);
      if (!isNaN(rate) && isFinite(rate) && rate > 0) {
        videoRef.current.playbackRate = Math.max(0.1, Math.min(2.0, rate));
        // Also notify global audio context to sync audio playback rate
        if (isActive) {
          globalAudioContext.setPlaybackRate(rate);
        }
      }
    }
  }, [playbackRate, isActive]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (glitchTimeoutRef.current) {
        clearTimeout(glitchTimeoutRef.current);
      }
      skySegmentation.dispose();
    };
  }, []);
  
  // Handle play/pause - muted video for visual animation only
  // The actual audio plays through the main Player component
  useEffect(() => {
    if (!videoRef.current) return;
    
    videoRef.current.muted = true;
    
    if (isPlaying && isActive) {
      // Ensure video is loaded before playing
      if (videoRef.current.readyState < 2) {
        videoRef.current.load();
      }
      const playPromise = videoRef.current.play();
      if (playPromise) {
        playPromise.catch(() => {
          // Retry play after a short delay
          setTimeout(() => {
            if (videoRef.current && isPlayingRef.current && isActiveRef.current) {
              videoRef.current.play().catch(() => {});
            }
          }, 100);
        });
      }
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, isActive, src]);
  
  // Handle video load error
  const handleVideoError = (e) => {
    console.warn('Video load error, falling back to direct display:', cleanVideoUrl);
    setVideoLoadError(true);
    if (onError) onError(e);
  };
  
  // If video failed to load with CORS, show it directly without processing
  if (videoLoadError) {
    return (
      <video
        src={cleanVideoUrl}
        className={className}
        muted
        playsInline
        autoPlay={isPlaying && isActive}
        loop
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover',
          borderRadius: 'inherit'
        }}
      />
    );
  }
  
  return (
    <div className="relative rounded-lg overflow-hidden" style={{ width: '100%', height: '100%' }}>
      {/* Hidden muted video element for visual animation only */}
      {/* Note: crossOrigin="anonymous" is REQUIRED for canvas pixel access (sky segmentation)
          S3 bucket has CORS configured to allow all origins */}
      <video
        ref={videoRef}
        src={cleanVideoUrl}
        crossOrigin="anonymous"
        muted
        playsInline
        preload="auto"
        loop
        style={{ 
          display: 'block', 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover',
          opacity: videoReady ? 0 : 1,
          position: videoReady ? 'absolute' : 'relative',
          zIndex: 0
        }}
        onError={handleVideoError}
        {...props}
      />
      
      {/* Canvas for processed video with sky color changes */}
      <canvas
        ref={canvasRef}
        className={className}
        style={{ 
          display: 'block',
          width: '100%', 
          height: '100%', 
          objectFit: 'cover',
          borderRadius: 'inherit',
          pointerEvents: 'none',
          opacity: videoReady ? 1 : 0,
          position: 'relative',
          zIndex: 1
        }}
      />
    </div>
  );
};

export default AudioReactiveVideo;
