/**
 * Spectrogram Synthesizer Engine
 * ==============================
 * Converts a 2D spectrogram image (frequency × time) into audio via additive synthesis.
 *
 * Inspired by the Aphex Twin formula:
 *   ΔMi−1 = −∂Σ(n=1→N) Di[n] [Σ(j∈C{i}) Fji[n−1] + Fext_i[n−1]]
 *
 * In the original context this describes coupled particle dynamics. We reinterpret it
 * for spectral synthesis:
 *   - Each frequency bin i has a "mass" M (amplitude state)
 *   - Di[n] is a damping/dissipation factor per bin (controls decay)
 *   - Fji[n-1] is the coupling force from neighboring bins j → i (harmonic interaction)
 *   - Fext_i[n-1] is the external force (user-drawn pixel intensity)
 *
 * This creates richer, more organic sound than naive additive synthesis because
 * neighboring frequencies "pull" on each other — similar to how real resonant systems
 * (strings, membranes, rooms) create coupled harmonics.
 *
 * Usage:
 *   const synth = new SpectrogramSynth(audioContext);
 *   const audioBuffer = synth.renderToBuffer(spectrogramData, duration);
 *   // spectrogramData: 2D array [timeSlice][frequencyBin] of amplitudes 0-1
 */

class SpectrogramSynth {
  constructor(audioContext, options = {}) {
    this.audioContext = audioContext;
    this.sampleRate = audioContext.sampleRate;

    // Spectrogram resolution
    this.numFreqBins = options.numFreqBins || 256;      // Number of frequency rows
    this.minFreq = options.minFreq || 20;               // Hz - lowest frequency
    this.maxFreq = options.maxFreq || 16000;            // Hz - highest frequency
    this.useLogScale = options.useLogScale !== false;    // Log frequency scale (more musical)

    // ΔMi−1 formula parameters — the "physics" of spectral interaction
    this.dampingFactor = options.dampingFactor || 0.15;     // Di - how fast bins decay (0 = no decay, 1 = instant decay)
    this.couplingStrength = options.couplingStrength || 0.08; // Fji weight - how much neighbors influence each other
    this.couplingRadius = options.couplingRadius || 3;       // How many neighboring bins interact
    this.externalForceGain = options.externalForceGain || 1.0; // Fext_i scaling

    // Synthesis
    this.overallGain = options.overallGain || 0.5;
    this.fadeMs = options.fadeMs || 10; // Fade in/out per time slice to avoid clicks

    // Precompute frequency mapping
    this.frequencies = this._computeFrequencyMap();
  }

  /**
   * Build the frequency bin → Hz mapping (log or linear scale)
   */
  _computeFrequencyMap() {
    const freqs = new Float64Array(this.numFreqBins);
    if (this.useLogScale) {
      const logMin = Math.log2(this.minFreq);
      const logMax = Math.log2(this.maxFreq);
      for (let i = 0; i < this.numFreqBins; i++) {
        const t = i / (this.numFreqBins - 1);
        freqs[i] = Math.pow(2, logMin + t * (logMax - logMin));
      }
    } else {
      for (let i = 0; i < this.numFreqBins; i++) {
        freqs[i] = this.minFreq + (i / (this.numFreqBins - 1)) * (this.maxFreq - this.minFreq);
      }
    }
    return freqs;
  }

  /**
   * Get the Hz value for a frequency bin index
   */
  getFrequencyForBin(binIndex) {
    if (binIndex < 0 || binIndex >= this.numFreqBins) return 0;
    return this.frequencies[binIndex];
  }

  /**
   * Get the bin index closest to a given Hz value
   */
  getBinForFrequency(hz) {
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < this.numFreqBins; i++) {
      const dist = Math.abs(this.frequencies[i] - hz);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  }

