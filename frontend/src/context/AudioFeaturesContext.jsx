import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';

const AudioFeaturesContext = createContext(null);

/**
 * AudioFeaturesProvider - Provides real-time audio features to all components
 * Creates its own direct connection to the audio element
 */
export const AudioFeaturesProvider = ({ children }) => {
  const [audioFeatures, setAudioFeatures] = useState(null);
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const connectedElementRef = useRef(null);
  const { isPlaying, activeSong } = useSelector((state) => state.player);

  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    // Find the audio element in the DOM
    const findAndConnect = () => {
      const audioElement = document.querySelector('audio');
      if (!audioElement) {
        console.log('⏳ Waiting for audio element...');
        setTimeout(findAndConnect, 200);
        return;
      }

      // Check if we're already connected to this element
      if (connectedElementRef.current === audioElement && analyserRef.current) {
        console.log('✅ Already connected, starting analysis');
        startAnalysis();
        return;
      }

      try {
        // Create new AudioContext if needed
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
          console.log('🎵 Created new AudioContext');
        }

        // Resume if suspended
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }

        // Create analyser
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        analyserRef.current.smoothingTimeConstant = 0.85;

        // Try to connect (may fail if already connected elsewhere)
        try {
          sourceRef.current = audioContextRef.current.createMediaElementSource(audioElement);
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.connect(audioContextRef.current.destination);
          connectedElementRef.current = audioElement;
          console.log('✅ AudioFeaturesContext: Direct connection established');
        } catch (e) {
          // Already connected - try to tap into existing connection
          console.log('⚠️ Audio element already connected, using alternative method');
          
          // Use captureStream as fallback
          if (audioElement.captureStream) {
            const stream = audioElement.captureStream();
            sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
            sourceRef.current.connect(analyserRef.current);
            connectedElementRef.current = audioElement;
            console.log('✅ AudioFeaturesContext: Connected via captureStream');
          } else {
            console.error('❌ Cannot connect to audio element');
            return;
          }
        }

        startAnalysis();
      } catch (error) {
        console.error('❌ Error setting up audio analysis:', error);
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

            if (Math.random() < 0.1) {
              console.log('🎵', {
                E: (features.energy * 100).toFixed(0) + '%',
                M: (features.valence * 100).toFixed(0) + '%',
                D: (features.danceability * 100).toFixed(0) + '%'
              });
            }
          }
          lastUpdate = timestamp;
        }

        animationRef.current = requestAnimationFrame(analyze);
      };

      animationRef.current = requestAnimationFrame(analyze);
    };

    findAndConnect();

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
