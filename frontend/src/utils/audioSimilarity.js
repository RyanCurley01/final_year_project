/**
 * Audio Similarity Logic (Ported from audio_service/main.py)
 * Generates Real Similarity Scores based on Weighted Euclidean Distance logic.
 */

export const calculateSimilarity = (currentFeatures, targetFeatures, playbackRate = 1.0) => {
  if (!currentFeatures || !targetFeatures) return 0;

  // 0. Detect "Default/Unanalyzed" Data to prevent fake 99% matches
  // If both songs have exactly 120 BPM and 0.5 Energy, they are likely unanalyzed.
  const isDefault = (f) => {
      const t = f.tempo || 0;
      const e = f.energy || 0.5;
      const v = f.valence ?? 0.5; // Use nullish coalescing for 0 values
      // Check for exact defaults used in DB initialization
      return Math.abs(t - 120) < 0.1 && Math.abs(e - 0.5) < 0.001 && Math.abs(v - 0.5) < 0.001;
  };

  if (isDefault(currentFeatures) && isDefault(targetFeatures)) {
      return 0.05; // Return very low match for two unanalyzed songs
  }

  // 1. Tempo Match (Exact logic from compute_artist_similarity)
  let currentTempo = 120;
  if (currentFeatures.effective_tempo) {
    currentTempo = currentFeatures.effective_tempo;
  } else if (currentFeatures.tempo) {
    currentTempo = currentFeatures.tempo * playbackRate;
  }
  const targetTempo = targetFeatures.tempo || 120;

  const tempoDiff = Math.abs(targetTempo - currentTempo);
  const tempoMatch = 1 - Math.min(tempoDiff / 100.0, 1.0);

  // 2. Feature Matching (Exact logic from compute_artist_similarity)
  // Python: 1 - abs(target - feature)
  
  const getFeature = (obj, key) => (obj && obj[key] !== undefined && obj[key] !== null) ? obj[key] : null;

  const cEnergy = getFeature(currentFeatures, 'energy');
  const tEnergy = getFeature(targetFeatures, 'energy');
  const energyMatch = (cEnergy !== null && tEnergy !== null) ? Math.max(0, 1 - Math.abs(tEnergy - cEnergy)) : 0;

  const cValence = getFeature(currentFeatures, 'valence');
  const tValence = getFeature(targetFeatures, 'valence');
  const moodMatch = (cValence !== null && tValence !== null) ? Math.max(0, 1 - Math.abs(tValence - cValence)) : 0;

  const cDance = getFeature(currentFeatures, 'danceability');
  const tDance = getFeature(targetFeatures, 'danceability');
  const danceMatch = (cDance !== null && tDance !== null) ? Math.max(0, 1 - Math.abs(tDance - cDance)) : 0;

  // 3. Weighted Score (Exact weights from compute_artist_similarity)
  // Tempo (25%) + Energy (30%) + Mood (20%) + Danceability (25%)
  let similarity = (
    tempoMatch * 0.25 +
    energyMatch * 0.30 +
    moodMatch * 0.20 +
    danceMatch * 0.25
  );

  // 4. Genre Bonus (Small consistency boost if genres match)
  if (currentFeatures.genre && targetFeatures.genre && 
      currentFeatures.genre !== 'Unknown' && 
      currentFeatures.genre === targetFeatures.genre) {
     similarity = Math.min(1.0, similarity + 0.05);
  }

  // 5. Realism Clamp (99%)
  if (similarity > 0.99) similarity = 0.99;

  return Math.max(0, similarity);
};
