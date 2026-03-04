/**
 * Image Generation Service
 * 
 * RAG-Enhanced AI Image Pool Manager for onset-reactive visuals.
 * Uses song metadata (title, genre, audio features) to construct contextually
 * relevant prompts, then retrieves pools of AI-generated images from Lexica.art
 * via the audio_service backend proxy (no CORS issues).
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
    this.preloadedImages = new Map(); // url → HTMLImageElement (for instant display)
    this.maxPoolSize = 50;
    this.refillThreshold = 5; // Refill when pool drops below this
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
    for (const url of imageUrls) {
      if (!pool.images.includes(url)) {
        pool.images.push(url);
        // Pre-load image for instant display
        this._preloadImage(url);
      }
    }
    // Cap pool size
    if (pool.images.length > this.maxPoolSize) {
      pool.images = pool.images.slice(-this.maxPoolSize);
    }
  }

  /**
   * Get the next image from the pool (cyclic).
   */
  getNextImage(songId) {
    const pool = this.getPool(songId);
    if (pool.images.length === 0) return null;

    const image = pool.images[pool.index % pool.images.length];
    pool.index = (pool.index + 1) % pool.images.length;
    return image;
  }

  /**
   * Check if pool needs refilling.
   */
  needsRefill(songId) {
    const pool = this.getPool(songId);
    const remaining = pool.images.length - (pool.index % Math.max(pool.images.length, 1));
    return remaining < this.refillThreshold && !pool.loading;
  }

  /**
   * Pre-load an image for instant display.
   */
  _preloadImage(url) {
    if (this.preloadedImages.has(url)) return;
    if (url.startsWith('data:')) return; // Don't preload data URLs

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    this.preloadedImages.set(url, img);

    // Limit preload cache size
    if (this.preloadedImages.size > 100) {
      const firstKey = this.preloadedImages.keys().next().value;
      this.preloadedImages.delete(firstKey);
    }
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
 * - Provider chain: Lexica API → Procedural fallback with graceful degradation
 */
class MCPImageOrchestrator {
  constructor() {
    this.rag = new SongContextRAG();
    this.poolManager = new ImagePoolManager();
    this.proceduralGenerator = new ProceduralGenerator();

    // MCP context state
    this.currentSongContext = null;
    this.providerStatus = {
      lexica: { available: true, lastError: null, errorCount: 0 },
      picsum: { available: true, lastError: null, errorCount: 0 },
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

    // Singleton onset registration: only one component drives onsets
    this._onsetRegistered = false;
  }

  /**
   * Try to become the primary onset driver. Returns true if successful.
   * Only one component at a time should register the onset callback.
   */
  claimOnsetPrimary() {
    if (this._onsetRegistered) return false;
    this._onsetRegistered = true;
    return true;
  }

  /**
   * Release onset primary status.
   */
  releaseOnsetPrimary() {
    this._onsetRegistered = false;
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
    const newImage = this.getNextImage(onsetData);
    if (newImage && newImage !== this._currentOnsetImage) {
      this._currentOnsetImage = newImage;
      this._onsetGeneration++;
      this._notifyListeners(newImage);
    }
    return newImage;
  }

  /**
   * Notify all image change listeners.
   */
  _notifyListeners(image) {
    for (const listener of this._onsetImageListeners) {
      try {
        listener(image, this._onsetGeneration);
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
   */
  async initializeSongContext(songContext) {
    this.currentSongContext = songContext;
    const songId = songContext.id || songContext.title;

    // Check if we already have a pool for this song
    const pool = this.poolManager.getPool(songId);

    // If pool is currently loading (another instance started the fetch), wait for it
    if (pool.loading && pool._loadPromise) {
      await pool._loadPromise;
    }

    // Pool already populated — nothing to fetch
    if (pool.images.length > 0) {
      return;
    }

    // Fetch audio features for this song from the DB cache
    let audioFeatures = songContext.audioFeatures || null;
    if (!audioFeatures && songContext.id) {
      audioFeatures = await this.getAudioFeaturesForSong(songContext.id);
    }

    // Store features in context for later use
    this.currentSongContext.audioFeatures = audioFeatures;

    // Populate the pool with mood-aware images (does NOT touch shared image state)
    await this._fetchAndPopulatePool(songContext, audioFeatures);
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
   * Activate a song for onset-driven playback.
   * Sets the shared image state and notifies all subscribers.
   * Should ONLY be called by the active/playing song's component.
   * @param {string|number} songId
   */
  activateForPlayback(songId) {
    const pool = this.poolManager.getPool(songId);
    if (pool.images.length > 0) {
      // Use current shared image if it belongs to this pool, otherwise first image
      if (this._currentOnsetImage && pool.images.includes(this._currentOnsetImage)) {
        // Already showing an image from this pool — notify subscribers
        this._notifyListeners(this._currentOnsetImage);
      } else {
        // Set to this song's first image
        pool.index = 0;
        const initialImage = pool.images[0];
        if (initialImage) {
          this._currentOnsetImage = initialImage;
          this._onsetGeneration++;
          this._notifyListeners(initialImage);
        }
      }
    }
  }

  /**
   * MCP Tool: Get next image for an onset event.
   * Called by the onset detection system.
   * @param {Object} onsetData - { time, strength, type, lfc, hfc, flux, energy, spectralCentroid }
   * @returns {string} Image URL or data URL
   */
  getNextImage(onsetData = {}) {
    if (!this.currentSongContext) {
      return this.proceduralGenerator.generate(onsetData);
    }

    const songId = this.currentSongContext.id || this.currentSongContext.title;

    // Try API-sourced image from pool
    const poolImage = this.poolManager.getNextImage(songId);

    // Check if pool needs refill (background fetch)
    if (this.poolManager.needsRefill(songId)) {
      this._backgroundRefill(this.currentSongContext);
    }

    if (poolImage) {
      return poolImage;
    }

    // Fallback: procedural generation
    return this.proceduralGenerator.generate(onsetData);
  }

  /**
   * Get a procedural image (always instant, for initial display).
   */
  getProceduralImage(params = {}) {
    return this.proceduralGenerator.generate(params);
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
   */
  async _fetchAndPopulatePool(songContext, audioFeatures = null) {
    const songId = songContext.id || songContext.title;
    const pool = this.poolManager.getPool(songId);

    if (pool.loading) return;
    pool.loading = true;

    // Store the load promise so other instances can await it
    pool._loadPromise = (async () => {
    try {
      const apiBaseUrl = envConfig.getApiBaseUrl();
      const encodedTitle = encodeURIComponent(songContext.title || 'electronic music');

      // Build URL with audio feature params for mood-aware prompts
      let url = `${apiBaseUrl}/api/images/pool?song_title=${encodedTitle}&song_id=${songContext.id || 0}&count=30`;

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
        // Prefer urlLarge (full resolution 1024px) for crisp fullscreen display
        const imageUrls = images.map(img => img.urlLarge || img.url);
        this.poolManager.addImages(songId, imageUrls);
        this._updateProviderStatus('lexica', true);
        console.log(`[ImageGen] Fetched ${imageUrls.length} images for "${songContext.title}" (source: ${data.source}, mood: ${data.mood || 'N/A'})`);
      } else {
        console.warn(`[ImageGen] No images returned for "${songContext.title}"`);
      }
    } catch (error) {
      console.warn(`[ImageGen] API fetch failed for "${songContext.title}":`, error.message);
      this._updateProviderStatus('lexica', false, error.message);

      // Generate procedural fallback images and add to pool
      const proceduralImages = [];
      for (let i = 0; i < 15; i++) {
        proceduralImages.push(this.proceduralGenerator.generate({
          energy: Math.random(),
          lfc: Math.random(),
          hfc: Math.random(),
          spectralCentroid: Math.random(),
          type: ['kick', 'snare', 'unknown'][Math.floor(Math.random() * 3)],
        }));
      }
      this.poolManager.addImages(songId, proceduralImages);
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

    // Don't refill if providers are down
    if (!this.providerStatus.lexica.available && this.providerStatus.lexica.errorCount > 3) {
      // Just add more procedural images
      const songId = songContext.id || songContext.title;
      const proceduralImages = [];
      for (let i = 0; i < 10; i++) {
        proceduralImages.push(this.proceduralGenerator.generate({
          energy: Math.random(),
          lfc: Math.random(),
          hfc: Math.random(),
          spectralCentroid: Math.random(),
        }));
      }
      this.poolManager.addImages(songId, proceduralImages);
      return;
    }

    await this._fetchAndPopulatePool(songContext, songContext.audioFeatures);
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
    this.poolManager.clearAll();
    this._currentOnsetImage = null;
    this._onsetRegistered = false;
    this._onsetGeneration = 0;
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
