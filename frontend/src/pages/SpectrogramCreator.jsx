/**
 * SpectrogramCreator — Draw-to-Sound Spectrogram Synthesizer
 * ==========================================================
 * Inspired by Aphex Twin's technique of embedding images in spectrograms
 * (Windowlicker, ΔMi−1 = −∂Σn=1NDi[n][Σj∈C{i}Fji[n−1] + Fexti[n−1]])
 *
 * Users can:
 * 1. Paint on a spectrogram canvas (x = time, y = frequency)
 * 2. Hear their drawing synthesized into audio in real-time
 * 3. View the live spectrogram of the currently playing song
 * 4. Draw over the live spectrogram to add new frequencies
 * 5. Export their creation as a WAV file
 * 6. Use preset patterns (harmonic tones, sweeps, noise textures)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSelector } from 'react-redux';
import SpectrogramSynth from '../utils/spectrogramSynth';
import globalAudioContext from '../utils/globalAudioContext';
import { useSpectrogramLive } from '../context/SpectrogramLiveContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 512;
const NUM_FREQ_BINS = 256;
const NUM_TIME_SLICES = 200;
const DEFAULT_DURATION = 4; // seconds
const MS_PER_LIVE_COLUMN = 40; // ~25 columns/sec for live capture

const TOOLS = {
  BRUSH: 'brush',
  LINE: 'line',
  ERASER: 'eraser',
  HARMONIC: 'harmonic',
};

const PRESETS = [
  { name: 'Blank', icon: '⬜', description: 'Empty canvas' },
  { name: 'Rising Tone', icon: '📈', description: 'Frequency sweep upward' },
  { name: 'Falling Tone', icon: '📉', description: 'Frequency sweep downward' },
  { name: 'Chord', icon: '🎵', description: 'Major chord with harmonics' },
  { name: 'Noise Burst', icon: '💥', description: 'Broadband noise texture' },
  { name: 'Spiral', icon: '🌀', description: 'Aphex Twin-style spiral' },
  { name: 'Text: AFX', icon: '🔤', description: 'Write "AFX" in spectrum' },
];

// Color palettes for painting intensity
const INTENSITY_COLORS = [
  'rgba(0, 0, 0, 0)',          // 0 - transparent
  'rgba(15, 10, 60, 0.8)',     // very low
  'rgba(30, 10, 120, 0.85)',   // low
  'rgba(80, 10, 180, 0.9)',    // med-low
  'rgba(160, 20, 180, 0.9)',   // medium
  'rgba(220, 50, 80, 0.95)',   // med-high
  'rgba(250, 120, 20, 0.95)',  // high
  'rgba(255, 200, 40, 1)',     // very high
  'rgba(255, 255, 200, 1)',    // max
];

// Map an amplitude (0-1) to a color string
const amplitudeToColor = (amp) => {
  if (amp <= 0.001) return 'rgba(0, 0, 0, 0)';
  const idx = Math.min(Math.floor(amp * (INTENSITY_COLORS.length - 1)) + 1, INTENSITY_COLORS.length - 1);
  return INTENSITY_COLORS[idx];
};

// Map amplitude to RGB values for direct pixel manipulation
const amplitudeToRGB = (amp) => {
  if (amp <= 0.001) return [10, 8, 30, 255]; // Dark background
  // Black body radiation-style: dark blue → purple → magenta → red → orange → yellow → white
  const t = Math.min(amp, 1);
  let r, g, b;
  if (t < 0.2) {
    const s = t / 0.2;
    r = Math.round(15 + s * 15);
    g = Math.round(10);
    b = Math.round(30 + s * 90);
  } else if (t < 0.4) {
    const s = (t - 0.2) / 0.2;
    r = Math.round(30 + s * 50);
    g = Math.round(10);
    b = Math.round(120 + s * 60);
  } else if (t < 0.6) {
    const s = (t - 0.4) / 0.2;
    r = Math.round(80 + s * 80);
    g = Math.round(10 + s * 10);
    b = Math.round(180 - s * 0);
  } else if (t < 0.8) {
    const s = (t - 0.6) / 0.2;
    r = Math.round(160 + s * 60);
    g = Math.round(20 + s * 30);
    b = Math.round(180 - s * 100);
  } else {
    const s = (t - 0.8) / 0.2;
    r = Math.round(220 + s * 35);
    g = Math.round(50 + s * 150);
    b = Math.round(80 - s * 60);
  }
  return [r, g, b, 255];
};

// ─── Preset Generators ───────────────────────────────────────────────────────

const generatePreset = (name, synth) => {
  const grid = SpectrogramSynth.createBlankGrid(NUM_TIME_SLICES, NUM_FREQ_BINS);

  switch (name) {
    case 'Rising Tone':
      SpectrogramSynth.paintSweep(grid, 20, 200, 0, NUM_TIME_SLICES - 1, 0.9);
      break;

    case 'Falling Tone':
      SpectrogramSynth.paintSweep(grid, 200, 20, 0, NUM_TIME_SLICES - 1, 0.9);
      break;

    case 'Chord': {
      // C major chord fundamental bins (approximate in log scale)
      const fundamentals = [30, 38, 45]; // C, E, G approximations
      fundamentals.forEach((f) => {
        SpectrogramSynth.paintHarmonicTone(grid, f, 0, NUM_TIME_SLICES - 1, 5, 0.7);
      });
      break;
    }

    case 'Noise Burst': {
      // Random broadband noise in bursts
      for (let t = 0; t < NUM_TIME_SLICES; t++) {
        const burstPhase = Math.sin(t * 0.15) * 0.5 + 0.5;
        for (let f = 10; f < NUM_FREQ_BINS - 10; f++) {
          grid[t][f] = Math.random() * burstPhase * 0.6;
        }
      }
      break;
    }

    case 'Spiral': {
      // Aphex Twin-style spiral in the spectrogram
      const cx = NUM_TIME_SLICES / 2;
      const cy = NUM_FREQ_BINS / 2;
      for (let angle = 0; angle < Math.PI * 8; angle += 0.02) {
        const r = angle * 4;
        const t = Math.round(cx + r * Math.cos(angle) * 0.15);
        const f = Math.round(cy + r * Math.sin(angle) * 0.3);
        if (t >= 0 && t < NUM_TIME_SLICES && f >= 0 && f < NUM_FREQ_BINS) {
          grid[t][f] = 0.9;
          // Thicken the spiral
          if (f > 0) grid[t][f - 1] = 0.5;
          if (f < NUM_FREQ_BINS - 1) grid[t][f + 1] = 0.5;
        }
      }
      break;
    }

    case 'Text: AFX': {
      // Simple pixel font for "AFX"
      const paintChar = (char, startT, startF, scale = 3) => {
        const fonts = {
          A: [[0,1],[0,2],[0,3],[0,4],[1,0],[1,2],[2,0],[2,2],[3,1],[3,2],[3,3],[3,4]],
          F: [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0],[1,2],[2,0],[2,2],[3,0]],
          X: [[0,0],[0,4],[1,1],[1,3],[2,2],[3,1],[3,3],[4,0],[4,4]],
        };
        const pixels = fonts[char] || [];
        pixels.forEach(([dt, df]) => {
          for (let st = 0; st < scale; st++) {
            for (let sf = 0; sf < scale; sf++) {
              const t = startT + dt * scale + st;
              const f = startF + df * scale + sf;
              if (t >= 0 && t < NUM_TIME_SLICES && f >= 0 && f < NUM_FREQ_BINS) {
                grid[t][f] = 0.85;
              }
            }
          }
        });
      };
      paintChar('A', 30, 100, 4);
      paintChar('F', 80, 100, 4);
      paintChar('X', 130, 100, 4);
      break;
    }

    default: // Blank
      break;
  }

  return grid;
};

// ─── Live Spectrogram Analyzer ───────────────────────────────────────────────

/**
 * Hook that connects to the global audio context's media source for live
 * spectrogram data. Depends on Redux player state so it reconnects whenever
 * a song starts/stops or the audio context reinitializes (e.g. new song).
 */
