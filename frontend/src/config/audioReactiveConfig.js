/**
 * Test Configuration for Audio-Reactive System
 * Adjust these parameters to fine-tune the onset detection and sky segmentation
 */

export const audioReactiveConfig = {
  // Onset Detection Settings
  onset: {
    // FFT size - larger = better frequency resolution, but slower
    // Must be power of 2: 512, 1024, 2048, 4096
    fftSize: 2048,
    
    // Detection threshold (0-1)
    // Lower = more sensitive (more false positives)
    // Higher = less sensitive (might miss some hits)
    // Recommended: 0.2-0.4 for music with clear drums
    threshold: 0.25,
    
    // Minimum time between detected onsets (milliseconds)
    // Prevents double-detection of same drum hit
    minTimeBetweenOnsets: 100,
    
    // Hop size for analysis
    // Smaller = more frequent analysis, but more CPU intensive
    hopSize: 512,
    
    // Weight for HFC vs Spectral Flux
    // hfcWeight + fluxWeight should equal 1.0
    hfcWeight: 0.7,      // Good for percussive sounds
    fluxWeight: 0.3,     // Good for general onsets
  },
  
  // Sky Segmentation Settings
  skySegmentation: {
    // How much of the detected color to blend with original (0-1)
    // 0 = no effect, 1 = full color replacement
    blendFactor: 0.5,
    
    // Sky detection threshold (0-1)
    // Lower = more pixels classified as sky
    // Higher = fewer pixels classified as sky
    threshold: 0.6,
    
    // Enable morphological operations to clean up mask
    useMorphology: false,
  },
  
  // Visual Effects Settings
  effects: {
    // Enable smooth color transitions
    smoothTransitions: true,
    
    // Transition duration (milliseconds)
    transitionDuration: 200,
    
    // Color palette (RGB arrays)
    colorPalette: [
      [135, 206, 235], // Sky blue
      [255, 105, 180], // Hot pink
      [138, 43, 226],  // Blue violet
      [255, 215, 0],   // Gold
      [0, 255, 255],   // Cyan
      [255, 99, 71],   // Tomato red
      [50, 205, 50],   // Lime green
      [255, 140, 0],   // Dark orange
      [147, 112, 219], // Medium purple
      [64, 224, 208],  // Turquoise
    ],
    
    // Randomize colors or cycle through palette
    randomColors: true,
  },
  
  // Performance Settings
  performance: {
    // Target frame rate for video processing
    // Lower = less CPU usage but choppier visuals
    targetFPS: 30,
    
    // Process every Nth frame (1 = every frame, 2 = every other frame)
    frameSkip: 1,
    
    // Use OffscreenCanvas if available (better performance)
    useOffscreenCanvas: true,
  },
  
  // Debug Settings
  debug: {
    // Log onset detections to console
    logOnsets: false,
    
    // Show sky mask overlay
    showMask: false,
    
    // Log performance metrics
    logPerformance: false,
  },
};

/**
 * Preset configurations for different use cases
 */
export const presets = {
  // Optimized for electronic dance music
  edm: {
    onset: {
      fftSize: 2048,
      threshold: 0.2,
      minTimeBetweenOnsets: 80,
      hfcWeight: 0.8,
      fluxWeight: 0.2,
    },
  },
  
  // Optimized for rock/metal with heavy drums
  rock: {
    onset: {
      fftSize: 2048,
      threshold: 0.3,
      minTimeBetweenOnsets: 100,
      hfcWeight: 0.7,
      fluxWeight: 0.3,
    },
  },
  
  // Optimized for acoustic/jazz with subtle drums
  acoustic: {
    onset: {
      fftSize: 4096,
      threshold: 0.15,
      minTimeBetweenOnsets: 150,
      hfcWeight: 0.5,
      fluxWeight: 0.5,
    },
  },
  
  // Optimized for IDM (Intelligent Dance Music) - Aphex Twin, Squarepusher
  idm: {
    onset: {
      fftSize: 2048,
      threshold: 3.5,      // Balanced for kick drums and complex rhythms
      minTimeBetweenOnsets: 60,  // Fast for rapid-fire beats
      hopSize: 256,        // Smaller hop for complex patterns
      hfcWeight: 0.1,      // Low weight for high-freq
      fluxWeight: 0.15,    // Medium weight for general onsets
    },
    effects: {
      smoothTransitions: false,  // Glitchy, immediate changes
      transitionDuration: 50,    // Very fast transitions
      randomColors: true,
    },
  },
  
  // Low CPU usage for mobile devices
  lowPerformance: {
    performance: {
      targetFPS: 15,
      frameSkip: 2,
    },
    skySegmentation: {
      threshold: 0.7, // Less aggressive detection
    },
  },
  
  // Maximum quality for desktop
  highPerformance: {
    onset: {
      fftSize: 4096,
      hopSize: 256,
    },
    performance: {
      targetFPS: 60,
      frameSkip: 1,
    },
  },
};

export default audioReactiveConfig;
