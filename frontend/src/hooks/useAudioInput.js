// src/hooks/useAudioInput.js
// Capture live audio from a microphone / audio interface and run real-time FFT analysis.
// Uses the Web Audio API's AnalyserNode — no external dependencies.
import { useState, useEffect, useRef, useCallback } from 'react';
import { analyseAudioFrame } from '../config/audioAnalysis';

// How finely the audio frequencies are sliced for feature extraction. Higher = more CPU.
const FFT_SIZE = 2048;
const ANALYSIS_INTERVAL_MS = 150; // how often we compute features

export default function useAudioInput() {
  // Checks if the browser allows microphone access (navigator.mediaDevices), then sets up state variables to track available microphones
  // then sets up state variables to track available microphones, the current volume (level), and the math outputs (features)
  const [supported] = useState(() => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));

  const [audioDevices, setAudioDevices] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState(null);
  const [listening, setListening] = useState(false);
  const [features, setFeatures] = useState(null); // latest derived audio features
  const [error, setError] = useState(null);
  const [level, setLevel] = useState(0); // 0-1 VU meter

  // Refs for cleanup
  const streamRef = useRef(null);
  const contextRef = useRef(null);
  const analyserRef = useRef(null);
  const intervalRef = useRef(null);

  // ── Enumerate audio input devices ──────────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      // Maps available devices to a clean array so the user can select their specific audio interface.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({
          id: d.deviceId,
          label: d.label || `Input ${d.deviceId.slice(0, 8)}`,
          groupId: d.groupId,
        }));
      setAudioDevices(inputs);
    } catch (err) {
      setError(`Cannot list audio devices: ${err.message}`);
    }
  }, []);

  // Enumerate on mount — labels may be empty until permission granted
  useEffect(() => {
    if (supported) refreshDevices();
  }, [supported, refreshDevices]);

  // ── Start listening on a specific device ───────────────────────
  const startListening = useCallback(async (deviceId) => {
    // Stop any previous session
    stopListening();

    try {
      const constraints = {
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // After getting permission, re-enumerate to get full labels
      refreshDevices();

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      contextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(analyser.fftSize);

      // Periodic analysis
      intervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(timeData);

        const result = analyseAudioFrame(freqData, timeData, ctx.sampleRate, analyser.fftSize);
        setFeatures(result);
        setLevel(result.rms);
      }, ANALYSIS_INTERVAL_MS);

      setActiveDeviceId(deviceId || stream.getAudioTracks()[0]?.getSettings()?.deviceId || 'default');
      setListening(true);
      setError(null);
    } catch (err) {
      setError(`Microphone access denied: ${err.message}`);
      setListening(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshDevices]);

  // ── Stop listening ─────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (contextRef.current) {
      contextRef.current.close().catch(() => {});
      contextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    analyserRef.current = null;
    setListening(false);
    setActiveDeviceId(null);
    setFeatures(null);
    setLevel(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopListening();
  }, [stopListening]);

  return {
    supported,
    audioDevices,
    activeDeviceId,
    listening,
    features,
    level,
    error,
    refreshDevices,
    startListening,
    stopListening,
  };
}
