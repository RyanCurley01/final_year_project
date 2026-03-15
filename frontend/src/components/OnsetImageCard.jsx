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
  // Normalize IDs up-front so every UI surface references the same pool key.
  const songId = normalizeId(rawSongId);
  // Two-layer crossfade refs
  const containerRef = useRef(null);
  const [currentImage, setCurrentImage] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [imageError, setImageError] = useState(false);
  // Pool loading progress — tracks how many AI images have loaded
  const [poolReady, setPoolReady] = useState(false);
  const poolPollRef = useRef(null);

  // Refs for avoiding stale closures in callbacks and async effects.
  const isActiveRef = useRef(isActive);
  const isPlayingRef = useRef(isPlaying);
  const currentImageRef = useRef(null);
  const isMountedRef = useRef(true);
  const initPromiseRef = useRef(null);
  // Track whether this instance is the "primary" onset driver (first active instance).
  // Only this instance should subscribe to raw onset events to avoid duplicates.
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

  // Continuously poll pool status — show loading overlay whenever pool has no
  // real network images available yet.
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

  // Instant swap helper shared by subscription events and direct updates.
  // Guarding against identical URLs prevents unnecessary React re-renders.
  const swapTo = useCallback((newImage) => {
    if (!isMountedRef.current) return;
    if (!newImage || newImage === currentImageRef.current) return;
    setCurrentImage(newImage);
    currentImageRef.current = newImage;
  }, []);

  // Initialize image pool when song changes or component mounts.
  // This flow prioritizes shared state, then local pool, then fresh fetch.
  useEffect(() => {
    if (!songTitle) return;

    const initPool = async () => {
      try {
        // Clear any stale image from a previous song.
        // Loading overlay remains visible until a real image is fetched/preloaded.
        if (isMountedRef.current) {
          setCurrentImage(null);
          currentImageRef.current = null;
          setPoolReady(false);
        }

        // Tracks whether an immediate usable image was found before network init.
        let imageSet = false;

        // 1. Try syncing with shared state first (highest priority if active)
        if (isActive && imageGenerationService.getActiveSongId() == songId) {
          const sharedImage = imageGenerationService.getCurrentImage();
          if (sharedImage && isMountedRef.current) {
            setCurrentImage(sharedImage);
            currentImageRef.current = sharedImage;
            setIsInitialized(true);
            setPoolReady(true);
            imageSet = true;
          }
        }

        // 2. If no shared image, try using first available pool frame.
        if (!imageSet) {
          const existingPoolImage = imageGenerationService.getFirstPoolImage(songId);
          if (existingPoolImage && isMountedRef.current) {
            setCurrentImage(existingPoolImage);
            currentImageRef.current = existingPoolImage;
            setIsInitialized(true);
            setPoolReady(true);
            imageSet = true;
          }
        }

        // 3) Always initialize context and verify pool health.
        // This also handles refill when a synced image exists but pool depth is low.
        const context = {
          id: songId,
          title: songTitle,
          genre: 'electronic',
        };

        // Active cards request deeper queues; inactive cards request lightweight
        // thumbnail queues for quick list rendering.
        const initPromise = imageGenerationService.initializeSongContext(context, isActive ? 'full' : 'thumbnail');
        initPromiseRef.current = initPromise;
        
        // If no real image is currently available, update after fetch completes.
        if (!imageSet) {
          await initPromise;
          if (isMountedRef.current) {
            // Force a second pool check. Some timing paths resolve the promise
            // before the first read reflects updated pool data.
            const myImage = imageGenerationService.getFirstPoolImage(songId);
            if (myImage) {
              setCurrentImage(myImage);
              currentImageRef.current = myImage;
              setIsInitialized(true);
              setPoolReady(true);
              
              // Active instance also updates shared state for all subscribers.
              if (isActive) {
                imageGenerationService.activateForPlayback(songId);
              }
            } else if (isActive) {
               // If no image exists after fetch for an active song, trigger
               // another full-mode initialization as a kickstart refill path.
               imageGenerationService.initializeSongContext(context, 'full');
            }
          }
        } else {
          // Even with an existing image, await completion so pool depth is
          // ready for upcoming onset events.
          await initPromise; 
        }

      } catch (error) {
        console.warn('[OnsetImageCard] Pool initialization error:', error);
      }
    };

    initPool();
  }, [songTitle, songId, swapTo, isActive]);

  // Subscribe to shared image changes — active song instances follow onset
  // image changes from the singleton orchestrator.
  // Subscription stays active while paused so fullscreen and inline cards remain aligned.
  useEffect(() => {
    if (!isActive) return;

    // Force activation first so service state points to this active song.
    // Primary-onset claim below depends on this active-song state.
    imageGenerationService.activateForPlayback(songId);

    // On subscription, immediately sync to the current shared image to avoid
    // brief visual mismatch when opening a second view.
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

  // Passive sync: non-active instances of the same song follow onset image changes.
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

    // Also check once on mount so list cards instantly reflect already-playing state.
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

  // Handle onset (drum hit). Only the primary active instance advances the
  // shared image state, then all subscribers receive the same update.
  const handleOnset = useCallback((onset) => {
    if (!isMountedRef.current) return;
    if (!isActiveRef.current || !isPlayingRef.current) return;

    // advanceImage emits to all subscribers (including this component).
    imageGenerationService.advanceImage({
      energy: onset.energy || 0.5,
      lfc: onset.lfc || 0.5,
      hfc: onset.hfc || 0.5,
      spectralCentroid: onset.spectralCentroid || 0.5,
      type: onset.type || 'unknown',
      strength: onset.strength || 0.5,
    });
  }, []);

  // Register/unregister onset callback — only one component globally owns
  // the raw onset subscription at any given moment.
  useEffect(() => {
    if (!isActive || !isPlaying) {
      if (isPrimaryRef.current) {
        globalAudioContext.offOnset(handleOnset);
        imageGenerationService.releaseOnsetPrimary(songId);
        isPrimaryRef.current = false;
      }
      return;
    }

    // Sequential setup keeps ownership deterministic across rapid UI remounts.
    // 1) Set active song in service
    imageGenerationService.activateForPlayback(songId);

    // 2) Claim primary onset callback ownership. Only one active instance wins.
    if (imageGenerationService.claimOnsetPrimary(songId)) {
      isPrimaryRef.current = true;
      globalAudioContext.onOnset(handleOnset);
    }

    return () => {
      if (isPrimaryRef.current) {
        globalAudioContext.offOnset(handleOnset);
        imageGenerationService.releaseOnsetPrimary(songId);
        isPrimaryRef.current = false;
      }
    };
  }, [isActive, isPlaying, handleOnset, songId]);

  // Listen for glitch events (high-frequency transients).
  // The timeout enforces a consistent visual glitch pulse duration.
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

  // Handle image load errors — fallback guarantees that the card never renders
  // as an empty surface even if network images fail.
  const handleImageError = useCallback(() => {
    if (!isMountedRef.current) return;

    const activeSongId = imageGenerationService.getActiveSongId();
    let fallback = null;

    // Active song instances publish one shared procedural frame for all subscribers.
    if (isActiveRef.current && activeSongId == songId) {
      if (isPrimaryRef.current) {
        fallback = imageGenerationService.setSharedProceduralImage({}, songId);
      } else {
        // Non-primary active instances should not generate a new procedural frame,
        // or fullscreen/minimized can diverge. Follow the shared frame only.
        fallback = imageGenerationService.getCurrentImage();
        if (!fallback) {
          return;
        }
      }
    } else {
      // Non-active instances follow current shared frame when available, then
      // fallback to a local procedural frame if nothing is shared yet.
      fallback = imageGenerationService.getCurrentImage();
      if (!fallback) {
        fallback = imageGenerationService.getProceduralImage();
      }
    }

    setCurrentImage(fallback);
    currentImageRef.current = fallback;
    setImageError(true);
  }, [songId]);

  // Compute glitch styles per render. During glitch-active frames, random
  // values are recomputed to create visual jitter.
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
      {(!currentImage && !poolReady) && (
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
