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
    this.onsetCallbacks = new Map(); // Use Map with IDs for stable references
    this.glitchCallbacks = new Map();
    this.callbackIdCounter = 0;
  }

  /**
   * Initialize audio context and connect to audio element using captureStream
   */
  async initialize(audioElement) {
    if (this.isInitialized && this.audioElement === audioElement) {
      return;
    }

    if (this.isInitialized) {
      return;
    }

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.audioElement = audioElement;

      try {
        this.mediaSource = this.audioContext.createMediaElementSource(audioElement);
        
        this.onsetDetector = new OnsetDetector(this.audioContext, {
          threshold: 0.5,
          fftSize: 2048,
          hopSize: 256,
          minTimeBetweenOnsets: 60,
        });

        this.mediaSource.connect(this.onsetDetector.analyser);
        this.onsetDetector.analyser.connect(this.audioContext.destination);
        
      } catch (mediaElementError) {
        let stream = audioElement.captureStream ? audioElement.captureStream() : audioElement.mozCaptureStream();
        
        if (!stream) {
          throw new Error('Both createMediaElementSource and captureStream failed');
        }
        
        const audioTracks = stream.getAudioTracks();
        
        if (audioTracks.length === 0) {
          throw new Error('Captured stream has no audio tracks');
        }
        
        this.mediaSource = this.audioContext.createMediaStreamSource(stream);
        
        this.onsetDetector = new OnsetDetector(this.audioContext, {
          threshold: 0.5,
          fftSize: 2048,
          hopSize: 256,
          minTimeBetweenOnsets: 60,
        });

        this.mediaSource.connect(this.onsetDetector.analyser);
      }

      this.onsetDetector.onOnset((onset) => {
        this.onsetCallbacks.forEach((callback, id) => {
          try {
            callback(onset);
          } catch (e) {}
        });
      });
      
      this.onsetDetector.onGlitch((glitch) => {
        this.glitchCallbacks.forEach((callback, id) => {
          try {
            callback(glitch);
          } catch (e) {}
        });
      });

      this.onsetDetector.start();
      this.isInitialized = true;
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  /**
   * Register a callback for onset events - returns ID for cleanup
   */
  onOnset(callback) {
    const id = ++this.callbackIdCounter;
    this.onsetCallbacks.set(id, callback);
    return id;
  }

  offOnset(id) {
    if (typeof id === 'number') {
      this.onsetCallbacks.delete(id);
    }
  }

  onGlitch(callback) {
    const id = ++this.callbackIdCounter;
    this.glitchCallbacks.set(id, callback);
    return id;
  }

  offGlitch(id) {
    if (typeof id === 'number') {
      this.glitchCallbacks.delete(id);
    }
  }

  /**
   * Resume audio context (needed for autoplay policies)
   */
  resume() {
    if (this.audioContext) {
      // Always try to resume, not just when suspended
      if (this.audioContext.state !== 'running') {
        this.audioContext.resume();
      }
    }
    // Force restart onset detector loop in case it stopped
    if (this.onsetDetector) {
      this.onsetDetector.restart();
    }
  }

  /**
   * Reset onset detector state - call when switching songs
   */
  resetDetector() {
    if (this.onsetDetector) {
      this.onsetDetector.reset();
      this.onsetDetector.restart(); // Force loop to restart after reset
    }
  }

  /**
   * Set playback rate for the audio element
   */
  setPlaybackRate(rate) {
    if (this.audioElement) {
      const clampedRate = Math.max(0.1, Math.min(2.0, rate));
      this.audioElement.playbackRate = clampedRate;
      
      if (this.onsetDetector) {
        this.onsetDetector.minTimeBetweenOnsets = Math.round(60 / clampedRate);
        const baseThreshold = 0.8;
        this.onsetDetector.threshold = baseThreshold * Math.sqrt(clampedRate);
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
    this.onsetCallbacks.clear();
    this.glitchCallbacks.clear();
  }
}

// Export singleton instance
export default new GlobalAudioContext();
