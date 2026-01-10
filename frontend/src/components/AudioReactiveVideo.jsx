/**
 * Audio-Reactive Video Component
 * Combines sky segmentation with onset detection for reactive visuals
 */

import { useRef, useEffect, useState, useCallback } from 'react';
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
  const { volume } = useSelector((state) => state.player);
  const { currentSkyColor: globalSkyColor, setCurrentSkyColor: setGlobalSkyColor } = useVideoModal();
  
  // Glitch effect state
  const [isGlitching, setIsGlitching] = useState(false);
  const [glitchType, setGlitchType] = useState(null); // 'flip' or 'stutter' - randomly chosen
  const glitchTimeoutRef = useRef(null);
  
  // Determine which color to use: global if active (regardless of playing state), local if not
  const currentSkyColor = isActive ? globalSkyColor : localSkyColor;
  
  // Update ref when color changes
  useEffect(() => {
    currentSkyColorRef.current = currentSkyColor;
  }, [currentSkyColor]);
  
  // Reset to default color when video becomes inactive
  useEffect(() => {
    if (!isActive) {
      setLocalSkyColor([135, 206, 235]); // Reset to sky blue
    }
  }, [isActive]);
  
  // Listen for drum hits from global audio context (ONLY when this video is active)
  // Drums trigger sky color changes
  useEffect(() => {
    // Only register callback if this video is the currently playing one
    if (!isActive || !isPlaying) {
      return;
    }
    
    const handleOnset = (onset) => {
      const randomColor = SKY_COLORS[Math.floor(Math.random() * SKY_COLORS.length)];
      console.log('🎨 AudioReactiveVideo: Changing sky color on drum hit:', randomColor);
      // Always update global color when active
      setGlobalSkyColor(randomColor);
    };
    
    console.log('🔌 AudioReactiveVideo: Registering onset callback for ACTIVE video');
    // Register callback with global audio context
    globalAudioContext.onOnset(handleOnset);
    
    // Cleanup: unregister when component unmounts or becomes inactive
    return () => {
      console.log('🔌 AudioReactiveVideo: Unregistering onset callback');
      globalAudioContext.offOnset(handleOnset);
    };
  }, [isActive, isPlaying, setGlobalSkyColor]); // Re-register when active state changes
  
  // Listen for glitch sounds (unusual sounds that are NOT drums/melodies/bass/acid)
  // Glitch sounds trigger video flip and rapid cloud repeat
  useEffect(() => {
    if (!isActive || !isPlaying) {
      return;
    }
    
    const handleGlitch = (glitch) => {
      // Randomly choose between flip (75%) OR stutter (25%)
      const chosenEffect = Math.random() < 0.25 ? 'flip' : 'stutter';
      console.log(`⚡ AudioReactiveVideo: Glitch detected - applying ${chosenEffect} effect`);
      
      // Trigger glitch effect
      setGlitchType(chosenEffect);
      setIsGlitching(true);
      
      // Clear any existing timeout
      if (glitchTimeoutRef.current) {
        clearTimeout(glitchTimeoutRef.current);
      }
      
      // End glitch after 150ms (quick burst) - video will flip back automatically
      glitchTimeoutRef.current = setTimeout(() => {
        setIsGlitching(false);
        setGlitchType(null);
      }, 150);
    };
    
    console.log('🔌 AudioReactiveVideo: Registering glitch callback for ACTIVE video');
    globalAudioContext.onGlitch(handleGlitch);
    
    return () => {
      console.log('🔌 AudioReactiveVideo: Unregistering glitch callback');
      globalAudioContext.offGlitch(handleGlitch);
    };
  }, [isActive, isPlaying]);
  
  // Render initial frame when video loads (so we see a preview even when not playing)
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const renderInitialFrame = async () => {
      // Wait for video to have loaded enough data
      if (videoRef.current && videoRef.current.readyState >= 2) {
        await skySegmentation.processFrame(
          videoRef.current,
          canvasRef.current,
          currentSkyColor
        );
      }
    };
    
    const handleCanPlay = () => {
      renderInitialFrame();
    };
    
    if (videoRef.current && videoRef.current.readyState >= 2) {
      renderInitialFrame();
    } else if (videoRef.current) {
      videoRef.current.addEventListener('canplay', handleCanPlay, { once: true });
    }
    
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('canplay', handleCanPlay);
      }
    };
  }, [src, skySegmentation, currentSkyColor]);
  
  // Process video frames with sky segmentation (throttled to ~30fps)
  useEffect(() => {
    let lastFrameTime = 0;
    let lastVideoTime = -1;
    const targetFrameRate = 30; // Target 30fps for better performance
    const frameInterval = 1000 / targetFrameRate;
    
    const processFrames = async (timestamp) => {
      if (!videoRef.current || !canvasRef.current) return;
      if (!isPlaying || !isActive) return;
      
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
    
    if (isPlaying && isActive) {
      animationFrameRef.current = requestAnimationFrame(processFrames);
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, isActive, skySegmentation, isGlitching, glitchType, playbackRate]);
  
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
    
    // Mute the video so only the main Player's audio is heard
    videoRef.current.muted = true;
    
    if (isPlaying && isActive) {
      videoRef.current.play().catch(e => console.error('Video play error:', e));
    } else {
      videoRef.current.pause();
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
        {...props}
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
          pointerEvents: 'none'
        }}
      />
    </div>
  );
};

export default AudioReactiveVideo;
