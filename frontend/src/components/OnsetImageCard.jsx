/**
 * Onset Image Card Component
 * 
 * Replaces AudioReactiveVideo for non-"Teddy Emotion" songs.
 * Displays AI-generated images that swap on each onset (drum hit) detection.
 * Images are mood-matched using actual AudioFeatures from the database.
 * 
 * Visual Pipeline:
 * 1. On mount/song change: Fetch audio features + initialize mood-aware image pool
 * 2. While pool loads: Show procedurally generated abstract art (1024px)
 * 3. On each onset callback: Crossfade to next image from shared pool
 * 4. Track spinner + SongCard stay in sync via shared onImageChange subscription
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
  // Track whether this instance is the "primary" onset driver (first active instance)
  const isPrimaryRef = useRef(false);

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

  // Crossfade helper - shared between onset handler and image change listener
  const crossfadeTo = useCallback((newImage) => {
    if (!isMountedRef.current) return;
    if (!newImage || newImage === currentImageRef.current) return;

    setNextImage(newImage);
    setShowNext(true);

    if (swapTimeoutRef.current) {
      clearTimeout(swapTimeoutRef.current);
    }

    swapTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setCurrentImage(newImage);
        currentImageRef.current = newImage;
        setShowNext(false);
      }
    }, CROSSFADE_MS);
  }, []);

  // Initialize image pool when song changes or component mounts
  useEffect(() => {
    if (!songTitle) return;

    const initPool = async () => {
      try {
        // Check if this song's pool already has images (cached from prior visit)
        const existingPoolImage = imageGenerationService.getFirstPoolImage(songId);
        if (existingPoolImage) {
          if (isMountedRef.current) {
            setCurrentImage(existingPoolImage);
            currentImageRef.current = existingPoolImage;
            setIsInitialized(true);
          }
          // Pool already loaded — no fetch needed, but still call init to set context
          await imageGenerationService.initializeSongContext({
            id: songId,
            title: songTitle,
            genre: 'electronic',
          });
          return;
        }

        // No pool yet — show procedural placeholder while API loads
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

        // Fetch and populate the pool for THIS song
        const context = {
          id: songId,
          title: songTitle,
          genre: 'electronic',
        };

        initPromiseRef.current = imageGenerationService.initializeSongContext(context);
        await initPromiseRef.current;

        // After pool loads, show THIS song's first pool image (not the global shared one)
        if (isMountedRef.current) {
          const myImage = imageGenerationService.getFirstPoolImage(songId);
          if (myImage && myImage !== currentImageRef.current) {
            crossfadeTo(myImage);
          }
        }
      } catch (error) {
        console.warn('[OnsetImageCard] Pool initialization error:', error);
      }
    };

    initPool();
  }, [songTitle, songId, crossfadeTo]);

  // Subscribe to shared image changes — ONLY active song instances follow onset images
  // Subscribe when isActive (regardless of playing state) so paused fullscreen stays in sync
  useEffect(() => {
    if (!isActive) return;

    // Activate this song's pool as the shared playback source
    imageGenerationService.activateForPlayback(songId);

    // On subscription, immediately sync to the current shared image
    const sharedImage = imageGenerationService.getCurrentImage();
    if (sharedImage && sharedImage !== currentImageRef.current) {
      setCurrentImage(sharedImage);
      currentImageRef.current = sharedImage;
    }

    const handleImageChange = (newImage, _generation) => {
      crossfadeTo(newImage);
    };

    imageGenerationService.onImageChange(handleImageChange);
    return () => {
      imageGenerationService.offImageChange(handleImageChange);
    };
  }, [isActive, songId, crossfadeTo]);

  // Handle onset (drum hit) — only the primary instance advances the pool
  const handleOnset = useCallback((onset) => {
    if (!isMountedRef.current) return;
    if (!isActiveRef.current || !isPlayingRef.current) return;

    // advanceImage notifies all subscribers (including this one via onImageChange)
    imageGenerationService.advanceImage({
      energy: onset.energy || 0.5,
      lfc: onset.lfc || 0.5,
      hfc: onset.hfc || 0.5,
      spectralCentroid: onset.spectralCentroid || 0.5,
      type: onset.type || 'unknown',
      strength: onset.strength || 0.5,
    });
  }, []);

  // Register/unregister onset callback — only ONE instance globally drives onsets
  useEffect(() => {
    if (!isActive || !isPlaying) {
      if (isPrimaryRef.current) {
        globalAudioContext.offOnset(handleOnset);
        imageGenerationService.releaseOnsetPrimary();
        isPrimaryRef.current = false;
      }
      return;
    }

    // Try to claim primary — only the first active instance wins
    if (imageGenerationService.claimOnsetPrimary()) {
      isPrimaryRef.current = true;
      globalAudioContext.onOnset(handleOnset);
    }

    return () => {
      if (isPrimaryRef.current) {
        globalAudioContext.offOnset(handleOnset);
        imageGenerationService.releaseOnsetPrimary();
        isPrimaryRef.current = false;
      }
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
