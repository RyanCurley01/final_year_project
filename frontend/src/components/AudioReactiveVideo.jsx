/**
 * Audio-Reactive Video Component
 * Combines onset detection with sky segmentation for reactive visuals
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import OnsetDetector from '../utils/onsetDetection';
import SkySegmentation from '../utils/skySegmentation';

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
  onError,
  ...props 
}) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [skySegmentation] = useState(() => new SkySegmentation());
  const [onsetDetector, setOnsetDetector] = useState(null);
  const [audioContext, setAudioContext] = useState(null);
  const [currentSkyColor, setCurrentSkyColor] = useState([135, 206, 235]); // Default sky blue
  const animationFrameRef = useRef(null);
  const audioInitializedRef = useRef(false); // Track if audio is already initialized
  const audioContextRef = useRef(null);
  const onsetDetectorRef = useRef(null);
  const { volume } = useSelector((state) => state.player);
  
  // Initialize audio context and onset detector
  useEffect(() => {
    // Only initialize if active and playing
    if (!isActive || !isPlaying) return;
    if (!videoRef.current || audioInitializedRef.current) return;
    
    const initAudio = async () => {
      // Double-check to prevent race conditions
      if (audioInitializedRef.current || !videoRef.current) return;
      
      try {
        // Mark as initialized immediately to prevent duplicate calls
        audioInitializedRef.current = true;
        
        // Create audio context
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = ctx;
        
        // Create media element source (can only be created once per element)
        // Note: createMediaElementSource can throw if the element is already connected to another context
        // or if CORS restrictions prevent it
        let source;
        try {
           source = ctx.createMediaElementSource(videoRef.current);
        } catch (e) {
           console.warn("⚠️ Could not create MediaElementSource (CORS or already connected):", e.message);
           // Clean up and reset flag so video can still play
           ctx.close();
           audioContextRef.current = null;
           audioInitializedRef.current = false;
           return;
        }
        
        // Create onset detector
        const detector = new OnsetDetector(ctx, {
          threshold: 0.25,
          fftSize: 2048,
        });
        onsetDetectorRef.current = detector;
        
        // Connect audio graph: source -> detector -> destination
        source.connect(detector.analyser);
        detector.analyser.connect(ctx.destination);
        
        // Listen for onsets (drum hits)
        detector.onOnset((onset) => {
          // Change sky color on drum hit
          const randomColor = SKY_COLORS[Math.floor(Math.random() * SKY_COLORS.length)];
          console.log('🎵 Drum hit detected! Changing sky color to:', randomColor);
          setCurrentSkyColor(randomColor);
        });
        
        detector.start();
        setOnsetDetector(detector);
        setAudioContext(ctx);
        
        console.log('✅ Audio-reactive system initialized');
      } catch (error) {
        console.error('Failed to initialize audio system:', error);
        // Reset flag on error so it can be retried
        audioInitializedRef.current = false;
      }
    };
    
    // Initialize when video is ready
    const handleLoadedMetadata = () => {
      initAudio();
    };
    
    // Check if already loaded
    if (videoRef.current.readyState >= 1) {
      initAudio();
    } else {
      videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
    }
    
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
      }
      
      // Only cleanup when source changes, not when play state changes
      // This prevents tearing down and recreating the AudioContext unnecessarily
    };
  }, [src, isActive, isPlaying]);
  
  // Separate cleanup effect for component unmount
  useEffect(() => {
    return () => {
      // Cleanup AudioContext and Detector on unmount
      if (onsetDetectorRef.current) {
        onsetDetectorRef.current.stop();
        onsetDetectorRef.current = null;
      }
      
      if (audioContextRef.current) {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
        audioContextRef.current = null;
      }
      
      audioInitializedRef.current = false;
    };
  }, []);
  
  // Render initial frame when video loads (so we see a preview even when not playing)
  useEffect(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const renderInitialFrame = async () => {
      // Wait for video to have loaded enough data
      if (videoRef.current.readyState >= 2) {
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
  }, [src, skySegmentation, currentSkyColor]);
  
  // Process video frames with sky segmentation
  useEffect(() => {
    const processFrames = async () => {
      if (!videoRef.current || !canvasRef.current) return;
      if (!isPlaying || !isActive) return;
      
      await skySegmentation.processFrame(
        videoRef.current,
        canvasRef.current,
        currentSkyColor
      );
      
      animationFrameRef.current = requestAnimationFrame(processFrames);
    };
    
    if (isPlaying && isActive) {
      processFrames();
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, isActive, currentSkyColor, skySegmentation]);
  
  // Sync volume
  useEffect(() => {
    if (videoRef.current && volume !== undefined && volume !== null) {
      const numericVolume = parseFloat(volume);
      if (!isNaN(numericVolume) && isFinite(numericVolume)) {
        videoRef.current.volume = Math.max(0, Math.min(1, numericVolume));
      }
    }
  }, [volume]);
  
  // Resume audio context on user interaction
  useEffect(() => {
    const resumeAudio = () => {
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
      }
    };
    
    document.addEventListener('click', resumeAudio);
    return () => document.removeEventListener('click', resumeAudio);
  }, [audioContext]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (onsetDetector) {
        onsetDetector.disconnect();
      }
      if (audioContext) {
        audioContext.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
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
          borderRadius: 'inherit'
        }}
      />
    </div>
  );
};

export default AudioReactiveVideo;
