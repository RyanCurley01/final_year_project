/**
 * Onset Detection for Music Signals
 * Based on "A Tutorial on Onset Detection in Music Signals" 
 * Implements High-Frequency Content (HFC) method for percussive onset detection
 * Also includes tracker-style glitch detection (tape stop, stutters, gates)
 */

class OnsetDetector {
  constructor(audioContext, options = {}) {
    this.audioContext = audioContext;

    // 1. Number of audio samples to analyze at once - MUST be set before creating analyser
    this.fftSize = options.fftSize || 512;
    this.hopSize = options.hopSize || 128;
    this.threshold = options.threshold || 1; // Very low for fast detection
    this.glitchThreshold = options.glitchThreshold || 0.6; // Threshold for glitch detection
    this.sampleRate = audioContext.sampleRate;

    // 2. Create analyzer to break down audio into different frequencies
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0;

    /* 3. analyzer divides the sound into 256 frequency "buckets" (bins). Each bucket represents a frequency range:
          Bin 0 = very low bass (sub-bass)
          Bin 128 = midrange frequencies
          Bin 256 = high treble */
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.previousSpectrum = new Uint8Array(this.analyser.frequencyBinCount);
    this.previousOnsetFunction = 0;
    this.sampleRate = audioContext.sampleRate;

    // To store glitch effect detection patterns
    this.spectralCentroidHistory = []; // Track pitch/centroid changes for tape stop
    this.energyHistory = []; // Track energy for gates/stutters
    this.historySize = 20; // Longer history for more accurate detection

    this.lastGlitchTime = 0;
    
    // Onset detection state
    this.onsetCallbacks = [];
    this.glitchCallbacks = [];
    this.isRunning = false;
    this.lastOnsetTime = 0;
    this.minTimeBetweenOnsets = options.minTimeBetweenOnsets || 30; // Fast response
    this.minTimeBetweenGlitches = options.minTimeBetweenGlitches || 500; // Much longer gap - glitches are rare events
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
   * Add callback for glitch events (high-frequency transients)
   */
  onGlitch(callback) {
    this.glitchCallbacks.push(callback);
    return this;
  }
  
  /**
   * Remove glitch callback
   */
  offGlitch(callback) {
    this.glitchCallbacks = this.glitchCallbacks.filter(cb => cb !== callback);
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
   * Calculate spectral centroid - the "center of mass" of the spectrum
   * Indicates the perceived pitch/brightness of the sound
   * Used to detect tape stop effects (rapid pitch drop)
   */
  calculateSpectralCentroid(spectrum) {
    let weightedSum = 0;
    let magnitudeSum = 0;
    
    for (let k = 0; k < spectrum.length; k++) {
      const magnitude = spectrum[k] / 255.0;
      weightedSum += k * magnitude;
      magnitudeSum += magnitude;
    }
    
    return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  }
  
  /**
   * Calculate total energy of the signal
   * Used to detect gates, chops, and stutters
   */
  calculateEnergy(spectrum) {
    let energy = 0;
    for (let k = 0; k < spectrum.length; k++) {
      const magnitude = spectrum[k] / 255.0;
      energy += magnitude * magnitude;
    }
    return energy;
  }
  
  /**
   * Detect tape stop effect - rapid decrease in spectral centroid (pitch dropping)
   * Like when a record/tape is slowing down - VERY strict detection
   */
  detectTapeStop() {
    if (this.spectralCentroidHistory.length < 10) return false;
    
    // Get recent centroid values
    const recent = this.spectralCentroidHistory.slice(-10);
    
    // Tape stop requires CONTINUOUS pitch drop over many frames
    // Normal melodies go up and down, tape stop only goes down
    let consecutiveDrops = 0;
    let totalDrop = 0;
    let maxConsecutiveDrops = 0;
    
    for (let i = 1; i < recent.length; i++) {
      const drop = recent[i - 1] - recent[i];
      if (drop > 0.5) { // Pitch is dropping
        consecutiveDrops++;
        totalDrop += drop;
        maxConsecutiveDrops = Math.max(maxConsecutiveDrops, consecutiveDrops);
      } else {
        consecutiveDrops = 0; // Reset if pitch goes up or stays same
      }
    }
    
    return maxConsecutiveDrops >= 12 && totalDrop > 30;
  }
  
  /**
   * Detect stutter/retrigger effect - extremely rapid repeated transients
   * Only triggers on abnormally fast retriggering (faster than any normal rhythm)
   */
  detectStutter() {
    if (this.energyHistory.length < this.historySize) return false;
    
    const recent = this.energyHistory.slice(-this.historySize);
    
    // Look for EXTREME oscillation - energy must swing dramatically every single frame
    // This is faster than any normal kick pattern
    let extremeOscillations = 0;
    let previousDirection = 0;
    
    for (let i = 1; i < recent.length; i++) {
      const diff = recent[i] - recent[i - 1];
      // Require LARGE energy swings (not just small variations)
      const currentDirection = diff > 0.25 ? 1 : (diff < -0.25 ? -1 : 0);
      
      // Count rapid direction changes with significant magnitude
      if (currentDirection !== 0 && currentDirection !== previousDirection && previousDirection !== 0) {
        extremeOscillations++;
      }
      if (currentDirection !== 0) {
        previousDirection = currentDirection;
      }
    }
    
    return extremeOscillations >= 12;
  }
  
  /**
   * Detect gate/chop effect - multiple rapid silence gaps in quick succession
   * Only triggers on clearly artificial gating patterns
   */
  detectGate() {
    if (this.energyHistory.length < 10) return false;
    
    const recent = this.energyHistory.slice(-10);
    
    // Look for multiple VERY short silence gaps (near-zero energy)
    // This pattern is clearly artificial, not natural rhythm
    let gateCount = 0;
    let nearSilenceCount = 0;
    
    for (let i = 2; i < recent.length; i++) {
      const beforeGate = recent[i - 2] > 0.2;
      const gatePoint = recent[i - 1] < 0.02; // Almost complete silence
      const afterGate = recent[i] > 0.2;
      
      if (beforeGate && gatePoint && afterGate) {
        gateCount++;
      }
      
      // Count near-silence frames
      if (recent[i] < 0.02) {
        nearSilenceCount++;
      }
    }
    
    return gateCount >= 9 && nearSilenceCount >= 9;
  }
  
  /**
   * Detect tracker-style glitch effects (Aphex Twin style)
   * Looks for tape stop, stutters, and gates
   */
  detectTrackerGlitch() {
    const now = Date.now();
    
    // Check if enough time has passed since last glitch
    if (now - this.lastGlitchTime < this.minTimeBetweenGlitches) {
      return { detected: false, type: null };
    }
    
    // Check for each glitch type
    if (this.detectTapeStop()) {
      this.lastGlitchTime = now;
      return { detected: true, type: 'tapestop' };
    }
    
    if (this.detectStutter()) {
      this.lastGlitchTime = now;
      return { detected: true, type: 'stutter' };
    }
    
    if (this.detectGate()) {
      this.lastGlitchTime = now;
      return { detected: true, type: 'gate' };
    }
    
    return { detected: false, type: null };
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
    
    // Calculate tracker glitch detection metrics
    const spectralCentroid = this.calculateSpectralCentroid(this.frequencyData);
    const energy = this.calculateEnergy(this.frequencyData);
    
    // Update history for glitch detection
    this.spectralCentroidHistory.push(spectralCentroid);
    this.energyHistory.push(energy);
    
    // Sliding window of the most recent 20 frames to remove the first old frame
    if (this.spectralCentroidHistory.length > this.historySize) {
      this.spectralCentroidHistory.shift();
    }
    if (this.energyHistory.length > this.historySize) {
      this.energyHistory.shift();
    }
    
    // Combine both methods
    const onsetFunction = (0.7 * hfc / 1000) + (0.3 * flux / 10);
    
    // Detect onset (drum hits)
    if (this.detectOnset(onsetFunction)) {
      /* loop through all registered callback functions
         cb(...) - Call each callback with:
         time: Exact moment the drum hit occurred (in seconds)
         strength: How strong the drum hit was */
      this.onsetCallbacks.forEach(cb => cb({
        time: this.audioContext.currentTime,
        strength: onsetFunction
      }));
    }
    
    // Detect tracker-style glitch effects (tape stop, stutter, gate)
    const glitchResult = this.detectTrackerGlitch();
    if (glitchResult.detected) {
      /* Loop through all glitch callback functions
         cb(...) - Call each callback with:
         time: Exact moment the glitch occurred (in seconds)
         type: Type of glitch detected (tapestop, stutter, gate)
         spectralCentroid: Current spectral centroid value
         energy: Current energy value */
      this.glitchCallbacks.forEach(cb => cb({
        time: this.audioContext.currentTime,
        type: glitchResult.type,
        spectralCentroid,
        energy
      }));
    }
    
    // Store current frame data for comparison in the NEXT frame
    // Copies all 256 frequency bin values efficiently
    this.previousSpectrum.set(this.frequencyData);
    this.previousOnsetFunction = onsetFunction;
    
    // To call processFrame again on the next animation frame
    requestAnimationFrame(() => this.processFrame());
  }
  
  /**
   * Start onset detection
   */
  start() {
    if (!this.isRunning) {
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
   * Set glitch detection threshold
   */
  setGlitchThreshold(threshold) {
    this.glitchThreshold = threshold;
    return this;
  }
  
  /**
   * Disconnect and cleanup
   */
  disconnect() {
    this.stop();
    this.analyser.disconnect();
    this.onsetCallbacks = [];
    this.glitchCallbacks = [];
    this.spectralCentroidHistory = [];
    this.energyHistory = [];
  }
}

export default OnsetDetector;