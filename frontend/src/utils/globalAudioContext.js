/**
 * Global Audio Context for Onset Detection
 * Provides a single AudioContext instance that connects to the main audio player
 */

import OnsetDetector from './onsetDetection';

class GlobalAudioContext {
  constructor() {
    this.audioContext = null;
    this.onsetDetector = null;
    this.audioElement = null;
    this.mediaSource = null;
    this.isInitialized = false;
    this.onsetCallbacks = [];
  }

  /**
   * Initialize audio context and connect to audio element using captureStream
   */
  async initialize(audioElement) {
    // If already initialized with this element, skip
    if (this.isInitialized && this.audioElement === audioElement) {
      console.log('⏭️ Already initialized with this audio element, skipping');
      return;
    }

    // CRITICAL: Cannot call createMediaElementSource twice on same element
    // If we have ANY initialization, we must reuse it
    if (this.isInitialized) {
      console.log('⚠️ Already initialized with different element - cannot reinitialize');
      return;
    }

    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.audioElement = audioElement;

      // Try createMediaElementSource first (most reliable)
      try {
        this.mediaSource = this.audioContext.createMediaElementSource(audioElement);
        console.log('✅ Using createMediaElementSource');
        
        // Create onset detector with drum-optimized settings
        this.onsetDetector = new OnsetDetector(this.audioContext, {
          threshold: 0.8,  // Lowered for better drum detection
          fftSize: 2048,
          hopSize: 256,
          minTimeBetweenOnsets: 60,
        });

        // IMPORTANT: Connect to destination so audio plays!
        this.mediaSource.connect(this.onsetDetector.analyser);
        this.onsetDetector.analyser.connect(this.audioContext.destination);
        
      } catch (mediaElementError) {
        console.warn('createMediaElementSource failed, trying captureStream:', mediaElementError.message);
        
        // Fallback to captureStream
        let stream = audioElement.captureStream ? audioElement.captureStream() : audioElement.mozCaptureStream();
        
        if (!stream) {
          throw new Error('Both createMediaElementSource and captureStream failed');
        }
        
        const audioTracks = stream.getAudioTracks();
        console.log('📡 Captured stream audio tracks:', audioTracks.length);
        
        if (audioTracks.length === 0) {
          throw new Error('Captured stream has no audio tracks');
        }
        
        this.mediaSource = this.audioContext.createMediaStreamSource(stream);
        
        this.onsetDetector = new OnsetDetector(this.audioContext, {
          threshold: 0.8,  // Lowered for better drum detection
          fftSize: 2048,
          hopSize: 256,
          minTimeBetweenOnsets: 60,
        });

        // Connect stream (no need for destination with captureStream)
        this.mediaSource.connect(this.onsetDetector.analyser);
      }

      // Set up onset callback to trigger all registered callbacks
      this.onsetDetector.onOnset((onset) => {
        console.log('🥁 Kick drum detected! Callbacks:', this.onsetCallbacks.length, onset);
        this.onsetCallbacks.forEach(callback => {
          console.log('Calling onset callback...');
          callback(onset);
        });
      });

      this.onsetDetector.start();
      this.isInitialized = true;

      console.log('✅ Global audio context initialized');
      console.log('   - AudioContext state:', this.audioContext.state);
      console.log('   - Sample rate:', this.audioContext.sampleRate);
      console.log('   - FFT size:', this.onsetDetector.analyser.fftSize);
      console.log('   - Callbacks registered:', this.onsetCallbacks.length);
    } catch (error) {
      console.error('Failed to initialize global audio context:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Register a callback for onset events
   */
  onOnset(callback) {
    if (!this.onsetCallbacks.includes(callback)) {
      this.onsetCallbacks.push(callback);
      console.log('📝 Registered onset callback, total callbacks:', this.onsetCallbacks.length);
    }
  }

  /**
   * Unregister a callback
   */
  offOnset(callback) {
    this.onsetCallbacks = this.onsetCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Resume audio context (needed for autoplay policies)
   */
  resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  /**
   * Set playback rate for the audio element
   */
  setPlaybackRate(rate) {
    if (this.audioElement) {
      const clampedRate = Math.max(0.1, Math.min(2.0, rate));
      this.audioElement.playbackRate = clampedRate;
      console.log('🎚️ Set audio playback rate to:', clampedRate);
      
      // Adjust onset detector sensitivity based on playback rate
      // At slower speeds: increase min time between onsets (drums are further apart)
      // At faster speeds: decrease min time (drums are closer together)
      if (this.onsetDetector) {
        // Base min time is 60ms at 1x speed
        // At 0.1x: 60 / 0.1 = 600ms between detections
        // At 2.0x: 60 / 2.0 = 30ms between detections
        this.onsetDetector.minTimeBetweenOnsets = Math.round(60 / clampedRate);
        
        // Also adjust threshold - at slower speeds, transients are stretched and weaker
        // Lower threshold to compensate
        const baseThreshold = 0.8;
        this.onsetDetector.threshold = baseThreshold * Math.sqrt(clampedRate);
        
        console.log('🥁 Adjusted onset detection for', clampedRate + 'x:', {
          minTime: this.onsetDetector.minTimeBetweenOnsets + 'ms',
          threshold: this.onsetDetector.threshold.toFixed(3)
        });
      }
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.onsetDetector) {
      this.onsetDetector.stop();
      this.onsetDetector.disconnect();
      this.onsetDetector = null;
    }

    if (this.mediaSource) {
      this.mediaSource.disconnect();
      this.mediaSource = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.audioElement = null;
    this.isInitialized = false;
    this.onsetCallbacks = [];
  }
}

// Export singleton instance
export default new GlobalAudioContext();
