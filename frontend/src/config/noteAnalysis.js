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
  const velocities = notes.map((n) => n.velocity);
  const pitches = notes.map((n) => n.note);
  const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  const avgPitch = pitches.reduce((a, b) => a + b, 0) / pitches.length;
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const pitchRange = maxPitch - minPitch;

  // Velocity variance (normalised 0-1)
  const velVariance =
    velocities.reduce((s, v) => s + (v - avgVelocity) ** 2, 0) / velocities.length;
  const velStd = Math.sqrt(velVariance) / 127; // 0-1

  // ── Time-based metrics ─────────────────────────────────────────
  const windowMs = notes[notes.length - 1].ts - notes[0].ts;
  const windowSec = Math.max(windowMs / 1000, 0.1);
  const notesPerSec = notes.length / windowSec;

  // Inter-onset intervals
  const iois = [];
  for (let i = 1; i < notes.length; i++) {
    iois.push(notes[i].ts - notes[i - 1].ts);
  }
  // IOI regularity: low std = rhythmic, high std = rubato
  const avgIOI = iois.reduce((a, b) => a + b, 0) / iois.length;
  const ioiVariance = iois.reduce((s, v) => s + (v - avgIOI) ** 2, 0) / iois.length;
  const ioiCv = avgIOI > 0 ? Math.sqrt(ioiVariance) / avgIOI : 1; // coefficient of variation

  // ── Interval analysis (valence) ────────────────────────────────
  let majorCount = 0;
  let minorCount = 0;
  for (let i = 1; i < notes.length; i++) {
    const interval = Math.abs(notes[i].note - notes[i - 1].note) % 12;
    if (MAJOR_INTERVALS.has(interval)) majorCount++;
    if (MINOR_INTERVALS.has(interval)) minorCount++;
  }
  const totalIntervals = majorCount + minorCount || 1;
  const majorRatio = majorCount / totalIntervals; // 0-1

  // ── Feature derivation ─────────────────────────────────────────
  const clamp = (v) => Math.max(0, Math.min(1, v));

  // Energy — driven by velocity and note density
  const energy = clamp(avgVelocity / 127 * 0.6 + Math.min(notesPerSec / 8, 1) * 0.4);

  // Valence — major intervals = happy, minor = sad, velocity adds warmth
  const valence = clamp(majorRatio * 0.7 + (avgVelocity / 127) * 0.3);

  // Tempo feel — note density mapped to 0-1 (8 notes/sec = max)
  const tempo = clamp(notesPerSec / 8);

  // Danceability — rhythmic regularity (low CV = danceable) + density
  const danceability = clamp((1 - Math.min(ioiCv, 2) / 2) * 0.7 + tempo * 0.3);

  // Acousticness — higher with softer dynamics and wider velocity range
  const acousticness = clamp((1 - avgVelocity / 127) * 0.4 + velStd * 0.6);

  // Instrumentalness — increases with pitch range (melodic exploration)
  const instrumentalness = clamp(pitchRange / 48); // 4 octaves = max

  // Speechiness — low for instrumental playing
  const speechiness = clamp(0.1);

  // Spectral centroid proxy — average pitch mapped to brightness
  const spectral_centroid = clamp((avgPitch - 36) / 60); // C2→C7 range

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
