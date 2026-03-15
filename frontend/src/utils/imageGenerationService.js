/**
 * Image Generation Service
 * 
 * RAG-Enhanced Image Pool Manager for onset-reactive visuals.
 * Uses song metadata (title, genre, audio features) to construct contextually
 * relevant Flickr keyword tags, then retrieves pools of real photographs from
 * LoremFlickr via the audio_service backend proxy.
 * 
 * MCP (Model Context Protocol) Pattern:
 * - Acts as a tool that the onset detection system invokes
 * - Manages context (song metadata, audio features, image pools) across calls
 * - Orchestrates multiple providers with fallback chains
 * 
 * Architecture:
 * 1. SongContextRAG - Maps song metadata → visual prompts
 * 2. ImagePoolManager - Manages per-song image pools with pre-fetching
 * 3. ProceduralGenerator - Canvas-based instant fallback
 * 4. MCPImageOrchestrator - Coordinates providers and tool calls
 */

import envConfig from '../config/environment';

// ============================================
// SONG CONTEXT RAG (Retrieval-Augmented Generation)
// ============================================

/**
 * Maps song metadata to contextually relevant visual themes.
 * This is the "retrieval" component - it retrieves relevant visual context
 * from a knowledge base indexed by musical keywords.
 */
class SongContextRAG {
  constructor() {
    // Knowledge base: keyword → visual theme associations
    this.themeKnowledgeBase = {
      acid: ['psychedelic neon fractal art', 'acid trip colorful digital abstract', 'alien acid landscape surreal dissolving'],
      alien: ['alien landscape sci-fi otherworldly', 'extraterrestrial abstract neon glowing', 'alien world surreal desert neon'],
      bass: ['deep bass pressure wave underwater', 'bass frequency vibration neon pulse', 'subwoofer visualization dark energy'],
      dream: ['dreamscape surreal fantasy ethereal', 'lucid dream clouds colorful floating', 'dream portal abstract soft glow'],
      ghost: ['spectral ethereal glow transparent', 'ghostly mist digital art luminous', 'phantom translucent neon abstract'],
      glitch: ['glitch art digital corruption pixel', 'databend glitch cyberpunk neon', 'broken screen digital abstract vivid'],
      night: ['night sky aurora neon abstract', 'dark nocturnal cyberpunk glow', 'midnight abstract digital art stars'],
      space: ['outer space nebula cosmic colorful', 'galaxy stars supernova abstract', 'cosmic void nebula digital art'],
      dark: ['dark moody abstract shadows depth', 'dark energy void neon contrast', 'shadow realm abstract art dark'],
      light: ['light rays prismatic abstract art', 'luminous ethereal bright energy', 'light beam spectrum colorful abstract'],
      fire: ['fire plasma energy abstract vivid', 'burning abstract flames neon art', 'inferno energy visualization digital'],
      water: ['underwater abstract deep ocean art', 'water reflection ripple neon', 'aquatic abstract visualization fluid'],
      electric: ['electric lightning arc neon vivid', 'electric field abstract energy art', 'voltage spark visualization neon'],
      cyber: ['cyberpunk neon cityscape abstract', 'cyberspace grid neon wireframe', 'cybernetic interface abstract art'],
      pulse: ['pulse wave heartbeat neon rhythm', 'pulsating energy abstract vivid', 'rhythm pulse visualization art'],
      wave: ['sound wave abstract colorful flow', 'wave interference pattern neon', 'ocean wave energy abstract art'],
      storm: ['storm lightning dramatic abstract art', 'tempest energy abstract neon swirl', 'storm cell dramatic visualization'],
      crystal: ['crystal structure refraction abstract', 'crystalline geometry neon colorful', 'crystal formation abstract art'],
      echo: ['echo wave ripple abstract digital', 'reverb visualization abstract neon', 'sound echo abstract layered art'],
      drift: ['drifting motion abstract flowing art', 'drift blur movement neon abstract', 'floating drift abstract colorful'],
      void: ['void darkness minimal abstract art', 'empty void deep space abstract', 'void portal abstract dark neon'],
      neon: ['neon lights abstract cyberpunk vivid', 'neon glow abstract digital art', 'neon sign abstract colorful warm'],
      zen: ['zen minimal peaceful abstract art', 'meditative calm abstract digital', 'zen ripple water abstract art'],
      chaos: ['chaos entropy abstract vivid art', 'chaotic energy neon explosion', 'fractal chaos abstract colorful art'],
      shadow: ['shadow play contrast abstract art', 'dark shadow abstract neon accent', 'shadow depth abstract digital art'],
      emotion: ['abstract emotion color expression art', 'emotional abstract digital painting', 'feeling emotion abstract vivid art'],
      ted: ['electronic music abstract visualization', 'electronic beats digital abstract art', 'techno abstract neon visualization'],
    };

    // Genre-specific base modifiers
    this.genreModifiers = {
      electronic: 'electronic music digital art abstract visualization',
      techno: 'techno dark industrial abstract neon',
      ambient: 'ambient atmospheric soft ethereal abstract',
      default: 'abstract digital art colorful vibrant music visualization',
    };
  }

