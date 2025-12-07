/**
 * Onset Detection for Music Signals
 * Based on "A Tutorial on Onset Detection in Music Signals" 
 * Implements High-Frequency Content (HFC) method for percussive onset detection
 */

class OnsetDetector {
  constructor(audioContext, options = {}) {
    this.audioContext = audioContext;
    this.fftSize = options.fftSize || 2048;
    this.hopSize = options.hopSize || 512;
    this.threshold = options.threshold || 5.0; // Adjusted for byte-based calculation
    this.sampleRate = audioContext.sampleRate;
    
    // Create analyzer
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0;
    
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.previousSpectrum = new Uint8Array(this.analyser.frequencyBinCount);
    this.previousOnsetFunction = 0;
    
    // Onset detection state
    this.onsetCallbacks = [];
    this.isRunning = false;
    this.lastOnsetTime = 0;
    this.minTimeBetweenOnsets = 100; // ms, prevents double detection
  }
  
  /**
   * Connect audio source to onset detector
   */
  connect(sourceNode) {
    sourceNode.connect(this.analyser);
    return this;
  }
  
  /**
   * Add callback for onset events
   */
  onOnset(callback) {
    this.onsetCallbacks.push(callback);
    return this;
  }
  
  /**
   * High-Frequency Content (HFC) onset detection function
   * Good for detecting percussive sounds like drums
   * O(n) = sum(k * |X(k)|^2) where X(k) is the magnitude spectrum
   */
  calculateHFC(spectrum) {
    let hfc = 0;
    for (let k = 0; k < spectrum.length; k++) {
      const magnitude = spectrum[k] / 255.0; // Normalize 0-255 to 0-1
      hfc += k * magnitude * magnitude;
    }
    return hfc;
  }
  
  /**
   * Spectral Flux - measures change in spectrum
   * Good for general onset detection
   */
  calculateSpectralFlux(currentSpectrum, previousSpectrum) {
    let flux = 0;
    for (let k = 0; k < currentSpectrum.length; k++) {
      const current = currentSpectrum[k] / 255.0; // Normalize to 0-1
      const previous = previousSpectrum[k] / 255.0;
      const diff = current - previous;
      // Half-wave rectification (only positive differences)
      flux += Math.max(0, diff);
    }
    return flux;
  }
  
  /**
   * Peak picking with adaptive threshold
   */
  detectOnset(onsetFunction) {
    const now = Date.now();
    
    // Check if enough time has passed since last onset
    if (now - this.lastOnsetTime < this.minTimeBetweenOnsets) {
      return false;
    }
    
    // Debug: Log when we're close to threshold
    if (onsetFunction > this.threshold * 0.5) {
      console.log('📊 Close to threshold:', onsetFunction.toFixed(4), 'vs', this.threshold);
    }
    
    // Simple peak detection: current value is higher than previous and above threshold
    const isOnset = onsetFunction > this.previousOnsetFunction && 
                    onsetFunction > this.threshold;
    
    if (isOnset) {
      this.lastOnsetTime = now;
      return true;
    }
    
    return false;
  }
  
  /**
   * Process audio frame
   */
  processFrame() {
    if (!this.isRunning) return;
    
    // Get frequency data as bytes (0-255)
    this.analyser.getByteFrequencyData(this.frequencyData);
    
    // Debug: Log stats occasionally (every ~500 frames = ~8s at 60fps)
    if (Math.random() < 0.002) {
      const max = Math.max(...this.frequencyData);
      const avg = this.frequencyData.reduce((a, b) => a + b, 0) / this.frequencyData.length;
      const nonZero = this.frequencyData.filter(v => v > 0).length;
      console.log('🎵 Frequency data stats:', {
        max: max,
        avg: avg.toFixed(1),
        nonZero: nonZero,
        total: this.frequencyData.length,
        contextState: this.audioContext.state
      });
    }
    
    // Skip processing if we have no audio data (all zeros)
    const hasAudio = this.frequencyData.some(v => v > 0);
    if (!hasAudio) {
      requestAnimationFrame(() => this.processFrame());
      return;
    }
    
    // Calculate onset detection function (HFC for drums)
    const hfc = this.calculateHFC(this.frequencyData);
    
    // Alternative: Spectral Flux
    const flux = this.calculateSpectralFlux(this.frequencyData, this.previousSpectrum);
    
    // Combine both methods (NO huge divisors that kill the signal!)
    const onsetFunction = (0.7 * hfc / 1000) + (0.3 * flux / 10);
    
    // Debug: Log onset function value occasionally (reduced frequency)
    if (Math.random() < 0.005) {
      console.log('Onset function value:', onsetFunction.toFixed(4), 'threshold:', this.threshold);
    }
    
    // Detect onset
    if (this.detectOnset(onsetFunction)) {
      // Trigger all callbacks
      this.onsetCallbacks.forEach(cb => cb({
        time: this.audioContext.currentTime,
        strength: onsetFunction
      }));
    }
    
    // Store for next frame
    this.previousSpectrum.set(this.frequencyData);
    this.previousOnsetFunction = onsetFunction;
    
    // Schedule next frame
    requestAnimationFrame(() => this.processFrame());
  }
  
  /**
   * Start onset detection
   */
  start() {
    if (!this.isRunning) {
      console.log('🎬 OnsetDetector: Starting detection loop');
      this.isRunning = true;
      this.processFrame();
    }
    return this;
  }
  
  /**
   * Stop onset detection
   */
  stop() {
    this.isRunning = false;
    return this;
  }
  
  /**
   * Set detection threshold
   */
  setThreshold(threshold) {
    this.threshold = threshold;
    return this;
  }
  
  /**
   * Disconnect and cleanup
   */
  disconnect() {
    this.stop();
    this.analyser.disconnect();
    this.onsetCallbacks = [];
  }
}

export default OnsetDetector;