  /**
   * Apply the coupled interaction formula to evolve bin amplitudes.
   *
   * ΔMi = −Di * [Σ(j∈neighbors) Fji * (Mj - Mi) + Fext_i]
   *
   * Where:
   *   Mi = current amplitude state of bin i
   *   Fji = coupling force from neighbor j (inversely proportional to distance)
   *   Fext_i = external force (the drawn pixel intensity)
   *   Di = damping factor
   *
   * Returns new amplitude array after one interaction step.
   */
  _applyInteractionStep(currentState, externalForce) {
    const newState = new Float64Array(this.numFreqBins);

    for (let i = 0; i < this.numFreqBins; i++) {
      // Coupling force from neighbors: Σ(j∈C{i}) Fji * (Mj - Mi)
      let couplingForce = 0;
      for (let r = -this.couplingRadius; r <= this.couplingRadius; r++) {
        if (r === 0) continue;
        const j = i + r;
        if (j < 0 || j >= this.numFreqBins) continue;

        // Coupling strength decreases with distance (1/|r|)
        const Fji = this.couplingStrength / Math.abs(r);
        couplingForce += Fji * (currentState[j] - currentState[i]);
      }

      // External force (drawn amplitude)
      const Fext = externalForce[i] * this.externalForceGain;

      // ΔMi = −Di * [coupling + external]
      // We invert the sign convention so that external force _adds_ energy
      const delta = -this.dampingFactor * (couplingForce) + Fext;

      // Update state, clamp to [0, 1]
      newState[i] = Math.max(0, Math.min(1, currentState[i] + delta));
    }

    return newState;
  }

  /**
   * Render a spectrogram to an AudioBuffer.
   *
   * @param {number[][]} spectrogramData - 2D array [timeSlice][freqBin], values 0-1
   * @param {number} duration - Total duration in seconds
   * @returns {AudioBuffer}
   */
  renderToBuffer(spectrogramData, duration) {
    const numTimeSlices = spectrogramData.length;
    if (numTimeSlices === 0) return this.audioContext.createBuffer(1, 1, this.sampleRate);

    const totalSamples = Math.ceil(duration * this.sampleRate);
    const samplesPerSlice = totalSamples / numTimeSlices;
    const buffer = this.audioContext.createBuffer(1, totalSamples, this.sampleRate);
    const output = buffer.getChannelData(0);

    // Phase accumulators for each frequency bin (continuous across slices)
    const phases = new Float64Array(this.numFreqBins);

    // Amplitude state (the "M" in the formula — evolves over time)
    let amplitudeState = new Float64Array(this.numFreqBins);

    // Precompute angular velocity for each bin
    const angularVelocities = new Float64Array(this.numFreqBins);
    for (let i = 0; i < this.numFreqBins; i++) {
      angularVelocities[i] = (2 * Math.PI * this.frequencies[i]) / this.sampleRate;
    }

    // Normalization: scale so the sum doesn't clip
    const normFactor = this.overallGain / Math.sqrt(this.numFreqBins);

    for (let t = 0; t < numTimeSlices; t++) {
      const sliceStart = Math.round(t * samplesPerSlice);
      const sliceEnd = Math.min(Math.round((t + 1) * samplesPerSlice), totalSamples);
      const sliceLength = sliceEnd - sliceStart;

      // Get the drawn amplitudes for this time slice (external force)
      const externalForce = new Float64Array(this.numFreqBins);
      for (let i = 0; i < this.numFreqBins; i++) {
        externalForce[i] = (spectrogramData[t] && spectrogramData[t][i]) || 0;
      }

      // Apply the interaction formula to evolve amplitude state
      amplitudeState = this._applyInteractionStep(amplitudeState, externalForce);

      // Synthesize this slice via additive synthesis
      const fadeSamples = Math.min(Math.round(this.fadeMs * this.sampleRate / 1000), sliceLength / 2);

      for (let s = 0; s < sliceLength; s++) {
        let sample = 0;

        // Fade envelope to prevent clicks between slices
        let envelope = 1;
        if (s < fadeSamples) envelope = s / fadeSamples;
        else if (s > sliceLength - fadeSamples) envelope = (sliceLength - s) / fadeSamples;

        // Sum all frequency bins (additive synthesis)
        for (let i = 0; i < this.numFreqBins; i++) {
          if (amplitudeState[i] < 0.001) continue; // Skip silent bins for performance
          sample += amplitudeState[i] * Math.sin(phases[i]) * envelope;
          phases[i] += angularVelocities[i];
        }

        output[sliceStart + s] = sample * normFactor;
      }

      // Keep phases in [0, 2π] to avoid floating point drift
      for (let i = 0; i < this.numFreqBins; i++) {
        phases[i] = phases[i] % (2 * Math.PI);
      }
    }

    return buffer;
  }