  /**
   * RAG retrieval: Extract relevant themes from song context.
   * @param {Object} songContext - { title, genre, energy, mood }
   * @returns {string[]} Array of contextually relevant search prompts
   */
  retrieveThemes(songContext) {
    const { title = '', genre = 'electronic' } = songContext;
    const titleLower = title.toLowerCase();
    const words = titleLower.split(/[\s\-_]+/).filter(w => w.length > 2);

    const themes = new Set();
    let hasMatch = false;

    // Search knowledge base for matching themes
    for (const word of words) {
      for (const [key, themeList] of Object.entries(this.themeKnowledgeBase)) {
        if (word.includes(key) || key.includes(word)) {
          themeList.forEach(theme => themes.add(theme));
          hasMatch = true;
        }
      }
    }

    // If no specific match, use default electronic themes
    if (!hasMatch) {
      themes.add('abstract electronic music visualization colorful neon');
      themes.add('electronic beats abstract digital art vivid');
      themes.add('music visualization abstract colorful energy');
      themes.add('abstract art colorful vibrant digital painting');
      themes.add('neon abstract digital art futuristic cyberpunk');
    }

    return Array.from(themes);
  }

  /**
   * RAG augmentation: Generate search prompts enriched with song context.
   * @param {Object} songContext - { title, genre, energy, mood }
   * @returns {string[]} Array of augmented prompts for image search
   */
  generatePrompts(songContext) {
    const themes = this.retrieveThemes(songContext);
    const title = (songContext.title || '').toLowerCase();
    const genreMod = this.genreModifiers[songContext.genre] || this.genreModifiers.default;

    const prompts = [];

    // Augment themes with song-specific context
    for (const theme of themes.slice(0, 4)) {
      prompts.push(`${theme} ${genreMod}`);
    }

    // Add title-based prompt
    prompts.push(`${title} abstract digital art ${genreMod}`);

    return prompts;
  }
}


// ============================================
// PROCEDURAL GENERATOR (Instant Canvas Fallback)
// ============================================

/**
 * Generates abstract art on canvas, driven by audio feature parameters.
 * Always available, instant generation, no API calls needed.
 * Used as fallback while API images load.
 */
class ProceduralGenerator {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 1024;
    this.ctx = this.canvas.getContext('2d');
    this.colorIndex = 0;

