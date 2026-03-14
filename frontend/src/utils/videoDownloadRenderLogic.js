/**
 * Video Download Render Logic
 *
 * Frontend-side utilities that mirror the onset detection and procedural
 * generation logic used by downloaded video export.
 *
 * This module is intentionally self-contained so the video export pipeline can:
 * 1) detect percussive onsets and glitch anomalies from frequency frames,
 * 2) generate procedural fallback images for dense/glitch intervals,
 * 3) build a render timeline for image-to-video assembly.
 */

export const VIDEO_ONSET_DEFAULTS = {
  threshold: 0.5,
  minTimeBetweenOnsetsMs: 100,
  minTimeBetweenGlitchesMs: 3500,
  anomalyThreshold: 2.5,
  anomalyHistorySize: 60,
  kickThreshold: 0.5,
  snareThreshold: 0.9,
  minRealImageInterval: 0.11,
};

const PROCEDURAL_PALETTES = [
  ['#FF006E', '#8338EC', '#3A86FF', '#06D6A0', '#FFD166'],
  ['#2D00F7', '#6A00F4', '#8900F2', '#A100F2', '#B100E8'],
  ['#FF0000', '#FF4400', '#FF8800', '#FFBB00', '#FFFF00'],
  ['#00F5D4', '#00BBF9', '#9B5DE5', '#F15BB5', '#FEE440'],
  ['#001219', '#005F73', '#0A9396', '#94D2BD', '#E9D8A6'],
  ['#10002B', '#240046', '#3C096C', '#5A189A', '#7B2D8E'],
  ['#03071E', '#370617', '#6A040F', '#9D0208', '#D00000'],
  ['#006466', '#065A60', '#0B525B', '#144552', '#1B3A4B'],
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function getPaletteIndex(spectralCentroid) {
  const index = Math.floor((spectralCentroid || 0) * PROCEDURAL_PALETTES.length);
  return ((index % PROCEDURAL_PALETTES.length) + PROCEDURAL_PALETTES.length) % PROCEDURAL_PALETTES.length;
}

function calculateLFC(spectrum) {
  let lfc = 0;
  const kickBinEnd = Math.min(10, spectrum.length);
  for (let k = 0; k < kickBinEnd; k += 1) {
    const magnitude = spectrum[k] / 255;
    const weight = kickBinEnd - k;
    lfc += weight * magnitude * magnitude;
  }
  return lfc;
}

function calculateHFC(spectrum) {
  let hfc = 0;
  for (let k = 0; k < spectrum.length; k += 1) {
    const magnitude = spectrum[k] / 255;
    hfc += k * magnitude * magnitude;
  }
  return hfc;
}

function calculateSpectralFlux(currentSpectrum, previousSpectrum) {
  let flux = 0;
  for (let k = 0; k < currentSpectrum.length; k += 1) {
    const current = currentSpectrum[k] / 255;
    const previous = previousSpectrum[k] / 255;
    flux += Math.max(0, current - previous);
  }
  return flux;
}

function calculateSpectralCentroid(spectrum) {
  let weightedSum = 0;
  let magnitudeSum = 0;
  for (let k = 0; k < spectrum.length; k += 1) {
    const magnitude = spectrum[k] / 255;
    weightedSum += k * magnitude;
    magnitudeSum += magnitude;
  }
  return magnitudeSum > 0 ? weightedSum / magnitudeSum : 0;
}

function calculateEnergy(spectrum) {
  let energy = 0;
  for (let k = 0; k < spectrum.length; k += 1) {
    const magnitude = spectrum[k] / 255;
    energy += magnitude * magnitude;
  }
  return energy;
}

function detectSpectralAnomaly({
  flux,
  centroid,
  fluxHistory,
  centroidHistory,
  nowMs,
  lastGlitchMs,
  minTimeBetweenGlitchesMs,
  anomalyThreshold,
}) {
  if ((nowMs - lastGlitchMs) < minTimeBetweenGlitchesMs) {
    return { detected: false, strength: 0 };
  }

  if (fluxHistory.length < 30) {
    return { detected: false, strength: 0 };
  }

  const fluxMean = fluxHistory.reduce((a, b) => a + b, 0) / fluxHistory.length;
  const fluxVariance = fluxHistory.reduce((sum, value) => sum + ((value - fluxMean) ** 2), 0) / fluxHistory.length;
  const fluxStdDev = Math.sqrt(fluxVariance);

  const centroidMean = centroidHistory.reduce((a, b) => a + b, 0) / centroidHistory.length;
  const centroidVariance = centroidHistory.reduce((sum, value) => sum + ((value - centroidMean) ** 2), 0) / centroidHistory.length;
  const centroidStdDev = Math.sqrt(centroidVariance);

  const fluxZScore = fluxStdDev > 0.001 ? (flux - fluxMean) / fluxStdDev : 0;
  const centroidZScore = centroidStdDev > 0.001 ? Math.abs(centroid - centroidMean) / centroidStdDev : 0;

  const anomalyScore = Math.max(fluxZScore, centroidZScore);
  if (anomalyScore > anomalyThreshold) {
    return { detected: true, strength: anomalyScore };
  }

  return { detected: false, strength: anomalyScore };
}

/**
 * Detect onset and glitch events from precomputed frequency frames.
 *
 * @param {Object} params
 * @param {Array<Uint8Array|number[]>} params.frequencyFrames - Byte spectra (0-255)
 * @param {number[]} params.frameTimes - Time in seconds for each frame
 * @param {Object} [params.options]
 * @returns {{ onsets: Array, glitches: Array }}
 */
export function detectVideoRenderEvents({ frequencyFrames, frameTimes, options = {} }) {
  const cfg = { ...VIDEO_ONSET_DEFAULTS, ...options };

  if (!Array.isArray(frequencyFrames) || frequencyFrames.length === 0) {
    return { onsets: [], glitches: [] };
  }

  if (!Array.isArray(frameTimes) || frameTimes.length !== frequencyFrames.length) {
    throw new Error('frameTimes must be provided with same length as frequencyFrames');
  }

  const onsets = [];
  const glitches = [];

  let previousSpectrum = new Uint8Array(frequencyFrames[0].length || 0);
  let previousOnsetFunction = 0;
  let previousKickScore = 0;
  let previousSnareScore = 0;
  let lastOnsetMs = -1e9;
  let lastGlitchMs = -1e9;

  const fluxHistory = [];
  const centroidHistory = [];

  for (let i = 0; i < frequencyFrames.length; i += 1) {
    const sourceFrame = frequencyFrames[i];
    const currentSpectrum = sourceFrame instanceof Uint8Array ? sourceFrame : Uint8Array.from(sourceFrame);
    const timeSec = Number(frameTimes[i]) || 0;
    const nowMs = timeSec * 1000;

    const hasAudio = currentSpectrum.some((value) => value > 0);
    if (!hasAudio) {
      previousSpectrum = currentSpectrum;
      previousOnsetFunction = 0;
      previousKickScore = 0;
      previousSnareScore = 0;
      continue;
    }

    const spectralCentroid = calculateSpectralCentroid(currentSpectrum);
    const energy = calculateEnergy(currentSpectrum);

    const lfc = calculateLFC(currentSpectrum);
    const hfc = calculateHFC(currentSpectrum);
    const flux = calculateSpectralFlux(currentSpectrum, previousSpectrum);

    fluxHistory.push(flux);
    centroidHistory.push(spectralCentroid);
    if (fluxHistory.length > cfg.anomalyHistorySize) fluxHistory.shift();
    if (centroidHistory.length > cfg.anomalyHistorySize) centroidHistory.shift();

    const normalizedLFC = lfc / 200;
    const normalizedHFC = hfc / 10000;
    const normalizedFlux = flux / 10;

    const recentEnergy = fluxHistory.slice(-4, -1);
    const avgEnergy = recentEnergy.length > 0
      ? recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length
      : flux;
    const energyRatio = avgEnergy > 0.001 ? flux / avgEnergy : 1.0;

    let diffCount = 0;
    for (let k = 0; k < currentSpectrum.length; k += 1) {
      const diff = Math.max(0, (currentSpectrum[k] - previousSpectrum[k]) / 255);
      if (diff > 0.02) diffCount += 1;
    }
    const onsetBandwidth = diffCount / currentSpectrum.length;

    const bandwidthFactor = clamp((onsetBandwidth - 0.05) / 0.15, 0, 1);
    const transientFactor = clamp(energyRatio / 2.5, 0, 1);
    const percussiveness = bandwidthFactor * transientFactor;

    const tonalGate = clamp((onsetBandwidth - 0.06) / 0.09, 0, 1);

    const kickScore = (0.4 * normalizedLFC) + (0.2 * normalizedFlux) + (0.4 * percussiveness);
    const snareScore = (0.3 * normalizedHFC) + (0.3 * normalizedFlux) + (0.4 * percussiveness);
    const isKick = kickScore > previousKickScore && kickScore > cfg.kickThreshold;
    const isSnare = snareScore > previousSnareScore && snareScore > cfg.snareThreshold;

    const rawOnset = (0.2 * normalizedLFC) + (0.15 * normalizedHFC) + (0.35 * normalizedFlux) + (0.3 * percussiveness);
    const onsetFunction = rawOnset * tonalGate;
    const isDrum = percussiveness > 0.60;

    const isOnset = (
      (nowMs - lastOnsetMs) >= cfg.minTimeBetweenOnsetsMs
      && onsetFunction > previousOnsetFunction
      && onsetFunction > cfg.threshold
    );

    if (isOnset && isDrum) {
      lastOnsetMs = nowMs;
      const drumType = isKick ? 'kick' : (isSnare ? 'snare' : 'percussion');
      onsets.push({
        time: timeSec,
        strength: onsetFunction,
        type: drumType,
        lfc: normalizedLFC,
        hfc: normalizedHFC,
        flux: normalizedFlux,
        energy,
        spectralCentroid,
      });
    }

    const anomalyResult = detectSpectralAnomaly({
      flux,
      centroid: spectralCentroid,
      fluxHistory,
      centroidHistory,
      nowMs,
      lastGlitchMs,
      minTimeBetweenGlitchesMs: cfg.minTimeBetweenGlitchesMs,
      anomalyThreshold: cfg.anomalyThreshold,
    });

    if (anomalyResult.detected) {
      lastGlitchMs = nowMs;
      glitches.push({
        time: timeSec,
        type: 'anomaly',
        strength: anomalyResult.strength,
        spectralCentroid,
        energy,
      });
    }

    previousSpectrum = currentSpectrum;
    previousOnsetFunction = onsetFunction;
    previousKickScore = kickScore;
    previousSnareScore = snareScore;
  }

  return { onsets, glitches };
}

/**
 * Procedural frame generator for video export fallback frames.
 *
 * Mirrors the frontend procedural generator behavior but allows deterministic
 * output via seed for reproducible downloaded video rendering.
 */
export class DownloadVideoProceduralGenerator {
  constructor({ width = 1024, height = 1024 } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
  }

  setSize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  generate(params = {}) {
    const {
      energy = Math.random(),
      lfc = Math.random(),
      hfc = Math.random(),
      spectralCentroid = Math.random(),
      type = 'unknown',
      glitch = false,
      seed,
      mimeType = 'image/jpeg',
      quality = 0.85,
    } = params;

    const random = Number.isInteger(seed) ? mulberry32(seed) : Math.random;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const paletteIdx = getPaletteIndex(spectralCentroid);
    const palette = PROCEDURAL_PALETTES[paletteIdx];

    const angle = random() * Math.PI * 2;
    const gx1 = w / 2 + Math.cos(angle) * w / 2;
    const gy1 = h / 2 + Math.sin(angle) * h / 2;
    const gx2 = w - gx1;
    const gy2 = h - gy1;

    const gradient = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
    gradient.addColorStop(0, palette[0]);
    gradient.addColorStop(0.5, palette[1]);
    gradient.addColorStop(1, palette[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    const largeShapeCount = 3 + Math.floor(clamp(lfc, 0, 1) * 5);
    for (let i = 0; i < largeShapeCount; i += 1) {
      ctx.save();
      ctx.globalAlpha = 0.2 + random() * 0.3;
      ctx.fillStyle = palette[Math.floor(random() * palette.length)];
      ctx.beginPath();
      const cx = random() * w;
      const cy = random() * h;
      const radius = 50 + clamp(energy, 0, 1) * 150 + random() * 100;

      const points = 5 + Math.floor(random() * 4);
      for (let j = 0; j <= points; j += 1) {
        const a = (j / points) * Math.PI * 2;
        const r = radius * (0.7 + random() * 0.6);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (j === 0) {
          ctx.moveTo(x, y);
        } else {
          const cpx = cx + Math.cos(a - 0.3) * r * 1.2;
          const cpy = cy + Math.sin(a - 0.3) * r * 1.2;
          ctx.quadraticCurveTo(cpx, cpy, x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const geoCount = 5 + Math.floor(clamp(hfc, 0, 1) * 15);
    for (let i = 0; i < geoCount; i += 1) {
      ctx.save();
      ctx.globalAlpha = 0.1 + random() * 0.4;
      const color = palette[Math.floor(random() * palette.length)];
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1 + random() * 3;

      const x = random() * w;
      const y = random() * h;
      const size = 10 + random() * (60 + clamp(energy, 0, 1) * 80);

      const shapeType = Math.floor(random() * 4);
      switch (shapeType) {
        case 0:
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          random() > 0.5 ? ctx.fill() : ctx.stroke();
          break;
        case 1:
          ctx.beginPath();
          ctx.moveTo(x, y - size);
          ctx.lineTo(x - size * 0.866, y + size * 0.5);
          ctx.lineTo(x + size * 0.866, y + size * 0.5);
          ctx.closePath();
          random() > 0.5 ? ctx.fill() : ctx.stroke();
          break;
        case 2:
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            x + Math.cos(random() * Math.PI * 2) * size * 2,
            y + Math.sin(random() * Math.PI * 2) * size * 2,
          );
          ctx.stroke();
          break;
        default:
          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
          ctx.stroke();
          break;
      }

      ctx.restore();
    }

    const particleCount = Math.floor(clamp(energy, 0, 1) * 100);
    for (let i = 0; i < particleCount; i += 1) {
      ctx.save();
      ctx.globalAlpha = 0.3 + random() * 0.5;
      ctx.fillStyle = palette[Math.floor(random() * palette.length)];
      const x = random() * w;
      const y = random() * h;
      const r = 1 + random() * 4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (type === 'kick' || clamp(energy, 0, 1) > 0.6) {
      const flareX = w * (0.2 + random() * 0.6);
      const flareY = h * (0.2 + random() * 0.6);
      const flareGradient = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, 200);
      flareGradient.addColorStop(0, 'rgba(255,255,255,0.4)');
      flareGradient.addColorStop(0.5, `${palette[3]}44`);
      flareGradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = flareGradient;
      ctx.fillRect(0, 0, w, h);
    }

    if (glitch) {
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      const shiftR = Math.floor(random() * 21) - 10;
      const shiftG = Math.floor(random() * 29) - 14;
      const shiftB = Math.floor(random() * 17) - 8;

      const copy = new Uint8ClampedArray(data);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const idx = (y * w + x) * 4;

          const rx = (x + shiftR + w) % w;
          const gx = (x + shiftG + w) % w;
          const by = (y + shiftB + h) % h;

          const ridx = (y * w + rx) * 4;
          const gidx = (y * w + gx) * 4;
          const bidx = (by * w + x) * 4;

          data[idx] = copy[ridx];
          data[idx + 1] = copy[gidx + 1];
          data[idx + 2] = copy[bidx + 2];
        }
      }

      for (let y = 0; y < h; y += 6) {
        for (let x = 0; x < w; x += 1) {
          const idx = (y * w + x) * 4;
          data[idx] *= 0.55;
          data[idx + 1] *= 0.55;
          data[idx + 2] *= 0.55;
        }
      }

      const speckleChance = 0.01 + 0.04 * clamp(energy, 0, 1);
      for (let i = 0; i < data.length; i += 4) {
        if (random() < speckleChance) {
          data[i] = Math.floor(random() * 255);
          data[i + 1] = Math.floor(random() * 255);
          data[i + 2] = Math.floor(random() * 255);
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }

    return this.canvas.toDataURL(mimeType, quality);
  }
}

/**
 * Build a render timeline for downloaded video export.
 *
 * Intervals are onset-synced when onsets exist, and fallback/procedural frames
 * are inserted for dense intervals and glitch windows.
 */
export function buildDownloadedVideoRenderPlan({
  imageUrls,
  onsets,
  glitches,
  audioDuration,
  frameDuration = 0.45,
  options = {},
}) {
  const cfg = { ...VIDEO_ONSET_DEFAULTS, ...options };
  const safeImages = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
  const safeOnsets = Array.isArray(onsets) ? onsets : [];
  const safeGlitches = Array.isArray(glitches) ? glitches : [];

  if (safeImages.length === 0) {
    throw new Error('imageUrls must contain at least one URL');
  }

  const totalDuration = Math.max(0, Number(audioDuration) || 0);
  if (totalDuration <= 0) {
    return {
      segments: safeImages.map((url) => ({
        start: 0,
        duration: Math.max(0.02, frameDuration),
        sourceType: 'image',
        source: url,
      })),
      usedOnsets: false,
      proceduralCount: 0,
      glitchCount: 0,
    };
  }

  const onsetTimes = [0];
  for (let i = 0; i < safeOnsets.length; i += 1) {
    const t = Number(safeOnsets[i]?.time) || 0;
    if (t <= 0 || t >= totalDuration) continue;
    if ((t - onsetTimes[onsetTimes.length - 1]) < 0.02) continue;
    onsetTimes.push(t);
  }
  if (onsetTimes[onsetTimes.length - 1] < totalDuration) {
    onsetTimes.push(totalDuration);
  }

  const usedOnsets = onsetTimes.length > 2;
  const segments = [];
  let proceduralCount = 0;
  let glitchCount = 0;

  if (!usedOnsets) {
    let t = 0;
    let imageIdx = 0;
    while (t < totalDuration) {
      const duration = Math.min(Math.max(0.02, frameDuration), totalDuration - t);
      segments.push({
        start: t,
        duration,
        sourceType: 'image',
        source: safeImages[imageIdx % safeImages.length],
      });
      imageIdx += 1;
      t += duration;
    }

    return { segments, usedOnsets: false, proceduralCount: 0, glitchCount: 0 };
  }

  let imageIdx = 0;
  let onsetIdx = 0;
  let glitchIdx = 0;

  for (let i = 0; i < onsetTimes.length - 1; i += 1) {
    const start = onsetTimes[i];
    const end = onsetTimes[i + 1];
    const duration = Math.max(0.02, end - start);

    while (
      onsetIdx + 1 < safeOnsets.length
      && (Number(safeOnsets[onsetIdx + 1]?.time) || 0) <= start
    ) {
      onsetIdx += 1;
    }

    let hasGlitch = false;
    while (glitchIdx < safeGlitches.length) {
      const glitchTime = Number(safeGlitches[glitchIdx]?.time) || 0;
      if (glitchTime < start) {
        glitchIdx += 1;
        continue;
      }
      if (glitchTime < end) hasGlitch = true;
      break;
    }

    const needsProcedural = duration < cfg.minRealImageInterval;
    if (hasGlitch || needsProcedural) {
      proceduralCount += 1;
      if (hasGlitch) glitchCount += 1;
      const onset = safeOnsets[onsetIdx] || {};
      segments.push({
        start,
        duration,
        sourceType: 'procedural',
        source: {
          energy: onset.energy ?? 0.5,
          lfc: onset.lfc ?? 0,
          hfc: onset.hfc ?? 0,
          spectralCentroid: onset.spectralCentroid ?? 0,
          type: onset.type ?? 'percussion',
          glitch: hasGlitch,
          seed: ((i * 1103515245) + 1337) >>> 0,
        },
      });
    } else {
      segments.push({
        start,
        duration,
        sourceType: 'image',
        source: safeImages[imageIdx % safeImages.length],
      });
      imageIdx += 1;
    }
  }

  return {
    segments,
    usedOnsets: true,
    proceduralCount,
    glitchCount,
  };
}

/**
 * Helper: convert procedural segments to renderable data URLs.
 */
export function materializeProceduralSegments(segments, generator) {
  if (!Array.isArray(segments)) return [];
  if (!generator) throw new Error('generator is required');

  return segments.map((segment) => {
    if (segment.sourceType !== 'procedural') return segment;
    const dataUrl = generator.generate(segment.source || {});
    return {
      ...segment,
      sourceType: 'image',
      source: dataUrl,
    };
  });
}
