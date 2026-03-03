/**
 * Onset Image Card Component
 * 
 * Replaces AudioReactiveVideo for non-"Teddy Emotion" songs.
 * Displays AI-generated images that swap on each onset (drum hit) detection.
 * 
 * Visual Pipeline:
 * 1. On mount/song change: Initialize image pool via MCPImageOrchestrator
 * 2. While pool loads: Show procedurally generated abstract art
 * 3. On each onset callback: Crossfade to next image from pool
 * 4. Continuous: Smooth CSS transitions between images
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import globalAudioContext from '../utils/globalAudioContext';
import imageGenerationService from '../utils/imageGenerationService';

// Transition duration for image crossfade (ms)
const CROSSFADE_MS = 250;

const OnsetImageCard = ({
  songTitle,
  songId,
  className,
  isPlaying,
  isActive,
  onError,
  ...props
}) => {
  // Two-layer crossfade refs
  const containerRef = useRef(null);
  const [currentImage, setCurrentImage] = useState(null);
  const [nextImage, setNextImage] = useState(null);
  const [showNext, setShowNext] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Refs for avoiding stale closures in callbacks
  const isActiveRef = useRef(isActive);
  const isPlayingRef = useRef(isPlaying);
  const currentImageRef = useRef(null);
  const isMountedRef = useRef(true);
  const swapTimeoutRef = useRef(null);
  const initPromiseRef = useRef(null);

  const { activeSong } = useSelector((state) => state.player);

  // Keep refs in sync
  useEffect(() => {
    isActiveRef.current = isActive;
    isPlayingRef.current = isPlaying;
  }, [isActive, isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (swapTimeoutRef.current) {
        clearTimeout(swapTimeoutRef.current);
      }
    };
  }, []);

  // Initialize image pool when song changes or component mounts
  useEffect(() => {
    if (!songTitle) return;

    const initPool = async () => {
      try {
        // Generate an immediate procedural image to show instantly
        const proceduralImage = imageGenerationService.getProceduralImage({
          energy: 0.5,
          lfc: 0.5,
          hfc: 0.5,
          spectralCentroid: Math.random(),
        });

        if (isMountedRef.current) {
          setCurrentImage(proceduralImage);
          currentImageRef.current = proceduralImage;
          setIsInitialized(true);
        }

        // Initialize the full pool (fetches from API in background)
        const context = {
          id: songId,
          title: songTitle,
          genre: 'electronic',
        };

        initPromiseRef.current = imageGenerationService.initializeSongContext(context);
        await initPromiseRef.current;

        // Once pool is loaded, show first API image
        if (isMountedRef.current) {
          const firstImage = imageGenerationService.getNextImage({});
          if (firstImage) {
            setNextImage(firstImage);
            setShowNext(true);
            // Complete the crossfade
            setTimeout(() => {
              if (isMountedRef.current) {
                setCurrentImage(firstImage);
                currentImageRef.current = firstImage;
                setShowNext(false);
              }
            }, CROSSFADE_MS);
          }
        }
      } catch (error) {
        console.warn('[OnsetImageCard] Pool initialization error:', error);
      }
    };

    initPool();
  }, [songTitle, songId]);

  // Reset when active song changes
  useEffect(() => {
    if (activeSong?.id !== songId && activeSong?.albumTitle !== songTitle) {
      // Not the active song - show a static procedural image
      const staticImage = imageGenerationService.getProceduralImage({
        energy: 0.3,
        spectralCentroid: Math.random(),
      });
      setCurrentImage(staticImage);
      currentImageRef.current = staticImage;
    }
  }, [activeSong?.id, activeSong?.albumTitle, songId, songTitle]);

  // Handle onset (drum hit) - swap to next image
  const handleOnset = useCallback((onset) => {
    if (!isMountedRef.current) return;
    if (!isActiveRef.current || !isPlayingRef.current) return;

    // Get next image from the MCP orchestrator
    const newImage = imageGenerationService.getNextImage({
      energy: onset.energy || 0.5,
      lfc: onset.lfc || 0.5,
      hfc: onset.hfc || 0.5,
      spectralCentroid: onset.spectralCentroid || 0.5,
      type: onset.type || 'unknown',
      strength: onset.strength || 0.5,
    });

    if (!newImage || newImage === currentImageRef.current) return;

    // Trigger crossfade
    setNextImage(newImage);
    setShowNext(true);

    // Clear previous swap timeout
    if (swapTimeoutRef.current) {
      clearTimeout(swapTimeoutRef.current);
    }

    // Complete the swap after crossfade
    swapTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setCurrentImage(newImage);
        currentImageRef.current = newImage;
        setShowNext(false);
      }
    }, CROSSFADE_MS);
  }, []);

  // Register/unregister onset callback
  useEffect(() => {
    if (!isActive || !isPlaying) return;

    globalAudioContext.onOnset(handleOnset);

    return () => {
      globalAudioContext.offOnset(handleOnset);
    };
  }, [isActive, isPlaying, handleOnset]);

  // Handle image load errors
  const handleImageError = useCallback((e) => {
    // Replace with procedural fallback
    const fallback = imageGenerationService.getProceduralImage({
      energy: Math.random(),
      spectralCentroid: Math.random(),
    });
    if (e.target) {
      e.target.src = fallback;
    }
    setImageError(true);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className || ''}`}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Current image layer */}
      {currentImage && (
        <img
          src={currentImage}
          alt={songTitle || 'AI Generated Art'}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: showNext ? 0 : 1,
            transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
            borderRadius: 'inherit',
          }}
          onError={handleImageError}
          crossOrigin="anonymous"
        />
      )}

      {/* Next image layer (crossfade target) */}
      {nextImage && (
        <img
          src={nextImage}
          alt={songTitle || 'AI Generated Art'}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: showNext ? 1 : 0,
            transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
            borderRadius: 'inherit',
          }}
          onError={handleImageError}
          crossOrigin="anonymous"
        />
      )}

      {/* Loading indicator overlay (shown briefly while pool initializes) */}
      {!isInitialized && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Pulse effect on onset (subtle border flash) */}
      {isActive && isPlaying && (
        <div
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{
            borderRadius: 'inherit',
            boxShadow: showNext ? 'inset 0 0 30px rgba(255,255,255,0.15)' : 'none',
            transition: `box-shadow ${CROSSFADE_MS}ms ease-out`,
          }}
        />
      )}
    </div>
  );
};

export default OnsetImageCard;
