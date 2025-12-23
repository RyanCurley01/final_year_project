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
   * Low-Frequency Content (LFC) onset detection function
   * Optimized for kick drums which are typically in 40-100Hz range
   * IDM music often has complex bass patterns that need focused detection
   */
  calculateLFC(spectrum) {
    const nyquist = this.sampleRate / 2;
    const binWidth = nyquist / spectrum.length;
    
    // Focus on bass frequencies: 0-200Hz for kick drums
    const maxKickFreqBin = Math.floor(200 / binWidth);
    
    let lfc = 0;
    for (let k = 0; k < Math.min(maxKickFreqBin, spectrum.length); k++) {
      const magnitude = spectrum[k] / 255.0;
      // Weight lower frequencies more heavily for kick detection
      const weight = 1.0 - (k / maxKickFreqBin) * 0.5; // Linear decay
      lfc += magnitude * magnitude * weight;
    }
    return lfc;
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
    let broadbandCount = 0;
    
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
      if (bandTransient > 0.3) {
        bandsWithTransients++;
        transientEnergy += bandTransient;
      }
    }
    
    // Drums hit many frequency bands simultaneously
    // Melodies typically affect fewer, more specific bands
    const isBroadband = bandsWithTransients >= 3;
    
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
    
    // Check if enough time has passed since last onset
    if (now - this.lastOnsetTime < this.minTimeBetweenOnsets) {
      return false;
    }
    
    // Debug: Log when we're close to threshold
    if (onsetFunction > this.threshold * 0.6) {
      console.log('📊 Close to threshold:', onsetFunction.toFixed(4), 'vs', this.threshold, '(', Math.round((onsetFunction / this.threshold) * 100), '%)');
    }
    
    // Simple peak detection: current value is higher than previous and above threshold
    const isOnset = onsetFunction > this.previousOnsetFunction && 
                    onsetFunction > this.threshold;
    
    if (isOnset) {
      console.log('🥁💥 KICK DETECTED! Value:', onsetFunction.toFixed(4), 'Threshold:', this.threshold);
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
    
    // Calculate detection functions
    const isPercussiveFrame = this.isPercussive(this.frequencyData, this.previousSpectrum);
    const flatness = this.calculateSpectralFlatness(this.frequencyData);
    const percussive = this.calculatePercussiveOnset(this.frequencyData, this.previousSpectrum);
    const lfc = this.calculateLFC(this.frequencyData);
    
    // Calculate transient strength (sharp attack detection)
    let transientStrength = 0;
    for (let k = 0; k < 50; k++) {
      const current = this.frequencyData[k] / 255.0;
      const previous = this.previousSpectrum[k] / 255.0;
      const change = current - previous;
      if (change > 0.15) { // Sharp increase
        transientStrength += change * change;
      }
    }
    
    // DRUM DETECTION - Less strict but still filters sustained tones:
    // Drums have TRANSIENTS (sharp attacks) - bass/acid patterns are more sustained
    // Use transient strength as the primary filter
    const hasSharpTransient = transientStrength > 0.05;
    const hasBroadbandEnergy = percussive > 0.1;
    
    // Accept as drum if: sharp transient AND (broadband OR percussive frame)
    const isDrumHit = hasSharpTransient && (hasBroadbandEnergy || isPercussiveFrame);
    
    // Calculate onset function
    let onsetFunction = 0;
    if (isDrumHit) {
      // Combine transient strength with percussive detection
      onsetFunction = (transientStrength * 20) + (percussive * 2);
    }
    
    // Debug every 30 frames (~0.5 seconds at 60fps)
    this.debugCounter++;
    if (this.debugCounter % 30 === 0) {
      console.log('🥁 DRUM DETECTION:', {
        transient: transientStrength.toFixed(4),
        percussive: percussive.toFixed(3),
        flatness: flatness.toFixed(3),
        hasSharpTransient: hasSharpTransient ? '✅ SHARP' : '❌ SUSTAINED',
        hasBroadband: hasBroadbandEnergy ? '✅' : '❌',
        isPercussive: isPercussiveFrame ? '✅' : '❌',
        isDrumHit: isDrumHit ? '🥁 DRUM' : '🎹 NOT DRUM',
        total: onsetFunction.toFixed(4),
        threshold: this.threshold,
        willTrigger: onsetFunction > this.threshold ? '🔥 YES' : '⏸️ NO'
      });
    }
    
    // Debug: Log onset function value occasionally
    if (Math.random() < 0.005) {
      console.log('🎵 Drum check:', 
        'Transient:', transientStrength.toFixed(4), 
        '| Percussive:', isPercussiveFrame,
        '| Broadband:', percussive.toFixed(3), 
        '→ Total:', onsetFunction.toFixed(4), 
        '| Is Drum:', isDrumHit);
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
