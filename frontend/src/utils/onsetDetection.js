/**
 * Onset Detection for Music Signals
 * Based on "A Tutorial on Onset Detection in Music Signals" 
 * Implements High-Frequency Content (HFC) method for percussive onset detection
 * Also includes spectral anomaly detection for glitch effects
 */

class OnsetDetector {
  constructor(audioContext, options = {}) {
    this.audioContext = audioContext;

    // 1. Number of audio samples to analyze at once - MUST be set before creating analyser
    this.fftSize = options.fftSize || 512;
    this.threshold = options.threshold || 0.5;  // For general onset (normalized values ~0-1)
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

    // Spectral anomaly detection — replaces pattern-matching with statistical outlier detection.
    // Tracks running statistics of spectral flux and centroid. When the current frame
    // deviates significantly from the recent mean (measured in standard deviations),
    // it's flagged as a glitch. This catches any type of glitch effect.
    this.fluxHistory = [];           // Recent spectral flux values
    this.centroidHistory = [];       // Recent spectral centroid values
    this.anomalyHistorySize = 60;    // ~1 second at 60fps — long enough to build stable statistics
    this.anomalyThreshold = options.anomalyThreshold || 2.5; // Standard deviations above mean to trigger
    this.lastGlitchTime = 0;
    
    // Onset detection state
    this.onsetCallbacks = [];      // General onset with type field ('kick', 'snare', 'unknown')
    this.glitchCallbacks = [];
    this.isRunning = false;
    this.lastOnsetTime = 0;
    this.baseMinTimeBetweenOnsets = options.minTimeBetweenOnsets || 100; // Base time between detections (ms)
    this.minTimeBetweenOnsets = this.baseMinTimeBetweenOnsets; // Adjusted by playback rate
    this.minTimeBetweenGlitches = options.minTimeBetweenGlitches || 3500; // Much longer gap - glitches are rare events
    
    // Previous values for peak detection
    this.previousKickScore = 0;
    this.previousSnareScore = 0;
    
    // Thresholds for drum type classification
    this.kickThreshold = options.kickThreshold || 0.5;
    this.snareThreshold = options.snareThreshold || 0.9;
  }
  