const useLiveSpectrogram = (isLiveMode, activeSong, isSongPlaying) => {
  const analyserRef = useRef(null);
  const dataRef = useRef(null);
  const connectedSourceRef = useRef(null); // Track which source we're connected to
  const [isConnected, setIsConnected] = useState(false);

  // Attempt to connect (or reconnect) to the global audio context
  const tryConnect = useCallback(() => {
    const ctx = globalAudioContext.audioContext;
    const source = globalAudioContext.mediaSource;
    if (!ctx || !source) {
      setIsConnected(false);
      return false;
    }

    // Already connected to this exact source — nothing to do
    if (analyserRef.current && connectedSourceRef.current === source) {
      setIsConnected(true);
      return true;
    }

    // Disconnect old analyser if source changed
    if (analyserRef.current && connectedSourceRef.current) {
      try { connectedSourceRef.current.disconnect(analyserRef.current); } catch (e) { /* ok */ }
    }

    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      // Don't connect analyser to destination (it's already routed)

      analyserRef.current = analyser;
      connectedSourceRef.current = source;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
      setIsConnected(true);
      return true;
    } catch (e) {
      console.warn('[SpectrogramCreator] Failed to connect live analyser:', e.message);
      setIsConnected(false);
      return false;
    }
  }, []);

  // Connect / disconnect when live mode, active song, or play state changes
  useEffect(() => {
    if (!isLiveMode) {
      // Disconnect when live mode is off
      if (analyserRef.current && connectedSourceRef.current) {
        try { connectedSourceRef.current.disconnect(analyserRef.current); } catch (e) { /* ok */ }
      }
      analyserRef.current = null;
      connectedSourceRef.current = null;
      dataRef.current = null;
      setIsConnected(false);
      return;
    }

    // Try immediately
    tryConnect();

    // Also retry on a short interval in case the audio context initializes after
    // the user enables live mode (e.g. they toggle Live, then press play on a song)
    const retryInterval = setInterval(() => {
      if (!analyserRef.current || connectedSourceRef.current !== globalAudioContext.mediaSource) {
        tryConnect();
      }
    }, 500);

    return () => {
      clearInterval(retryInterval);
      if (analyserRef.current && connectedSourceRef.current) {
        try { connectedSourceRef.current.disconnect(analyserRef.current); } catch (e) { /* ok */ }
      }
      analyserRef.current = null;
      connectedSourceRef.current = null;
      dataRef.current = null;
      setIsConnected(false);
    };
  }, [isLiveMode, activeSong, isSongPlaying, tryConnect]);

  const getFrequencyData = useCallback(() => {
    if (!analyserRef.current || !dataRef.current) return null;
    analyserRef.current.getByteFrequencyData(dataRef.current);
    return dataRef.current;
  }, []);

  return { getFrequencyData, analyser: analyserRef, isConnected };
};

// ─── Main Component ──────────────────────────────────────────────────────────