  /**
   * Play a spectrogram immediately.
   * Returns the source node (call .stop() to halt playback).
   */
  play(spectrogramData, duration, destinationNode, offset = 0) {
    const buffer = this.renderToBuffer(spectrogramData, duration);
    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 1.0;

    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(destinationNode || this.audioContext.destination);
    source.start(0, offset);

    return { source, gainNode };
  }

  /**
   * Generate a WAV blob from spectrogram data for download.
   */
  async renderToWav(spectrogramData, duration) {
    const buffer = this.renderToBuffer(spectrogramData, duration);
    return this._audioBufferToWav(buffer);
  }

  /**
   * Convert AudioBuffer to WAV Blob
   */
  _audioBufferToWav(buffer) {
    const numChannels = 1;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const data = buffer.getChannelData(0);
    const dataLength = data.length * (bitDepth / 8);
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);           // Subchunk1Size
    view.setUint16(20, format, true);        // AudioFormat
    view.setUint16(22, numChannels, true);   // NumChannels
    view.setUint32(24, sampleRate, true);    // SampleRate
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true); // ByteRate
    view.setUint16(32, numChannels * (bitDepth / 8), true); // BlockAlign
    view.setUint16(34, bitDepth, true);      // BitsPerSample
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < data.length; i++) {
      const s = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Create a blank spectrogram data grid
   */
  static createBlankGrid(numTimeSlices, numFreqBins) {
    return Array.from({ length: numTimeSlices }, () => new Float64Array(numFreqBins));
  }

  /**
   * Paint a frequency band on the spectrogram (horizontal line = sustained tone)
   */
  static paintTone(grid, freqBin, startSlice, endSlice, amplitude = 1.0) {
    for (let t = startSlice; t <= endSlice && t < grid.length; t++) {
      if (grid[t]) grid[t][freqBin] = Math.min(1, amplitude);
    }
  }

  /**
   * Paint a diagonal line (frequency sweep / glissando)
   */
  static paintSweep(grid, startBin, endBin, startSlice, endSlice, amplitude = 1.0) {
    // It calculates the total distance to travel in time (timeSteps) and frequency (freqSteps).
    const timeSteps = endSlice - startSlice;
    const freqSteps = endBin - startBin;

    // Loops through time to calculate the exact proportional vertical step using linear interpolation: 
    // startBin + (freqSteps * t) / timeSteps
    for (let t = 0; t <= timeSteps && (startSlice + t) < grid.length; t++) {
      const bin = Math.round(startBin + (freqSteps * t) / timeSteps);

      if (bin >= 0 && bin < grid[0].length) {
        grid[startSlice + t][bin] = Math.min(1, amplitude);
        
        // To make the line thick enough to be heard clearly and seen smoothly on the canvas, 
        // it draws the main pixel at full amplitude, and then paints the pixels immediately 
        // above and below it (bin - 1 and bin + 1) at half (0.5) amplitude
        if (bin > 0) grid[startSlice + t][bin - 1] = Math.min(1, amplitude * 0.5);
        if (bin < grid[0].length - 1) grid[startSlice + t][bin + 1] = Math.min(1, amplitude * 0.5);
      }
    }
  }

  /**
   * Paint a harmonic series at a fundamental frequency bin
   * (creates a more musical/natural tone)
   */
  static paintHarmonicTone(grid, fundamentalBin, startSlice, endSlice, numHarmonics = 6, amplitude = 1.0) {
    for (let h = 1; h <= numHarmonics; h++) {
      const harmonicBin = fundamentalBin * h; // Approximate — works well with log scale
      if (harmonicBin >= grid[0].length) break;
      const harmonicAmplitude = amplitude / h; // Natural harmonic falloff
      SpectrogramSynth.paintTone(grid, harmonicBin, startSlice, endSlice, harmonicAmplitude);
    }
  }
}

export default SpectrogramSynth;
