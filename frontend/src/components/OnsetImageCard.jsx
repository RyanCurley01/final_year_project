/**
 * Onset Image Card Component
 * 
 * Replaces AudioReactiveVideo for non-"Teddy Emotion" songs.
 * Displays AI-generated images that swap on each onset (drum hit) detection.
 * Images are mood-matched using actual AudioFeatures from the database.
 * 
 * Visual Pipeline:
 * 1. On mount/song change: Fetch audio features + initialize mood-aware image pool
 * 2. While pool loads: Show "Loading images" overlay
 * 3. On each onset callback: Swap to next image from shared pool
 * 4. Track spinner + SongCard stay in sync via shared onImageChange subscription
 * 5. If pool drains mid-playback, re-show loading overlay until refill completes
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import globalAudioContext from '../utils/globalAudioContext';
import imageGenerationService from '../utils/imageGenerationService';
import { GLITCH_DURATION_MS, glitchStyle } from '../utils/glitchEffects';

/**
 * Normalize songId to ensure consistent pool keys across all components.
 * Different APIs return the same product with different field names:
 * - Products API: { id: 5163 }
 * - TopPlayed API: { productId: 5163 }
 * - Recommendations API: { product_id: 5163 }
 * This strips any string prefix (e.g. 'db-') and returns the raw numeric ID.
 */
const normalizeId = (id) => {
  if (id == null) return null;
  const str = String(id);
  // Strip common prefixes like 'db-'
  const stripped = str.replace(/^db-/i, '');
  const num = parseInt(stripped, 10);
  return isNaN(num) ? str : num;
};