const SpectrogramCreator = () => {
  // ── State ──
  const [grid, setGrid] = useState(() => SpectrogramSynth.createBlankGrid(NUM_TIME_SLICES, NUM_FREQ_BINS));
  const [tool, setTool] = useState(TOOLS.BRUSH);
  const [brushSize, setBrushSize] = useState(3);
  const [intensity, setIntensity] = useState(0.8);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const [playheadPos, setPlayheadPos] = useState(-1);
  const [hoveredFreq, setHoveredFreq] = useState(null);

  // Physics parameters (ΔMi−1 formula)
  const [dampingFactor, setDampingFactor] = useState(0.15);
  const [couplingStrength, setCouplingStrength] = useState(0.08);
  const [couplingRadius, setCouplingRadius] = useState(3);
  const [externalForceGain, setExternalForceGain] = useState(1.0);
  const [simulationEnabled, setSimulationEnabled] = useState(true);
  const [simulationSpeed, setSimulationSpeed] = useState(1); // steps per frame

  // Evolved grid — the physics simulation result displayed on canvas
  const [evolvedGrid, setEvolvedGrid] = useState(() => SpectrogramSynth.createBlankGrid(NUM_TIME_SLICES, NUM_FREQ_BINS));
  const evolvedGridRef = useRef(evolvedGrid);
  const simulationStateRef = useRef(null); // running amplitude state per time-slice

  // ── Refs ──
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const synthRef = useRef(null);
  const playbackRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const gridRef = useRef(grid);
  const animFrameRef = useRef(null);
  const playbackStartTimeRef = useRef(0);
  const liveWriteHeadRef = useRef(0); // (legacy) write position ref
  const lastLiveWriteTimeRef = useRef(0); // Throttle live writes
  const liveColumnsRef = useRef([]); // Accumulated live FFT columns (continuous, no wrapping)
  const liveRecordStartRef = useRef(0); // wall-clock start time (performance.now) of recording
  const capturedRecordingRef = useRef(null); // Full captured recording { columns: Float64Array[], duration: number }
  const playbackColumnRef = useRef(-1); // Current column during captured playback (for canvas scrolling)
  const realtimeProcessorRef = useRef(null); // ScriptProcessorNode for live synthesis
  const realtimePhasesRef = useRef(null);    // Persistent phase accumulators
  const realtimeSampleRef = useRef(0);       // Sample counter for playhead
  const durationRef = useRef(DEFAULT_DURATION); // Duration ref for audio thread
  const simulationEnabledRef = useRef(true);
  const intensityRef = useRef(0.8);  // Live amplitude multiplier for audio + canvas

  // ── Redux — track whether a song is actively playing ──
  const { activeSong, isPlaying: isSongPlaying } = useSelector((state) => state.player);

  // ── Shared live recording state (read by Sidebar for recording indicator) ──
  const { setLiveRecording } = useSpectrogramLive();

  // ── Live Spectrogram — passes player state so hook reconnects on song changes ──
  const { getFrequencyData, isConnected: isLiveConnected } = useLiveSpectrogram(isLiveMode, activeSong, isSongPlaying);

  // ── Sync live recording state to context so Sidebar can show indicator ──
  const isActivelyRecording = isLiveMode && isLiveConnected && isSongPlaying;
  useEffect(() => {
    setLiveRecording(isActivelyRecording, activeSong?.title || activeSong?.albumTitle || null);
    return () => setLiveRecording(false, null);
  }, [isActivelyRecording, activeSong?.title, activeSong?.albumTitle, setLiveRecording]);

  // Keep refs in sync
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { evolvedGridRef.current = evolvedGrid; }, [evolvedGrid]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { simulationEnabledRef.current = simulationEnabled; }, [simulationEnabled]);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);

  // ── Save live capture when recording stops ──
  useEffect(() => {
    if (!isActivelyRecording && liveColumnsRef.current.length > 0) {
      const columns = liveColumnsRef.current;
      const totalCols = columns.length;

      // Use actual wall-clock elapsed time for accurate duration
      const elapsedMs = performance.now() - liveRecordStartRef.current;
      const captureDuration = Math.max(1, elapsedMs / 1000);
      capturedRecordingRef.current = {
        columns: columns.slice(), // copy array of Float64Arrays
        duration: captureDuration,
      };

      // Auto-set duration to match recording length
      const roundedDur = Math.min(300, Math.max(1, parseFloat(captureDuration.toFixed(1))));
      setDuration(roundedDur);

      // Save last NUM_TIME_SLICES to grid for static canvas display
      const startIdx = Math.max(0, totalCols - NUM_TIME_SLICES);
      const newGrid = SpectrogramSynth.createBlankGrid(NUM_TIME_SLICES, NUM_FREQ_BINS);
      for (let col = 0; col < NUM_TIME_SLICES; col++) {
        const dataIdx = startIdx + col;
        if (dataIdx < totalCols) {
          for (let f = 0; f < NUM_FREQ_BINS; f++) {
            newGrid[col][f] = columns[dataIdx][f];
          }
        }
      }
      setGrid(newGrid);
      liveColumnsRef.current = []; // Clear live buffer after saving
    }
  }, [isActivelyRecording]);

  // ── Initialize Synth (once — AudioContext is expensive to recreate) ──
  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    synthRef.current = new SpectrogramSynth(ctx, {
      numFreqBins: NUM_FREQ_BINS,
      dampingFactor,
      couplingStrength,
      couplingRadius,
      externalForceGain,
    });
    return () => ctx.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount — params are patched in-place below

  // ── Patch synth parameters in-place so AudioContext stays alive ──
  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return;
    synth.dampingFactor = dampingFactor;
    synth.couplingStrength = couplingStrength;
    synth.couplingRadius = couplingRadius;
    synth.externalForceGain = externalForceGain;
  }, [dampingFactor, couplingStrength, couplingRadius, externalForceGain]);

  // ── Physics simulation — runs the ΔMi−1 formula to evolve the grid ──
  // Recompute from scratch whenever the raw grid or physics parameters change.
  // This is what makes sliders/presets/drawing dynamically change the visual energy.
  // Intensity feeds into the external force so dragging it re-shapes the spectrum.
  useEffect(() => {
    if (!simulationEnabled) {
      // When simulation is off, display the raw drawn grid
      setEvolvedGrid(grid);
      simulationStateRef.current = null;
      return;
    }

    // Run the full interaction simulation across all time slices
    const evolved = grid.map((slice) => Float64Array.from(slice));
    let amplitudeState = new Float64Array(NUM_FREQ_BINS);

    for (let t = 0; t < NUM_TIME_SLICES; t++) {
      // External force = drawn pixel values * gain * intensity
      const externalForce = new Float64Array(NUM_FREQ_BINS);
      for (let i = 0; i < NUM_FREQ_BINS; i++) {
        externalForce[i] = (grid[t]?.[i] || 0) * externalForceGain * intensity;
      }

      // Apply the ΔMi−1 interaction step
      const newState = new Float64Array(NUM_FREQ_BINS);
      for (let i = 0; i < NUM_FREQ_BINS; i++) {
        // Coupling force: Σ(j∈C{i}) Fji * (Mj − Mi)
        let couplingForce = 0;
        for (let r = -couplingRadius; r <= couplingRadius; r++) {
          if (r === 0) continue;
          const j = i + r;
          if (j < 0 || j >= NUM_FREQ_BINS) continue;
          const Fji = couplingStrength / Math.abs(r);
          couplingForce += Fji * (amplitudeState[j] - amplitudeState[i]);
        }

        // ΔMi = −Di * coupling + Fext
        const delta = -dampingFactor * couplingForce + externalForce[i];
        newState[i] = Math.max(0, Math.min(1, amplitudeState[i] + delta));
      }

      amplitudeState = newState;

      // Write evolved amplitudes back
      for (let i = 0; i < NUM_FREQ_BINS; i++) {
        evolved[t][i] = newState[i];
      }
    }

    simulationStateRef.current = amplitudeState;
    setEvolvedGrid(evolved);
  }, [grid, dampingFactor, couplingStrength, couplingRadius, externalForceGain, simulationEnabled, intensity]);

  // ── Render canvas ──
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Create ImageData for fast pixel manipulation
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    const cellW = w / NUM_TIME_SLICES;
    const cellH = h / NUM_FREQ_BINS;

    // Use the physics-evolved grid for rendering (shows the ΔMi−1 result)
    const displayGrid = simulationEnabledRef.current ? evolvedGridRef.current : gridRef.current;
    // Live intensity multiplier for real-time visual feedback
    const liveIntensity = intensityRef.current;

    // ── Capture new live FFT data first (before rendering) ──
    const isRecording = isLiveMode && isLiveConnected && isSongPlaying;
    if (isRecording) {
      // Mark start time on the very first capture frame
      if (liveColumnsRef.current.length === 0) {
        liveRecordStartRef.current = performance.now();
      }
      const freqData = getFrequencyData();
      if (freqData) {
        const now = performance.now();
        if (now - lastLiveWriteTimeRef.current >= MS_PER_LIVE_COLUMN) {
          const column = new Float64Array(NUM_FREQ_BINS);
          const binCount = Math.min(freqData.length, NUM_FREQ_BINS);
          for (let i = 0; i < binCount; i++) {
            column[i] = freqData[i] / 255;
          }
          liveColumnsRef.current.push(column);
          lastLiveWriteTimeRef.current = now;
        }
      }
    }

    // ── Determine data source (live scrolling buffer, captured playback, or static grid) ──
    const liveColumns = liveColumnsRef.current;
    const hasLiveData = liveColumns.length > 0 && (isRecording || isLiveMode);
    const liveStartIdx = hasLiveData ? Math.max(0, liveColumns.length - NUM_TIME_SLICES) : 0;

    // Captured recording playback — scroll through ALL captured columns as audio plays
    const captured = capturedRecordingRef.current;
    const pbCol = playbackColumnRef.current;
    const isCapturedPlayback = captured && captured.columns.length > NUM_TIME_SLICES && pbCol >= 0;
    const capturedViewStart = isCapturedPlayback
      ? Math.max(0, Math.min(pbCol - Math.floor(NUM_TIME_SLICES * 0.8), captured.columns.length - NUM_TIME_SLICES))
      : 0;

    // ── Draw spectrogram pixels ──
    for (let t = 0; t < NUM_TIME_SLICES; t++) {
      for (let f = 0; f < NUM_FREQ_BINS; f++) {
        let amp;

        if (hasLiveData) {
          // Render from continuously accumulated live columns (scrolling waterfall)
          const dataIdx = liveStartIdx + t;
          amp = dataIdx < liveColumns.length ? liveColumns[dataIdx][f] : 0;
        } else if (isCapturedPlayback) {
          // Scroll through full captured recording during playback
          const dataIdx = capturedViewStart + t;
          amp = dataIdx < captured.columns.length ? captured.columns[dataIdx][f] : 0;
        } else {
          // Normal grid render
          const rawAmp = displayGrid[t]?.[f] || 0;
          amp = simulationEnabledRef.current ? rawAmp : Math.min(1, rawAmp * liveIntensity);
        }

        const [r, g, b, a] = amplitudeToRGB(amp);

        // Map to canvas coordinates (y is inverted — high freq at top)
        const px = Math.floor(t * cellW);
        const py = Math.floor((NUM_FREQ_BINS - 1 - f) * cellH);
        const pw = Math.max(1, Math.ceil(cellW));
        const ph = Math.max(1, Math.ceil(cellH));

        for (let dx = 0; dx < pw && px + dx < w; dx++) {
          for (let dy = 0; dy < ph && py + dy < h; dy++) {
            const idx = ((py + dy) * w + (px + dx)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // ── Recording indicator ──
    if (isRecording && liveColumns.length > 0) {
      // Leading/right edge indicator — fills left to right, then stays at right edge
      const filledCols = Math.min(liveColumns.length, NUM_TIME_SLICES);
      const edgeX = (filledCols / NUM_TIME_SLICES) * w;

      ctx.strokeStyle = 'rgba(255, 60, 60, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(edgeX - 1, 0);
      ctx.lineTo(edgeX - 1, h);
      ctx.stroke();
      // Red glow
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.15)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(edgeX - 1, 0);
      ctx.lineTo(edgeX - 1, h);
      ctx.stroke();

      // Recording time label — use actual wall-clock elapsed time
      const elapsedSec = (performance.now() - liveRecordStartRef.current) / 1000;
      ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`● REC ${Math.max(0, elapsedSec).toFixed(1)}s`, 8, h - 8);
    }

    // ── Captured playback scrolling playhead ──
    if (isCapturedPlayback) {
      // Show playhead line at the position within the current viewport
      const playheadViewCol = pbCol - capturedViewStart;
      const playheadX = (playheadViewCol / NUM_TIME_SLICES) * w;
      ctx.strokeStyle = 'rgba(0, 255, 150, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
      // Glow
      ctx.strokeStyle = 'rgba(0, 255, 150, 0.2)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();

      // Progress label
      const totalSec = captured.duration;
      const currentSec = (pbCol / captured.columns.length) * totalSec;
      ctx.fillStyle = 'rgba(0, 255, 150, 0.9)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`▶ ${currentSec.toFixed(1)}s / ${totalSec.toFixed(1)}s`, 8, h - 8);
    }
  }, [isLiveMode, isLiveConnected, isSongPlaying, getFrequencyData, simulationEnabled]);

  // ── Render overlay (playhead, frequency guide) ──
  const renderOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = canvas.width;
    const h = canvas.height;
    const cellH = h / NUM_FREQ_BINS;

    // Draw playhead
    if (playheadPos >= 0 && playheadPos < NUM_TIME_SLICES) {
      const x = (playheadPos / NUM_TIME_SLICES) * w;
      ctx.strokeStyle = 'rgba(0, 255, 150, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      // Glow effect
      ctx.strokeStyle = 'rgba(0, 255, 150, 0.2)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Draw frequency labels on right edge
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(200, 200, 255, 0.5)';
    ctx.textAlign = 'right';
    const freqLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 16000];

    if (synthRef.current) {
      freqLabels.forEach((freq) => {
        const bin = synthRef.current.getBinForFrequency(freq);
        const y = (NUM_FREQ_BINS - 1 - bin) * cellH;
        if (y > 10 && y < h - 10) {
          ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : `${freq}`, w - 4, y + 3);
          ctx.strokeStyle = 'rgba(200, 200, 255, 0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w - 30, y);
          ctx.stroke();
        }
      });
    }

    // Hover frequency indicator
    if (hoveredFreq !== null) {
      ctx.fillStyle = 'rgba(0, 255, 150, 0.8)';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      const freqText = hoveredFreq >= 1000
        ? `${(hoveredFreq / 1000).toFixed(1)}kHz`
        : `${Math.round(hoveredFreq)}Hz`;
      ctx.fillText(freqText, 8, 16);
    }
  }, [playheadPos, hoveredFreq]);

  // ── Animation loop ──
  useEffect(() => {
    const animate = () => {
      renderCanvas();
      renderOverlay();
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [renderCanvas, renderOverlay]);

  // ── Canvas coordinate helpers ──
  const canvasToGrid = useCallback((e) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const t = Math.floor((x / rect.width) * NUM_TIME_SLICES);
    const f = NUM_FREQ_BINS - 1 - Math.floor((y / rect.height) * NUM_FREQ_BINS);
    return { t: Math.max(0, Math.min(NUM_TIME_SLICES - 1, t)), f: Math.max(0, Math.min(NUM_FREQ_BINS - 1, f)) };
  }, []);

  // ── Paint on grid ──
  const paintOnGrid = useCallback((t, f) => {
    // User is drawing manually — discard any captured recording so playback uses the grid
    capturedRecordingRef.current = null;
    setGrid((prev) => {
      const next = prev.map((slice) => Float64Array.from(slice));
      const halfBrush = Math.floor(brushSize / 2);

      for (let dt = -halfBrush; dt <= halfBrush; dt++) {
        for (let df = -halfBrush; df <= halfBrush; df++) {
          const tt = t + dt;
          const ff = f + df;
          if (tt < 0 || tt >= NUM_TIME_SLICES || ff < 0 || ff >= NUM_FREQ_BINS) continue;

          // Circular brush with falloff
          const dist = Math.sqrt(dt * dt + df * df);
          if (dist > halfBrush + 0.5) continue;
          const falloff = 1 - (dist / (halfBrush + 1));

          if (tool === TOOLS.ERASER) {
            next[tt][ff] = Math.max(0, next[tt][ff] - falloff * 0.3);
          } else if (tool === TOOLS.HARMONIC && synthRef.current) {
            // Paint with harmonics
            const numHarmonics = 6;
            for (let h = 1; h <= numHarmonics; h++) {
              const harmonicBin = Math.round(ff * h);
              if (harmonicBin >= NUM_FREQ_BINS) break;
              const harmonicAmp = intensity * falloff / h;
              next[tt][harmonicBin] = Math.min(1, Math.max(next[tt][harmonicBin], harmonicAmp));
            }
          } else {
            next[tt][ff] = Math.min(1, Math.max(next[tt][ff], intensity * falloff));
          }
        }
      }
      return next;
    });
  }, [tool, brushSize, intensity]);

  // ── Bresenham line interpolation for smooth strokes ──
  const paintLine = useCallback((x0, y0, x1, y1) => {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      paintOnGrid(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }, [paintOnGrid]);

  // ── Mouse handlers ──
  const handlePointerDown = useCallback((e) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const pt = canvasToGrid(e);
    if (pt) {
      lastPointRef.current = pt;
      paintOnGrid(pt.t, pt.f);
    }
  }, [canvasToGrid, paintOnGrid]);

  const handlePointerMove = useCallback((e) => {
    const pt = canvasToGrid(e);
    if (pt && synthRef.current) {
      setHoveredFreq(synthRef.current.getFrequencyForBin(pt.f));
    }

    if (!isDrawingRef.current || !pt) return;
    e.preventDefault();

    const last = lastPointRef.current;
    if (last) {
      paintLine(last.t, last.f, pt.t, pt.f);
    } else {
      paintOnGrid(pt.t, pt.f);
    }
    lastPointRef.current = pt;
  }, [canvasToGrid, paintOnGrid, paintLine]);

  const handlePointerUp = useCallback(() => {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  // ── Real-Time Playback ──
  // Instead of pre-rendering a static AudioBuffer, we use a ScriptProcessorNode
  // that reads evolvedGridRef on every audio frame. This means slider/drawing
  // changes are heard instantly without any stop/restart.
  const handlePlay = useCallback(async () => {
    if (isPlaying) {
      // Stop — tear down the processor
      if (realtimeProcessorRef.current) {
        realtimeProcessorRef.current.disconnect();
        realtimeProcessorRef.current.onaudioprocess = null;
        realtimeProcessorRef.current = null;
      }
      if (playbackRef.current) {
        playbackRef.current.disconnect();
        playbackRef.current = null;
      }
      realtimePhasesRef.current = null;
      realtimeSampleRef.current = 0;
      playbackColumnRef.current = -1;
      setIsPlaying(false);
      setPlayheadPos(-1);
      return;
    }

    const synth = synthRef.current;
    if (!synth) return;
    const ctx = synth.audioContext;

    // Resume audio context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Precompute angular velocities (Hz → radians/sample) once
    const angularVelocities = new Float64Array(NUM_FREQ_BINS);
    for (let i = 0; i < NUM_FREQ_BINS; i++) {
      angularVelocities[i] = (2 * Math.PI * synth.frequencies[i]) / ctx.sampleRate;
    }
    const normFactor = synth.overallGain / Math.sqrt(NUM_FREQ_BINS);
    const fadeMs = synth.fadeMs || 10;

    // Phase accumulators persist across buffers for smooth sine continuity
    const phases = new Float64Array(NUM_FREQ_BINS);
    realtimePhasesRef.current = phases;
    realtimeSampleRef.current = 0;

    // Create ScriptProcessorNode (2048 samples ≈ 46ms at 44.1kHz — low latency)
    const bufferSize = 2048;
    const processor = ctx.createScriptProcessor(bufferSize, 0, 1);
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;

    // Snapshot captured recording at play-start so it's stable during playback
    const captured = capturedRecordingRef.current;
    const hasCaptured = captured && captured.columns.length > 0;
    const capturedColumns = hasCaptured ? captured.columns : null;
    const capturedNumSlices = hasCaptured ? captured.columns.length : 0;

    processor.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0);
      const dur = durationRef.current;
      const totalSamples = Math.ceil(dur * ctx.sampleRate);
      const fadeSamples = Math.round(fadeMs * ctx.sampleRate / 1000);
      let sampleIdx = realtimeSampleRef.current;

      // Determine data source and slice count
      const useCaptured = hasCaptured;
      const numSlices = useCaptured ? capturedNumSlices : NUM_TIME_SLICES;
      const currentGrid = useCaptured ? null : (simulationEnabledRef.current ? evolvedGridRef.current : gridRef.current);
      const samplesPerSlice = totalSamples / numSlices;

      for (let s = 0; s < output.length; s++) {
        if (sampleIdx >= totalSamples) {
          output[s] = 0;
          continue;
        }

        // Which time slice are we in?
        const t = Math.min(Math.floor(sampleIdx / samplesPerSlice), numSlices - 1);
        // Position within the current slice (for fade envelope)
        const posInSlice = sampleIdx - Math.floor(t * samplesPerSlice);
        const sliceLen = Math.ceil(samplesPerSlice);

        // Fade envelope to prevent clicks between slices
        let envelope = 1;
        if (posInSlice < fadeSamples) envelope = posInSlice / fadeSamples;
        else if (posInSlice > sliceLen - fadeSamples) envelope = (sliceLen - posInSlice) / fadeSamples;

        // Read the frequency data for this time slice
        const sliceData = useCaptured ? capturedColumns[t] : (currentGrid?.[t] || null);

        // Additive synthesis — sum all active frequency bins
        let sample = 0;
        const liveIntensity = intensityRef.current;
        for (let i = 0; i < NUM_FREQ_BINS; i++) {
          const rawAmp = sliceData?.[i] || 0;
          const amp = rawAmp * liveIntensity;
          if (amp < 0.001) {
            phases[i] += angularVelocities[i]; // keep phase moving
            continue;
          }
          sample += amp * Math.sin(phases[i]) * envelope;
          phases[i] += angularVelocities[i];
        }

        output[s] = sample * normFactor;
        sampleIdx++;
      }

      realtimeSampleRef.current = sampleIdx;

      // Keep phases in [0, 2π] every buffer to avoid float drift
      for (let i = 0; i < NUM_FREQ_BINS; i++) {
        phases[i] %= (2 * Math.PI);
      }
    };

    processor.connect(gainNode);
    gainNode.connect(ctx.destination);
    realtimeProcessorRef.current = processor;
    playbackRef.current = gainNode;

    setIsPlaying(true);
    playbackStartTimeRef.current = ctx.currentTime;

    // Playhead animation driven by the sample counter
    const animatePlayhead = () => {
      if (!realtimeProcessorRef.current) return;
      const dur = durationRef.current;
      const totalSamples = Math.ceil(dur * ctx.sampleRate);
      const progress = realtimeSampleRef.current / totalSamples;
      if (progress >= 1) {
        // Playback finished — clean up
        if (realtimeProcessorRef.current) {
          realtimeProcessorRef.current.disconnect();
          realtimeProcessorRef.current.onaudioprocess = null;
          realtimeProcessorRef.current = null;
        }
        if (playbackRef.current) {
          playbackRef.current.disconnect();
          playbackRef.current = null;
        }
        playbackColumnRef.current = -1;
        setIsPlaying(false);
        setPlayheadPos(-1);
        return;
      }
      // For captured recordings, map progress to full columns range for canvas scrolling
      if (hasCaptured) {
        const currentCol = Math.floor(progress * capturedNumSlices);
        // Encode as negative to signal captured mode to renderCanvas (avoids extra state)
        // Store the actual column in a ref for the canvas to read
        playbackColumnRef.current = currentCol;
      } else {
        playbackColumnRef.current = -1;
      }
      setPlayheadPos(Math.floor(progress * NUM_TIME_SLICES));
      requestAnimationFrame(animatePlayhead);
    };
    requestAnimationFrame(animatePlayhead);
  }, [isPlaying]);

  // ── Export WAV ──
  const handleExport = useCallback(async () => {
    const synth = synthRef.current;
    if (!synth) return;
    // Use full captured recording if available, otherwise use the grid
    const captured = capturedRecordingRef.current;
    const exportGrid = captured && captured.columns.length > 0
      ? captured.columns
      : (simulationEnabled ? evolvedGrid : grid);
    const exportDuration = captured && captured.columns.length > 0
      ? captured.duration
      : duration;
    const blob = await synth.renderToWav(exportGrid, exportDuration);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spectrogram-synth-${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }, [grid, evolvedGrid, duration, simulationEnabled]);

  // ── Load preset ──
  const handlePreset = useCallback((presetName) => {
    const newGrid = generatePreset(presetName, synthRef.current);
    setGrid(newGrid);
    capturedRecordingRef.current = null; // Discard captured recording
  }, []);

  // ── Clear canvas ──
  const handleClear = useCallback(() => {
    setGrid(SpectrogramSynth.createBlankGrid(NUM_TIME_SLICES, NUM_FREQ_BINS));
    liveColumnsRef.current = []; // Also clear live capture
    capturedRecordingRef.current = null; // Discard captured recording
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-full min-h-screen pb-24 px-4 md:px-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mt-4 mb-6 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Spectrogram Creator
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Draw a spectrogram and hear the sound it makes or live record a library or artist song's energy
            to hear what your favourite songs sound like in a spectrogram.
          </p>
        </div>

        {/* Formula toggle */}
        <button
          onClick={() => setShowFormula((v) => !v)}
          className="text-xs bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 
                     rounded-lg px-3 py-2 text-purple-300 transition-colors whitespace-nowrap"
        >
          {showFormula ? 'Hide' : 'Show'} ΔMi−1 Formula
        </button>
      </div>

      {/* Formula explanation panel */}
      {showFormula && (
        <div className="bg-[#1a1640]/80 border border-purple-500/30 rounded-xl p-4 mb-6 text-sm">
          <h3 className="text-white font-mono font-bold text-base mb-2">
            ΔM<sub>i−1</sub> = −∂Σ<sub>n=1</sub><sup>N</sup> D<sub>i</sub>[n] [ Σ<sub>j∈C&#123;i&#125;</sub> F<sub>ji</sub>[n−1] + F<sub>ext_i</sub>[n−1] ]
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-gray-300">
            <div>
              <span className="text-purple-400 font-mono">M<sub>i</sub></span> — Amplitude state of frequency bin <em>i</em>
              <br />
              <span className="text-purple-400 font-mono">D<sub>i</sub></span> — Damping factor (controls decay): <strong className="text-white">{dampingFactor}</strong>
              <br />
              <span className="text-purple-400 font-mono">C&#123;i&#125;</span> — Coupling radius (neighbor range): <strong className="text-white">{couplingRadius} bins</strong>
            </div>
            <div>
              <span className="text-purple-400 font-mono">F<sub>ji</sub></span> — Coupling force from neighbor bin <em>j</em>: <strong className="text-white">{couplingStrength}</strong>
              <br />
              <span className="text-purple-400 font-mono">F<sub>ext_i</sub></span> — Your drawing! (external force on bin <em>i</em>) × <strong className="text-white">{externalForceGain}</strong>
            </div>
          </div>
          <p className="text-gray-500 mt-3 text-xs">
            Neighboring frequency bins interact like coupled particles — creating richer, more organic 
            sounds than simple additive synthesis. Adjust the physics parameters below to change the character.
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Drawing tools */}
        <div className="flex bg-[#1a1640]/60 rounded-lg p-1 gap-1">
          {[
            { id: TOOLS.BRUSH, label: '🖌️ Brush', title: 'Paint frequencies' },
            { id: TOOLS.HARMONIC, label: '🎶 Harmonic', title: 'Paint with harmonic series' },
            { id: TOOLS.ERASER, label: '🧹 Eraser', title: 'Remove frequencies' },
          ].map(({ id, label, title }) => (
            <button
              key={id}
              onClick={() => setTool(id)}
              title={title}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tool === id
                  ? 'bg-purple-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Brush size */}
        <div className="flex items-center gap-2 bg-[#1a1640]/60 rounded-lg px-3 py-1">
          <span className="text-xs text-gray-400">Size</span>
          <input
            type="range"
            min="1"
            max="12"
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="w-16 accent-purple-500"
          />
          <span className="text-xs text-white w-4">{brushSize}</span>
        </div>

        {/* Intensity */}
        <div className="flex items-center gap-2 bg-[#1a1640]/60 rounded-lg px-3 py-1">
          <span className="text-xs text-gray-400">Intensity</span>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={intensity}
            onChange={(e) => setIntensity(parseFloat(e.target.value))}
            className="w-16 accent-orange-500"
          />
          <span className="text-xs text-white w-6">{Math.round(intensity * 100)}%</span>
        </div>

        {/* Duration */}
        <div className="flex items-center gap-2 bg-[#1a1640]/60 rounded-lg px-3 py-1">
          <span className="text-xs text-gray-400">Duration</span>
          <input
            type="range"
            min="1"
            max={Math.max(15, Math.ceil(duration))}
            step="0.5"
            value={duration}
            onChange={(e) => { setDuration(parseFloat(e.target.value)); capturedRecordingRef.current = null; }}
            className="w-16 accent-cyan-500"
          />
          <span className="text-xs text-white w-8">{duration}s</span>
        </div>

        {/* Live mode toggle */}
        <button
          onClick={() => {
            setIsLiveMode((v) => {
              if (!v) {
                // Starting live mode — clear previous capture for a fresh session
                liveColumnsRef.current = [];
                lastLiveWriteTimeRef.current = 0;
              }
              return !v;
            });
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isLiveMode && isLiveConnected
              ? 'bg-green-600/80 text-white'
              : isLiveMode && !isLiveConnected
                ? 'bg-yellow-600/80 text-white animate-pulse'
                : 'bg-[#1a1640]/60 text-gray-400 hover:text-white'
          }`}
          title={
            isLiveMode && isLiveConnected
              ? `Connected — streaming "${activeSong?.title || activeSong?.albumTitle || 'audio'}"`
              : isLiveMode && !isLiveConnected
                ? 'Waiting for audio… play a song to connect'
                : activeSong?.title || activeSong?.albumTitle
                  ? `Overlay spectrum of "${activeSong?.title || activeSong?.albumTitle}"`
                  : 'Play a song then enable live mode'
          }
        >
          📡 {isLiveMode ? (isLiveConnected ? 'Live ●' : 'Live ○') : 'Live'}
        </button>

        {/* Now Playing indicator — shows which song the analyser can capture */}
        {isSongPlaying && (activeSong?.title || activeSong?.albumTitle) && (
          <div className="flex items-center gap-1.5 bg-[#1a1640]/60 rounded-lg px-3 py-1 text-xs text-gray-300">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="truncate max-w-[160px]">{activeSong?.title || activeSong?.albumTitle}</span>
          </div>
        )}
        {!isSongPlaying && isLiveMode && (
          <span className="text-[10px] text-yellow-400/70 self-center">
            ⚠ Play a song to capture its spectrum
          </span>
        )}
      </div>

      {/* Physics parameters — now always relevant since they visually affect the canvas */}
      <details className="mb-4" open>
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">
          ⚛️ Physics Parameters (ΔMi−1 formula tuning) — {simulationEnabled ? 'ACTIVE' : 'OFF'}
        </summary>
        <div className="flex flex-wrap gap-4 mt-2 bg-[#1a1640]/40 rounded-lg p-3">
          {/* Simulation on/off */}
          <button
            onClick={() => setSimulationEnabled((v) => !v)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              simulationEnabled
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-400'
            }`}
          >
            {simulationEnabled ? '⚡ Simulation ON' : '⏸ Simulation OFF'}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-purple-400 font-mono">D<sub>i</sub> (damping)</span>
            <input
              type="range" min="0" max="0.5" step="0.01" value={dampingFactor}
              onChange={(e) => setDampingFactor(parseFloat(e.target.value))}
              className="w-20 accent-purple-500"
            />
            <span className="text-xs text-white">{dampingFactor}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-purple-400 font-mono">F<sub>ji</sub> (coupling)</span>
            <input
              type="range" min="0" max="0.3" step="0.01" value={couplingStrength}
              onChange={(e) => setCouplingStrength(parseFloat(e.target.value))}
              className="w-20 accent-purple-500"
            />
            <span className="text-xs text-white">{couplingStrength}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-purple-400 font-mono">C&#123;i&#125; (radius)</span>
            <input
              type="range" min="1" max="10" step="1" value={couplingRadius}
              onChange={(e) => setCouplingRadius(parseInt(e.target.value))}
              className="w-20 accent-purple-500"
            />
            <span className="text-xs text-white">{couplingRadius}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-purple-400 font-mono">F<sub>ext</sub> (force gain)</span>
            <input
              type="range" min="0.1" max="3.0" step="0.1" value={externalForceGain}
              onChange={(e) => setExternalForceGain(parseFloat(e.target.value))}
              className="w-20 accent-orange-500"
            />
            <span className="text-xs text-white">{externalForceGain}×</span>
          </div>
        </div>
      </details>

      {/* Canvas area */}
      <div className="relative rounded-xl overflow-hidden border border-purple-500/20 bg-[#0a0820] mb-4"
           style={{ maxWidth: CANVAS_WIDTH }}>
        {/* Y-axis label */}
        <div className="absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center z-10 pointer-events-none">
          <span className="text-[10px] text-gray-500 transform -rotate-90 whitespace-nowrap">
            Frequency →
          </span>
        </div>

        {/* Canvas stack */}
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block w-full"
          style={{ imageRendering: 'pixelated' }}
        />
        <canvas
          ref={overlayCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />

        {/* X-axis label */}
        <div className="text-center py-1">
          <span className="text-[10px] text-gray-500">Time →</span>
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs text-gray-500 self-center mr-1">Presets:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => handlePreset(preset.name)}
            title={preset.description}
            className="px-2.5 py-1 rounded-md text-xs bg-[#1a1640]/60 text-gray-300 
                       hover:bg-purple-600/40 hover:text-white transition-colors border border-transparent
                       hover:border-purple-500/30"
          >
            {preset.icon} {preset.name}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handlePlay}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            isPlaying
              ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20'
              : 'bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-600/20'
          }`}
        >
          {isPlaying ? '⏹ Stop' : '▶ Play'}
        </button>

        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                     bg-[#1a1640] hover:bg-[#252060] text-gray-200 border border-purple-500/20 
                     hover:border-purple-500/40 transition-colors"
        >
          💾 Export WAV
        </button>

        <button
          onClick={handleClear}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                     bg-[#1a1640] hover:bg-red-900/40 text-gray-400 hover:text-red-300 
                     border border-transparent hover:border-red-500/30 transition-colors"
        >
          🗑️ Clear
        </button>
      </div>

      {/* Info footer */}
      <div className="mt-6 text-xs text-white max-w-2xl">
        <p>
          <strong className="text-gray-950 font-bold">How it works:</strong> Each pixel's vertical position maps to a frequency 
          (log scale, 20Hz–16kHz) and brightness maps to amplitude. When you hit Play, the synth engine 
          uses additive synthesis with coupled frequency bin interactions (the ΔMi−1 formula) to create audio. 
          Neighboring frequencies "pull" on each other like coupled oscillators, producing richer timbres than 
          simple sine-wave addition.
        </p>
      </div>
    </div>
  );
};

export default SpectrogramCreator;
