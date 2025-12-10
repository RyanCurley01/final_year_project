import { useEffect, useRef, useState } from 'react';

/**
 * AudioAnalyzer - Extracts real-time audio features using Web Audio API
 * This component analyzes the currently playing audio and extracts features
 * similar to what Spotify's audio analysis provides
 */
const AudioAnalyzer = ({ audioElement, onFeaturesExtracted, isPlaying }) => {
  const [audioContext, setAudioContext] = useState(null);
  const [analyser, setAnalyser] = useState(null);
  const [features, setFeatures] = useState(null);
  const animationFrameRef = useRef(null);
  const sourceNodeRef = useRef(null);

  // Initialize Web Audio API
  useEffect(() => {
    if (!audioElement || audioContext) return;

    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const analyserNode = context.createAnalyser();
      
      // Configure analyser
      analyserNode.fftSize = 2048;
      analyserNode.smoothingTimeConstant = 0.8;

      setAudioContext(context);
      setAnalyser(analyserNode);

      // Connect audio element to analyser
      if (!sourceNodeRef.current) {
        const source = context.createMediaElementSource(audioElement);
        source.connect(analyserNode);
        analyserNode.connect(context.destination);
        sourceNodeRef.current = source;
      }
    } catch (error) {
      console.error('Error initializing audio context:', error);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioElement]);

  // Extract audio features in real-time
  useEffect(() => {
    if (!analyser || !isPlaying) return;

    const extractFeatures = () => {
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const timeDataArray = new Uint8Array(bufferLength);
      
      // Get frequency and time domain data
      analyser.getByteFrequencyData(dataArray);
      analyser.getByteTimeDomainData(timeDataArray);

      // Calculate features
      const extractedFeatures = calculateAudioFeatures(dataArray, timeDataArray, bufferLength);
      
      setFeatures(extractedFeatures);
      
      if (onFeaturesExtracted) {
        onFeaturesExtracted(extractedFeatures);
      }

      // Continue analysis loop
      animationFrameRef.current = requestAnimationFrame(extractFeatures);
    };

    extractFeatures();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyser, isPlaying, onFeaturesExtracted]);

  return null; // This is a headless component
};

/**
 * Calculate audio features from frequency and time domain data
 */
function calculateAudioFeatures(frequencyData, timeData, bufferLength) {
  // Energy: Overall amplitude/loudness
  const energy = calculateEnergy(frequencyData);
  
  // Spectral Centroid: "Brightness" of sound
  const spectralCentroid = calculateSpectralCentroid(frequencyData);
  
  // Spectral Rolloff: Frequency below which 85% of spectrum energy is contained
  const spectralRolloff = calculateSpectralRolloff(frequencyData);
  
  // Zero Crossing Rate: Rate of sign changes (noisiness)
  const zeroCrossingRate = calculateZeroCrossingRate(timeData);
  
  // Estimate tempo from autocorrelation (simplified)
  const tempo = estimateTempo(energy);
  
  // Loudness in dB
  const loudness = calculateLoudness(frequencyData);
  
  // Valence (positivity) - derived from spectral features
  const valence = calculateValence(spectralCentroid, energy);
  
  // Danceability - based on beat strength and regularity
  const danceability = calculateDanceability(energy, tempo);
  
  // Acousticness - inverse of high frequency content
  const acousticness = calculateAcousticness(frequencyData);
  
  // Instrumentalness - lack of vocal frequencies
  const instrumentalness = calculateInstrumentalness(frequencyData);
  
  // Speechiness - presence in vocal frequency range
  const speechiness = 1 - instrumentalness;

  return {
    tempo: Math.round(tempo),
    energy: parseFloat(energy.toFixed(3)),
    danceability: parseFloat(danceability.toFixed(3)),
    valence: parseFloat(valence.toFixed(3)),
    acousticness: parseFloat(acousticness.toFixed(3)),
    instrumentalness: parseFloat(instrumentalness.toFixed(3)),
    loudness: parseFloat(loudness.toFixed(2)),
    speechiness: parseFloat(speechiness.toFixed(3)),
    spectral_centroid: parseFloat(spectralCentroid.toFixed(2)),
    spectral_rolloff: parseFloat(spectralRolloff.toFixed(2)),
    zero_crossing_rate: parseFloat(zeroCrossingRate.toFixed(3)),
  };
}

// Feature calculation functions
function calculateEnergy(frequencyData) {
  let sum = 0;
  for (let i = 0; i < frequencyData.length; i++) {
    sum += frequencyData[i] * frequencyData[i];
  }
  return Math.sqrt(sum / frequencyData.length) / 255;
}

function calculateSpectralCentroid(frequencyData) {
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < frequencyData.length; i++) {
    numerator += i * frequencyData[i];
    denominator += frequencyData[i];
  }
  
  return denominator > 0 ? numerator / denominator : 0;
}

function calculateSpectralRolloff(frequencyData) {
  const totalEnergy = frequencyData.reduce((sum, val) => sum + val, 0);
  const threshold = totalEnergy * 0.85;
  
  let cumulativeEnergy = 0;
  for (let i = 0; i < frequencyData.length; i++) {
    cumulativeEnergy += frequencyData[i];
    if (cumulativeEnergy >= threshold) {
      return i;
    }
  }
  
  return frequencyData.length;
}

function calculateZeroCrossingRate(timeData) {
  let crossings = 0;
  const centerLine = 128; // Assuming unsigned 8-bit data
  
  for (let i = 1; i < timeData.length; i++) {
    if ((timeData[i] >= centerLine && timeData[i - 1] < centerLine) ||
        (timeData[i] < centerLine && timeData[i - 1] >= centerLine)) {
      crossings++;
    }
  }
  
  return crossings / timeData.length;
}

function estimateTempo(energy) {
  // Simplified tempo estimation
  // In production, use autocorrelation or beat detection
  const baseTempo = 120;
  const energyFactor = energy * 40;
  return Math.max(60, Math.min(180, baseTempo + energyFactor));
}

function calculateLoudness(frequencyData) {
  const rms = Math.sqrt(
    frequencyData.reduce((sum, val) => sum + val * val, 0) / frequencyData.length
  );
  return 20 * Math.log10(rms / 255) || -60;
}

function calculateValence(spectralCentroid, energy) {
  // Higher brightness and energy typically correlate with positive valence
  const normalizedCentroid = spectralCentroid / 1024;
  return (normalizedCentroid * 0.6 + energy * 0.4);
}

function calculateDanceability(energy, tempo) {
  // Danceability increases with moderate tempo and high energy
  const tempoFactor = 1 - Math.abs(tempo - 128) / 128;
  return (tempoFactor * 0.5 + energy * 0.5);
}

function calculateAcousticness(frequencyData) {
  // Lower high-frequency content suggests more acoustic
  const highFreqStart = Math.floor(frequencyData.length * 0.6);
  const highFreqEnergy = frequencyData.slice(highFreqStart).reduce((sum, val) => sum + val, 0);
  const totalEnergy = frequencyData.reduce((sum, val) => sum + val, 0);
  
  return 1 - (highFreqEnergy / totalEnergy);
}

function calculateInstrumentalness(frequencyData) {
  // Vocal frequencies typically 300Hz - 3400Hz (roughly bins 6-70 at 44.1kHz)
  const vocalStart = 6;
  const vocalEnd = 70;
  const vocalEnergy = frequencyData.slice(vocalStart, vocalEnd).reduce((sum, val) => sum + val, 0);
  const totalEnergy = frequencyData.reduce((sum, val) => sum + val, 0);
  
  return 1 - (vocalEnergy / totalEnergy);
}

export default AudioAnalyzer;
