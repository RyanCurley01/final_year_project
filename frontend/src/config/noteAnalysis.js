// src/config/noteAnalysis.js
// Derive audio features from a rolling window of played MIDI notes.
// Each note: { note: 0-127, velocity: 0-127, type: 'on'|'off', ts: number }

/** Interval semitones that are "major" / happy sounding */
const MAJOR_INTERVALS = new Set([0, 2, 4, 5, 7, 9, 11]); // unison, M2, M3, P4, P5, M6, M7
/** Interval semitones that are "minor" / dark sounding */
const MINOR_INTERVALS = new Set([1, 3, 6, 8, 10]); // m2, m3, tritone, m6, m7

/**
 * Analyse a window of recent note-on events and derive 0-1 feature values.
 *
 * @param {Array} notes — note-on events with { note, velocity, ts }
 * @returns {{ energy, valence, tempo, danceability, acousticness, instrumentalness, speechiness, spectral_centroid } | null}
 */
export function analyseNoteWindow(notes) {
  if (!notes || notes.length < 2) return null;

  // ── Basic stats ────────────────────────────────────────────────
  // Splits the array of note objects into two separate arrays: 
  // one just containing how hard the keys were pressed (velocities), 
  // and another containing just the musical pitches (pitches).
  const velocities = notes.map((n) => n.velocity);
  const pitches = notes.map((n) => n.note);

  // Calculates the mathematical mean (average) for how hard the player was playing overall (avgVelocity) 
  // and roughly where on the keyboard their hands were resting (avgPitch) natively from 0 to 127.
  const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;

  // Finds the absolute lowest note, the absolute highest note, 
  // and calculates the total semitone spread (range) of the melody.
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const pitchRange = maxPitch - minPitch;

  // Calculates mathematical variance of the velocities. If the player plays some notes soft 
  // and some loud, this number is high. If they slam every note equally, it's low.
  const velVariance =
    velocities.reduce((s, v) => s + (v - avgVelocity) ** 2, 0) / velocities.length;

  // Standard Deviation of velocities. It is divided by 127 to normalize it to a 0.0 to 1.0 scale.
  const velStd = Math.sqrt(velVariance) / 127; 

  // ── Time-based metrics ─────────────────────────────────────────
  // windowMs: Time elapsed (in milliseconds) from the first note in the array to the last note.
  // windowSec: Converts to seconds. Math.max prevents "Divide-by-Zero" if keys are pressed at exact same ms.
  // notesPerSec: Calculates the player's sheer speed (density).
  const windowMs = notes[notes.length - 1].ts - notes[0].ts;
  const windowSec = Math.max(windowMs / 1000, 0.1);
  const notesPerSec = notes.length / windowSec;

  // IOI (Inter-Onset Interval): A loop that determines the exact time gap (in milliseconds) 
  // between every newly played note and the one right before it.
  const iois = [];
  for (let i = 1; i < notes.length; i++) {
    iois.push(notes[i].ts - notes[i - 1].ts);
  }

  // IOI regularity: Calculates average gap between notes and the variance of those gaps.
  // ioiCv is the Coefficient of Variation. mathematically: are you playing like a steady 
  // metronome (low variation), or erratically pausing and speeding up (high variation)?
  const avgIOI = iois.reduce((a, b) => a + b, 0) / iois.length;
  const ioiVariance = iois.reduce((s, v) => s + (v - avgIOI) ** 2, 0) / iois.length;
  const ioiCv = avgIOI > 0 ? Math.sqrt(ioiVariance) / avgIOI : 1; 

  // ── Interval analysis (valence) ────────────────────────────────
  let majorCount = 0;
  let minorCount = 0;

  // Loops over every consecutive pair of notes.
  for (let i = 1; i < notes.length; i++) {
    // interval: Subtracts the two pitches to find the distance, 
    // and uses Modulo 12 (% 12) to ignore octave jumps, isolating just the "musical interval class".
    const interval = Math.abs(notes[i].note - notes[i - 1].note) % 12;
    // Increments a counter based on whether the jump belongs to the Happy/Major list or Sad/Minor list.
    if (MAJOR_INTERVALS.has(interval)) majorCount++;
    if (MINOR_INTERVALS.has(interval)) minorCount++;
  }

  // Calculates what percentage of the player's note jumps were "Major". 
  // (e.g. 0.8 means 80% of their playing sounded major/happy).
  const totalIntervals = majorCount + minorCount || 1;
  const majorRatio = majorCount / totalIntervals; // 0-1

  // Distilling Features (The 0-to-1 Mapping)
  // ── Feature derivation ─────────────────────────────────────────

  // A utility function guaranteeing that no final score ever falls below 0.0 or exceeds 1.0.
  const clamp = (v) => Math.max(0, Math.min(1, v));

  // Energy: Takes heavy playing (avgVelocity mapped to 0-1) and weights that at 60%. 
  // Takes speed (fast playing up to 8 notes a second) and weights that at 40%. The result is total physical energy.
  const energy = clamp(avgVelocity / 127 * 0.6 + Math.min(notesPerSec / 8, 1) * 0.4);

  // Valence (Happiness): Weighted 70% by how many major intervals were played, 
  // and 30% by how hard the keys were hit (harder velocities imply higher confidence/positivity).
  const valence = clamp(majorRatio * 0.7 + (avgVelocity / 127) * 0.3);

  // Tempo: Purely determined by the speed of playing, maxing out at an average of 8 notes pressing per second.
  const tempo = clamp(notesPerSec / 8);

  // Danceability: 70% driven by rhythmic steadiness (mathematically consistent gaps). 
  // A lower Coefficient of Variation (ioiCv) is better here. 
  // Rewards playing like a steady metronome. 30% is based on the tempo.
  const danceability = clamp((1 - Math.min(ioiCv, 2) / 2) * 0.7 + tempo * 0.3);

  // Acousticness: Acoustic instruments are dynamically expressive. 
  // Favors playing overall quieter (inversing the velocity) 
  // while having high expression (high standard deviation of velocity).
  const acousticness = clamp((1 - avgVelocity / 127) * 0.4 + velStd * 0.6);

  // Instrumentalness: Measured by how widely the player moves their hands across the keyboard. 
  // Reaches 100% if they traverse at least 4 octaves (48 semitones).
  const instrumentalness = clamp(pitchRange / 48); 

  // Speechiness: Hardcoded to 0.1 because pianos don't talk.
  const speechiness = clamp(0.1);

  // Spectral Centroid (Brightness): Calculates whether the player's hands are primarily on the bass 
  // or treble side of the keyboard. Normalizes note 36 (Low C2) to note 96 (High C7) into a 0-1 score.
  const spectral_centroid = clamp((avgPitch - 36) / 60); 

  return {
    energy,
    valence,
    tempo,
    danceability,
    acousticness,
    instrumentalness,
    speechiness,
    spectral_centroid,
  };
}

