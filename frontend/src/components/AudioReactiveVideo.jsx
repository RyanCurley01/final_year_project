/**
 * Audio-Reactive Video Component
 * Combines sky segmentation with onset detection for reactive visuals
 */

import { useRef, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import SkySegmentation from '../utils/skySegmentation';
import globalAudioContext from '../utils/globalAudioContext';
import { useVideoModal } from '../context/VideoModalContext';
import { GLITCH_DURATION_MS, glitchStyle } from '../utils/glitchEffects';

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

const DEFAULT_SKY_COLOR = [135, 206, 235]; // Sky blue - default color

const AudioReactiveVideo = ({ 
  src, 
  alt, 
  className, 
  isPlaying, 
  isActive,
  onError,
  ...props 
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [skySegmentation] = useState(() => new SkySegmentation());
  const currentSkyColorRef = useRef(DEFAULT_SKY_COLOR); // Ref for animation loop
  const animationFrameRef = useRef(null);
  const isActiveRef = useRef(isActive);
  const isPlayingRef = useRef(isPlaying);
  const glitchTimeoutRef = useRef(null);
  const [isGlitching, setIsGlitching] = useState(false);
  const isGlitchingRef = useRef(false); // Ref for processFrame to read
  const { volume, activeSong } = useSelector((state) => state.player);
  
  // Use shared color from VideoModalContext - all active videos share the same color
  const { currentSkyColor, setCurrentSkyColor } = useVideoModal();
  
  // Reset color to default when song changes
  useEffect(() => {
    currentSkyColorRef.current = DEFAULT_SKY_COLOR;
    setCurrentSkyColor(DEFAULT_SKY_COLOR);
  }, [activeSong?.id, activeSong?.albumTitle, setCurrentSkyColor]);
  
  // Keep refs in sync with props (avoids stale closure issues)
  useEffect(() => {
    isActiveRef.current = isActive;
    isPlayingRef.current = isPlaying;
  }, [isActive, isPlaying]);
  
  // Listen for drum hits from global audio context (ONLY when this video is active)
  useEffect(() => {
    // Only register callback if this video is the currently playing one
    if (!isActive || !isPlaying) {
      return;
    }
    
    const handleOnset = (onset) => {
      // Get a random color that's DIFFERENT from the current one
      let randomColor;
      let attempts = 0;
      do {
        randomColor = SKY_COLORS[Math.floor(Math.random() * SKY_COLORS.length)];
        attempts++;
        // Compare RGB arrays - if same, pick again (max 10 attempts to avoid infinite loop)
      } while (
        attempts < 10 &&
        currentSkyColorRef.current[0] === randomColor[0] &&
        currentSkyColorRef.current[1] === randomColor[1] &&
        currentSkyColorRef.current[2] === randomColor[2]
      );
      
      // Update ref directly for immediate use in animation loop
      currentSkyColorRef.current = randomColor;
      // Also update shared context so other components can react
      setCurrentSkyColor(randomColor);
    };
    
    // Register callback with global audio context
    globalAudioContext.onOnset(handleOnset);
    
    // Cleanup: unregister when component unmounts or becomes inactive
    return () => {
      globalAudioContext.offOnset(handleOnset);
    };
  }, [isActive, isPlaying, setCurrentSkyColor]);
  
  // Listen for glitch sounds (high-frequency transients) to trigger glitch visual effect
  useEffect(() => {
    // Only register callback if this video is the currently playing one
    if (!isActive || !isPlaying) {
      return;
    }
    
    const handleGlitch = (glitch) => {
      // Trigger glitch visual effect
      setIsGlitching(true);
      isGlitchingRef.current = true; // Update ref for processFrame
      if (glitchTimeoutRef.current) {
        clearTimeout(glitchTimeoutRef.current);
      }
      glitchTimeoutRef.current = setTimeout(() => {
        setIsGlitching(false);
        isGlitchingRef.current = false;
      }, GLITCH_DURATION_MS);
    };
    
    // Register callback with global audio context
    globalAudioContext.onGlitch(handleGlitch);
    
    // Cleanup: unregister when component unmounts or becomes inactive
    return () => {
      globalAudioContext.offGlitch(handleGlitch);
    };
  }, [isActive, isPlaying]);
  
  // Sync shared color to ref for inactive videos (so they can show the active video's color)
  // Reset to default when video becomes inactive
  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive) {
      // Active video's color is already set via handleOnset
      currentSkyColorRef.current = currentSkyColor;
      wasActiveRef.current = true;
    } else if (wasActiveRef.current) {
      // Only re-render once when transitioning from active to inactive
      wasActiveRef.current = false;
      currentSkyColorRef.current = DEFAULT_SKY_COLOR;
      // Re-render the frame with default color when becoming inactive
      if (videoRef.current && canvasRef.current && videoRef.current.readyState >= 2) {
        skySegmentation.processFrame(
          videoRef.current,
          canvasRef.current,
          DEFAULT_SKY_COLOR
        );
      }
    }
  }, [currentSkyColor, isActive, skySegmentation]);
  
  // Render initial frame when video loads (so we see a preview even when not playing)
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const renderInitialFrame = async () => {
      // Wait for video to have loaded enough data
      if (videoRef.current && canvasRef.current && videoRef.current.readyState >= 2) {
        await skySegmentation.processFrame(
          videoRef.current,
          canvasRef.current,
          currentSkyColorRef.current
        );
      }
    };
    
    const handleCanPlay = () => {
      renderInitialFrame();
    };
    
    if (videoRef.current.readyState >= 2) {
      renderInitialFrame();
    } else {
      videoRef.current.addEventListener('canplay', handleCanPlay, { once: true });
    }
    
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('canplay', handleCanPlay);
      }
    };
  }, [src, skySegmentation]);
  
  // Process video frames with sky segmentation - runs independently at 60fps
  useEffect(() => {
    let lastFrameTime = 0;
    let lastVideoTime = -1;
    const targetFrameRate = 60; // Target 60fps for smooth playback
    const frameInterval = 1000 / targetFrameRate;
    let isProcessing = false;
    
    const processFrames = async (timestamp) => {
      if (!videoRef.current || !canvasRef.current) {
        animationFrameRef.current = requestAnimationFrame(processFrames);
        return;
      }
      
      // Use refs to check state (avoids stale closure)
      if (!isPlayingRef.current || !isActiveRef.current) {
        animationFrameRef.current = requestAnimationFrame(processFrames);
        return;
      }
      
      // Throttle to target frame rate
      if (timestamp - lastFrameTime < frameInterval) {
        animationFrameRef.current = requestAnimationFrame(processFrames);
        return;
      }
      
      // Skip if already processing a frame
      if (isProcessing) {
        animationFrameRef.current = requestAnimationFrame(processFrames);
        return;
      }
      
      // Only update if video time has changed (video is actually playing)
      const currentVideoTime = videoRef.current.currentTime;
      if (currentVideoTime !== lastVideoTime) {
        isProcessing = true;
        await skySegmentation.processFrame(
          videoRef.current,
          canvasRef.current,
          currentSkyColorRef.current,
          isGlitchingRef.current // Pass glitch state to apply distortion only to sky
        );
        isProcessing = false;
        lastVideoTime = currentVideoTime;
      }
      
      lastFrameTime = timestamp;
      animationFrameRef.current = requestAnimationFrame(processFrames);
    };
    
    // Always start the animation loop when mounted - it checks isPlaying/isActive internally
    if (isPlaying && isActive) {
      animationFrameRef.current = requestAnimationFrame(processFrames);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, isActive, skySegmentation]);
  
  // Sync volume
  useEffect(() => {
    if (videoRef.current && volume !== undefined && volume !== null) {
      const numericVolume = parseFloat(volume);
      if (!isNaN(numericVolume) && isFinite(numericVolume)) {
        videoRef.current.volume = Math.max(0, Math.min(1, numericVolume));
      }
    }
  }, [volume]);
  
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
    
    const video = videoRef.current;
    video.muted = true;
    
    if (isPlaying && isActive) {
      // Simple play - don't await, just fire and forget
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, isActive, src]);
  
  return (
    <div className="relative" style={{ width: '100%', height: '100%' }}>
      {/* Hidden muted video element for visual animation only */}
      <video
        ref={videoRef}
        src={src}
        crossOrigin="anonymous"
        muted
        playsInline
        preload="auto"
        loop
        style={{ display: 'none' }}
        onError={onError}
      />
      
      {/* Canvas for processed video with sky color changes */}
      <canvas
        ref={canvasRef}
        className={className}
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover',
          borderRadius: 'inherit',
          // Randomly-selected glitch effect (CSS filter, blur, or pixelated distortion)
          ...glitchStyle(isGlitching)
        }}
      />
    </div>
  );
};

export default AudioReactiveVideo;