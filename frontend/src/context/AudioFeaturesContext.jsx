import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import globalAudioContext from '../utils/globalAudioContext';

const AudioFeaturesContext = createContext(null);

/**
 * AudioFeaturesProvider - Provides real-time audio features to all components
 * Uses the global audio context to avoid "already connected" errors
 */
export const AudioFeaturesProvider = ({ children }) => {
  const [audioFeatures, setAudioFeatures] = useState(null);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const { isPlaying, activeSong } = useSelector((state) => state.player);

  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    // Wait for global audio context to be initialized, then branch off from it
    const connectToGlobalContext = () => {
      if (!globalAudioContext.isInitialized || !globalAudioContext.mediaSource) {
        setTimeout(connectToGlobalContext, 200);
        return;
      }

      // Check if we already have an analyser connected
      if (analyserRef.current) {
        startAnalysis();
        return;
      }

      try {
        // Create a new analyser and branch off from the global audio context's media source
        analyserRef.current = globalAudioContext.audioContext.createAnalyser();
        analyserRef.current.fftSize = 2048;
        analyserRef.current.smoothingTimeConstant = 0.85;
        
        // Connect from the global media source (branching the signal)
        globalAudioContext.mediaSource.connect(analyserRef.current);
        // Don't connect to destination - globalAudioContext already does that
        
        startAnalysis();
      } catch (error) {
        // Error setting up audio analysis - silently fail
      }
    };

    const startAnalysis = () => {
      if (!analyserRef.current) return;

      const analyser = analyserRef.current;
      const bufferLength = analyser.frequencyBinCount;
      const frequencyData = new Uint8Array(bufferLength);
      const timeData = new Uint8Array(bufferLength);

      let lastUpdate = 0;
      const UPDATE_MS = 200;

      const analyze = (timestamp) => {
        if (!isPlaying) return;

        if (timestamp - lastUpdate >= UPDATE_MS) {
          analyser.getByteFrequencyData(frequencyData);
          analyser.getByteTimeDomainData(timeData);

          const sum = frequencyData.reduce((a, b) => a + b, 0);
          
          if (sum > 100) { // Need some minimum signal
            const features = calculateAudioFeatures(frequencyData, timeData, bufferLength);
            setAudioFeatures(features);
          }
          lastUpdate = timestamp;
        }

        animationRef.current = requestAnimationFrame(analyze);
      };

      animationRef.current = requestAnimationFrame(analyze);
    };

    connectToGlobalContext();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [isPlaying, activeSong?.id]);

  return (
    <AudioFeaturesContext.Provider value={{ audioFeatures, isPlaying }}>
      {children}
    </AudioFeaturesContext.Provider>
  );
};

export const useAudioFeatures = () => {
  const context = useContext(AudioFeaturesContext);
  if (!context) {
    return { audioFeatures: null, isPlaying: false };
  }
  return context;
};

// Feature calculations
function calculateAudioFeatures(frequencyData, timeData, bufferLength) {
  // Energy (RMS of spectrum)
  let energySum = 0;
  for (let i = 0; i < frequencyData.length; i++) {
    energySum += frequencyData[i] * frequencyData[i];
  }
  const energy = Math.sqrt(energySum / frequencyData.length) / 255;

  // Spectral centroid (brightness)
  let num = 0, den = 0;
  for (let i = 0; i < frequencyData.length; i++) {
    num += i * frequencyData[i];
    den += frequencyData[i];
  }
  const centroid = den > 0 ? num / den : 0;
  const normalizedCentroid = Math.min(centroid / (bufferLength / 4), 1);

  // Valence (mood) - brighter + energetic = happier
  const valence = Math.max(0, Math.min(1, normalizedCentroid * 0.6 + energy * 0.4));

  // Tempo estimate
  const tempo = Math.round(80 + energy * 100);

  // Danceability
  const tempoScore = 1 - Math.abs(tempo - 120) / 60;
  const danceability = Math.max(0, Math.min(1, tempoScore * 0.5 + energy * 0.5));

  // Acousticness (more low freq = more acoustic)
  let lowSum = 0, highSum = 0;
  const mid = Math.floor(frequencyData.length / 4);
  for (let i = 0; i < mid; i++) lowSum += frequencyData[i];
  for (let i = mid; i < frequencyData.length; i++) highSum += frequencyData[i];
  const acousticness = (lowSum + highSum) > 0 ? lowSum / (lowSum + highSum) : 0.5;

  return {
    tempo: Math.max(60, Math.min(180, tempo)),
    energy: parseFloat(energy.toFixed(3)),
    valence: parseFloat(valence.toFixed(3)),
    danceability: parseFloat(danceability.toFixed(3)),
    acousticness: parseFloat(acousticness.toFixed(3)),
  };
}

export default AudioFeaturesContext;
