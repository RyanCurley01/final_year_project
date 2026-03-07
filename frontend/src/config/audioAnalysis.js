// src/config/audioAnalysis.js
// Derive audio features from real-time Web Audio API analyser data.
// Works on raw FFT frequency-domain + time-domain buffers.

/**
 * Analyse a single frame of audio data from an AnalyserNode.
 *
 * @param {Uint8Array} freqData — getByteFrequencyData output (0-255 per bin)
 * @param {Uint8Array} timeData — getByteTimeDomainData output (centered at 128)
 * @param {number}     sampleRate — AudioContext.sampleRate
 * @param {number}     fftSize — AnalyserNode.fftSize
 * @returns {{ energy, valence, tempo, danceability, acousticness, instrumentalness, speechiness, spectral_centroid, rms, dominantFreq }}
 */
export function analyseAudioFrame(freqData, timeData, sampleRate, fftSize) {
  const binCount = freqData.length; // fftSize / 2
  const binHz = sampleRate / fftSize; // frequency per bin

  // ── RMS (root-mean-square loudness) ────────────────────────────
  let sumSq = 0;
  for (let i = 0; i < timeData.length; i++) {
    const s = (timeData[i] - 128) / 128; // normalize to -1..1
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / timeData.length);

  // ── Spectral centroid (brightness) ─────────────────────────────
  let weightedSum = 0;
  let magnitudeSum = 0;
  for (let i = 0; i < binCount; i++) {
    const mag = freqData[i];
    const freq = i * binHz;
    weightedSum += freq * mag;
    magnitudeSum += mag;
  }
  const centroidHz = magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
  // Normalize: 200Hz (very dark) → 0, 8000Hz (very bright) → 1
  const centroidNorm = clamp((centroidHz - 200) / 7800);

  // ── Dominant frequency (rough pitch estimate) ──────────────────
  let maxBin = 0;
  let maxVal = 0;
  // Start from bin 2 to skip DC and sub-bass rumble
  for (let i = 2; i < binCount; i++) {
    if (freqData[i] > maxVal) {
      maxVal = freqData[i];
      maxBin = i;
    }
  }
  const dominantFreq = maxBin * binHz;

  // ── Spectral flatness (noise vs tonal) ─────────────────────────
  // Geometric mean / arithmetic mean of magnitudes
  let logSum = 0;
  let arithSum = 0;
  let nonZero = 0;
  for (let i = 1; i < binCount; i++) {
    const mag = freqData[i] + 1; // avoid log(0)
    logSum += Math.log(mag);
    arithSum += mag;
    nonZero++;
  }
  const geoMean = Math.exp(logSum / nonZero);
  const arithMean = arithSum / nonZero;
  const flatness = arithMean > 0 ? geoMean / arithMean : 0; // 0 = tonal, 1 = white noise

  // ── Spectral rolloff (frequency below which 85% of energy sits) ─
  const targetEnergy = magnitudeSum * 0.85;
  let cumulative = 0;
  let rolloffBin = binCount - 1;
  for (let i = 0; i < binCount; i++) {
    cumulative += freqData[i];
    if (cumulative >= targetEnergy) {
      rolloffBin = i;
      break;
    }
  }
  const rolloffHz = rolloffBin * binHz;
  const rolloffNorm = clamp(rolloffHz / 12000);

  // ── Zero crossing rate (percussiveness / noise) ────────────────
  let crossings = 0;
  for (let i = 1; i < timeData.length; i++) {
    if ((timeData[i] >= 128) !== (timeData[i - 1] >= 128)) crossings++;
  }
  const zcr = crossings / timeData.length;
  const zcrNorm = clamp(zcr / 0.5); // 0.5 is very noisy

  // ── Low / mid / high band energy ratios ────────────────────────
  const lowEnd = Math.floor(300 / binHz);
  const midEnd = Math.floor(2000 / binHz);
  let lowEnergy = 0, midEnergy = 0, highEnergy = 0;
  for (let i = 0; i < binCount; i++) {
    const e = freqData[i] * freqData[i];
    if (i < lowEnd) lowEnergy += e;
    else if (i < midEnd) midEnergy += e;
    else highEnergy += e;
  }
  const totalBandEnergy = lowEnergy + midEnergy + highEnergy || 1;
  const lowRatio = lowEnergy / totalBandEnergy;
  const highRatio = highEnergy / totalBandEnergy;

  // ── Feature derivation ─────────────────────────────────────────
  // Energy — RMS loudness is the primary driver
  const energy = clamp(rms * 4); // rms typically 0-0.3 for music

  // Valence — brighter + less bassy = happier (rough heuristic)
  const valence = clamp(centroidNorm * 0.5 + (1 - lowRatio) * 0.3 + (1 - flatness) * 0.2);

  // Danceability — strong low end + rhythmic energy
  const danceability = clamp(lowRatio * 0.5 + energy * 0.3 + (1 - flatness) * 0.2);

  // Tempo — approximated from ZCR + energy transients
  const tempo = clamp(zcrNorm * 0.4 + energy * 0.6);

  // Acousticness — low flatness (tonal), moderate centroid
  const acousticness = clamp((1 - flatness) * 0.5 + (1 - centroidNorm) * 0.3 + (1 - energy) * 0.2);

  // Instrumentalness — broad spectrum distribution
  const instrumentalness = clamp(rolloffNorm * 0.5 + (1 - zcrNorm) * 0.5);

  // Speechiness — high ZCR + mid-range emphasis
  const speechiness = clamp(zcrNorm * 0.4 + (midEnergy / totalBandEnergy) * 0.4 + flatness * 0.2);

  // Spectral centroid — direct mapping
  const spectral_centroid = centroidNorm;

  return {
    energy,
    valence,
    tempo,
    danceability,
    acousticness,
    instrumentalness,
    speechiness,
    spectral_centroid,
    rms,
    dominantFreq,
  };
}

function clamp(v) {
  return Math.max(0, Math.min(1, v));
}