const KEY_TO_PC = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));

function normalize(vec) {
  if (!Array.isArray(vec) || vec.length === 0) return [];
  const sum = vec.reduce((a, b) => a + Math.max(0, Number(b) || 0), 0);
  if (sum <= 1e-9) return vec.map(() => 0);
  return vec.map((v) => (Math.max(0, Number(v) || 0)) / sum);
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  if (aa <= 1e-9 || bb <= 1e-9) return 0;
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

function topIndices(values, n = 6) {
  return values
    .map((value, index) => ({ index, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
    .map((entry) => entry.index);
}

function orderAgreement(a, b) {
  if (!a.length || !b.length) return 0;
  const limit = Math.min(a.length, b.length);
  const posB = new Map();
  b.forEach((v, i) => posB.set(v, i));
  let inOrder = 0;
  let compared = 0;
  for (let i = 0; i < limit; i += 1) {
    const v = a[i];
    if (!posB.has(v)) continue;
    compared += 1;
    const delta = Math.abs(i - posB.get(v));
    if (delta <= 1) inOrder += 1;
  }
  if (compared === 0) return 0;
  return inOrder / compared;
}

/**
 * Build melody fingerprint from played MIDI notes.
 * Captures both order-independent pitch class content and order-sensitive contour.
 */
export function buildPlayedMelodyProfile(notes) {
  if (!Array.isArray(notes) || notes.length < 4) return null;

  const onNotes = notes
    .filter((n) => Number.isFinite(n?.note) && Number.isFinite(n?.velocity) && Number.isFinite(n?.ts))
    .slice(-64);

  if (onNotes.length < 4) return null;

  const pitchClassHist = Array.from({ length: 12 }, () => 0);
  const intervalClassHist = Array.from({ length: 12 }, () => 0);
  const contour = { up: 0, down: 0, repeat: 0 };

  for (let i = 0; i < onNotes.length; i += 1) {
    const pc = ((onNotes[i].note % 12) + 12) % 12;
    pitchClassHist[pc] += 1;
    if (i === 0) continue;
    const diff = onNotes[i].note - onNotes[i - 1].note;
    const ic = Math.abs(diff) % 12;
    intervalClassHist[ic] += 1;
    if (diff > 0) contour.up += 1;
    else if (diff < 0) contour.down += 1;
    else contour.repeat += 1;
  }

  const pitchClassNorm = normalize(pitchClassHist);
  const intervalClassNorm = normalize(intervalClassHist);
  const contourTotal = contour.up + contour.down + contour.repeat || 1;
  const contourVec = [
    contour.up / contourTotal,
    contour.down / contourTotal,
    contour.repeat / contourTotal,
  ];

  const avgVelocity = onNotes.reduce((sum, n) => sum + n.velocity, 0) / onNotes.length;
  const ioi = [];
  for (let i = 1; i < onNotes.length; i += 1) {
    ioi.push(Math.max(1, onNotes[i].ts - onNotes[i - 1].ts));
  }
  const avgIOI = ioi.length ? ioi.reduce((a, b) => a + b, 0) / ioi.length : 250;
  const tempoProxy = clamp(60000 / (4 * avgIOI) / 200);

  return {
    noteCount: onNotes.length,
    pitchClassNorm,
    intervalClassNorm,
    contourVec,
    pitchClassOrder: topIndices(pitchClassNorm, 6),
    tempoProxy,
    energyProxy: clamp(avgVelocity / 127),
  };
}

/**
 * Build a song melody proxy from audio-feature cache rows.
 */
export function buildSongMelodyProxy(features) {
  if (!features || typeof features !== 'object') return null;

  const rawChroma = Array.isArray(features.chroma_mean) && features.chroma_mean.length === 12
    ? features.chroma_mean
    : Array.from({ length: 12 }, () => 1 / 12);
  const chromaNorm = normalize(rawChroma);

  const keySignature = features.key_signature || features.key || null;
  const keyPc = keySignature && KEY_TO_PC[keySignature] != null ? KEY_TO_PC[keySignature] : null;
  const keyVector = Array.from({ length: 12 }, (_, i) => (keyPc != null && i === keyPc ? 1 : 0));

  return {
    pitchClassNorm: chromaNorm,
    pitchClassOrder: topIndices(chromaNorm, 6),
    keyVector,
    keyPc,
    tempoNorm: clamp((Number(features.tempo) || 120) / 200),
    energyNorm: clamp(Number(features.energy) || 0.5),
    danceNorm: clamp(Number(features.danceability) || 0.5),
  };
}

/**
 * Score whether played notes are likely contained in a song melody space.
 */
export function scoreMelodyContainment(playedProfile, songProxy) {
  if (!playedProfile || !songProxy) return 0;

  const pitchOverlap = clamp(cosine(playedProfile.pitchClassNorm, songProxy.pitchClassNorm));
  const keyAgreement = songProxy.keyPc == null
    ? 0.5
    : clamp(playedProfile.pitchClassNorm[songProxy.keyPc] * 2);
  const tempoAgreement = 1 - Math.abs((playedProfile.tempoProxy || 0.5) - (songProxy.tempoNorm || 0.5));

  return clamp((pitchOverlap * 0.65) + (keyAgreement * 0.2) + (tempoAgreement * 0.15));
}

/**
 * Score "same note palette but different order" vs played melody.
 */
export function scoreDifferentOrderSimilarity(playedProfile, songProxy) {
  if (!playedProfile || !songProxy) return 0;

  const pitchOverlap = clamp(cosine(playedProfile.pitchClassNorm, songProxy.pitchClassNorm));
  const orderAlign = clamp(orderAgreement(playedProfile.pitchClassOrder, songProxy.pitchClassOrder));
  const rhythmCompat = clamp(1 - Math.abs((playedProfile.tempoProxy || 0.5) - (songProxy.tempoNorm || 0.5)));

  // High overlap, low order alignment => likely similar notes in a different arrangement.
  return clamp((pitchOverlap * 0.7) + ((1 - orderAlign) * 0.2) + (rhythmCompat * 0.1));
}
