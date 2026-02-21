/**
 * Global Audio Context for Onset Detection
 * To create a singleton (single shared instance) that manages audio analysis for the entire app.
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
    this.glitchCallbacks = [];
    // Track elements that have already been connected (can only call createMediaElementSource once per element EVER)
    this.connectedElements = new WeakSet();
    
    // Quantum Mode: StereoPanner for qubit-based 4-directional panning
    this.stereoPanner = null;
    this.quantumMode = false;
    this.quantumCallbacks = []; // Callbacks to notify UI of quantum state changes
  }

  /**
   * Initialize audio context and connect to audio element using captureStream
   */
  async initialize(audioElement) {
    // If already initialized with this exact element, just ensure detector is running
    if (this.isInitialized && this.audioElement === audioElement) {
      if (this.onsetDetector) {
        this.onsetDetector.restart();
      }
      return;
    }

    // If initialized with a different element, we must cleanup first
    // because createMediaElementSource can only be called once per element
    if (this.isInitialized && this.audioElement !== audioElement) {
      this.cleanup();
    }

    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.audioElement = audioElement;

      // Check if this element was already connected before (can only use createMediaElementSource once per element EVER)
      const elementAlreadyConnected = this.connectedElements.has(audioElement);
      let useMediaElementSource = !elementAlreadyConnected;

      // Try createMediaElementSource first (most reliable) - but only if element hasn't been connected before
      if (useMediaElementSource) {
        try {
          this.mediaSource = this.audioContext.createMediaElementSource(audioElement);
          // Mark this element as connected
          this.connectedElements.add(audioElement);
          
          // Create onset detector with kick-focused settings
          this.onsetDetector = new OnsetDetector(this.audioContext, {
            threshold: 0.3,       // General onset threshold (normalized 0-1)
            kickThreshold: 0.4,   // Kick detection threshold
            snareThreshold: 0.3,  // Snare/hi-hat threshold
            fftSize: 512,
            minTimeBetweenOnsets: 100,  // Slower detection (100ms between onsets)
          });

          // IMPORTANT: Connect to destination so audio plays!
          // Graph: mediaSource -> stereoPanner -> analyser -> destination
          this.stereoPanner = this.audioContext.createStereoPanner();
          this.stereoPanner.pan.value = 0; // Center by default
          this.mediaSource.connect(this.stereoPanner);
          this.stereoPanner.connect(this.onsetDetector.analyser);
          this.onsetDetector.analyser.connect(this.audioContext.destination);
          
        } catch (mediaElementError) {
          useMediaElementSource = false;
        }
      }
      
      // Use captureStream if createMediaElementSource failed or element was already connected
      if (!useMediaElementSource) {
        // Fallback to captureStream
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
          threshold: 0.3,       // General onset threshold (normalized 0-1)
          kickThreshold: 0.4,   // Kick detection threshold
          snareThreshold: 0.3,  // Snare/hi-hat threshold
          fftSize: 512,
          minTimeBetweenOnsets: 100,  // Slower detection (100ms between onsets)
        });

        // Connect stream (no need for destination with captureStream)
        // Graph: mediaSource -> stereoPanner -> analyser
        this.stereoPanner = this.audioContext.createStereoPanner();
        this.stereoPanner.pan.value = 0; // Center by default
        this.mediaSource.connect(this.stereoPanner);
        this.stereoPanner.connect(this.onsetDetector.analyser);
      }

      // Set up onset callback to trigger all registered callbacks
      this.onsetDetector.onOnset((onset) => {
        this.onsetCallbacks.forEach(callback => callback(onset));
      });
      
      // Set up glitch callback to trigger all registered glitch callbacks
      this.onsetDetector.onGlitch((glitch) => {
        this.glitchCallbacks.forEach(callback => callback(glitch));
      });

      this.onsetDetector.start();
      this.isInitialized = true;
    } catch (error) {
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
    }
  }

  /**
   * Unregister a callback
   */
  offOnset(callback) {
    this.onsetCallbacks = this.onsetCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Register a callback for glitch events (high-frequency transients)
   */
  onGlitch(callback) {
    if (!this.glitchCallbacks.includes(callback)) {
      this.glitchCallbacks.push(callback);
    }
  }

  /**
   * Unregister a glitch callback
   */
  offGlitch(callback) {
    this.glitchCallbacks = this.glitchCallbacks.filter(cb => cb !== callback);
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
   * Set playback rate - adjusts detection timing to match audio speed
   */
  setPlaybackRate(rate) {
    if (this.onsetDetector) {
      this.onsetDetector.setPlaybackRate(rate);
    }
  }

  /**
   * Quantum Mode: Uses qubit-inspired superposition for 4-directional stereo panning.
   * Instead of classical bits (0=left, 1=right), qubits collapse to one of 4 basis states:
   *   |00⟩ = Hard left   (-1.0)
   *   |01⟩ = Hard right  (+1.0)
   *   |10⟩ = Soft left   (-0.4)
   *   |11⟩ = Soft right  (+0.4)
   * Each transient hit triggers a "measurement" that collapses the qubit state.
   */

  /**
   * Enable/disable quantum mode
   */
  setQuantumMode(enabled) {
    this.quantumMode = enabled;
    if (!enabled) {
      // Reset panner to center when disabling
      if (this.stereoPanner && this.audioContext) {
        this.stereoPanner.pan.setTargetAtTime(0, this.audioContext.currentTime, 0.02);
      }
      // Notify UI that quantum state is reset
      this._notifyQuantumState(null);
    }
  }

  /**
   * Simulate qubit measurement - returns one of 4 quantum basis states
   * Uses quantum-inspired probability amplitudes where each state
   * has equal probability (|α|² = |β|² = 0.25 for each basis state)
   */
  measureQubit() {
    // Generate two "qubit" measurements (each 0 or 1 with equal probability)
    // This gives us 4 basis states: |00⟩, |01⟩, |10⟩, |11⟩
    const qubit1 = Math.random() < 0.5 ? 0 : 1;
    const qubit2 = Math.random() < 0.5 ? 0 : 1;
    
    const states = [
      { bits: '|00⟩', label: 'HARD LEFT',  pan: -1.0, direction: 'left' },
      { bits: '|01⟩', label: 'HARD RIGHT', pan:  1.0, direction: 'right' },
      { bits: '|10⟩', label: 'SOFT LEFT',  pan: -0.4, direction: 'soft-left' },
      { bits: '|11⟩', label: 'SOFT RIGHT', pan:  0.4, direction: 'soft-right' },
    ];
    
    return states[qubit1 * 2 + qubit2];
  }

  /**
   * Apply quantum state to audio on transient hit
   * Called from the onset callback when quantum mode is active
   */
  applyQuantumState(onset) {
    if (!this.quantumMode || !this.audioContext) return;
    
    const state = this.measureQubit();
    const now = this.audioContext.currentTime;
    
    // Apply stereo pan with fast but smooth transition
    if (this.stereoPanner) {
      this.stereoPanner.pan.cancelScheduledValues(now);
      this.stereoPanner.pan.setTargetAtTime(state.pan, now, 0.01);
    }
    
    // Notify UI of the collapsed quantum state
    this._notifyQuantumState(state);
  }

  /**
   * Register a callback for quantum state change events
   */
  onQuantumState(callback) {
    if (!this.quantumCallbacks.includes(callback)) {
      this.quantumCallbacks.push(callback);
    }
  }

  /**
   * Unregister a quantum state callback
   */
  offQuantumState(callback) {
    this.quantumCallbacks = this.quantumCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Notify all quantum state listeners
   */
  _notifyQuantumState(state) {
    this.quantumCallbacks.forEach(cb => cb(state));
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

    if (this.stereoPanner) {
      this.stereoPanner.disconnect();
      this.stereoPanner = null;
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
    this.glitchCallbacks = [];
    this.quantumCallbacks = [];
    this.quantumMode = false;
  }
}

// Export singleton instance
export default new GlobalAudioContext();