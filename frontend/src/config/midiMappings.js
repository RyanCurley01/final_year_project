// src/config/midiMappings.js
// Default CC → AudioFeature mappings and helpers for the MIDI Explorer

/**
 * Audio features available for MIDI mapping.
 * Each key matches what the audio service expects.
 */
export const AUDIO_FEATURES = {
  energy:        { label: 'Energy',        min: 0, max: 1, default: 0.5, color: '#f97316', description: 'Intensity / loudness' },
  valence:       { label: 'Valence',       min: 0, max: 1, default: 0.5, color: '#facc15', description: 'Mood — sad to happy' },
  tempo:         { label: 'Tempo',         min: 0, max: 1, default: 0.5, color: '#ef4444', description: 'BPM (normalized 0-1)' },
  danceability:  { label: 'Danceability',  min: 0, max: 1, default: 0.5, color: '#a855f7', description: 'Rhythm strength' },
  acousticness:  { label: 'Acousticness',  min: 0, max: 1, default: 0.5, color: '#22c55e', description: 'Organic / acoustic sound' },
  instrumentalness: { label: 'Instrumentalness', min: 0, max: 1, default: 0.5, color: '#06b6d4', description: 'Vocal absence' },
  speechiness:   { label: 'Speechiness',   min: 0, max: 1, default: 0.1, color: '#ec4899', description: 'Spoken word presence' },
  spectral_centroid: { label: 'Brightness', min: 0, max: 1, default: 0.3, color: '#eab308', description: 'Spectral centroid (treble)' },
};

/**
 * Default MIDI CC → feature mapping.
 * Users can override this in the UI.  Keys are CC numbers (1-127).
 */
export const DEFAULT_CC_MAP = {
  1:  'energy',            // Mod wheel
  2:  'valence',           // Breath / generic CC2
  3:  'tempo',             // CC3
  4:  'danceability',      // CC4
  5:  'acousticness',      // CC5
  7:  'instrumentalness',  // Volume (common)
  10: 'speechiness',       // Pan (common)
  74: 'spectral_centroid', // Filter cutoff (common on synths)
};

/** Convert a raw 0-127 MIDI CC value to the feature's 0-1 range */
export function ccToFeatureValue(ccValue, featureKey) {
  const meta = AUDIO_FEATURES[featureKey];
  if (!meta) return ccValue / 127;
  return meta.min + (ccValue / 127) * (meta.max - meta.min);
}

/**
 * Russell's Circumplex Model of Affect which
 * maps emotions across a 2D plane using Energy 
 * (intensity) and Valence (positivity).
 */
export function deriveMood(energy, valence) {
  if (energy >= 0.5 && valence >= 0.5) return { mood: 'Energetic', emoji: '⚡' };
  if (energy < 0.5  && valence >= 0.5) return { mood: 'Happy',     emoji: '😊' };
  if (energy < 0.5  && valence < 0.5)  return { mood: 'Calm',      emoji: '🌊' };
  return { mood: 'Sad', emoji: '🌧️' };
}

/** Build a feature target object from current CC values + mappings */
export function buildTargetFromCCs(ccValues, ccMap) {
  const target = {};
  for (const [featureKey, meta] of Object.entries(AUDIO_FEATURES)) {
    target[featureKey] = meta.default; // start with defaults
  }
  for (const [ccNumStr, featureKey] of Object.entries(ccMap)) {
    const key = ccNumStr; // could be "1.74" (channel.cc) or just "74"
    // Try channel-qualified first, then bare CC
    let raw = null;
    for (const [k, v] of ccValues.entries()) {
      // k is "channel.cc" — match the cc portion
      const parts = k.split('.');
      if (parts[1] === String(ccNumStr) || k === String(ccNumStr)) {
        raw = v;
        break;
      }
    }
    if (raw !== null) {
      target[featureKey] = ccToFeatureValue(raw, featureKey);
    }
  }
  return target;
}