const OnsetImageCard = ({
  songTitle,
  songId: rawSongId,
  className,
  isPlaying,
  isActive,
  onError,
  ...props
}) => {
  // Normalize the songId so all instances of the same song share one image pool
  const songId = normalizeId(rawSongId);
  // Two-layer crossfade refs
  const containerRef = useRef(null);
  const [currentImage, setCurrentImage] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [imageError, setImageError] = useState(false);
  // Pool loading progress — tracks how many AI images have loaded
  const [poolReady, setPoolReady] = useState(false);
  const poolPollRef = useRef(null);

  // Refs for avoiding stale closures in callbacks
  const isActiveRef = useRef(isActive);
  const isPlayingRef = useRef(isPlaying);
  const currentImageRef = useRef(null);
  const isMountedRef = useRef(true);
  const initPromiseRef = useRef(null);
  // Track whether this instance is the "primary" onset driver (first active instance)
  const isPrimaryRef = useRef(false);
  // Glitch state — mirrors AudioReactiveVideo's glitch effect exactly
  const [isGlitching, setIsGlitching] = useState(false);
  const glitchTimeoutRef = useRef(null);

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
      if (glitchTimeoutRef.current) {
        clearTimeout(glitchTimeoutRef.current);
      }
      if (poolPollRef.current) {
        clearInterval(poolPollRef.current);
      }
    };
  }, []);

  // Continuously poll pool status — show loading overlay whenever pool has no images
  useEffect(() => {
    if (!songId) return;

    const checkStatus = () => {
      const status = imageGenerationService.getPoolStatus(songId);
      if (isMountedRef.current) {
        // Pool is ready only when it has images AND is not in initial load
        setPoolReady(!status.loading && status.imageCount > 0);
      }
    };

    checkStatus();
    poolPollRef.current = setInterval(checkStatus, 500);

    return () => {
      if (poolPollRef.current) {
        clearInterval(poolPollRef.current);
        poolPollRef.current = null;
      }
    };
  }, [songId]);

  // Instant swap helper - shared between onset handler and image change listener
  const swapTo = useCallback((newImage) => {
    if (!isMountedRef.current) return;
    if (!newImage || newImage === currentImageRef.current) return;
    setCurrentImage(newImage);
    currentImageRef.current = newImage;
  }, []);

  // Initialize image pool when song changes or component mounts
  useEffect(() => {
    if (!songTitle) return;

    const initPool = async () => {
      try {
        // If this song is already the active song (e.g. fullscreen opening while
        // thumbnail is playing), sync directly to the current shared image so both
        // instances show the exact same picture.
        if (isActive && imageGenerationService.getActiveSongId() == songId) {
          const sharedImage = imageGenerationService.getCurrentImage();
          if (sharedImage && isMountedRef.current) {
            setCurrentImage(sharedImage);
            currentImageRef.current = sharedImage;
            setIsInitialized(true);
            return;
          }
        }

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

        // No pool yet — show loading overlay (no procedural placeholder)
        // Fetch and populate the pool for THIS song
        const context = {
          id: songId,
          title: songTitle,
          genre: 'electronic',
        };

        initPromiseRef.current = imageGenerationService.initializeSongContext(context);
        await initPromiseRef.current;

        // After pool loads, show THIS song's first real pool image
        if (isMountedRef.current) {
          const myImage = imageGenerationService.getFirstPoolImage(songId);
          if (myImage) {
            setCurrentImage(myImage);
            currentImageRef.current = myImage;
            setIsInitialized(true);
          }
        }
      } catch (error) {
        console.warn('[OnsetImageCard] Pool initialization error:', error);
      }
    };

    initPool();
  }, [songTitle, songId, swapTo]);

  // Subscribe to shared image changes — ONLY active song instances follow onset images
  // Subscribe when isActive (regardless of playing state) so paused fullscreen stays in sync
  useEffect(() => {
    if (!isActive) return;

    // Activate this song's pool as the shared playback source — but only if
    // it isn't already active (avoids consuming an extra image from the pool
    // when a second instance like fullscreen mounts for the same song).
    if (imageGenerationService.getActiveSongId() != songId) {
      imageGenerationService.activateForPlayback(songId);
    }

    // On subscription, immediately sync to the current shared image
    const sharedImage = imageGenerationService.getCurrentImage();
    if (sharedImage && sharedImage !== currentImageRef.current) {
      setCurrentImage(sharedImage);
      currentImageRef.current = sharedImage;
    }

    const handleImageChange = (newImage, _generation) => {
      swapTo(newImage);
    };

    imageGenerationService.onImageChange(handleImageChange);
    return () => {
      imageGenerationService.offImageChange(handleImageChange);
    };
  }, [isActive, songId, swapTo]);

  // Passive sync: non-active instances of the same song follow onset image changes
  // This keeps wishlist, stock, purchased products etc. in sync with the playing song
  useEffect(() => {
    if (isActive) return; // Active instances are handled above
    if (!songId) return;

    const handlePassiveSync = (newImage, _generation, activeSongId) => {
      // Only sync if the image change is for THIS song
      if (activeSongId == songId) {
        swapTo(newImage);
      }
    };

    // Also check on mount if the active song matches and has a current image
    const currentActiveSongId = imageGenerationService.getActiveSongId();
    if (currentActiveSongId == songId) {
      const sharedImage = imageGenerationService.getCurrentImage();
      if (sharedImage && sharedImage !== currentImageRef.current) {
        setCurrentImage(sharedImage);
        currentImageRef.current = sharedImage;
      }
    }

    imageGenerationService.onImageChange(handlePassiveSync);
    return () => {
      imageGenerationService.offImageChange(handlePassiveSync);
    };
  }, [isActive, songId, swapTo]);

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

  // Listen for glitch events (high-frequency transients) — same logic as AudioReactiveVideo
  useEffect(() => {
    if (!isActive || !isPlaying) return;

    const handleGlitch = (glitch) => {
      setIsGlitching(true);
      if (glitchTimeoutRef.current) {
        clearTimeout(glitchTimeoutRef.current);
      }
      glitchTimeoutRef.current = setTimeout(() => {
        setIsGlitching(false);
      }, GLITCH_DURATION_MS);
    };

    globalAudioContext.onGlitch(handleGlitch);
    return () => {
      globalAudioContext.offGlitch(handleGlitch);
      if (glitchTimeoutRef.current) {
        clearTimeout(glitchTimeoutRef.current);
      }
    };
  }, [isActive, isPlaying]);

  // Handle image load errors — hide the broken image so loading overlay shows
  const handleImageError = useCallback(() => {
    if (isMountedRef.current) {
      setCurrentImage(null);
      currentImageRef.current = null;
      setImageError(true);
    }
  }, []);

  // Compute glitch styles once per render (random values refresh each render while glitching)
  const activeGlitch = isActive && isPlaying ? glitchStyle(isGlitching) : glitchStyle(false);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className || ''}`}
      style={{ width: '100%', height: '100%' }}
    >
      {/* Image layer — instant swap, no crossfade */}
      {currentImage && (
        <img
          src={currentImage}
          alt={songTitle || 'AI Generated Art'}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            borderRadius: 'inherit',
            transform: activeGlitch.transform,
            filter: activeGlitch.filter,
            imageRendering: activeGlitch.imageRendering,
            transition: activeGlitch.transition,
          }}
          onError={handleImageError}
        />
      )}

      {/* Scanline / noise overlay — visible only during glitch (matches sky grain effect) */}
      {isGlitching && isActive && isPlaying && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            borderRadius: 'inherit',
            background: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(255,255,255,0.03) 2px,
              rgba(255,255,255,0.03) 4px
            )`,
            mixBlendMode: 'overlay',
          }}
        />
      )}

      {/* Loading overlay — shown whenever pool has no real images ready */}
      {!poolReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 rounded-lg z-10">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-2" />
          <span className="text-white/70 text-xs font-medium">
            Loading images…
          </span>
        </div>
      )}
    </div>
  );
};

export default OnsetImageCard;
