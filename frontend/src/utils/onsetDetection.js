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
    this.threshold = options.threshold || 0.8; // Lowered for better drum detection
    this.sampleRate = audioContext.sampleRate;
    this.debugCounter = 0; // For periodic debugging
    
    // Create analyzer
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = 0;
    
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.previousSpectrum = new Uint8Array(this.analyser.frequencyBinCount);
    this.previousOnsetFunction = 0;
    
    // Onset detection state
    this.onsetCallbacks = [];
    this.glitchCallbacks = []; // For unusual/glitch sounds
    this.isRunning = false;
    this.loopId = 0; // Unique ID for each loop instance, used to prevent duplicate loops
    this.lastOnsetTime = 0;
    this.lastGlitchTime = 0; // Track last glitch detection
    this.minTimeBetweenOnsets = 100; // ms, prevents double detection
    
    // Glitch detection state (for IDM-style effects like Vordhosbn)
    this.recentOnsets = []; // Track recent onset times
    this.previousEnergy = 0; // For tracking energy changes
    this.energyHistory = []; // Track energy over time
    this.glitchTriggeredRecently = false; // Prevents double triggering
    this.framesAfterReset = 10; // Start ready to detect (skip frame logic)
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
   * Add callback for glitch sound events
   */
  onGlitch(callback) {
    this.glitchCallbacks.push(callback);
    return this;
  }
  
  /**
   * Calculate high frequency content (for hi-hats, cymbals, glitchy sounds)
   * Focuses on 5kHz-15kHz range
   */
  calculateHighFrequencyContent(spectrum) {
    const nyquist = this.sampleRate / 2;
    const binWidth = nyquist / spectrum.length;
    
    // Focus on high frequencies: 5kHz-15kHz
    const minBin = Math.floor(5000 / binWidth);
    const maxBin = Math.min(Math.floor(15000 / binWidth), spectrum.length);
    
    let highFreqEnergy = 0;
    for (let k = minBin; k < maxBin; k++) {
      const magnitude = spectrum[k] / 255.0;
      highFreqEnergy += magnitude * magnitude;
    }
    return highFreqEnergy / (maxBin - minBin);
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
   * Spectral Flatness (Wiener Entropy)
   * Measures how noise-like vs tonal a signal is
   * Drums = high flatness (noise-like), Melodies = low flatness (tonal)
   * Returns value 0-1 where higher = more percussive/noisy
   */
  calculateSpectralFlatness(spectrum) {
    const epsilon = 1e-10; // Prevent log(0)
    let geometricMean = 0;
    let arithmeticMean = 0;
    let count = 0;
    
    for (let k = 0; k < spectrum.length; k++) {
      const magnitude = (spectrum[k] / 255.0) + epsilon;
      if (magnitude > epsilon) {
        geometricMean += Math.log(magnitude);
        arithmeticMean += magnitude;
        count++;
      }
    }
    
    if (count === 0) return 0;
    
    geometricMean = Math.exp(geometricMean / count);
    arithmeticMean = arithmeticMean / count;
    
    // Flatness = geometric mean / arithmetic mean
    // High value = noisy (drums), Low value = tonal (melody)
    return arithmeticMean > epsilon ? geometricMean / arithmeticMean : 0;
  }
  
  /**
   * Detect if current frame is percussive (drum-like) vs melodic
   * Uses spectral flatness and transient sharpness
   */
  isPercussive(spectrum, previousSpectrum) {
    const flatness = this.calculateSpectralFlatness(spectrum);
    
    // Calculate attack sharpness (drums have very sharp attacks)
    let attackSharpness = 0;
    let totalChange = 0;
    
    for (let k = 0; k < Math.min(100, spectrum.length); k++) {
      const current = spectrum[k] / 255.0;
      const previous = previousSpectrum[k] / 255.0;
      const change = current - previous;
      
      if (change > 0) {
        attackSharpness += change * change; // Square emphasizes sharp attacks
        totalChange += change;
      }
    }
    
    // Drums have: high flatness + sharp attacks
    // Melodies have: low flatness + gradual changes
    const percussiveScore = (flatness * 0.4) + (attackSharpness * 10);
    
    // Threshold: must be sufficiently percussive
    return percussiveScore > 0.15;
  }
  
  /**
   * Drum Content Detection - ALL drum types
   * Analyzes percussion across full spectrum:
   * - Kick: 40-100Hz
   * - Snare: 150-250Hz + 3-5kHz
   * - Hi-hat/Cymbals: 5-10kHz
   * - Toms: 80-400Hz
   */
  calculateDrumContent(spectrum) {
    const nyquist = this.sampleRate / 2;
    const binWidth = nyquist / spectrum.length;
    
    // Analyze drum frequency ranges (0-8000Hz captures most drum energy)
    const maxDrumFreqBin = Math.floor(8000 / binWidth);
    
    let drumContent = 0;
    for (let k = 0; k < Math.min(maxDrumFreqBin, spectrum.length); k++) {
      const magnitude = spectrum[k] / 255.0;
      // Emphasize typical drum frequencies
      const freq = k * binWidth;
      let weight = 1.0;
      
      // Boost kick range (40-100Hz)
      if (freq >= 40 && freq <= 100) weight = 1.5;
      // Boost snare fundamentals (150-250Hz)
      else if (freq >= 150 && freq <= 250) weight = 1.3;
      // Boost hi-hat/cymbal range (5-8kHz)
      else if (freq >= 5000 && freq <= 8000) weight = 1.2;
      
      drumContent += magnitude * magnitude * weight;
    }
    return drumContent;
  }
  
  /**
   * Percussive Onset Detection (Drums Only)
   * Filters out melodic/acid patterns by focusing on:
   * 1. Transient attacks (sharp amplitude increases)
   * 2. Broadband energy (drums spread across frequencies)
   * 3. Spectral flatness (drums are noise-like, melodies are tonal)
   */
  calculatePercussiveOnset(currentSpectrum, previousSpectrum) {
    let transientEnergy = 0;
    
    // Count frequency bands with sudden increases (transients)
    const bandSize = 20;
    const numBands = Math.floor(currentSpectrum.length / bandSize);
    let bandsWithTransients = 0;
    
    for (let band = 0; band < numBands; band++) {
      let bandTransient = 0;
      let bandEnergy = 0;
      
      for (let k = band * bandSize; k < (band + 1) * bandSize; k++) {
        const current = currentSpectrum[k] / 255.0;
        const previous = previousSpectrum[k] / 255.0;
        const change = current - previous;
        
        // Only count positive changes (attacks, not decays)
        if (change > 0.1) {
          bandTransient += change;
        }
        bandEnergy += current;
      }
      
      // A band has a transient if significant sudden increase
      if (bandTransient > 0.25) {
        bandsWithTransients++;
        transientEnergy += bandTransient;
      }
    }
    
    // Drums hit many frequency bands simultaneously
    // Melodies/acid typically affect fewer, more specific bands
    const isBroadband = bandsWithTransients >= 6; // Lower = detect more drums; Higher = stricter filtering
    
    // Only count as onset if broadband (drum-like)
    if (isBroadband) {
      return transientEnergy * (bandsWithTransients / numBands);
    }
    
    return 0; // Reject narrow-band (melodic) onsets
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
    
    if (now - this.lastOnsetTime < this.minTimeBetweenOnsets) {
      return false;
    }
    
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
   * @param {number} loopId - The ID of this loop instance, used to detect stale loops
   */
  processFrame(loopId) {
    // Stop if this loop instance has been superseded by a newer one
    if (!this.isRunning || loopId !== this.loopId) return;
    
    // Get frequency data as bytes (0-255)
    this.analyser.getByteFrequencyData(this.frequencyData);
    
    // Skip processing if we have no audio data (all zeros)
    const hasAudio = this.frequencyData.some(v => v > 0);
    if (!hasAudio) {
      requestAnimationFrame(() => this.processFrame(loopId));
      return;
    }
    
    // Skip detection for first few frames after reset to let spectrum stabilize
    if (this.framesAfterReset < 10) {
      this.framesAfterReset++;
      this.previousSpectrum.set(this.frequencyData);
      requestAnimationFrame(() => this.processFrame(loopId));
      return;
    }
    
    // Calculate detection functions
    const isPercussiveFrame = this.isPercussive(this.frequencyData, this.previousSpectrum);
    const flatness = this.calculateSpectralFlatness(this.frequencyData);
    const percussive = this.calculatePercussiveOnset(this.frequencyData, this.previousSpectrum);
    const drumContent = this.calculateDrumContent(this.frequencyData);
    
    // Calculate transient strength across full drum spectrum (sharp attack detection)
    // Analyze 0-400 bins (~0-8kHz at 44.1kHz) to capture all drum types
    let transientStrength = 0;
    const drumBins = Math.min(400, this.frequencyData.length);
    
    for (let k = 0; k < drumBins; k++) {
      const current = this.frequencyData[k] / 255.0;
      const previous = this.previousSpectrum[k] / 255.0;
      const change = current - previous;
      // Lowered to 0.15 to capture softer drums while still filtering gradual changes
      if (change > 0.15) { // Sharp increases (drums)
        transientStrength += change * change;
      }
    }
    
    // STRICT DRUM DETECTION - Filter out melodies, acid, and bass:
    // 1. Drums have VERY sharp transients (acid/bass have smoother envelopes)
    // 2. Drums are broadband (acid/melodies are narrow-band tonal)
    // 3. Drums have high spectral flatness (noise-like), melodies are tonal (low flatness)
    // 4. Drums have significant energy in typical drum frequency ranges
    
    const hasVerySharpTransient = transientStrength > 0.12; // Balanced: catches most drums while filtering gradual changes
    const hasBroadbandEnergy = percussive > 0.25; // Strict: drums must hit many bands simultaneously
    const isNoiseLike = flatness > 0.35; // Critical: reject tonal content (melodies/acid are < 0.2)
    const hasTypicalDrumFrequencies = drumContent > 0.15; // Must have energy in drum ranges
    
    // Accept as drum ONLY if: very sharp transient AND broadband AND noise-like AND drum frequencies
    // This quad-condition filters out:
    // - Melodies: tonal (low flatness), narrow-band, wrong frequencies
    // - Acid: tonal (low flatness), resonant peaks, sustained
    // - Bass: narrow-band, smoother attack, too low frequency
    const isDrumHit = hasVerySharpTransient && hasBroadbandEnergy && isNoiseLike && hasTypicalDrumFrequencies;
    
    // IDM-STYLE GLITCH DETECTION (Vordhosbn, Aphex Twin style)
    // Detects: sudden audio CUTS/SILENCES - the signature of IDM glitch edits
    // Only triggers ONCE per glitch event
    
    // Calculate current frame energy
    const currentEnergy = this.frequencyData.reduce((sum, v) => sum + v, 0) / this.frequencyData.length / 255;
    
    // Track energy history (last 30 frames ~0.5 seconds)
    this.energyHistory.push(currentEnergy);
    if (this.energyHistory.length > 30) this.energyHistory.shift();
    
    // GLITCH DETECTION: Sudden silence/cut after sustained audio
    // This is THE characteristic of Vordhosbn-style glitches
    let isGlitchSound = false;
    
    if (this.energyHistory.length >= 10 && !this.glitchTriggeredRecently) {
      // Check if audio was playing (average energy over recent frames)
      const recentEnergy = this.energyHistory.slice(-10, -1); // Last 10 frames excluding current
      const avgRecentEnergy = recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length;
      
      // Sudden cut: was playing audio (energy > 0.08), now suddenly silent/very quiet
      const wasPlayingAudio = avgRecentEnergy > 0.08;
      const suddenSilence = currentEnergy < 0.02; // Nearly silent now
      const sharpDrop = currentEnergy < avgRecentEnergy * 0.15; // 85%+ drop
      
      isGlitchSound = wasPlayingAudio && suddenSilence && sharpDrop;
      
      if (isGlitchSound) {
        // Prevent re-triggering for 500ms after a glitch
        this.glitchTriggeredRecently = true;
        setTimeout(() => { this.glitchTriggeredRecently = false; }, 500);
      }
    }
    
    this.previousEnergy = currentEnergy;
    
    // Calculate onset function
    let onsetFunction = 0;
    if (isDrumHit) {
      onsetFunction = (transientStrength * 15) + (percussive * 2) + (drumContent * 3);
    }
    
    // Detect onset
    if (this.detectOnset(onsetFunction)) {
      // Trigger all drum callbacks
      this.onsetCallbacks.forEach(cb => cb({
        time: this.audioContext.currentTime,
        strength: onsetFunction,
        type: 'drum'
      }));
    }
    
    // Detect glitch sounds
    if (isGlitchSound) {
      this.glitchCallbacks.forEach(cb => cb({
        time: this.audioContext.currentTime,
        strength: transientStrength,
        type: 'cut'
      }));
    }
    
    // Store for next frame
    this.previousSpectrum.set(this.frequencyData);
    this.previousOnsetFunction = onsetFunction;
    
    // Schedule next frame (only if this loop is still valid)
    if (loopId === this.loopId) {
      requestAnimationFrame(() => this.processFrame(loopId));
    }
  }
  
  /**
   * Reset detection state - call when switching songs
   */
  reset() {
    // Clear spectrum data
    this.frequencyData.fill(0);
    this.previousSpectrum.fill(0);
    this.previousOnsetFunction = 0;
    
    // Reset timing
    this.lastOnsetTime = 0;
    this.lastGlitchTime = 0;
    
    // Reset glitch detection state
    this.recentOnsets = [];
    this.previousEnergy = 0;
    this.energyHistory = [];
    this.glitchTriggeredRecently = false;
    
    // Only skip 3 frames after reset (faster recovery)
    this.framesAfterReset = 7;
    
    return this;
  }
  
  /**
   * Start onset detection
   */
  start() {
    // Always ensure the loop is running
    // If already running, this is a no-op (processFrame will be scheduled)
    // If not running, start the loop
    if (!this.isRunning) {
      this.isRunning = true;
      this.loopId = (this.loopId || 0) + 1; // Unique ID for this loop instance
      this.processFrame(this.loopId);
    }
    return this;
  }

  /**
   * Force restart the detection loop (use if loop may have stopped)
   * This properly invalidates any existing loop before starting a new one
   */
  restart() {
    // Invalidate any existing loop by incrementing the loop ID
    this.loopId = (this.loopId || 0) + 1;
    const currentLoopId = this.loopId;
    this.isRunning = true;
    // Start new loop with the new ID
    this.processFrame(currentLoopId);
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