    // Curated color palettes for procedural generation
    this.palettes = [
      ['#FF006E', '#8338EC', '#3A86FF', '#06D6A0', '#FFD166'], // Vibrant
      ['#2D00F7', '#6A00F4', '#8900F2', '#A100F2', '#B100E8'], // Purple wave
      ['#FF0000', '#FF4400', '#FF8800', '#FFBB00', '#FFFF00'], // Fire
      ['#00F5D4', '#00BBF9', '#9B5DE5', '#F15BB5', '#FEE440'], // Neon
      ['#001219', '#005F73', '#0A9396', '#94D2BD', '#E9D8A6'], // Ocean
      ['#10002B', '#240046', '#3C096C', '#5A189A', '#7B2D8E'], // Deep purple
      ['#03071E', '#370617', '#6A040F', '#9D0208', '#D00000'], // Dark fire
      ['#006466', '#065A60', '#0B525B', '#144552', '#1B3A4B'], // Deep teal
    ];
  }

  /**
   * Generate a unique abstract art image.
   * @param {Object} params - Audio features influencing the art
   * @returns {string} Data URL of generated image
   */
  generate(params = {}) {
    const {
      energy = Math.random(),
      lfc = Math.random(),
      hfc = Math.random(),
      spectralCentroid = Math.random(),
      type = 'unknown',
    } = params;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Select palette based on spectral centroid
    const paletteIdx = Math.floor(spectralCentroid * this.palettes.length) % this.palettes.length;
    const palette = this.palettes[paletteIdx];

    // Background gradient
    const angle = Math.random() * Math.PI * 2;
    const gx1 = w / 2 + Math.cos(angle) * w / 2;
    const gy1 = h / 2 + Math.sin(angle) * h / 2;
    const gx2 = w - gx1;
    const gy2 = h - gy1;
    const gradient = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
    gradient.addColorStop(0, palette[0]);
    gradient.addColorStop(0.5, palette[1]);
    gradient.addColorStop(1, palette[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Layer 1: Large organic shapes (influenced by LFC - low frequency / kick)
    const largeShapeCount = 3 + Math.floor(lfc * 5);
    for (let i = 0; i < largeShapeCount; i++) {
      ctx.save();
      ctx.globalAlpha = 0.2 + Math.random() * 0.3;
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.beginPath();
      const cx = Math.random() * w;
      const cy = Math.random() * h;
      const radius = 50 + energy * 150 + Math.random() * 100;

      // Blob shape using bezier curves
      const points = 5 + Math.floor(Math.random() * 4);
      for (let j = 0; j <= points; j++) {
        const a = (j / points) * Math.PI * 2;
        const r = radius * (0.7 + Math.random() * 0.6);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (j === 0) ctx.moveTo(x, y);
        else {
          const cpx = cx + Math.cos(a - 0.3) * r * 1.2;
          const cpy = cy + Math.sin(a - 0.3) * r * 1.2;
          ctx.quadraticCurveTo(cpx, cpy, x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Layer 2: Geometric shapes (influenced by HFC - high frequency / snare)
    const geoCount = 5 + Math.floor(hfc * 15);
    for (let i = 0; i < geoCount; i++) {
      ctx.save();
      ctx.globalAlpha = 0.1 + Math.random() * 0.4;
      const color = palette[Math.floor(Math.random() * palette.length)];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1 + Math.random() * 3;

      const x = Math.random() * w;
      const y = Math.random() * h;
      const size = 10 + Math.random() * (60 + energy * 80);

      const shapeType = Math.floor(Math.random() * 4);
      switch (shapeType) {
        case 0: // Circle
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          Math.random() > 0.5 ? ctx.fill() : ctx.stroke();
          break;
        case 1: // Triangle
          ctx.beginPath();
          ctx.moveTo(x, y - size);
          ctx.lineTo(x - size * 0.866, y + size * 0.5);
          ctx.lineTo(x + size * 0.866, y + size * 0.5);
          ctx.closePath();
          Math.random() > 0.5 ? ctx.fill() : ctx.stroke();
          break;
        case 2: // Line
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(Math.random() * Math.PI * 2) * size * 2,
                     y + Math.sin(Math.random() * Math.PI * 2) * size * 2);
          ctx.stroke();
          break;
        case 3: // Ring
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
          ctx.stroke();
          break;
      }
      ctx.restore();
    }

    // Layer 3: Particle scatter (energy-driven)
    const particleCount = Math.floor(energy * 100);
    for (let i = 0; i < particleCount; i++) {
      ctx.save();
      ctx.globalAlpha = 0.3 + Math.random() * 0.5;
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = 1 + Math.random() * 4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Layer 4: Light flare effect for kicks
    if (type === 'kick' || energy > 0.6) {
      const flareX = w * (0.2 + Math.random() * 0.6);
      const flareY = h * (0.2 + Math.random() * 0.6);
      const flareGrad = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, 200);
      flareGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
      flareGrad.addColorStop(0.5, `${palette[3]}44`);
      flareGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = flareGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // Return as JPEG data URL for smaller size
    return this.canvas.toDataURL('image/jpeg', 0.85);
  }
}


// ============================================
// IMAGE POOL MANAGER
// ============================================

/**
 * Manages per-song image pools with pre-fetching, caching, and cycling.
 * Ensures images are always available for onset-triggered display.
 */
class ImagePoolManager {
  constructor() {
    this.pools = new Map(); // songId → { images: string[], index: number, loading: boolean }
    // url → { img: HTMLImageElement, promise: Promise<boolean>, loaded: boolean, failed: boolean }
    // Map iteration order is used as an approximate LRU.
    this.preloadedImages = new Map();
    this.maxPoolSize = 1000000; // Effectively infinite — never cap
    this.refillThreshold = 20; // Refill when pool drops below this
    // Keep a bounded number of upcoming URLs actively preloading.
    // This avoids spawning hundreds of concurrent image downloads, which can
    // starve the *next* image and cause missed swaps on fast onsets.
    this.preloadWindow = 16;
  }

  _touchPreloadEntry(url, entry) {
    if (!url || !entry) return;
    // Refresh insertion order (approx LRU) so active/used entries are least likely to be evicted.
    try {
      this.preloadedImages.delete(url);
      this.preloadedImages.set(url, entry);
    } catch {
      // ignore
    }
  }

  /**
   * Initialize or get the pool for a song.
   */
  getPool(songId) {
    if (!this.pools.has(songId)) {
      this.pools.set(songId, {
        images: [],
        index: 0,
        loading: false,
        lastFetch: 0,
      });
    }
    return this.pools.get(songId);
  }

  /**
   * Add images to a song's pool.
   */
  addImages(songId, imageUrls) {
    const pool = this.getPool(songId);
    // O(1) dedup with Set
    const existing = new Set(pool.images);
    for (const url of imageUrls) {
      if (!existing.has(url)) {
        pool.images.push(url);
        existing.add(url);
      }
    }

    // Start preloading only the next few images we might actually consume.
    this._ensurePreloadWindow(songId);

    // Cap pool size (very high — effectively infinite)
    if (pool.images.length > this.maxPoolSize) {
      pool.images = pool.images.slice(-this.maxPoolSize);
    }
  }

  _isUrlFailed(url) {
    const entry = this.preloadedImages.get(url);
    return entry?.failed === true;
  }

  /**
   * Discard any failed URLs at the head of the queue.
   * A single failed image should never permanently block onset-driven swapping.
   */
  _discardFailedHead(songId, maxDiscards = 25) {
    const pool = this.getPool(songId);
    let discards = 0;
    while (pool.images.length > 0 && discards < maxDiscards) {
      const head = pool.images[0];
      if (!head) break;
      if (head.startsWith('data:')) break;
      if (!this._isUrlFailed(head)) break;
      pool.images.shift();
      discards++;
    }
    return discards;
  }

  /**
   * Ensure a small lookahead window of images are being preloaded.
   */
  _ensurePreloadWindow(songId) {
    const pool = this.getPool(songId);
    this._discardFailedHead(songId);
    const limit = Math.min(pool.images.length, this.preloadWindow);
    for (let i = 0; i < limit; i++) {
      const url = pool.images[i];
      if (!url || url.startsWith('data:')) continue;
      // Skip known failures; they'll get discarded when they reach head.
      if (this._isUrlFailed(url)) continue;
      this._preloadImage(url);
    }
  }

  /**
   * Peek the next image URL without consuming it.
   */
  peekNextImage(songId) {
    this._discardFailedHead(songId);
    const pool = this.getPool(songId);
    return pool.images.length > 0 ? pool.images[0] : null;
  }

  /**
   * Consume the next image URL from the pool.
   */
  consumeNextImage(songId) {
    this._discardFailedHead(songId);
    const pool = this.getPool(songId);
    if (pool.images.length === 0) return null;
    const next = pool.images.shift();
    // Keep the lookahead window warm.
    this._ensurePreloadWindow(songId);
    return next;
  }

  /**
   * Returns true if an URL is already loaded (or is a data URL).
   * If the URL is not tracked yet, this will start a preload.
   */
  isUrlReady(url) {
    if (!url) return false;
    if (url.startsWith('data:')) return true;

    // Never treat failed URLs as ready.
    if (this._isUrlFailed(url)) return false;

    const entry = this.preloadedImages.get(url);
    if (!entry) {
      this._preloadImage(url);
      return false;
    }

    this._touchPreloadEntry(url, entry);

    // Prefer actual browser readiness.
    if (entry.img && entry.img.complete && entry.img.naturalWidth > 0) {
      entry.loaded = true;
      return true;
    }

    return entry.loaded === true;
  }

  /**
   * Get the next image from the pool (cyclic).
   */
  getNextImage(songId) {
    const pool = this.getPool(songId);
    if (pool.images.length === 0) return null;

    // Consuming queue: shift from front, never repeat
    const image = pool.images.shift();
    return image;
  }

  /**
   * Check if pool needs refilling.
   */
  needsRefill(songId) {
    const pool = this.getPool(songId);
    // Consuming queue: just check remaining length
    return pool.images.length < this.refillThreshold && !pool.loading;
  }

  /**
   * Pre-load an image for instant display.
   * Returns a Promise that resolves when the image is loaded (or rejects on error).
   */
  _preloadImage(url) {
    if (this.preloadedImages.has(url)) {
      const existing = this.preloadedImages.get(url);
      if (existing) this._touchPreloadEntry(url, existing);
      return existing?.promise || Promise.resolve();
    }
    if (url.startsWith('data:')) return Promise.resolve();

    const img = new Image();
    const entry = { img, promise: null, loaded: false, failed: false };
    const promise = new Promise((resolve) => {
      img.onload = () => {
        entry.loaded = true;
        entry.failed = false;
        resolve(true);
      };
      img.onerror = () => {
        entry.loaded = false;
        entry.failed = true;
        resolve(false); // resolve (not reject) so Promise.all doesn't abort
      };
    });
    // No crossOrigin — LoremFlickr doesn't send CORS headers
    img.src = url;
    entry.promise = promise;
    this.preloadedImages.set(url, entry);

    // Limit preload cache size
    if (this.preloadedImages.size > 200) {
      const firstKey = this.preloadedImages.keys().next().value;
      this.preloadedImages.delete(firstKey);
    }

    return promise;
  }

  /**
   * Preload a batch of URLs and wait for them to finish loading.
   * Used to ensure the first N images are ready before onset detection starts.
   * @param {string[]} urls - URLs to preload
   * @param {number} timeoutMs - Max time to wait (default 5s)
   */
  async _preloadPriorityBatch(urls, timeoutMs = 5000) {
    if (!urls.length) return;
    const promises = urls.map(url => this._preloadImage(url));
    // Race: either all load or timeout expires — don't block forever
    await Promise.race([
      Promise.all(promises),
      new Promise(resolve => setTimeout(resolve, timeoutMs)),
    ]);
  }

  /**
   * Clear pool for a song.
   */
  clearPool(songId) {
    this.pools.delete(songId);
  }

  /**
   * Clear all pools.
   */
  clearAll() {
    this.pools.clear();
    this.preloadedImages.clear();
  }
}


// ============================================
// MCP IMAGE ORCHESTRATOR (Model Context Protocol)
// ============================================

/**
 * Orchestrates the full image generation pipeline using MCP patterns:
 * - Tool invocation: Onset detection calls this as a "tool"
 * - Context management: Maintains song context, pool state, and provider status
 * - Provider chain: LoremFlickr → Procedural fallback with graceful degradation
 */
class MCPImageOrchestrator {
  constructor() {
    this.rag = new SongContextRAG();
    this.poolManager = new ImagePoolManager();
    this.proceduralGenerator = new ProceduralGenerator();

    // MCP context state — per-song context map so thumbnails don't clobber the active song
    this.currentSongContext = null;
    this._songContexts = new Map(); // songId → songContext
    this.providerStatus = {
      loremflickr: { available: true, lastError: null, errorCount: 0 },
    };

    // Rate limiting
    this.lastFetchTime = 0;
    this.minFetchInterval = 2000; // 2 seconds between API calls

    // Cached audio features from AudioFeatures DB table
    this._audioFeaturesCache = null;
    this._audioFeaturesFetchPromise = null;

    // Shared image state: all subscribers see the same current image per onset
    this._currentOnsetImage = null;
    this._onsetImageListeners = new Set();
    this._onsetGeneration = 0; // increments each onset
    this._activeSongId = null; // track which song is currently driving onsets

    // Singleton onset registration: only one component drives onsets
    this._onsetRegistered = false;

    // If an onset happens while the next pool image is still downloading,
    // we queue a "pending" onset and swap to the next real image as soon as it loads.
    this._pendingOnsetCount = new Map(); // songId -> number
    this._pendingSwapScheduled = new Set(); // songId
  }

  _resolveActiveSongId() {
    return this._activeSongId || (this.currentSongContext?.id || this.currentSongContext?.title);
  }

  _incrementPendingOnset(songId) {
    const key = String(songId);
    // Clamp to 1: if multiple onsets happen while downloading, we collapse them
    // into a single pending visual update (prevents rapid catch-up cycling).
    this._pendingOnsetCount.set(key, 1);
  }

  _decrementPendingOnset(songId) {
    const key = String(songId);
    const current = this._pendingOnsetCount.get(key) || 0;
    const next = Math.max(0, current - 1);
    if (next === 0) this._pendingOnsetCount.delete(key);
    else this._pendingOnsetCount.set(key, next);
    return next;
  }

  _scheduleSwapWhenReady(songId) {
    const key = String(songId);
    if (this._pendingSwapScheduled.has(key)) return;

    const peekUrl = this.poolManager.peekNextImage(songId);
    if (!peekUrl) return;

    this._pendingSwapScheduled.add(key);

    this.poolManager._preloadImage(peekUrl).then(() => {
      this._pendingSwapScheduled.delete(key);

      // Only fulfill pending onsets for the currently active song.
      if (String(this._activeSongId || '') !== key) return;

      const pending = this._pendingOnsetCount.get(key) || 0;
      if (pending <= 0) return;

      const readyUrl = this.poolManager.peekNextImage(songId);
      if (readyUrl && this.poolManager.isUrlReady(readyUrl)) {
        const realImage = this.poolManager.consumeNextImage(songId);
        if (realImage) {
          // Clear pending (clamped to 1 anyway)
          this._pendingOnsetCount.delete(key);
          this._currentOnsetImage = realImage;
          this._onsetGeneration++;
          this._notifyListeners(realImage);
        }
      }
    }).catch(() => {
      this._pendingSwapScheduled.delete(key);
    });
  }

  /**
   * Try to become the primary onset driver. Returns true if successful.
   * Only one component at a time should register the onset callback.
   * @param {string|number} songId - ID of the song requesting primary status
   */
  claimOnsetPrimary(songId) {
    // If we are the active song, we can ALWAYS claim/steal primary status
    // This solves race conditions where the previous song hasn't released it yet
    const normalizedActive = String(this._activeSongId || '');
    const normalizedRequest = String(songId || '');

    // Allow claim if:
    // 1. No one has claimed it yet
    // 2. We are the designated active song (we can steal/re-claim it)
    if (!this._onsetRegistered || (normalizedActive && normalizedActive === normalizedRequest)) {
      this._onsetRegistered = true;
      return true;
    }

    return false;
  }

  /**
   * Release onset primary status.
   * @param {string|number} songId - ID of the song releasing status
   */
  releaseOnsetPrimary(songId) {
    // Prevent "stolen" claims from being released by the previous owner.
    // Only release if the requesting song is actually the active song.
    // If active song has changed (e.g. A releases after B activated), 
    // we assume B has already claimed/will claim it, so A shouldn't touch the flag.
    const normalizedActive = String(this._activeSongId || '');
    const normalizedRequest = String(songId || '');
    
    // If no songId provided, fallback to unsafe release (legacy behavior)
    // but honestly we should probably enforce it.
    if (!songId || normalizedActive === normalizedRequest) {
      this._onsetRegistered = false;
    }
  }

  /**
   * Subscribe to onset image changes. Listener receives (imageUrl, generation).
   * Used to sync multiple OnsetImageCard instances (SongCard + Track spinner).
   */
  onImageChange(listener) {
    this._onsetImageListeners.add(listener);
  }

  /**
   * Unsubscribe from onset image changes.
   */
  offImageChange(listener) {
    this._onsetImageListeners.delete(listener);
  }

  /**
   * Advance to the next image and notify all listeners.
   * Called once per onset; all subscribers receive the same image.
   */
  advanceImage(onsetData = {}) {
    const songId = this._resolveActiveSongId();
    const newImage = this.getNextImage(onsetData, songId);
    if (newImage) {
      // Always advance — crossfadeTo in the UI already guards against same-image
      this._currentOnsetImage = newImage;
      this._onsetGeneration++;
      this._notifyListeners(newImage);
      return newImage;
    }

    // If the next real image isn't ready yet, still produce an immediate visual
    // update for this onset using the procedural generator.
    // This keeps the UI responsive even when network downloads can't keep up.
    // We keep the pending swap logic below so a real image replaces it ASAP.
    const current = this._currentOnsetImage;
    const hasSomethingDisplayed = typeof current === 'string' && current.length > 0;
    if (hasSomethingDisplayed) {
      const procedural = this.getProceduralImage({
        energy: onsetData.energy,
        lfc: onsetData.lfc,
        hfc: onsetData.hfc,
        spectralCentroid: onsetData.spectralCentroid,
        type: onsetData.type,
        strength: onsetData.strength,
      });
      if (procedural) {
        this._currentOnsetImage = procedural;
        this._onsetGeneration++;
        this._notifyListeners(procedural);
      }
    }

    // No real image ready at the onset moment. Queue it and fulfill as soon as
    // the next pool image finishes downloading.
    if (songId) {
      this._incrementPendingOnset(songId);
      this._scheduleSwapWhenReady(songId);
    }
    return null;
  }

  /**
   * Notify all image change listeners.
   */
  _notifyListeners(image) {
    for (const listener of this._onsetImageListeners) {
      try {
        listener(image, this._onsetGeneration, this._activeSongId);
      } catch (e) {
        // Ignore callback errors
      }
    }
  }

  /**
   * Get the current shared onset image without advancing.
   */
  getCurrentImage() {
    return this._currentOnsetImage;
  }

  /**
   * Get the currently active song ID (the song driving onset images).
   */
  getActiveSongId() {
    return this._activeSongId;
  }

  /**
   * Check if an image URL belongs to a specific song's pool.
   */
  isImageInPool(songId, imageUrl) {
    const pool = this.poolManager.getPool(songId);
    return pool.images.includes(imageUrl);
  }

  /**
   * Fetch all cached audio features from the backend AudioFeatures table.
   * Results are cached in memory for the session.
   * @returns {Object} Map of productId string → feature object
   */
  async fetchAudioFeatures() {
    if (this._audioFeaturesCache) return this._audioFeaturesCache;
    if (this._audioFeaturesFetchPromise) return this._audioFeaturesFetchPromise;

    this._audioFeaturesFetchPromise = (async () => {
      try {
        const apiBaseUrl = envConfig.getApiBaseUrl();
        const response = await fetch(
          `${apiBaseUrl}/api/audio/cached-features?artist_only=false`,
          {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
          }
        );
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const data = await response.json();
        if (data.status === 'success' && data.features) {
          this._audioFeaturesCache = data.features;
          console.log(`[ImageGen] Loaded audio features for ${data.count} songs`);
          return this._audioFeaturesCache;
        }
        return {};
      } catch (err) {
        console.warn('[ImageGen] Failed to fetch audio features:', err.message);
        return {};
      } finally {
        this._audioFeaturesFetchPromise = null;
      }
    })();

    return this._audioFeaturesFetchPromise;
  }

  /**
   * Get audio features for a specific song by ID.
   * Tries both positive and negative productId keys.
   * @param {number|string} songId
   * @returns {Object|null} Audio features or null
   */
  async getAudioFeaturesForSong(songId) {
    const features = await this.fetchAudioFeatures();
    if (!features || !songId) return null;
    // Try negative ID (database songs), positive ID, and string variants
    const id = parseInt(songId, 10);
    return features[String(id)] || features[String(-Math.abs(id))] || features[String(Math.abs(id))] || null;
  }

  /**
   * MCP Tool: Initialize context for a new song.
   * Called when a song starts playing.
   * Fetches audio features and uses them for mood-aware image retrieval.
   * @param {Object} songContext - { id, title, genre, audioFeatures? }
   * @param {string} mode - 'thumbnail' (fetch 1 image) or 'full' (fetch 50 images)
   */
  async initializeSongContext(songContext, mode = 'thumbnail') {
    const songId = songContext.id || songContext.title;

    // Store context per-songId so thumbnails don't clobber the active song
    this._songContexts.set(songId, songContext);
    // Only set currentSongContext for the active song
    if (this._activeSongId == null || this._activeSongId == songId) {
      this.currentSongContext = songContext;
    }

    // Check if we already have a pool for this song
    const pool = this.poolManager.getPool(songId);

    // If pool is currently loading (another instance started the fetch), wait for it
    if (pool.loading && pool._loadPromise) {
      await pool._loadPromise;
    }

    // Determine if we have enough images for the requested mode
    // Thumbnail mode: needs at least 1 image
    // Full mode: needs at least 10 images (arbitrary non-empty threshold)
    const hasEnoughImages = mode === 'full' 
      ? pool.images.length >= 10 
      : pool.images.length > 0;

    // Pool already sufficiently populated — still ensure the next image is preloaded
    // so UI can render a real image immediately.
    if (hasEnoughImages) {
      const peekUrl = this.poolManager.peekNextImage(songId);
      if (peekUrl && !this.poolManager.isUrlReady(peekUrl)) {
        await this.poolManager._preloadPriorityBatch([peekUrl], 4000);
      }
      return;
    }

    // Fetch audio features for this song from the DB cache
    let audioFeatures = songContext.audioFeatures || null;
    if (!audioFeatures && songContext.id) {
      audioFeatures = await this.getAudioFeaturesForSong(songContext.id);
    }

    // Store features in context for later use
    songContext.audioFeatures = audioFeatures;
    this._songContexts.set(songId, songContext);

    // Populate the pool with mood-aware images (does NOT touch shared image state)
    await this._fetchAndPopulatePool(songContext, audioFeatures, false, mode);

    // Wait briefly for the first real image to preload so callers can render it.
    const poolAfter = this.poolManager.getPool(songId);
    const firstUrls = (poolAfter.images || []).slice(0, mode === 'thumbnail' ? 1 : 3);
    if (firstUrls.length) {
      await this.poolManager._preloadPriorityBatch(firstUrls, 4000);
    }
  }

  /**
   * Get the first image from a specific song's pool.
   * Used by cards to show their OWN song's thumbnail (not the global shared image).
   * @param {string|number} songId
   * @returns {string|null} First pool image URL or null
   */
  getFirstPoolImage(songId) {
    const pool = this.poolManager.getPool(songId);
    return pool.images.length > 0 ? pool.images[0] : null;
  }

  /**
   * Get pool loading status for a song (used by UI loading indicators).
   * @param {string|number} songId
   * @returns {{ loading: boolean, imageCount: number }}
   */
  getPoolStatus(songId) {
    const pool = this.poolManager.getPool(songId);
    return {
      loading: pool.loading,
      imageCount: pool.images.length,
    };
  }

  /**
   * Activate a song for onset-driven playback.
   * Sets the shared image state and notifies all subscribers.
   * Should ONLY be called by the active/playing song's component.
   * @param {string|number} songId
   */
  activateForPlayback(songId) {
    const wasActiveSongId = this._activeSongId;
    const isSameSongActivation =
      wasActiveSongId != null && songId != null && String(wasActiveSongId) === String(songId);

    this._activeSongId = songId;
    // Update currentSongContext to point to the active song's stored context
    const storedContext = this._songContexts.get(songId);
    if (storedContext) {
      this.currentSongContext = storedContext;
    }

    // If this is just another view of the SAME active song (e.g. fullscreen portal),
    // keep the current shared frame and primary onset owner untouched.
    if (isSameSongActivation) {
      if (this._currentOnsetImage) {
        this._notifyListeners(this._currentOnsetImage);
      }
      return;
    }

    // Song actually changed: release onset primary so the new active card can claim it.
    this._onsetRegistered = false;
    const pool = this.poolManager.getPool(songId);
    const context = this._songContexts.get(songId) || storedContext || this.currentSongContext;

    const peekUrl = this.poolManager.peekNextImage(songId);
    if (peekUrl && this.poolManager.isUrlReady(peekUrl)) {
      const initialImage = this.poolManager.consumeNextImage(songId);
      if (initialImage) {
        this._currentOnsetImage = initialImage;
        this._onsetGeneration++;
        this._notifyListeners(initialImage);
        return;
      }
    }

    // If we have a pool URL queued, swap to the first REAL image as soon as it finishes loading.
    // Until then we keep the shared image empty and the UI shows the existing loading overlay.
    if (peekUrl) {
      this.poolManager._preloadImage(peekUrl).then(() => {
        if (this._activeSongId != songId) return;
        const readyUrl = this.poolManager.peekNextImage(songId);
        if (readyUrl && this.poolManager.isUrlReady(readyUrl)) {
          const realImage = this.poolManager.consumeNextImage(songId);
          if (realImage) {
            this._currentOnsetImage = realImage;
            this._onsetGeneration++;
            this._notifyListeners(realImage);
          }
        }
      }).catch(() => {
        // ignore preload errors; UI stays in loading state
      });
    }
  }

  /**
   * MCP Tool: Get next image for an onset event.
   * Called by the onset detection system.
   * @param {Object} onsetData - { time, strength, type, lfc, hfc, flux, energy, spectralCentroid }
   * @returns {string} Image URL or data URL
   */
  getNextImage(onsetData = {}, resolvedSongId = null) {
    // CRITICAL: use _activeSongId, not currentSongContext.id!
    // currentSongContext gets overwritten by every thumbnail card that mounts.
    // _activeSongId is only set by activateForPlayback (the actually playing song).
    const songId = resolvedSongId || this._resolveActiveSongId();

    if (!songId) {
      return null;
    }

    // Try API-sourced image from pool — but only consume it when it's actually loaded.
    // Otherwise the UI "updates" to a URL that hasn't downloaded yet (looks like a lag).
    const peekUrl = this.poolManager.peekNextImage(songId);
    let poolImage = null;
    if (peekUrl && this.poolManager.isUrlReady(peekUrl)) {
      poolImage = this.poolManager.consumeNextImage(songId);
    }

    // Check if pool needs refill (background fetch)
    if (this.poolManager.needsRefill(songId)) {
      const ctx = this._songContexts.get(songId) || this.currentSongContext;
      if (ctx) this._backgroundRefill(ctx);
    }

    if (poolImage) return poolImage;

    // No real image ready yet.
    // Start a preload and return null so the UI keeps its current image
    // (or shows the loading overlay).
    if (peekUrl) {
      this._scheduleSwapWhenReady(songId);
    }
    return null;
  }

  /**
   * Get a procedural image (always instant, for initial display).
   */
  getProceduralImage(params = {}) {
    return this.proceduralGenerator.generate(params);
  }

  /**
   * Generate and publish a shared procedural fallback frame for the active song.
   * Keeps all subscribers (card + fullscreen + track widgets) visually in sync.
   */
  setSharedProceduralImage(params = {}, targetSongId = null) {
    const activeSongId = this._activeSongId;
    const songId = targetSongId ?? activeSongId;

    // Only publish shared fallback for the currently active song.
    if (activeSongId == null || songId == null || String(activeSongId) !== String(songId)) {
      return this.getProceduralImage(params);
    }

    const procedural = this.getProceduralImage(params);
    if (procedural) {
      this._currentOnsetImage = procedural;
      this._onsetGeneration++;
      this._notifyListeners(procedural);
    }
    return procedural;
  }

  /**
   * Check if pool has images ready.
   */
  hasPoolImages(songId) {
    const pool = this.poolManager.getPool(songId || this.currentSongContext?.id);
    return pool.images.length > 0;
  }

  /**
   * Fetch images from the backend proxy and populate the pool.
   * Passes audio features to backend for mood-aware prompt generation.
   * @param {Object} songContext
   * @param {Object} audioFeatures
   * @param {boolean} isRefill
   * @param {string} mode - 'thumbnail' or 'full'
   */
  async _fetchAndPopulatePool(songContext, audioFeatures = null, isRefill = false, mode = 'full') {
    const songId = songContext.id || songContext.title;
    const pool = this.poolManager.getPool(songId);

    if (pool.loading) return;
    pool.loading = true;

    // Store the load promise so other instances can await it
    pool._loadPromise = (async () => {
    try {
      const apiBaseUrl = envConfig.getApiBaseUrl();
      const encodedTitle = encodeURIComponent(songContext.title || 'electronic music');

      // Build URL with audio feature params for mood-aware prompts.
      // Keep client fetch sizing aligned with backend pool target defaults.
      const fullPoolTarget = 80;
      const refillBatch = 80;
      let batchCount = fullPoolTarget;
      if (mode === 'thumbnail') batchCount = 1;
      else if (isRefill) batchCount = refillBatch;

      let url = `${apiBaseUrl}/api/images/pool?song_title=${encodedTitle}&song_id=${songContext.id || 0}&count=${batchCount}&pad_external=false`;

      // Append audio features from the AudioFeatures DB table
      const af = audioFeatures || songContext.audioFeatures;
      if (af) {
        if (af.mood) url += `&mood=${encodeURIComponent(af.mood)}`;
        if (af.energy != null) url += `&energy=${af.energy}`;
        if (af.valence != null) url += `&valence=${af.valence}`;
        if (af.tempo != null) url += `&tempo=${af.tempo}`;
        if (af.danceability != null) url += `&danceability=${af.danceability}`;
        if (af.acousticness != null) url += `&acousticness=${af.acousticness}`;
        if (af.genre) url += `&genre=${encodeURIComponent(af.genre)}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(20000), // 20 second timeout
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      const images = data.images || [];

      if (images.length > 0) {
        // Use url (640x480) — same resolution for thumbnails and fullscreen
        const imageUrls = images.map(img => img.url || img.urlLarge);

        // Add all URLs to pool IMMEDIATELY so they are available for playback logic
        // We do this BEFORE preloading to prevent "empty pool" states during the download phase
        this.poolManager.addImages(songId, imageUrls);
        this._updateProviderStatus('loremflickr', true);

        // KICKSTART FIX: If this is the active song and we're currently showing nothing OR a procedural placeholder,
        // swap to the first real image as soon as it's preloaded (no need to wait for a beat).
        if (this._activeSongId == songId) {
          const current = this._currentOnsetImage;
          const isPlaceholder = current == null || (typeof current === 'string' && current.startsWith('data:'));
          if (isPlaceholder) {
            const peekUrl = this.poolManager.peekNextImage(songId);
            if (peekUrl) {
              this.poolManager._preloadImage(peekUrl).then(() => {
                if (this._activeSongId != songId) return;
                const stillCurrent = this._currentOnsetImage;
                const stillPlaceholder = stillCurrent == null || (typeof stillCurrent === 'string' && stillCurrent.startsWith('data:'));
                if (!stillPlaceholder) return;

                const readyUrl = this.poolManager.peekNextImage(songId);
                if (readyUrl && this.poolManager.isUrlReady(readyUrl)) {
                  const kickstartImage = this.poolManager.consumeNextImage(songId);
                  if (kickstartImage) {
                    this._currentOnsetImage = kickstartImage;
                    this._onsetGeneration++;
                    this._notifyListeners(kickstartImage);
                  }
                }
              }).catch(() => {
                // ignore preload errors
              });
            }
          }
        }

        // Priority preload: start downloading first few images in background
        // We do NOT await this, so initPool returns as soon as we have URLs
        const priorityCount = mode === 'thumbnail' ? 1 : 12;
        const priorityUrls = imageUrls.slice(0, priorityCount);
        this.poolManager._preloadPriorityBatch(priorityUrls, 4000).catch(err => {
             console.warn('[ImageGen] Preload warning:', err);
        });

        const sampleUrl = imageUrls[0] || '';
        const isS3Cached = sampleUrl.includes('/api/images/file') || sampleUrl.includes('amazonaws.com');
        const fetchType = isS3Cached ? 'S3/Cached' : (sampleUrl.includes('loremflickr') ? 'LoremFlickr' : 'Other');
        
        console.log(`[ImageGen] Fetched ${imageUrls.length} images for "${songContext.title}" (mode: ${mode}, source: ${data.source}) [Type: ${fetchType}]`);
        console.debug(`[ImageGen] Sample Image URL: ${sampleUrl}`);
      } else {
        console.warn(`[ImageGen] No images returned for "${songContext.title}"`);
      }
    } catch (error) {
      console.warn(`[ImageGen] API fetch failed for "${songContext.title}":`, error.message);
      this._updateProviderStatus('loremflickr', false, error.message);
      // Pool stays empty — UI will show loading overlay
    } finally {
      pool.loading = false;
      pool._loadPromise = null;
      this.lastFetchTime = Date.now();
    }
    })();

    await pool._loadPromise;
  }

  /**
   * Background refill when pool is running low.
   */
  async _backgroundRefill(songContext) {
    // Rate limit background refills
    if (Date.now() - this.lastFetchTime < this.minFetchInterval) return;

    // Don't refill if providers are down — pool stays empty, UI shows loading overlay
    if (!this.providerStatus.loremflickr.available && this.providerStatus.loremflickr.errorCount > 3) {
      return;
    }

    await this._fetchAndPopulatePool(songContext, songContext.audioFeatures, true);
  }

  /**
   * Update provider health status.
   */
  _updateProviderStatus(provider, available, errorMessage = null) {
    if (this.providerStatus[provider]) {
      this.providerStatus[provider].available = available;
      if (!available) {
        this.providerStatus[provider].lastError = errorMessage;
        this.providerStatus[provider].errorCount += 1;
      } else {
        this.providerStatus[provider].errorCount = 0;
        this.providerStatus[provider].lastError = null;
      }
    }
  }

  /**
   * Reset the orchestrator (e.g., on cleanup).
   */
  reset() {
    this.currentSongContext = null;
    this._songContexts.clear();
    this.poolManager.clearAll();
    this._currentOnsetImage = null;
    this._onsetRegistered = false;
    this._onsetGeneration = 0;
    this._activeSongId = null;
  }

  /**
   * Dispose resources.
   */
  dispose() {
    this.reset();
  }
}


// ============================================
// SINGLETON EXPORT
// ============================================

/** Global singleton instance of the MCP Image Orchestrator */
const imageGenerationService = new MCPImageOrchestrator();

export default imageGenerationService;
export { SongContextRAG, ProceduralGenerator, ImagePoolManager, MCPImageOrchestrator };