  /**
   * Set playback rate - adjusts detection timing
   * The audio element's time-stretching already spaces transients proportionally,
   * so onset detection naturally slows down with slower playback. We keep the
   * debounce interval at the base value — no additional scaling needed.
   */
  setPlaybackRate(rate) {
    this.playbackRate = rate || 1.0;
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
   * Bins 0-10 contain most kick drum energy (~0-860Hz at 44.1kHz/512 FFT)
   * O(n) = sum((maxBin - k) * |X(k)|^2) - inverted weighting
   */
  calculateLFC(spectrum) {
    let lfc = 0;
    const kickBinEnd = 10; // Focus on bins 0-10 (~0-860Hz) — sub-bass through kick body
    
    for (let k = 0; k < kickBinEnd; k++) {
      const magnitude = spectrum[k] / 255.0; // Normalize 0-255 to 0-1
      // Weight low frequencies MORE (inverse of HFC)
      // Bin 0 gets weight 10, bin 9 gets weight 1
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
   * Spectral Flatness — distinguishes tonal sounds from percussive/noise sounds.
   * Ratio of geometric mean to arithmetic mean of the power spectrum.
   *   Near 0 = tonal (bass lines, melodies — energy at specific harmonics)
   *   Near 1 = noise-like (drums, percussion — energy spread across frequencies)
   * This is the key metric for filtering out bass/melody false positives.
   */
  calculateSpectralFlatness(spectrum) {
    let logSum = 0;
    let sum = 0;
    let count = 0;
    
    for (let k = 0; k < spectrum.length; k++) {
      const magnitude = spectrum[k] / 255.0;
      if (magnitude > 0.001) { // Skip near-zero to avoid log(0)
        logSum += Math.log(magnitude);
        count++;
      }
      sum += magnitude;
    }
    
    if (count === 0 || sum === 0) return 0;
    
    const geometricMean = Math.exp(logSum / count);
    const arithmeticMean = sum / spectrum.length;
    
    return arithmeticMean > 0 ? geometricMean / arithmeticMean : 0;
  }
  
  /**
   * Detect spectral anomaly — any abnormal departure from the signal's own recent behaviour.
   * Instead of pattern-matching specific glitch types, this uses statistical outlier detection:
   *  1. Track running mean and standard deviation of spectral flux and centroid
   *  2. When either metric exceeds mean + N×stdDev, flag as anomaly
   * This catches tape stops, stutters, gates, bitcrushing, ring mod, granular glitches,
   * and any other effect that disrupts the spectrum — without needing a specific detector for each.
   *
   * @param {number} flux - Current frame's spectral flux
   * @param {number} centroid - Current frame's spectral centroid
   * @returns {{ detected: boolean, strength: number }}
   */
  detectSpectralAnomaly(flux, centroid) {
    const now = Date.now();
    
    // Rate-limit glitch events
    if (now - this.lastGlitchTime < this.minTimeBetweenGlitches) {
      return { detected: false, strength: 0 };
    }
    
    // Need enough history to compute meaningful statistics
    if (this.fluxHistory.length < 30) {
      return { detected: false, strength: 0 };
    }
    
    // ---- Compute running mean and standard deviation for flux ----
    const fluxMean = this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length;
    const fluxVariance = this.fluxHistory.reduce((sum, v) => sum + (v - fluxMean) ** 2, 0) / this.fluxHistory.length;
    const fluxStdDev = Math.sqrt(fluxVariance);
    
    // ---- Compute running mean and standard deviation for centroid ----
    const centroidMean = this.centroidHistory.reduce((a, b) => a + b, 0) / this.centroidHistory.length;
    const centroidVariance = this.centroidHistory.reduce((sum, v) => sum + (v - centroidMean) ** 2, 0) / this.centroidHistory.length;
    const centroidStdDev = Math.sqrt(centroidVariance);
    
    // ---- Calculate how many standard deviations the current frame is from the mean ----
    // Flux anomaly: sudden spectral change (bitcrush, stutter, gate, granular, etc.)
    const fluxZScore = fluxStdDev > 0.001 ? (flux - fluxMean) / fluxStdDev : 0;
    // Centroid anomaly: sudden brightness shift (tape stop, pitch shift, ring mod, etc.)
    // Use absolute difference — centroid can jump up OR down during a glitch
    const centroidZScore = centroidStdDev > 0.001 ? Math.abs(centroid - centroidMean) / centroidStdDev : 0;
    
    // Combined anomaly: either metric spiking is enough, take the stronger signal
    const anomalyScore = Math.max(fluxZScore, centroidZScore);
    
    if (anomalyScore > this.anomalyThreshold) {
      this.lastGlitchTime = now;
      return { detected: true, strength: anomalyScore };
    }
    
    return { detected: false, strength: anomalyScore };
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
    
    // Compute spectral features for this frame
    const spectralCentroid = this.calculateSpectralCentroid(this.frequencyData);
    const energy = this.calculateEnergy(this.frequencyData);
    const spectralFlatness = this.calculateSpectralFlatness(this.frequencyData);
    
    // Skip onset detection if we have no audio data (all zeros)
    const hasAudio = this.frequencyData.some(v => v > 0);
    if (!hasAudio) {
      this.previousSpectrum.set(this.frequencyData);
      requestAnimationFrame(() => this.processFrame());
      return;
    }
    
    // ============ CALCULATE ONSET DETECTION FUNCTIONS ============
    
    // 1. LFC (Low-Frequency Content) - for KICK detection
    const lfc = this.calculateLFC(this.frequencyData);
    
    // 2. HFC (High-Frequency Content) - for SNARE/HI-HAT detection  
    const hfc = this.calculateHFC(this.frequencyData);
    
    // 3. Spectral Flux - measures CHANGE in spectrum (good for any transient)
    const flux = this.calculateSpectralFlux(this.frequencyData, this.previousSpectrum);
    
    // ============ UPDATE ANOMALY HISTORY ============
    this.fluxHistory.push(flux);
    this.centroidHistory.push(spectralCentroid);
    if (this.fluxHistory.length > this.anomalyHistorySize) {
      this.fluxHistory.shift();
    }
    if (this.centroidHistory.length > this.anomalyHistorySize) {
      this.centroidHistory.shift();
    }
    
    // ============ NORMALIZE VALUES ============
    const normalizedLFC = lfc / 200;   // Narrower band → lower max, adjust divisor
    const normalizedHFC = hfc / 10000;
    const normalizedFlux = flux / 10;
    
    // ============ PERCUSSIVENESS DETECTION ============
    
    // Energy ratio: how sharply energy spikes above recent average
    // Drums produce sharp transients (ratio >> 1), sustained notes stay near 1
    const recentEnergy = this.fluxHistory.slice(-4, -1); // Approximate from recent flux
    const avgEnergy = recentEnergy.length > 0
      ? recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length
      : flux;
    const energyRatio = avgEnergy > 0.001 ? flux / avgEnergy : 1.0;
    
    // Percussiveness: combines flatness (is it noise-like?) with transient sharpness (is it a spike?)
    // Both must be high for the sound to be classified as percussive
    const flatnessFactor = Math.min(spectralFlatness * 2.0, 1.0);  // 0.5+ flatness → full score
    const transientFactor = Math.min(energyRatio / 3.0, 1.0);     // 3.0x+ spike → full score
    const percussiveness = flatnessFactor * transientFactor;
    
    // ============ TONAL SUPPRESSION GATE ============
    // Bass lines and acid patterns are highly tonal (spectral flatness < 0.15).
    // Drums are broadband/noise-like (flatness > 0.25).
    // Smoothly suppress onsets based on tonality so bass/acid never triggers,
    // but a drum hit on top of a sustaining bass note still can.
    //   flatness 0.00-0.10 → full suppression (pure bass/acid)
    //   flatness 0.10-0.25 → partial suppression (mixed or borderline)
    //   flatness 0.25+     → no suppression (percussive/noise)
    const tonalGate = Math.min(Math.max((spectralFlatness - 0.10) / 0.15, 0), 1);
    
    // ============ CLASSIFY DRUM TYPE ============
    // Percussiveness gates the classification — tonal sounds get suppressed
    const kickScore = (0.4 * normalizedLFC) + (0.2 * normalizedFlux) + (0.4 * percussiveness);
    const snareScore = (0.3 * normalizedHFC) + (0.3 * normalizedFlux) + (0.4 * percussiveness);
    
    // Determine drum type based on which score is higher and above threshold
    const isKick = kickScore > this.previousKickScore && kickScore > this.kickThreshold;
    const isSnare = snareScore > this.previousSnareScore && snareScore > this.snareThreshold;
    
    // ============ GENERAL ONSET (DRUMS ONLY) ============
    // Only fire onset callback when a drum hit (kick or snare) is positively identified.
    // Raw onset strength gated by tonal suppression AND drum classification —
    // unclassified transients ('unknown') are silently discarded.
    const rawOnset = (0.2 * normalizedLFC) + (0.15 * normalizedHFC) + (0.35 * normalizedFlux) + (0.3 * percussiveness);
    const onsetFunction = rawOnset * tonalGate;
    
    if (this.detectOnset(onsetFunction) && (isKick || isSnare)) {
      this.onsetCallbacks.forEach(cb => cb({
        time: this.audioContext.currentTime,
        strength: onsetFunction,
        type: isKick ? 'kick' : 'snare',
        lfc: normalizedLFC,
        hfc: normalizedHFC,
        flux: normalizedFlux,
        energy: energy,
        spectralCentroid: spectralCentroid
      }));
    }
    
    // ============ SPECTRAL ANOMALY DETECTION (GLITCH) ============
    const anomalyResult = this.detectSpectralAnomaly(flux, spectralCentroid);
    if (anomalyResult.detected) {
      this.glitchCallbacks.forEach(cb => cb({
        time: this.audioContext.currentTime,
        type: 'anomaly',
        strength: anomalyResult.strength,
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
   * Disconnect and cleanup
   */
  disconnect() {
    this.stop();
    this.analyser.disconnect();
    this.onsetCallbacks = [];
    this.glitchCallbacks = [];
    this.fluxHistory = [];
    this.centroidHistory = [];
  }
}

export default OnsetDetector;