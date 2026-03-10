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
    this.threshold = options.threshold || 0.5;  // For general onset (normalized values ~0-1)
    this.glitchThreshold = options.glitchThreshold || 0.9; // Threshold for glitch detection
    this.sampleRate = audioContext.sampleRate;
    this.playbackRate = options.playbackRate || 1.0; // Playback speed multiplier

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
    this.historySize = 20 // Longer history for more accurate detection

    this.lastGlitchTime = 0;
    
    // Onset detection state
    this.onsetCallbacks = [];      // General onset with type field ('kick', 'snare', 'unknown')
    this.glitchCallbacks = [];
    this.isRunning = false;
    this.lastOnsetTime = 0;
    this.baseMinTimeBetweenOnsets = options.minTimeBetweenOnsets || 100; // Base time between detections (ms)
    this.minTimeBetweenOnsets = this.baseMinTimeBetweenOnsets; // Adjusted by playback rate
    this.minTimeBetweenGlitches = options.minTimeBetweenGlitches || 500; // Much longer gap - glitches are rare events
    
    // Previous values for peak detection
    this.previousKickScore = 0;
    this.previousSnareScore = 0;
    
    // Thresholds for drum type classification
    this.kickThreshold = options.kickThreshold || 0.5;
    this.snareThreshold = options.snareThreshold || 0.9;
  }
  
  /**
   * Set playback rate - adjusts detection timing
   * Slower playback = slower detection, faster playback = faster detection
   */
  setPlaybackRate(rate) {
    this.playbackRate = rate || 1.0;
    // Adjust minTimeBetweenOnsets based on playback rate
    // At 0.5x speed, wait 2x longer between detections
    // At 2.0x speed, wait 0.5x as long
    this.minTimeBetweenOnsets = this.baseMinTimeBetweenOnsets / this.playbackRate;
    return this;
  }
  
  /**
   * Connect audio source to onset detector
   */
  connect(sourceNode) {
    sourceNode.connect(this.analyser);
    return this;
  }
  
  /**
   * Add callback for onset events (includes type: 'kick', 'snare', or 'unknown')
   */
  onOnset(callback) {
    this.onsetCallbacks.push(callback);
    return this;
  }
  
  /**
   * Remove onset callback
   */
  offOnset(callback) {
    this.onsetCallbacks = this.onsetCallbacks.filter(cb => cb !== callback);
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
   * Low-Frequency Content (LFC) - Modified HFC for KICK detection
   * Weights LOW frequencies more heavily (kicks are in 40-150Hz range)
   * Bins 0-20 contain most kick drum energy
   * O(n) = sum((maxBin - k) * |X(k)|^2) - inverted weighting
   */
  calculateLFC(spectrum) {
    let lfc = 0;
    const kickBinEnd = 25; // Focus on bins 0-25 (~0-2000Hz at 44.1kHz)
    
    for (let k = 0; k < kickBinEnd; k++) {
      const magnitude = spectrum[k] / 255.0; // Normalize 0-255 to 0-1
      // Weight low frequencies MORE (inverse of HFC)
      // Bin 0 gets weight 25, bin 24 gets weight 1
      const weight = kickBinEnd - k;
      lfc += weight * magnitude * magnitude;
    }
    return lfc;
  }
  
  /**
   * High-Frequency Content (HFC) - for snare/hi-hat detection (kept for reference)
   * Good for detecting high-frequency percussive sounds
   */
  calculateHFC(spectrum) {
    let hfc = 0;
    for (let k = 0; k < spectrum.length; k++) {
      const magnitude = spectrum[k] / 255.0;
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
    
    // ============ CALCULATE ALL DETECTION FUNCTIONS ============
    
    // 1. LFC (Low-Frequency Content) - for KICK detection
    const lfc = this.calculateLFC(this.frequencyData);
    
    // 2. HFC (High-Frequency Content) - for SNARE/HI-HAT detection  
    const hfc = this.calculateHFC(this.frequencyData);
    
    // 3. Spectral Flux - measures CHANGE in spectrum (good for any transient)
    const flux = this.calculateSpectralFlux(this.frequencyData, this.previousSpectrum);
    
    // 4. Spectral Centroid - "brightness" of sound (used for glitch detection)
    const spectralCentroid = this.calculateSpectralCentroid(this.frequencyData);
    
    // 5. Energy - total signal power (used for glitch detection)
    const energy = this.calculateEnergy(this.frequencyData);
    
    // ============ UPDATE HISTORY FOR GLITCH DETECTION ============
    this.spectralCentroidHistory.push(spectralCentroid);
    this.energyHistory.push(energy);
    
    // Sliding window - keep only recent frames
    if (this.spectralCentroidHistory.length > this.historySize) {
      this.spectralCentroidHistory.shift();
    }
    if (this.energyHistory.length > this.historySize) {
      this.energyHistory.shift();
    }
    
    // ============ NORMALIZE VALUES ============
    const normalizedLFC = lfc / 500;
    const normalizedHFC = hfc / 10000;
    const normalizedFlux = flux / 10;
    const now = Date.now();
    
    // ============ CLASSIFY DRUM TYPE ============
    // Calculate scores to determine if this is a kick or snare
    const kickScore = (0.7 * normalizedLFC) + (0.3 * normalizedFlux);
    const snareScore = (0.6 * normalizedHFC) + (0.4 * normalizedFlux);
    
    // Determine drum type based on which score is higher and above threshold
    const isKick = kickScore > this.previousKickScore && kickScore > this.kickThreshold;
    const isSnare = snareScore > this.previousSnareScore && snareScore > this.snareThreshold;
    
    // ============ GENERAL ONSET (ALL FUNCTIONS COMBINED) ============
    // Weighted combination of all detection methods
    const onsetFunction = (0.4 * normalizedLFC) + (0.3 * normalizedHFC) + (0.3 * normalizedFlux);
    
    if (this.detectOnset(onsetFunction)) {
      this.onsetCallbacks.forEach(cb => cb({
        time: this.audioContext.currentTime,
        strength: onsetFunction,
        type: isKick ? 'kick' : (isSnare ? 'snare' : 'unknown'),
        lfc: normalizedLFC,
        hfc: normalizedHFC,
        flux: normalizedFlux,
        energy: energy,
        spectralCentroid: spectralCentroid
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
    this.previousKickScore = kickScore;   // Store kickScore, not just LFC
    this.previousSnareScore = snareScore; // Store snareScore, not just HFC
    
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
   * Restart onset detection (stop then start)
   */
  restart() {
    this.stop();
    this.start();
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