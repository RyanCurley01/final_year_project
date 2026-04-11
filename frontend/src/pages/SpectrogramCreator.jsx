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

// Format seconds as m:ss
const formatTime = (s) => {
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const TOOLS = {
  BRUSH: 'brush',
  LINE: 'line',
  ERASER: 'eraser',
  HARMONIC: 'harmonic',
};

const PRESETS = [
  { name: 'Blank', description: 'Empty canvas' },
  { name: 'Rising Tone',description: 'Frequency sweep upward' },
  { name: 'Falling Tone', description: 'Frequency sweep downward' },
  { name: 'Chord', description: 'Major chord with harmonics' },
  { name: 'Noise Burst', description: 'Broadband noise texture' },
  { name: 'Spiral', description: 'Aphex Twin-style spiral' },
  { name: 'Text: AFX', description: 'Write "AFX" in spectrum' },
  { name: 'Einstein Face', description: 'Einstein tongue photo — spectral face', persistKey: 'spectrogram-preset-einstein-bw', bundledSrc: '/Einstein gray.jpg' },
  { name: 'Male Face', description: 'Your saved face in the spectrum (ΔMi−1 style)', persistKey: 'spectrogram-preset-male-face', bundledSrc: '/male-face.png' },
  { name: 'Item Capture', description: 'Capture an item with webcam' },
  { name: 'Upload Image', description: 'Load any image into the spectrogram' },
];

const SAVED_FACE_KEY = 'spectrogram-saved-face';
const CUSTOM_FACE_PREFIX = 'spectrogram-face-';

// Color palette for painting intensity — matches ΔMi−1 inferno colormap
const INTENSITY_COLORS = [
  'rgba(0, 0, 0, 0)',            // 0 - transparent
  'rgba(3, 3, 18, 0.9)',         // very low — near black
  'rgba(23, 7, 80, 0.9)',        // low — deep indigo
  'rgba(100, 12, 120, 0.9)',     // med-low — purple
  'rgba(180, 20, 50, 0.95)',     // medium — dark red
  'rgba(220, 70, 20, 0.95)',     // med-high — orange-red
  'rgba(245, 140, 15, 0.95)',    // high — orange
  'rgba(255, 220, 30, 1)',       // very high — yellow
  'rgba(255, 255, 240, 1)',      // max — near white
];

// Map an amplitude (0-1) to a color string
const amplitudeToColor = (amp) => {
  if (amp <= 0.001) return 'rgba(0, 0, 0, 0)';
  const idx = Math.min(Math.floor(amp * (INTENSITY_COLORS.length - 1)) + 1, INTENSITY_COLORS.length - 1);
  return INTENSITY_COLORS[idx];
};

// Map amplitude to RGB values for direct pixel manipulation
// Colormap: dark navy → indigo → red → orange → yellow → white
const amplitudeToRGB = (amp) => {
  if (amp <= 0.001) return [3, 3, 18, 255]; // Near-black navy
  const t = Math.min(amp, 1);
  let r, g, b;
  if (t < 0.14) {
    // Black → deep indigo
    const s = t / 0.14;
    r = Math.round(3 + s * 20);
    g = Math.round(3 + s * 4);
    b = Math.round(18 + s * 62);
  } else if (t < 0.30) {
    // Deep indigo → purple
    const s = (t - 0.14) / 0.16;
    r = Math.round(23 + s * 77);
    g = Math.round(7 + s * 5);
    b = Math.round(80 + s * 40);
  } else if (t < 0.50) {
    // Purple → dark red
    const s = (t - 0.30) / 0.20;
    r = Math.round(100 + s * 100);
    g = Math.round(12 + s * 18);
    b = Math.round(120 - s * 80);
  } else if (t < 0.68) {
    // Dark red → orange
    const s = (t - 0.50) / 0.18;
    r = Math.round(200 + s * 40);
    g = Math.round(30 + s * 90);
    b = Math.round(40 - s * 30);
  } else if (t < 0.85) {
    // Orange → yellow
    const s = (t - 0.68) / 0.17;
    r = Math.round(240 + s * 15);
    g = Math.round(120 + s * 110);
    b = Math.round(10 + s * 20);
  } else {
    // Yellow → white
    const s = (t - 0.85) / 0.15;
    r = Math.round(255);
    g = Math.round(230 + s * 25);
    b = Math.round(30 + s * 225);
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
 * Connects an AnalyserNode to the global output audio instance globalAudioContext
 */
const useLiveSpectrogram = (isLiveMode, activeSong, isSongPlaying) => {
  const analyserRef = useRef(null);
  const dataRef = useRef(null);

  // Creates a useRef to keep track of the specific <audio> stream 
  // (MediaElementAudioSourceNode) the analyser has been attached to
  const connectedSourceRef = useRef(null); 

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
      // Opens a try block for safely building the audio graph. Asks the master Audio Context to build an AnalyserNode — 
      // a native browser feature for extracting time/frequency data from audio.
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
  const [maxDuration, setMaxDuration] = useState(15); // Max for duration slider; updated to match recorded song length
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [reversed, setReversed] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const [playheadPos, setPlayheadPos] = useState(-1);
  const [playbackProgress, setPlaybackProgress] = useState(0); // 0-1 for seek slider
  const [hoveredFreq, setHoveredFreq] = useState(null);

  // Webcam & image upload
  const [showWebcam, setShowWebcam] = useState(false);
  const [pendingPresetSave, setPendingPresetSave] = useState(null); // { key } when uploading for a named preset
  const [savedImagePresets, setSavedImagePresets] = useState(() => {
    const found = {};
    PRESETS.forEach((p) => { if (p.persistKey && localStorage.getItem(p.persistKey)) found[p.persistKey] = true; });
    return found;
  });
  const [customFacePresets, setCustomFacePresets] = useState(() => {
    const faces = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CUSTOM_FACE_PREFIX)) {
        const num = parseInt(key.slice(CUSTOM_FACE_PREFIX.length), 10);
        if (!isNaN(num)) faces.push({ name: `Face ${num}`, persistKey: key });
      }
    }
    faces.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return faces;
  });

  // dampingFactor: Serves as decay control. It is inverted (1 - dampingFactor)
  // to slowly dial down the total coupling force added to the bin per loop.
  const [dampingFactor, setDampingFactor] = useState(0.15);

  // couplingStrength: Mathematical friction. How severely the energy on one frequency "smears" into the frequencies around it.
  const [couplingStrength, setCouplingStrength] = useState(0.08);

  // couplingRadius: How many specific bands up-or-down the "smear" is allowed to travel.
  const [couplingRadius, setCouplingRadius] = useState(3);

  // externalForceGain: Directly scale the raw base float amplitude up or down.
  const [externalForceGain, setExternalForceGain] = useState(1.0);

  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1); // steps per frame

  // Evolved grid — the physics simulation result displayed on canvas
  const [evolvedGrid, setEvolvedGrid] = useState(() => SpectrogramSynth.createBlankGrid(NUM_TIME_SLICES, NUM_FREQ_BINS));
  const evolvedGridRef = useRef(evolvedGrid);
  const simulationStateRef = useRef(null); // running amplitude state per time-slice

  // ── Refs ──
  const videoRef = useRef(null);
  const webcamStreamRef = useRef(null);
  const fileInputRef = useRef(null);
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
  const reversedRef = useRef(false);
  const simulationEnabledRef = useRef(false);
  const intensityRef = useRef(0.8);  // Live amplitude multiplier for audio + canvas
  const externalForceGainRef = useRef(1.0);
  const dampingFactorRef = useRef(0.15);
  const couplingStrengthRef = useRef(0.08);
  const couplingRadiusRef = useRef(3);


  // useSelector(...): Taps into the global Redux store (state.player).
  // activeSong: Grabs the currently selected track metadata.
  // isPlaying: isSongPlaying: Grabs the boolean of whether music is currently unpaused,
  // renaming it to isSongPlaying to avoid variable name clashes.
  const { activeSong, isPlaying: isSongPlaying } = useSelector((state) => state.player);

  // useSpectrogramLive(): A custom React context hook.
  // setLiveRecording: A function used to broadcast to the rest of the app (like a Sidebar pulsing red dot) 
  // that the microphone or player is actively capturing data.
  const { setLiveRecording } = useSpectrogramLive();

  // useLiveSpectrogram(...): A custom hook that manages the Web Audio API connection (MediaStream for mic or <audio> capture).
  // It takes isLiveMode (user toggled), and the Redux song state.
  // getFrequencyData: A function that can be called 60 times a second to get the current audio FFT byte array.
  // isLiveConnected: A boolean confirming the audio graph is successfully wired up.
  const { getFrequencyData, isConnected: isLiveConnected } = useLiveSpectrogram(isLiveMode, activeSong, isSongPlaying);

  // isActivelyRecording: A strict boolean. True only if the user wants live mode, 
  // the hardware connected, and audio is actually playing.
  const isActivelyRecording = isLiveMode && isLiveConnected && isSongPlaying;

  // useEffect: Whenever the recording state or song title changes, 
  // it calls setLiveRecording so the rest of the UI knows what is being recorded.
  useEffect(() => {
    setLiveRecording(isActivelyRecording, activeSong?.title || activeSong?.albumTitle || null);

    //The cleanup function. When the component unmounts, it safely tells the global state that recording has stopped.
    return () => setLiveRecording(false, null);

  }, [isActivelyRecording, activeSong?.title, activeSong?.albumTitle, setLiveRecording]);


  // Why this is necessary: The Canvas requestAnimationFrame loop (which draws the visuals) 
  // runs completely outside of React's state cycle. If the drawing loop used standard React state variables (like grid), 
  // it would get trapped in a "stale closure" and always see the initial values from when the component first mounted.

  // By constantly syncing standard state variables (grid) into mutable references (gridRef.current), 
  // the ultra-fast drawing loop can check .current to instantly see user slider 
  // adjustments without forcing the component to re-render.
  useEffect(() => { gridRef.current = grid; }, [grid]);
  useEffect(() => { evolvedGridRef.current = evolvedGrid; }, [evolvedGrid]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { reversedRef.current = reversed; }, [reversed]);
  useEffect(() => { simulationEnabledRef.current = simulationEnabled; }, [simulationEnabled]);
  useEffect(() => { intensityRef.current = intensity; }, [intensity]);
  useEffect(() => { externalForceGainRef.current = externalForceGain; }, [externalForceGain]);
  useEffect(() => { dampingFactorRef.current = dampingFactor; }, [dampingFactor]);
  useEffect(() => { couplingStrengthRef.current = couplingStrength; }, [couplingStrength]);
  useEffect(() => { couplingRadiusRef.current = couplingRadius; }, [couplingRadius]);


  // ── Save live capture when recording stops ──
  useEffect(() => {
    // Triggers when the user stops recording (!isActivelyRecording), 
    // but only if we actually captured some audio data (liveColumnsRef.current.length > 0).
    if (!isActivelyRecording && liveColumnsRef.current.length > 0) {
      
      // Grabs the massive array containing all the captured 256-band audio frames.
      const columns = liveColumnsRef.current;
      const totalCols = columns.length;

      // Use actual wall-clock elapsed time for accurate duration.
      // performance.now(): Uses the browser's high-resolution microsecond clock. 
      // It subtracts the exact start time to find out how many milliseconds the recording lasted.
      const elapsedMs = performance.now() - liveRecordStartRef.current;

      // captureDuration: Converts it to seconds, ensuring it never registers as less than 1 second.
      const captureDuration = Math.max(1, elapsedMs / 1000);
      
      // .slice() creates a shallow copy of the recorded memory so we don't accidentally mutate or lose it later. 
      // Saves it into a permanent playback ref.
      capturedRecordingRef.current = {
        // copy array of Float64Arrays
        columns: columns.slice(), 
        duration: captureDuration,
      };

      // Auto-set duration to match recording length
      // Clamps the duration to max 300 seconds (5 minutes) and 1 decimal place. 
      // Updates the duration and sets the UI sliders' maximum bounds so the user 
      // can seek through exactly what they recorded.
      const roundedDur = Math.min(300, Math.max(1, parseFloat(captureDuration.toFixed(1))));
      setDuration(roundedDur);
      
      // Expand slider max to song length
      setMaxDuration(Math.ceil(roundedDur)); 

      // Save last NUM_TIME_SLICES to grid for static canvas display
      // Takes the massive recording array (which could be thousands of columns) 
      // and visually truncates it to just the last NUM_TIME_SLICES (likely 200 screen pixels wide) 
      // to display as a static grid on the Canvas.
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
      
      // setGrid(newGrid) saves it to state, and liveColumnsRef.current = [] 
      // deletes the live RAM buffer to prevent memory leaks and prepare for the next recording.
      setGrid(newGrid);
      liveColumnsRef.current = []; // Clear live buffer after saving
    }
  }, [isActivelyRecording]);

  // ── Initialize Synth (once — AudioContext is expensive to recreate) ──
  // Mounts once on component load ([] dependency array).
  useEffect(() => {
    // Creates a standalone Web Audio API context standard to Chromium and Safari (webkitAudioContext).
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Initializes the custom SpectrogramSynth class which generates audio from pixels.
    synthRef.current = new SpectrogramSynth(ctx, {
      numFreqBins: NUM_FREQ_BINS,
      dampingFactor,
      couplingStrength,
      couplingRadius,
      externalForceGain,
    });
    
    // return () => ctx.close() immediately kills the hardware audio pipeline 
    // if the user navigates away from the page, freeing up the soundcard.
    return () => ctx.close();
  }, []); 

  // Whenever a user touches one of the physics sliders, this instantly updates 
  // the internal variables of the audio synthesis engine so the sound mutates in real-time.
  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return;
    synth.dampingFactor = dampingFactor;
    synth.couplingStrength = couplingStrength;
    synth.couplingRadius = couplingRadius;
    synth.externalForceGain = externalForceGain;
  }, [dampingFactor, couplingStrength, couplingRadius, externalForceGain]);


  useEffect(() => {
    // If the user turns "Enable Simulation" off, it just copies the raw drawn grid 
    // directly to the screen (setEvolvedGrid) and aborts processing.
    if (!simulationEnabled) {
      setEvolvedGrid(grid);
      simulationStateRef.current = null;
      return;
    }

    // Deep clones the 2D grid using typed Float64Arrays for extremely fast mathematical computation.
    const evolved = grid.map((slice) => Float64Array.from(slice));
    
    // passes: Dictates how many times the blur/smoothing loop will run. A larger radius forces more mathematical passes.
    const passes = Math.max(1, Math.round(couplingRadius));

    // Iterates column by column globally across the screen (NUM_TIME_SLICES).
    for (let t = 0; t < NUM_TIME_SLICES; t++) {
      
      // Scale source data by gain and intensity
      // Scales the starting raw pixel brightness/audio energy 
      // by the user's externalForceGain and overall intensity.
      let state = new Float64Array(NUM_FREQ_BINS);
      for (let i = 0; i < NUM_FREQ_BINS; i++) {
        state[i] = (grid[t]?.[i] || 0) * externalForceGain * intensity;
      }

      // Multi-pass spatial coupling (frequency-domain smoothing)
      // Begins the spatial smoothing loop (acting similar to physical heat dissipation).
      for (let p = 0; p < passes; p++) {
        const next = new Float64Array(NUM_FREQ_BINS);
        
        // For every single pixel (i), it looks at its neighboring pixels above 
        // and below it up to the limit of couplingRadius (r).
        for (let i = 0; i < NUM_FREQ_BINS; i++) {
          
          // Aggregates the net energy pushing in or out of this bin from all neighbors.
          let couplingForce = 0;
          for (let r = -couplingRadius; r <= couplingRadius; r++) {
            
            // It skips itself (r === 0), and aborts if it hits the top or bottom of the screen (j < 0, etc).
            if (r === 0) continue;
            const j = i + r;
            if (j < 0 || j >= NUM_FREQ_BINS) continue;
            
            // Fji: Evaluates the force (friction). Frequencies further away 
            // (higher absolute r value) have a mathematically weaker influence than immediate neighbors.
            const Fji = couplingStrength / Math.abs(r);
            couplingForce += Fji * (state[j] - state[i]);
          }
          
          // Calculates the final pixel value: Takes its previous state, 
          // adds the massive couplingForce modified by the inverse dampingFactor.
          // .max(0, .min(1, ...)) locks the amplitude perfectly between 
          // 0.0 (Absolute silence/black) and 1.0 (Maximum volume/brightest color).
          next[i] = Math.max(0, Math.min(1, state[i] + (1 - dampingFactor) * couplingForce));
        }
        
        // Replaces the active state with this new processed array and loops again if passes requires it.
        state = next;
      }

      // Write evolved amplitudes back
      // Saves that single column back into the 2D evolved grid matrix.
      for (let i = 0; i < NUM_FREQ_BINS; i++) {
        evolved[t][i] = state[i];
      }
    }

    // Once all 200 time slices are fully processed, it calls 
    // setEvolvedGrid to pass the result over to the Canvas loop so the 
    // user finally sees the physical smearing effect on screen.
    simulationStateRef.current = null;
    setEvolvedGrid(evolved);
  }, [grid, dampingFactor, couplingStrength, couplingRadius, externalForceGain, simulationEnabled, intensity]);


  // ── Render canvas ──
  // Declares the drawing loop wrapped in a useCallback to prevent unnecessary component re-render
  const renderCanvas = useCallback(() => {

    // Grabs the HTML <canvas> element from its React useRef. 
    // If it hasn't rendered yet in the DOM (e.g., component is mounting), exit early to avoid fatal crashes.
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Gets the 2D rendering context ctx which allows drawing commands.
    // Gets the raw pixel width (w) and height (h) of the canvas element.
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // ctx.createImageData generates a massive one-dimensional 
    // array representing every single pixel on the canvas.
    const imageData = ctx.createImageData(w, h);

    // imageData.data is a Uint8ClampedArray (Values clamped 0-255). 
    // Every 4 indices represent a single pixel's Red, Green, Blue, and Alpha 
    // (opacity) channels. Manipulating this direct array is exponentially faster 
    // than using ctx.fillRect() thousands of times a second for spectrograms.
    const data = imageData.data;

    // Calculates the exact pixel width (cellW) and height (cellH) that a single "block" of spectrogram 
    // data should take up on the physical screen. E.g., if canvas is 800px wide and we have 200 
    // time slices, each block is 4 pixels wide.
    const cellW = w / NUM_TIME_SLICES;
    const cellH = h / NUM_FREQ_BINS;

    // Checks the simulation state reference boolean.
    // If the user has toggled "Enable Simulation", grab the evolvedGridRef 
    // (the 2D array that has had the physics engine applied to it).
    // If toggled off, grab the raw, normal gridRef (the raw mouse paintings or photo).
    const displayGrid = simulationEnabledRef.current ? evolvedGridRef.current : gridRef.current;

    // Grabs the current value of the Intensity slider so pixels can be instantly scaled brighter or 
    // dimmer visually without needing to wait for the physics engine to calculate
    const liveIntensity = intensityRef.current;

    // Determines if audio should be captured right now. Checks three state booleans: 
    // Did the user click the "Live" button? 
    // Are we successfully connected to the audio context? 
    // Is a song currently playing?
    const isRecording = isLiveMode && isLiveConnected && isSongPlaying;

    if (isRecording) {
      // If the condition is met, and the buffer memory (liveColumnsRef) is perfectly empty, we set a timestamp (performance.now())
      // to track exactly how many seconds the user has been recording for the UI label.
      if (liveColumnsRef.current.length === 0) {
        liveRecordStartRef.current = performance.now();
      }

      // Calls the hook function to get an array of raw frequency magnitudes 
      // (0-255) of the audio frame at this exact millisecond.
      const freqData = getFrequencyData();

      // If data came back successfully, we check the clock. We only grab a new "column" of audio every 
      // MS_PER_LIVE_COLUMN (e.g., 40 milliseconds). If less time has passed, we deliberately skip capturing 
      // this frame so the spectrogram doesn't scroll at the speed of light.
      if (freqData) {
        const now = performance.now();
        if (now - lastLiveWriteTimeRef.current >= MS_PER_LIVE_COLUMN) {

          // We create a fresh empty float array to hold exactly NUM_FREQ_BINS (256) data points because that's our screen resolution.
          // We check how many raw data points the audio analyzer gave us (totalBins, usually 1024).
          const column = new Float64Array(NUM_FREQ_BINS);
          const totalBins = freqData.length; // e.g. 1024 for fftSize=2048

          // Edge-case handling: If the browser for some odd reason returns a tiny audio buffer, just copy it exactly 1 to 1, 
          // and divide by 255 to scale it to a clean float between 0.0 and 1.0.
          if (totalBins <= NUM_FREQ_BINS) {
            // 1:1 or fewer bins — copy directly
            for (let i = 0; i < totalBins; i++) column[i] = freqData[i] / 255;
          } else {

            // Compression math: Since we have 1024 points of data but only 256 graphical slots, 
            // we find out how many audio bins fit into one graphical bin (1024 / 256 = 4).
            const binsPerCell = totalBins / NUM_FREQ_BINS;

            // Iterates over the 256 graphical slots. Calculates the exact start (lo) and end (hi) 
            // index markers for the 4 raw audio bins that belong in this visual slot.
            for (let i = 0; i < NUM_FREQ_BINS; i++) {
              const lo = Math.floor(i * binsPerCell);
              const hi = Math.floor((i + 1) * binsPerCell);

              // A loop checks the audio chunk and extracts the highest/loudest magnitude (peak) 
              // found within those 4 bins (Peak Binning strategy).
              // It sets that loudest volume divided by 255 into our neat 0.0 - 1.0 column array
              let peak = 0;
              for (let j = lo; j < hi; j++) {
                if (freqData[j] > peak) peak = freqData[j];
              }
              column[i] = peak / 255;
            }
          }

          // Pushes the finalized memory column to the end of the giant liveColumnsRef history array. 
          // Updates the throttle clock lastLiveWriteTimeRef to prevent capturing again for another 40ms
          liveColumnsRef.current.push(column);
          lastLiveWriteTimeRef.current = now;
        }
      }
    }

    // ── Determine data source (live scrolling buffer, captured playback, or static grid) ──
    // ── 3. Display Logic Routing ──
    // Makes a fast local reference to the massive history array.
    const liveColumns = liveColumnsRef.current;

    // Captured recording playback — scroll through ALL captured columns as audio plays.
    // Check this FIRST: when the spectrum is being played back, the captured recording
    // takes priority so the user sees (and can simulate) the recording they just made,
    // even if new live data is also arriving from an ongoing song.
    const captured = capturedRecordingRef.current;
    const pbCol = playbackColumnRef.current;
    
    // Checking for scenario A: Did the user completely stop recording, save the recording (captured), 
    // and press "Play" to listen back (isCapturedPlayback)?
    const isCapturedPlayback = captured && captured.columns.length > NUM_TIME_SLICES && pbCol >= 0;
    
    // If we are playing back a saved recording, calculate which chunk of the massive memory array
    // we should be looking at. It keeps the playhead mathematically bound roughly 80% to the 
    // right side of the screen (NUM_TIME_SLICES * 0.8), scrolling the canvas past the cursor.
    const capturedViewStart = isCapturedPlayback
      ? Math.max(0, Math.min(pbCol - Math.floor(NUM_TIME_SLICES * 0.8), captured.columns.length - NUM_TIME_SLICES))
      : 0;

    // Live scrolling waterfall — only when NOT doing captured playback.
    // This keeps the waterfall visible during brief pauses or audio glitches.
    // Checking for scenario B: Are we actively recording a live waterfall right now (hasLiveData)?
    const hasLiveData = !isCapturedPlayback && liveColumns.length > 0 && (isRecording || isLiveMode);
    
    // If yes, liveStartIdx grabs the *last* 200 frames from the array so the newest audio 
    // is always drawn on the right side of the screen.
    const liveStartIdx = hasLiveData ? Math.max(0, liveColumns.length - NUM_TIME_SLICES) : 0;

    // ── Apply ΔMi−1 physics simulation to live/captured columns ──
    // Uses multi-pass spatial coupling: each column is processed independently
    // (no inter-column accumulation) so there is no warmup dimming on dense
    // audio data. Multiple passes of neighbour-coupling are applied to spread
    // energy between frequency bins — the more passes, the wider the spread.
    // ── 4. Real-time Physics Engine Simulation ──
    let simulatedColumns = null;
    
    // If the User toggled the Physics Engine ON *and* there is actually live flowing data to process...
    if (simulationEnabledRef.current && (hasLiveData || isCapturedPlayback)) {
      
      // Grabs the correct dataset (live microphone vs a saved playback clip). 
      // Sets up an empty simulatedColumns list to hold the end-result of our physics math. 
      // Checks if the user toggled the "Reverse" switch.
      const sourceColumns = hasLiveData ? liveColumns : captured.columns;
      const viewStart = hasLiveData ? liveStartIdx : capturedViewStart;
      const viewCount = NUM_TIME_SLICES;
      const isReversed = reversedRef.current;
      simulatedColumns = new Array(viewCount);

      // Pulls all 5 physics slider variables from the UI instantly.
      const damp = dampingFactorRef.current;
      const coupling = couplingStrengthRef.current;
      const radius = couplingRadiusRef.current;
      const extGain = externalForceGainRef.current;
      const liveInt = intensityRef.current;
      
      // Number of spatial smoothing passes — more passes = wider spread
      // Calculates passes: The larger the coupling "radius", the more smoothing loops the engine runs.
      const passes = Math.max(1, Math.round(radius));

      // Begins the loop to process the 200 Time frames visible on screen. 
      // Handles reversing the visual index (outIdx) if the reverse toggle is enabled.
      for (let col = 0; col < viewCount; col++) {
        const outIdx = isReversed ? (viewCount - 1 - col) : col;
        const srcIdx = viewStart + outIdx;
        const srcCol = sourceColumns[srcIdx];
        
        // Safety check: If the array returned undefined, make a default column of pure silence (0.0s) and skip this loop.
        if (!srcCol) {
          simulatedColumns[outIdx] = new Float64Array(NUM_FREQ_BINS);
          continue;
        }

        // Start with scaled source data
        // Takes the raw audio volume floats (srcCol[i]) and multiplies them by the user's two global gain/intensity sliders.
        let state = new Float64Array(NUM_FREQ_BINS);
        for (let i = 0; i < NUM_FREQ_BINS; i++) {
          state[i] = (srcCol[i] || 0) * extGain * liveInt;
        }

        // Apply spatial coupling passes (frequency-domain smoothing)
        // Starts the multi-pass simulation loop.
        for (let p = 0; p < passes; p++) {
          const next = new Float64Array(NUM_FREQ_BINS);
          
          // Loops vertically through all 256 graphical bins. 
          // Sets an empty variable coupForce to measure how much energy 
          // from surrounding bins is bleeding into this current bin.
          for (let i = 0; i < NUM_FREQ_BINS; i++) {
            let coupForce = 0;
            
            // An inner loop checking the frequencies physically above 
            // and below this one within the user's radius. 
            // Bypasses r === 0 (looking at itself) and avoids checking out-of-bounds arrays.
            for (let r = -radius; r <= radius; r++) {
              if (r === 0) continue;
              const j = i + r;
              if (j < 0 || j >= NUM_FREQ_BINS) continue;
              
              // The Physics Math: The bleed force is calculated by subtracting difference
              //  between the neighbor's volume and its volume (state[j] - state[i]). 
              // It is multiplied by the users coupling slider limit, 
              // which is inversely divided by the physical distance of the neighbor (Math.abs(r)). 
              // E.g., bins directly next door smear heavily, bins 4 slots away smear weakly.
              coupForce += (coupling / Math.abs(r)) * (state[j] - state[i]);
            }
            
            // Damping controls how strongly the coupling modifies amplitudes
            // Calculates the final new energy for this pixel by injecting 
            // the smearing friction coupForce, while turning it down slightly via the user's decay slider (1 - damp).
            // Math.max(0, Math.min(1... completely clamps the number so energy never glitches over 1.0 or drops below 0.0.
            next[i] = Math.max(0, Math.min(1, state[i] + (1 - damp) * coupForce));
          }
          state = next;
        }
        
        // Assigns the final calculated column back into simulatedColumns[outIdx].
        simulatedColumns[outIdx] = state;
      }
    }

    // ── How the energy is drawn (Render spectrogram pixels) ──
    // ── 5. Drawing to the Physical Image Pixel Loop ──
    // This loop iterates over every "cell" of the logical matrix grid
    // Nested loop traversing every single cell in the 200x256 grid from left-to-right, bottom-to-top. 
    // Defining a blank amp variable for the volume of the cell.
    for (let t = 0; t < NUM_TIME_SLICES; t++) {
      for (let f = 0; f < NUM_FREQ_BINS; f++) {
        let amp;

        if (hasLiveData) {
          
          // Routing logic A (Live Flow): Grab pixel data from our physics output simulatedColumns 
          // if available, or just the raw liveColumns if physics is turned off.
          if (simulatedColumns) {
            amp = t < simulatedColumns.length ? simulatedColumns[t][f] : 0;
          } else {
            
            // Render from continuously accumulated live columns (scrolling waterfall)
            const dataIdx = liveStartIdx + t;
            amp = dataIdx < liveColumns.length ? liveColumns[dataIdx][f] : 0;
          }
        } else if (isCapturedPlayback) {
          
          // Routing logic B (Scrolling Clip Playback): Behaves identically 
          // to the live branch but pulls from the saved audio clip's memory.
          if (simulatedColumns) {
            amp = t < simulatedColumns.length ? simulatedColumns[t][f] : 0;
          } else {
            
            // Scroll through full captured recording during playback
            const dataIdx = capturedViewStart + t;
            amp = dataIdx < captured.columns.length ? captured.columns[dataIdx][f] : 0;
          }
        } else {
          
          // Normal grid render
          // Routing logic C (Static Canvas Mode): If no audio scrolling is happening, 
          // grab the pixel data right off the canvas (mouse drawings or photos) via displayGrid.
          const rawAmp = displayGrid[t]?.[f] || 0;
          amp = simulationEnabledRef.current ? rawAmp : Math.min(1, rawAmp * liveIntensity);
        }

        // Passes the finalized 0.0 - 1.0 volume energy into a helper function 
        // that returns an exact RGB color scheme array (e.g. [100, 12, 120, 255]).
        const [r, g, b, a] = amplitudeToRGB(amp);

        // Map to canvas coordinates (y is inverted — high freq at top)
        // px calculates the literal physical X-axis pixel coordinate on the screen.
        // py calculates the physical Y-axis on the screen. Crucially, it uses (NUM_FREQ_BINS - 1 - f). 
        // Canvas Y axis goes down, but human eyes expect high-frequencies at the top of a graph. 
        // This mathematically flips the rendering upside down graphically. 
        // pw and ph calculate how wide and thick a single "block" square should be painted on the screen.
        const px = Math.floor(t * cellW);
        const py = Math.floor((NUM_FREQ_BINS - 1 - f) * cellH);
        const pw = Math.max(1, Math.ceil(cellW));
        const ph = Math.max(1, Math.ceil(cellH));

        // Because a data "block" might be 4x2 actual monitor pixels in size, 
        // this sweeps a tiny inner-loop across that exact dimension block. 
        // Overflows off the right/bottom limits of the screen are blocked (< w, < h).
        for (let dx = 0; dx < pw && px + dx < w; dx++) {
          for (let dy = 0; dy < ph && py + dy < h; dy++) {
            
            // The Master ImageData Array Algorithm. This converts a simple (X, Y) coordinate 
            // into its literal position in a flat 1-Dimensional Array containing millions of numbers. 
            // Since every pixel takes up exactly 4 slots (R, G, B, A), modifying the index by * 4 is required.
            const idx = ((py + dy) * w + (px + dx)) * 4;
            
            // Injects the exact Red, Green, Blue, and fully opaque Alpha channel integers 
            // into the 1D Image Data block for rendering the massive single data array exactly 
            // where the pixel lives on the screen. Loops close.
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = a;
          }
        }
      }
    }

    // Flush the constructed pixel data array back to the visible canvas, completely replacing its contents.
    ctx.putImageData(imageData, 0, 0);

    // ── Recording indicator ──
    // If the system is actively recording from the microphone and has captured at least one slice of data.
    if (isRecording && liveColumns.length > 0) {
      
      // Leading/right edge indicator — fills left to right, then stays at right edge
      // Calculate how many columns have been filled physically on the canvas grid (up to the maximum width).
      const filledCols = Math.min(liveColumns.length, NUM_TIME_SLICES);
      
      // Determine the precise horizontal X coordinate of the leading recording edge.
      const edgeX = (filledCols / NUM_TIME_SLICES) * w;

      // Set the line color to a bold, semi-transparent red to indicate active recording.
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.8)';
      
      // Set the width of the recording indicator line.
      ctx.lineWidth = 2;
      
      // Begin a new path for the recording edge line.
      ctx.beginPath();
      
      // Start the line just to the left of the edge to ensure visibility.
      ctx.moveTo(edgeX - 1, 0);
      
      // Draw the line straight down to the bottom of the canvas.
      ctx.lineTo(edgeX - 1, h);
      
      // Execute the stroke to render the line.
      ctx.stroke();

      // Red glow
      // Swap to a much wider, more transparent red to create a neon glowing effect around the hard edge.
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.15)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(edgeX - 1, 0);
      ctx.lineTo(edgeX - 1, h);
      ctx.stroke();

      // Recording time label — use actual wall-clock elapsed time
      // Calculate the total elapsed seconds since recording began using the high-resolution performance timer.
      const elapsedSec = (performance.now() - liveRecordStartRef.current) / 1000;
      
      // Set the text color to matching red for the active recording timestamp.
      ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
      
      // Use a monospace font to prevent the text width from jittering as numbers change.
      ctx.font = '11px monospace';
      
      // Align the text to draw from left to right.
      ctx.textAlign = 'left';
      
      // Render the recording dot and the elapsed seconds at the bottom left.
      ctx.fillText(`● REC ${Math.max(0, elapsedSec).toFixed(1)}s`, 8, h - 8);
    }

    // ── Captured playback scrolling playhead ──
    // If the canvas is currently scrolling through a previously captured mic recording.
    if (isCapturedPlayback) {
      
      // Show playhead line at the position within the current viewport
      // Calculate where the current playback column sits relative to the current viewing window.
      const playheadViewCol = pbCol - capturedViewStart;
      
      // Translate that column index into a physical horizontal X coordinate.
      const playheadX = (playheadViewCol / NUM_TIME_SLICES) * w;
      
      // Set the playhead color to a bright, semi-transparent green.
      ctx.strokeStyle = 'rgba(0, 255, 150, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      // Draw a vertical line from the top to the bottom of the screen at the playhead position.
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();
      
      // Glow
      // Duplicate the stroke with a wider, faint green to create a glowing effect.
      ctx.strokeStyle = 'rgba(0, 255, 150, 0.2)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();

      // Progress label
      // Retrieve the total duration of the recorded audio capture.
      const totalSec = captured.duration;
      
      // Calculate the current timestamp in seconds based on the column progress ratio.
      const currentSec = (pbCol / captured.columns.length) * totalSec;
      
      // Configure the font style and alignment for the playback HUD.
      ctx.fillStyle = 'rgba(0, 255, 150, 0.9)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      
      // Render the current time vs total duration at the bottom left of the overlay.
      ctx.fillText(`▶ ${currentSec.toFixed(1)}s / ${totalSec.toFixed(1)}s`, 8, h - 8);
    }
  }, [isLiveMode, isLiveConnected, isSongPlaying, getFrequencyData, simulationEnabled]);

  // ── Render overlay (playhead, frequency guide) ──
  // useCallback hooks a separate rendering loop specifically for UI elements overlaid on the core canvas.
  const renderOverlay = useCallback(() => {
    
    // Attempt to retrieve the overlay canvas DOM element reference.
    const canvas = overlayCanvasRef.current;
    
    // Bail out immediately if the canvas hasn't mounted yet.
    if (!canvas) return;
    
    // Acquire the 2D drawing context for the overlay layer.
    const ctx = canvas.getContext('2d');
    
    // Wipe the entire overlay canvas entirely clean before drawing the new frame.
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Cache the absolute width and height of the canvas.
    const w = canvas.width;
    const h = canvas.height;
    
    // Calculate the physical height of each individual frequency bin in pixels.
    const cellH = h / NUM_FREQ_BINS;

    // Check if the system currently holds an actively playing recorded buffer longer than the screen space.
    const hasCapturedPlayback = capturedRecordingRef.current
      && capturedRecordingRef.current.columns.length > NUM_TIME_SLICES
      && playbackColumnRef.current >= 0;
      
    // If not doing captured playback, but a valid playhead exists, draw the generic green play line.
    if (!hasCapturedPlayback && playheadPos >= 0 && playheadPos < NUM_TIME_SLICES) {
      
      // Translate the playhead index (0-128) to an actual X pixel value.
      const x = (playheadPos / NUM_TIME_SLICES) * w;
      
      // Prepare the hard green core stroke.
      ctx.strokeStyle = 'rgba(0, 255, 150, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      // Slash vertically across the entire canvas height.
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();

      // Glow effect
      // Add a fading, wider transparent neon glow overlay for aesthetics.
      ctx.strokeStyle = 'rgba(0, 255, 150, 0.2)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Draw frequency labels on right edge
    // Configure text styling for the grid labels showing frequency demarcations.
    ctx.font = '10px monospace';
    
    // Use a faint purple-white color for the frequency text.
    ctx.fillStyle = 'rgba(200, 200, 255, 0.5)';
    
    // Anchor text rendering from the right side.
    ctx.textAlign = 'right';
    
    // Define the specific Hz values to explicitly mark on the Y-Axis graph.
    const freqLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 16000];

    // Check if the synthesizer backend is actively spun up.
    if (synthRef.current) {
      
      // Iterate through every defined label frequency.
      freqLabels.forEach((freq) => {
        
        // Query the synth to determine which array bin contains this specific frequency.
        const bin = synthRef.current.getBinForFrequency(freq);
        
        // Calculate the physical Y coordinate, inverting because array index 0 is at the bottom.
        const y = (NUM_FREQ_BINS - 1 - bin) * cellH;
        
        // Ensure the label falls within a safe rendering zone, avoiding clipping at the edges.
        if (y > 10 && y < h - 10) {
          
          // If the frequency hits kiloHertz bounds, format it with a 'k' suffix.
          ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : `${freq}`, w - 4, y + 3);
          
          // Set a very faint, highly transparent line color for the actual grid line.
          ctx.strokeStyle = 'rgba(200, 200, 255, 0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          
          // Draw the horizontal separator line originating from the left.
          ctx.moveTo(0, y);
          
          // Stop drawing the line slightly before the right edge to leave room for the text.
          ctx.lineTo(w - 30, y);
          ctx.stroke();
        }
      });
    }

    // Hover frequency indicator
    // Check if the user's mouse pointer is actively resting on the canvas grid.
    if (hoveredFreq !== null) {
      
      // Select a bright green text color for the dynamic HUD.
      ctx.fillStyle = 'rgba(0, 255, 150, 0.8)';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      
      // Format the active hovered Hz value, swapping to kHz if it crosses the 1000 margin.
      const freqText = hoveredFreq >= 1000
        ? `${(hoveredFreq / 1000).toFixed(1)}kHz`
        : `${Math.round(hoveredFreq)}Hz`;
      
        // Render the dynamic reading in the upper left corner.
      ctx.fillText(freqText, 8, 16);
    }
  }, [playheadPos, hoveredFreq]);

  // ── Animation loop ──
  // A master orchestration hook that binds the dual-canvas rendering logic directly to browser refresh frames.
  useEffect(() => {
    
    // Define the recursive heart of the animation loop.
    const animate = () => {
      
      // Trigger the complex math evaluating WebGL array generation.
      renderCanvas();
      
      // Render the lightweight UI element lines and text.
      renderOverlay();
      
      // Re-register the animate function to run on the next hardware vertical sync.
      animFrameRef.current = requestAnimationFrame(animate);
    };
    
    // Kickstart the rendering loop for the first time immediately upon mount.
    animFrameRef.current = requestAnimationFrame(animate);
    
    // Return a standard React cleanup unmount function.
    return () => {
      // If an animation frame was ever scheduled, securely cancel it before tearing down.
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [renderCanvas, renderOverlay]);

  // ── Canvas coordinate helpers ──
  // useCallback caches a helper function translating arbitrary browser mouse clicks into discrete math array indexes.
  const canvasToGrid = useCallback((e) => {
    
    // Attempt to target the active overlay canvas instance handling user UI.
    const canvas = overlayCanvasRef.current;
    
    // Fast-fail if the DOM element isn't actively painted.
    if (!canvas) return null;
    
    // Request the explicit viewport location parameters (padding, scroll offset) from the browser window.
    const rect = canvas.getBoundingClientRect();
    
    // Neutralize standard browser document-flow X coordinates into a canvas-internal relative position.
    const x = e.clientX - rect.left;
    
    // Neutralize standard browser document-flow Y coordinates into a canvas-internal relative position.
    const y = e.clientY - rect.top;
    
    // Take the relative horizontal position, find the percentage ratio, and multiply by integer array columns (Time Slice).
    const t = Math.floor((x / rect.width) * NUM_TIME_SLICES);
    
    // Take the relative vertical position, map ratio to frequency array indexing, and invert (bottom-up canvas rendering).
    const f = NUM_FREQ_BINS - 1 - Math.floor((y / rect.height) * NUM_FREQ_BINS);
    
    // Rigorously enforce boundary clamps, ensuring no math errors occur when rapidly dragging the mouse past edges.
    return { t: Math.max(0, Math.min(NUM_TIME_SLICES - 1, t)), f: Math.max(0, Math.min(NUM_FREQ_BINS - 1, f)) };
  }, []);

  // ── Paint on grid ──
  // Core user painting algorithm that actually mutates the deeply stored Float64 matrix states based on brushes.
  const paintOnGrid = useCallback((t, f) => {
    
    // Enter into the React state-setting queue for the absolute base data array.
    setGrid((prev) => {
      
      // Clone the entire massive 2D array, ensuring we don't accidentally mutate state directly outside React rules.
      const next = prev.map((slice) => Float64Array.from(slice));
      
      // Calculate a variable integer padding zone based on the active GUI slider.
      const halfBrush = Math.floor(brushSize / 2);

      // Construct a two-dimensional X sweep loop to check all adjoining pixel pixels.
      for (let dt = -halfBrush; dt <= halfBrush; dt++) {
        
        // Construct the inner Y sweep loop.
        for (let df = -halfBrush; df <= halfBrush; df++) {
          
          // Add the original root center to the sweep offsets.
          const tt = t + dt;
          const ff = f + df;
          
          // Discard the specific sub-pixel iteration if it exceeds math boundaries to prevent hard crashes.
          if (tt < 0 || tt >= NUM_TIME_SLICES || ff < 0 || ff >= NUM_FREQ_BINS) continue;

          // Circular brush with falloff
          // Resolve standard Pythagorean distance equations indicating how far the current sweep dot is from the click origin.
          const dist = Math.sqrt(dt * dt + df * df);
          
          // If the pixel resides entirely outside the designated radius of the circular footprint, stop evaluating.
          if (dist > halfBrush + 0.5) continue;
          
          // Generate a smooth interpolation curve determining how 'alpha' or strong the brush stamp gets based on range.
          const falloff = 1 - (dist / (halfBrush + 1));

          // Branching logic determining if the left-menu UI option is currently toggled onto "Erase Mode".
          if (tool === TOOLS.ERASER) {
            
            // Drop power towards absolute zero in a smooth manner instead of hard-clipping.
            next[tt][ff] = Math.max(0, next[tt][ff] - falloff * 0.3);
          } else if (tool === TOOLS.HARMONIC && synthRef.current) {
            
            // Paint with harmonics
            // Declare six octaves or "mirror points" for harmonic overtone mathematical rendering.
            const numHarmonics = 6;
            
            // Iterate down through the fundamental sequence of harmonics.
            for (let h = 1; h <= numHarmonics; h++) {
              
              // Calculate specific overtone bins by directly multiplying raw bin indexes rather than converting back to Hz.
              const harmonicBin = Math.round(ff * h);
              
              // Safe-brake if the overtone sequence calculates an infinite tone.
              if (harmonicBin >= NUM_FREQ_BINS) break;
              
              // Scale down amplitude exponentially to make secondary waves perceptually "soft".
              const harmonicAmp = intensity * falloff / h;
              
              // Securely inject the bounded power rating directly into the cloned `next` state.
              next[tt][harmonicBin] = Math.min(1, Math.max(next[tt][harmonicBin], harmonicAmp));
            }
          } else {
            
            // Apply standard flat-power addition to raw arrays.
            next[tt][ff] = Math.min(1, Math.max(next[tt][ff], intensity * falloff));
          }
        }
      }
      
      // Publish the heavily mutated structural changes back up into global React contexts via `setGrid`.
      return next;
    });
  }, [tool, brushSize, intensity]);

  // ── Bresenham line interpolation for smooth strokes ──
  // A traditional algorithm determining the straightest pixel-perfect path bridging point A to point B.
  const paintLine = useCallback((x0, y0, x1, y1) => {
    
    // Generate absolute ranges between start points and finish coordinates on X fields.
    const dx = Math.abs(x1 - x0);
    
    // Generate absolute ranges between start points and finish coordinates on Y fields.
    const dy = Math.abs(y1 - y0);
    
    // Determine mathematical polarity of travel—are we going Left/Right or Down/Up.
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    
    // Set a rolling error tracking metric to measure line aliasing drift over iteration cycles.
    let err = dx - dy;

    // Trigger an indefinite loop tracking drawing vectors.
    while (true) {
      
      // Actively run the paint/modify operations at the precise line origin.
      paintOnGrid(x0, y0);
      
      // Hard break statement safely breaking out of the infinite evaluation loop when goal met.
      if (x0 === x1 && y0 === y1) break;
      
      // Perform rolling margin mathematics to measure integer step requirements avoiding subpixel smearing.
      const e2 = 2 * err;
      
      // Inject error compensation if leaning off vertical trajectories.
      if (e2 > -dy) { err -= dy; x0 += sx; }
      
      // Inject error compensation if drifting off absolute horizontal tracking paths.
      if (e2 < dx) { err += dx; y0 += sy; }
    }
  }, [paintOnGrid]);

  // ── Mouse handlers ──
  // Hook tracking standard left-mouse-click initiations to begin user-driven canvas mutation interactions.
  const handlePointerDown = useCallback((e) => {
    
    // Interrupt standard browser interactions preventing highlight dragging errors over dynamic canvas fields.
    e.preventDefault();
    
    // Cache the actively down state to block unintentional drag smudging while hovering.
    isDrawingRef.current = true;
    
    // Calculate the array bin under the cursor root location using the pre-built DOM translator method.
    const pt = canvasToGrid(e);
    
    // Safety check confirming that calculation returned a valid structural address format.
    if (pt) {
      
      // Update global pointer memory registering where the track path originated.
      lastPointRef.current = pt;
      
      // Enact standard painting behaviors rendering instantaneous dots into array targets.
      paintOnGrid(pt.t, pt.f);
    }
  }, [canvasToGrid, paintOnGrid]);

  // A constantly-triggering event listener observing granular real-time sub-pixel pointer drift routines.
  const handlePointerMove = useCallback((e) => {
    
    // Process current cursor viewport position and translate back to rigid internal system blocks immediately.
    const pt = canvasToGrid(e);
    
    // Perform an independent safety scan verifying a valid location combined with an available synth architecture reference.
    if (pt && synthRef.current) {
      
      // Decode absolute index addresses back to acoustic properties pushing updates to local GUI overlay panels.
      setHoveredFreq(synthRef.current.getFrequencyForBin(pt.f));
    }

    // Fail rapidly leaving standard behaviors intact if a dragged move wasn't explicitly started with a full-press initialization.
    if (!isDrawingRef.current || !pt) return;
    
    // Disable any inherent OS-level interactions while engaging in complex line drawing vector processing modes.
    e.preventDefault();

    // Query the global memory bank searching for the absolute prior frame’s recorded mouse axis target points.
    const last = lastPointRef.current;
    if (last) {
      
      // Execute the Bresenham physics operation dynamically smoothing sweeping brush cuts.
      paintLine(last.t, last.f, pt.t, pt.f);
    } else {
      
      // Revert to raw single-action inputs should the timeline buffer inexplicably fail line bridging mechanics.
      paintOnGrid(pt.t, pt.f);
    }
    
    // Set the state system ready to evaluate against future timeline positions during rolling processing scans.
    lastPointRef.current = pt;
  }, [canvasToGrid, paintOnGrid, paintLine]);

  // A basic cleanup operation ending tracking strings automatically as system hardware interrupts finger/mouse pressures.
  const handlePointerUp = useCallback(() => {
    
    // Erase the background flag tracking boolean allowing standard UI interactions anew alongside non-modifying pointer tracking.
    isDrawingRef.current = false;
    
    // Scrub the global tracking variables guaranteeing subsequent cursor interactions remain disjointed and clear from history.
    lastPointRef.current = null;
  }, []);


  // A simple pause command that freezes the browser's global AudioContext hardware loop while maintaining memory.
  const handlePause = useCallback(() => {
    
    // Escape immediately if the state indicates we're already locked into a stationary timeline cycle.
    if (!isPlaying) return;
    
    // Extract the active synth core from the universal memory reference block.
    const synth = synthRef.current;
    
    // Safely interrogate the global AudioContext tracking system evaluating its internal hardware flow state.
    if (synth?.audioContext?.state === 'running') {
      
      // Hard stop the audio engine at a hardware level stopping buffer drains or processor calculations abruptly.
      synth.audioContext.suspend();
    }
    
    // Set the overall boolean states modifying the active React component views showing UI paused configurations.
    setIsPlaying(false);
    setIsPaused(true);

  }, [isPlaying]);

  // ── Stop — full teardown ──
  // A comprehensive nuke command that wipes processing arrays securely preventing orphaned runaway logic threads.
  const handleStop = useCallback(() => {
    
    // Specifically target the low-level Javascript AudioNode currently calculating sound values.
    if (realtimeProcessorRef.current) {
      
      // Sever the hardware node connection instantly severing processing capabilities.
      realtimeProcessorRef.current.disconnect();
      
      // Drop the active evaluation hook tracking audio stream buffer loops.
      realtimeProcessorRef.current.onaudioprocess = null;
      
      // Overwrite the core reference object explicitly eliminating zombie processes triggering memory errors.
      realtimeProcessorRef.current = null;
    }
    
    // Cleanly untangle the intermediary gain node acting as a volume control layer before output routing.
    if (playbackRef.current) {
      playbackRef.current.disconnect();
      playbackRef.current = null;
    }
    
    // Hard refresh root global tracking properties initializing sound loops back to a blank start line state.
    realtimePhasesRef.current = null;
    realtimeSampleRef.current = 0;
    
    // Ensure the external webcam snapshot recording cursor returns cleanly to resting default variables.
    playbackColumnRef.current = -1;
    
    // Command the broad logic environment out of active streaming states and zero the internal timelines.
    setIsPlaying(false);
    setIsPaused(false);
    setPlayheadPos(-1);
    setPlaybackProgress(0);
  }, []);


  // ── Seek — jump to a position (0-1) ──
  // Allow direct manipulation overriding default continuous time algorithms by skipping to absolute points.
  const handleSeek = useCallback((progress) => {
    
    // Acquire the foundational synth framework for safe interactions and calculation references.
    const synth = synthRef.current;
    if (!synth) return;
    
    // Extract local timeline constraints to accurately execute progress mathematics algorithms.
    const dur = durationRef.current;
    
    // Multiply global active limits against sample rate to identify absolute max ceiling thresholds.
    const totalSamples = Math.ceil(dur * synth.audioContext.sampleRate);
    
    // Explicitly modify the deep processing sample iterator to leap instantly ignoring preceding samples.
    realtimeSampleRef.current = Math.floor(progress * totalSamples);
    
    // Propagate the identical spatial skip math back into horizontal coordinate data for overlay redraw pipelines.
    setPlayheadPos(Math.floor(progress * NUM_TIME_SLICES));
    setPlaybackProgress(progress);
  }, []);

  
  // ── Play — build audio graphs and run buffers ──
  // Main orchestrator instantiating dynamic playback buffers converting drawn graphs into raw physical sound outputs.
  const handlePlay = useCallback(async () => {
    
    // Early exit determining if the node graph is merely paused rather than functionally stopped.
    if (isPaused && realtimeProcessorRef.current) {
      
      // Connect to the deep Web Audio context architecture validating active node graphs.
      const synth = synthRef.current;
      if (synth?.audioContext?.state === 'suspended') {
        
        // Use an asynchronous await pattern explicitly reviving suspended Audio Nodes sequentially.
        await synth.audioContext.resume();
      }
      
      // Re-trigger the active display flags flipping rendering logic pipelines to streaming visuals.
      setIsPlaying(true);
      setIsPaused(false);

      // Cache a local reference to the active hardware sound environment bypassing subsequent lookup loops.
      const ctx = synth.audioContext;
      const captured = capturedRecordingRef.current;
      
      // Configure local booleans establishing whether playback logic feeds from drawn models or recorded video files.
      const hasCaptured = captured && captured.columns.length > 0;
      const capturedNumSlices = hasCaptured ? captured.columns.length : 0;
      
      // Establish the cyclic internal animation worker exclusively executing playback visualization redraws.
      const animatePlayhead = () => {
        
        // Terminate immediately should the core processor terminate ungracefully dropping references mid-loop.
        if (!realtimeProcessorRef.current) return;
        const dur = durationRef.current;
        
        // Extract precisely scaled max boundary markers evaluating global run lengths against processing metrics.
        const totalSamples = Math.ceil(dur * ctx.sampleRate);
        
        // Deduce a clean 0.0 to 1.0 fraction marking total system playback propagation depth.
        const progress = realtimeSampleRef.current / totalSamples;
        
        // Invoke standard stop lifecycle routines assuming natural playback bounds have been completely processed.
        if (progress >= 1) {
          handleStop();
          return;
        }
        
        // Handle explicit rendering path behaviors when playing back previously encoded video audio conversions.
        if (hasCaptured) {
          playbackColumnRef.current = Math.floor(progress * capturedNumSlices);
        } else {
          playbackColumnRef.current = -1;
        }
        
        // Publish integer results forcing redraw behaviors in horizontal UI components tracking line progress.
        setPlayheadPos(Math.floor(progress * NUM_TIME_SLICES));
        setPlaybackProgress(progress);
        
        // Cycle the command sequence registering directly on the next hardware timing heartbeat refresh pass.
        requestAnimationFrame(animatePlayhead);
      };
      requestAnimationFrame(animatePlayhead);
      return;
    }

    // Toggle logic path handling button behaviors assuming active playback demands a sudden system pause instead.
    if (isPlaying) {
      handlePause();
      return;
    }

    // Default configuration force-enables basic physical ripple dynamics automatically when audio streams initialize.
    setSimulationEnabled(true);

    const synth = synthRef.current;
    if (!synth) return;
    const ctx = synth.audioContext;

    // Reactivate sleeping AudioContext environments assuring silent browsers do not drop initial output blocks.
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // Build massive parallel sine-wave calculation matrices calculating frequency-domain oscillator speed.
    const angularVelocities = new Float64Array(NUM_FREQ_BINS);
    for (let i = 0; i < NUM_FREQ_BINS; i++) {
      
      // Map arbitrary frequency indexes explicitly to pure 2*PI mathematical radial rotation speeds.
      angularVelocities[i] = (2 * Math.PI * synth.frequencies[i]) / ctx.sampleRate;
    }
    
    // Calculate an empirical scaling modifier normalizing raw summations preventing clipping distortion behaviors.
    const normFactor = synth.overallGain / Math.sqrt(NUM_FREQ_BINS);
    
    // Grab soft-fade values protecting abrupt volume transitions preventing sharp speaker pops/clicks.
    const fadeMs = synth.fadeMs || 10;

    // Establish memory arrays explicitly caching rotation phases avoiding arbitrary sine-wave alignment resetting frames.
    const phases = new Float64Array(NUM_FREQ_BINS);
    realtimePhasesRef.current = phases;
    realtimeSampleRef.current = 0;

    // Calculate generic frame boundaries demanding audio buffer generation (2048 handles latency vs glitching).
    const bufferSize = 2048;
    
    // Instantiate raw javascript execution pathways explicitly bypassing default audio algorithms in favor of direct DSP.
    const processor = ctx.createScriptProcessor(bufferSize, 0, 1);
    
    // Wire up standard volume controllers intercepting raw float data prior to hitting destination DAC hardware.
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;

    // Resolve global system properties verifying if playback explicitly streams real-time capture matrices versus drawings.
    const captured = capturedRecordingRef.current;
    const hasCaptured = captured && captured.columns.length > 0;
    const capturedColumns = hasCaptured ? captured.columns : null;
    const capturedNumSlices = hasCaptured ? captured.columns.length : 0;

    // Override the core audio processing engine attaching direct Javascript memory-chunk computation passes continuously.
    processor.onaudioprocess = (e) => {
      
      // Secure a direct memory pointer allowing modifications to physical DAC output buffer streams dynamically.
      const output = e.outputBuffer.getChannelData(0);
      const dur = durationRef.current;
      
      // Expand raw time scales back to explicit maximum buffer bounds establishing global track length constraints.
      const totalSamples = Math.ceil(dur * ctx.sampleRate);
      
      // Construct fade windows determining precise frame counts calculating initial / terminating volume drops.
      const fadeSamples = Math.round(fadeMs * ctx.sampleRate / 1000);
      
      // Access the mutable memory store registering where the global time cycle currently exists inside processing.
      let sampleIdx = realtimeSampleRef.current;

      // Select branching internal reference boundaries depending on capturing mode versus generative mode variables.
      const useCaptured = hasCaptured;
      const numSlices = useCaptured ? capturedNumSlices : NUM_TIME_SLICES;
      
      // Pre-select direct multi-dimensional float arrays resolving complex data stores prior to loop execution cycles.
      const currentGrid = useCaptured ? null : (simulationEnabledRef.current ? evolvedGridRef.current : gridRef.current);
      
      // Map arbitrary duration intervals precisely into raw sample window intervals allocating drawing resolutions.
      const samplesPerSlice = totalSamples / numSlices;

      // Instantiate dense calculation blocks processing sound frames sequentially across hardware buffer window lengths.
      for (let s = 0; s < output.length; s++) {
        
        // Graceful termination handling nullifying output streams identically avoiding clicking when boundary edges violated.
        if (sampleIdx >= totalSamples) {
          output[s] = 0;
          continue;
        }

        // Divide current sample counts determining implicit drawing matrix targets avoiding out-of-range slice indexes.
        const t = Math.min(Math.floor(sampleIdx / samplesPerSlice), numSlices - 1);

        // Derive sub-pixel positional timing metrics relative specifically to active grid divisions currently calculating.
        const posInSlice = sampleIdx - Math.floor(t * samplesPerSlice);
        
        // Explicitly calculate boundary ceilings protecting specific float interpolations rounding slice intervals up.
        const sliceLen = Math.ceil(samplesPerSlice);

        // Initialize pure mathematical multiplier variable managing active sound envelope modulators.
        let envelope = 1;
        
        // Implement initial zero-bound fade trajectories if current progress remains within calculated boundary padding.
        if (posInSlice < fadeSamples) envelope = posInSlice / fadeSamples;
        
        // Mirror fading behaviors handling inverse volume reductions identically across trailing boundary edges.
        else if (posInSlice > sliceLen - fadeSamples) envelope = (sliceLen - posInSlice) / fadeSamples;

        // Perform complex logic checks reversing output timelines flipping explicit playbacks generating "rewind" functionality.
        const sliceIdx = (useCaptured && reversedRef.current) ? (numSlices - 1 - t) : t;
        
        // Dynamically shift targeted data pools pointing specifically to internal snapshot columns vs active realtime grids.
        const sliceData = useCaptured ? capturedColumns[sliceIdx] : (currentGrid?.[t] || null);

        // Blank pure wave accumulators avoiding residual mathematical clipping overlaps destroying sine calculation results.
        let sample = 0;
        
        // Stream direct hardware control readings dynamically manipulating final envelope variables mid-calculation blocks.
        const liveIntensity = intensityRef.current;
        const liveForceGain = externalForceGainRef.current;
        const liveDamping = dampingFactorRef.current;
        const liveCoupling = couplingStrengthRef.current;
        const liveRadius = Math.round(couplingRadiusRef.current);
        const simOn = simulationEnabledRef.current;

        // Preallocate static memory banks guaranteeing Javascript Garbage Collectors remain untouched generating frames rapidly.
        const amps = new Float64Array(NUM_FREQ_BINS);
        for (let i = 0; i < NUM_FREQ_BINS; i++) {
          
          // Flatten visual representation scales specifically manipulating mathematical node powers instantly into matrices.
          amps[i] = (sliceData?.[i] || 0) * liveIntensity * liveForceGain;
        }

        // Process conditional branching paths specifically triggering explicit physics ripple solvers.
        if (simOn && liveCoupling > 0.001) {
          
          // Evaluate minimum mathematical cycle executions forcing propagation rendering effects smoothing frequency borders.
          const passes = Math.max(1, liveRadius);
          let state = amps;
          for (let p = 0; p < passes; p++) {
            
            // Allocate mutable temporary arrays caching modified properties during current internal evaluation sweeps.
            const next = new Float64Array(NUM_FREQ_BINS);
            for (let i = 0; i < NUM_FREQ_BINS; i++) {
              let coupForce = 0;
              
              // Iterate internal loops identifying exact cross-talk interactions pushing adjacent nodes vertically scaling values.
              for (let r = -liveRadius; r <= liveRadius; r++) {
                if (r === 0) continue;
                const j = i + r;
                if (j < 0 || j >= NUM_FREQ_BINS) continue;
                
                // Add positive coupling bias dragging current cell dynamics explicitly towards parallel target differences precisely.
                coupForce += (liveCoupling / Math.abs(r)) * (state[j] - state[i]);
              }
              
              // Enforce rigid [0,1] normalization matrices stopping aggressive cascade interactions mathematically scaling into oblivion.
              next[i] = Math.max(0, Math.min(1, state[i] + (1 - liveDamping) * coupForce));
            }
            state = next;
          }
          
          // Clone complete final generation block properties directly back into standard amplitude processing vectors sequentially.
          for (let i = 0; i < NUM_FREQ_BINS; i++) amps[i] = state[i];
        }

        // Conclude final raw algorithm sequences resolving independent frequency cycles linearly aggregating ultimate output floats.
        for (let i = 0; i < NUM_FREQ_BINS; i++) {
          
          // Implement physical damping variables manipulating raw sound pressures overriding external simulation constraints seamlessly.
          const amp = simOn ? amps[i] : amps[i] * (1 - liveDamping);
          
          // Exit early skipping silent frequency blocks optimizing global frame-times avoiding meaningless multiplying iterations entirely.
          if (amp < 0.001) {
            phases[i] += angularVelocities[i]; // keep phase moving
            continue;
          }
          
          // Add the discrete wave fragment into the master output mixing bus applying full volume envelope mapping.
          sample += amp * Math.sin(phases[i]) * envelope;
          
          // Step the mathematical angle forward preparing for the precise calculation required natively next frame.
          phases[i] += angularVelocities[i];
        }

        // Output raw audio data down to hardware smoothing peaks avoiding audio clipping using uniform dampeners.
        output[s] = sample * normFactor;
        sampleIdx++;
      }

      // Restore the internal cursor state into the react environment safely completing the Javascript iteration cycle.
      realtimeSampleRef.current = sampleIdx;

      // Keep phases in [0, 2π] every buffer to avoid float drift
      for (let i = 0; i < NUM_FREQ_BINS; i++) {
        
        // Run modulo wrapping operations to guarantee float parameters remain precise against standard JavaScript max decimal lengths.
        phases[i] %= (2 * Math.PI);
      }
    };

    // Route explicit Javascript audio manipulation pipeline nodes directly into standard WebAudio Graph flow paths.
    processor.connect(gainNode);
    
    // Connect output chain definitively back into physical device speaker outputs bridging math to sound.
    gainNode.connect(ctx.destination);
    
    // Store exact memory addresses for the currently streaming processor so teardown systems have an anchor.
    realtimeProcessorRef.current = processor;
    playbackRef.current = gainNode;

    // Transition React state views turning local playback components ON unlocking scrubbers/stoppers.
    setIsPlaying(true);
    setIsPaused(false);
    setPlaybackProgress(0);
    
    // Grab the exact internal Web Audio Context clock marking specifically when this specific iteration originated.
    playbackStartTimeRef.current = ctx.currentTime;

    // Playhead animation driven by the sample counter
    // Spin up an explicit graphical UI worker evaluating audio sync timing pushing UI playhead markers across canvas headers.
    const animatePlayhead = () => {
      
      // Sever the redraw process instantly if external state toggles cancel the active stream processor.
      if (!realtimeProcessorRef.current) return;
      
      const dur = durationRef.current;
      
      // Convert abstract temporal lengths dynamically against precise audio stream rates standardizing progress calculations.
      const totalSamples = Math.ceil(dur * ctx.sampleRate);
      const progress = realtimeSampleRef.current / totalSamples;
      
      // Assume stream generation completely concluded if internal cursor eclipses defined absolute boundary dimensions.
      if (progress >= 1) {
        handleStop();
        return;
      }
      
      // For captured recordings, map progress to full columns range for canvas scrolling
      if (hasCaptured) {
        
        // Track the current scrolling edge exactly to the active buffer offset.
        const currentCol = Math.floor(progress * capturedNumSlices);
        playbackColumnRef.current = currentCol;
      } else {
        playbackColumnRef.current = -1;
      }
      
      // Convert 0...1 percentage floats accurately into static geometric grid blocks highlighting vertical line traces.
      setPlayheadPos(Math.floor(progress * NUM_TIME_SLICES));
      setPlaybackProgress(progress);
      
      // Re-issue a callback requesting fresh cycle execution identically aligned to precise hardware screen refreshes.
      requestAnimationFrame(animatePlayhead);
    };
    requestAnimationFrame(animatePlayhead);
  }, [isPlaying, isPaused, handlePause, handleStop]);

  // ── Export WAV ──
  // Process the entire spatial grid immediately executing pure mathematical generation producing static offline WAV files.
  const handleExport = useCallback(async () => {
    const synth = synthRef.current;
    if (!synth) return;
    
    // Use full captured recording if available, otherwise use the grid
    const captured = capturedRecordingRef.current;
    
    // Toggle whether to process pure math generation or extract existing camera arrays.
    const exportGrid = captured && captured.columns.length > 0
      ? captured.columns
      : (simulationEnabled ? evolvedGrid : grid);
      
    // Set appropriate export length scales matching data bounds dynamically.
    const exportDuration = captured && captured.columns.length > 0
      ? captured.duration
      : duration;
      
    // Await the heavy generation resolving a standard Browser Blob packaging explicit WAV binary payload data.
    const blob = await synth.renderToWav(exportGrid, exportDuration);
    
    // Create an ephemeral virtual URL explicitly mapped to the system RAM storing the Blob content.
    const url = URL.createObjectURL(blob);
    
    // Instantiate a temporary, invisible DOM hyperlink precisely formatted to trigger standard browser download handlers.
    const a = document.createElement('a');
    a.href = url;
    
    // Assign a dynamic datetime namespace explicitly formatting the output payload file header nomenclature.
    a.download = `spectrogram-synth-${Date.now()}.wav`;
    
    // Simulate user interaction firing the click algorithm against the ephemeral HTML anchor.
    a.click();
    
    // Drop the strict DOM memory reference clearing RAM blocks preserving system stability post download.
    URL.revokeObjectURL(url);
  }, [grid, evolvedGrid, duration, simulationEnabled]);


  // Complete offline processor reading webcam feeds flattening data arrays building matrix geometries evaluating bounds.
  const imageToGrid = useCallback((imageSource) => {
    
    // Resolve precise physical input stream sizes verifying height and width independent of input format objects natively.
    const srcW = imageSource.naturalWidth || imageSource.videoWidth || imageSource.width;
    const srcH = imageSource.naturalHeight || imageSource.videoHeight || imageSource.height;

    // Stand up a complex hidden Canvas DOM object serving exclusively as an initial manipulation cache.
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = srcW;
    fullCanvas.height = srcH;
    const fullCtx = fullCanvas.getContext('2d');
    
    // Strip pure RGB data channels pushing everything strictly into a normalized Grayscale 0 to 255 buffer map.
    fullCtx.filter = 'grayscale(1)';
    fullCtx.drawImage(imageSource, 0, 0, srcW, srcH);
    fullCtx.filter = 'none';

    // Construct secondary scaled DOM node specifically matching global grid requirements formatting.
    const offscreen = document.createElement('canvas');
    offscreen.width = NUM_TIME_SLICES;
    offscreen.height = NUM_FREQ_BINS;
    const ctx = offscreen.getContext('2d');
    
    // Draw the massive primary canvas feed directly into the miniaturized structure performing raw compression interpolation.
    ctx.drawImage(fullCanvas, 0, 0, NUM_TIME_SLICES, NUM_FREQ_BINS);
    
    // Pull the raw clamped float arrays holding discrete pixel data out of browser rendering blocks explicitly.
    const imgData = ctx.getImageData(0, 0, NUM_TIME_SLICES, NUM_FREQ_BINS);
    const pixels = imgData.data;

    // Define memory footprint limits allocating Float64 resources tracking structural limits smoothly.
    const totalPixels = NUM_TIME_SLICES * NUM_FREQ_BINS;
    const grayValues = new Float64Array(totalPixels);

    // Iterating specifically through 2D vectors converting flat integer buffers into dimensional mapping models mapping grid spaces.
    for (let y = 0; y < NUM_FREQ_BINS; y++) {
      for (let t = 0; t < NUM_TIME_SLICES; t++) {
        const i = y * NUM_TIME_SLICES + t;
        
        // Divide original RGB integer spaces transforming 0-255 arrays down into normalized pure float scales [0-1].
        grayValues[i] = pixels[i * 4] / 255;
      }
    }

    // Allocate an empty framework preparing space explicitly recording specific high-contrast feature edges evaluating math differences.
    const edges = new Float64Array(totalPixels);
    let maxEdge = 0;

    // Begin standard Sobel Operator matrix loops evaluating gradients bypassing standard border pixels securely reducing crashes.
    for (let y = 1; y < NUM_FREQ_BINS - 1; y++) {
      for (let t = 1; t < NUM_TIME_SLICES - 1; t++) {
        
        // Map direct internal tracking matrix referencing where the current pixel lives sequentially.
        const idx = y * NUM_TIME_SLICES + t;
        
        // Target specifically independent pixels surrounding active evaluation centers acquiring local gradients mapped properly.
        const tl = grayValues[(y - 1) * NUM_TIME_SLICES + (t - 1)];
        const tc = grayValues[(y - 1) * NUM_TIME_SLICES + t];
        const tr = grayValues[(y - 1) * NUM_TIME_SLICES + (t + 1)];
        const ml = grayValues[y * NUM_TIME_SLICES + (t - 1)];
        const mr = grayValues[y * NUM_TIME_SLICES + (t + 1)];
        const bl = grayValues[(y + 1) * NUM_TIME_SLICES + (t - 1)];
        const bc = grayValues[(y + 1) * NUM_TIME_SLICES + t];
        const br = grayValues[(y + 1) * NUM_TIME_SLICES + (t + 1)];

        // Compute horizontal (X) and vertical (Y) intensity changes using standard mathematical edge approximation variables natively.
        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        
        // Set resulting absolute magnitudes executing standard distance formulations solving final vector length matrices dynamically.
        edges[idx] = Math.sqrt(gx * gx + gy * gy);
        
        // Track the single highest recorded contrast value allowing later mathematical pass normalization against max potential limits.
        if (edges[idx] > maxEdge) maxEdge = edges[idx];
      }
    }

    // Execute standard linear division forcing absolute data sets definitively between 0.0 and 1.0 based mathematically on largest found peak.
    if (maxEdge > 0) {
      for (let i = 0; i < totalPixels; i++) {
        edges[i] = edges[i] / maxEdge;
      }
    }

    // Assign a manual cutoff threshold explicitly removing generic camera noise static protecting generated audio tracks clearly.
    const edgeThreshold = 0.06;
    for (let i = 0; i < totalPixels; i++) {
      if (edges[i] < edgeThreshold) {
        
        // Immediately zero weak nodes creating clean empty spaces for clear sine waves rather than dirty static output frequencies.
        edges[i] = 0;
      } else {
        
        // Re-scale surviving edges to 0-1 and boost brightness aggressively
        // Run exponential curves compressing final ranges boosting low-contrast surviving lines brightly creating bold visuals instantly.
        edges[i] = Math.pow((edges[i] - edgeThreshold) / (1 - edgeThreshold), 0.35);
      }
    }

    // Generate entirely fresh multidimensional matrices formatted properly using the static initialisation toolkit completely anew.
    const newGrid = SpectrogramSynth.createBlankGrid(NUM_TIME_SLICES, NUM_FREQ_BINS);

    // Transplant computed single-array variables cleanly back into full 2D spaces respecting grid sizes actively rendering matrices.
    for (let t = 0; t < NUM_TIME_SLICES; t++) {
      for (let y = 0; y < NUM_FREQ_BINS; y++) {
        
        // Invert Y mapping ensuring internal rendering places highest audio frequencies consistently matching vertical spatial tracking arrays correctly.
        const f = NUM_FREQ_BINS - 1 - y;
        newGrid[t][f] = edges[y * NUM_TIME_SLICES + t];
      }
    }

    // Distribute final clean data representations back up to standard execution handlers ready to stream into DSP immediately seamlessly.
    return newGrid;
  }, []);


  // ── Webcam handling ──
  // Declares the function to open the camera, wrapped in useCallback so it doesn't get recreated on every React render. 
  // async is used because accessing hardware takes an unknown amount of time.
  const startWebcam = useCallback(async () => {
    try {

      // navigator.mediaDevices.getUserMedia: The standard browser API to request hardware permissions.
      // facingMode: 'user': Specifically asks for the front-facing "selfie" camera on mobile devices or laptops.
      // It asks for an ideal 640x480 resolution to avoid overloading the browser with a 4K video feed, 
      // since it will be downscaled to 200x256 anyway.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });

      // Saves the active video stream to a React useRef so it can be controlled or stopped later without triggering a re-render.
      // setShowWebcam(true) updates the UI state, popping up the Modal window containing the video feed.
      webcamStreamRef.current = stream;
      setShowWebcam(true);

      // Waits exactly one frame for React to physically render the <video> HTML element into the DOM.
      // Once it exists, it wires the raw camera stream directly into the video element so the user can see themselves.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });

      // If the user clicks "Block" on the browser permissions popup, or has no webcam, 
      // it catches the error and alerts them gracefully instead of crashing the app
    } catch (err) {
      console.error('Webcam access denied:', err);
      alert('Could not access webcam. Please allow camera permissions.');
    }
  }, []);

  const stopWebcam = useCallback(() => {
    
    // Cleanup: Checks if a camera stream is actively running.
    if (webcamStreamRef.current) {

      // .getTracks().forEach(track => track.stop()): 
      // Iterates through the video/audio streams and explicitly cuts power 
      // to the hardware (turning off the green webcam light on your laptop).
      webcamStreamRef.current.getTracks().forEach((track) => track.stop());
      webcamStreamRef.current = null;
    }

    // Deletes the reference and hides the webcam Modal window.
    setShowWebcam(false);
  }, []);

  // Capture the mirrored video frame to an offscreen canvas
  const captureVideoFrame = useCallback(() => {
    
    // Safely grabs the <video> element. If it's not ready or hasn't loaded video dimensions yet, abort.
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    
    // Creates an invisible <canvas> in the browser's memory exactly the exact size of the webcam feed.
    const offscreen = document.createElement('canvas');
    offscreen.width = video.videoWidth;
    offscreen.height = video.videoHeight;
    const ctx = offscreen.getContext('2d');
    
    // Mirroring logic: Webcams typically mirror you so lifting your right hand 
    // appears on the right side of the screen. Standard video captures don't save this mirror effect.
    // translate and scale(-1, 1) physically flip the invisible canvas completely backward.
    ctx.translate(offscreen.width, 0);
    ctx.scale(-1, 1);
    
    // drawImage instantly paints the current millisecond of the video onto this flipped canvas, and returns it.
    ctx.drawImage(video, 0, 0);
    return offscreen;
  }, []);

  const captureWebcam = useCallback(() => {
    const frame = captureVideoFrame();
    if (!frame) return;
    
    // Takes the photo, and passes it into imageToGrid (which applies 
    // the Aphex Twin style edge-detection and down-sizing to 200x256).
    const newGrid = imageToGrid(frame);
    
    // setGrid(newGrid) overwrites the current spectrogram drawing with the user's face.
    setGrid(newGrid);
    
    // Clears any currently playing audio recordings, 
    // and shuts down the webcam to save battery.
    capturedRecordingRef.current = null;
    stopWebcam();
  }, [captureVideoFrame, imageToGrid, stopWebcam]);

  // Save the current webcam frame as a new face preset
  const saveWebcamAsPreset = useCallback(() => {
    const frame = captureVideoFrame();
    if (!frame) return;
    
    const saveCanvas = document.createElement('canvas');
    saveCanvas.width = NUM_TIME_SLICES;
    saveCanvas.height = NUM_FREQ_BINS;
    const ctx = saveCanvas.getContext('2d');
    ctx.drawImage(frame, 0, 0, NUM_TIME_SLICES, NUM_FREQ_BINS);
    
    const dataUrl = saveCanvas.toDataURL('image/png');
    
    // Find next available face number
    let maxNum = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CUSTOM_FACE_PREFIX)) {
        const num = parseInt(key.slice(CUSTOM_FACE_PREFIX.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    const nextNum = maxNum + 1;
    const newKey = `${CUSTOM_FACE_PREFIX}${nextNum}`;
    localStorage.setItem(newKey, dataUrl);
    setCustomFacePresets((prev) => [...prev, { name: `Face ${nextNum}`, persistKey: newKey }]);
    
    // Also apply it immediately
    const newGrid = imageToGrid(frame);
    setGrid(newGrid);
    capturedRecordingRef.current = null;
    stopWebcam();
  }, [captureVideoFrame, imageToGrid, stopWebcam]);

  // Load saved face from localStorage into the grid
  const loadSavedFace = useCallback(() => {
    
    // When clicked later, it grabs that text string from the hard drive, 
    // creates a simulated HTML <img>, and waits for the browser to decode the 
    // Base64 string (img.onload). Once loaded, it throws it back into the 
    // imageToGrid DSP math and paints the screen.
    const dataUrl = localStorage.getItem(SAVED_FACE_KEY);
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      const newGrid = imageToGrid(img);
      setGrid(newGrid);
      capturedRecordingRef.current = null;
    };
    img.src = dataUrl;
  }, [imageToGrid]);

  // ── Upload image handler ──
  const handleImageUpload = useCallback((e) => {
    
    // Triggered when a user clicks a hidden <input type="file">. Grabs the physical image file they chose.
    const file = e.target.files?.[0];
    if (!file) { setPendingPresetSave(null); return; }
    
    // e.target.value = '' un-selects the file immediately from the HTML input. 
    // This is a common hack so the user can upload the exact same file twice if they make a mistake.
    e.target.value = '';
    
    // Checks if the user uploaded this image just for fun, or if they uploaded it specifically 
    // to fulfill a "Preset" slot (like clicking "Einstein B&W"). 
    const pending = pendingPresetSave;
    const img = new Image();
    img.onload = () => {
      if (pending) {
        
        // If it is a preset (pending), it draws it onto a canvas, converts it to a Base64 string, 
        // and saves it to localStorage under the preset's exact persistent key so they never have to upload it again.
        const saveCanvas = document.createElement('canvas');
        saveCanvas.width = NUM_TIME_SLICES;
        saveCanvas.height = NUM_FREQ_BINS;
        const sCtx = saveCanvas.getContext('2d');
        sCtx.drawImage(img, 0, 0, NUM_TIME_SLICES, NUM_FREQ_BINS);
        localStorage.setItem(pending.key, saveCanvas.toDataURL('image/png'));
        setSavedImagePresets((prev) => ({ ...prev, [pending.key]: true }));
        const newGrid = imageToGrid(img);
        setGrid(newGrid);
        setPendingPresetSave(null);
      } else {
        const newGrid = imageToGrid(img);
        setGrid(newGrid);
      }
      capturedRecordingRef.current = null;
      URL.revokeObjectURL(img.src);
    };
    
    // URL.createObjectURL(file): Converts the uploaded file on the hard drive into a 
    // temporary local URL that the img element can read instantly.
    img.src = URL.createObjectURL(file);
  }, [imageToGrid, pendingPresetSave]);

  // ── Load a persistent image preset from localStorage or bundled source ──
  const loadImagePreset = useCallback((preset) => {
    const dataUrl = localStorage.getItem(preset.persistKey);
    if (dataUrl) {
      const img = new Image();
      img.onload = () => {
        const newGrid = imageToGrid(img);
        setGrid(newGrid);
        capturedRecordingRef.current = null;
      };
      img.src = dataUrl;
    } else if (preset.bundledSrc) {
      // Load from bundled public image
      const img = new Image();
      img.onload = () => {
        const newGrid = imageToGrid(img);
        setGrid(newGrid);
        capturedRecordingRef.current = null;
      };
      img.src = preset.bundledSrc;
    } else {
      // First time — prompt user to upload the image, then auto-save
      setPendingPresetSave({ key: preset.persistKey });
      fileInputRef.current?.click();
    }
  }, [imageToGrid]);

  // ── Load preset ──
  const handlePreset = useCallback((presetName) => {
    
    // The master router for the Preset buttons. Whenever someone clicks a new preset, 
    // we violently kill any active audio, clear anything they recorded, and dump the live audio buffers.
    handleStop();
    capturedRecordingRef.current = null;
    liveColumnsRef.current = [];

    // Directs logic depending on the button clicked. Note fileInputRef.current?.click() 
    // programmatically forces a click on the hidden HTML file <input>, prompting the OS file chooser window to open.
    if (presetName === 'Item Capture') {
      startWebcam();
      return;
    }
    if (presetName === 'Upload Image') {
      setPendingPresetSave(null);
      fileInputRef.current?.click();
      return;
    }
    // Check for persistent image presets (Einstein, Male Face, etc.)
    const preset = PRESETS.find((p) => p.name === presetName);
    if (preset?.persistKey) {
      loadImagePreset(preset);
      return;
    }
    
    // If the user clicked a standard mathematical preset (like standard Harmonic series or noise functions), it simply generates a new array using generatePreset and sets the canvas to it.
    const newGrid = generatePreset(presetName, synthRef.current);
    setGrid(newGrid);
  }, [handleStop, startWebcam, loadImagePreset]);

  // ── Clear canvas ──
  const handleClear = useCallback(() => {
    
    // Bound to the "Trash/Clear" button.
    handleStop();
    
    // Creates a massive grid populated completely with 0 (silence/black).
    setGrid(SpectrogramSynth.createBlankGrid(NUM_TIME_SLICES, NUM_FREQ_BINS));
    
    // Also clear live capture
    liveColumnsRef.current = [];
    
    // Discard captured recording
    capturedRecordingRef.current = null; 
    
    // Resets the duration slider back to its default start time and its maximum cap to 15 seconds.
    setDuration(DEFAULT_DURATION); 
    setMaxDuration(15); 
  }, [handleStop]);

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

        {/* Toolbar - Formula Sliders for basic painting mechanics
            Changing Intensity scales `externalForceGain` which makes the drawn pixels brighter or dimmer
            in the main `useEffect` physics loop at the top of the file! */}
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

        {/* Duration slider */}
        <div className="flex items-center gap-2 bg-[#1a1640]/60 rounded-lg px-3 py-1">
          <span className="text-xs text-gray-400">Duration</span>
          <input
            type="range"
            min="1"
            max={maxDuration}
            step="0.5"
            value={duration}
            onChange={(e) => setDuration(parseFloat(e.target.value))}
            className="w-20 accent-cyan-500"
          />
          <span className="text-xs text-white w-10">{duration.toFixed(1)}s</span>
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
          
          {/* ── Formula Sliders ── 
              Moving these sliders instantly fires the onChange events (setDampingFactor, etc.).
              This updates the React state, which triggers the massive `useEffect` at the top of the file 
              that recalculates the ΔMi−1 math physics across all time slices. */}
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
        {PRESETS.map((preset) => {
          const needsSetup = preset.persistKey && !preset.bundledSrc && !savedImagePresets[preset.persistKey];
          return (
            <button
              key={preset.name}
              onClick={() => handlePreset(preset.name)}
              title={needsSetup ? `${preset.description} (click to upload image)` : preset.description}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors border ${
                preset.persistKey
                  ? needsSetup
                    ? 'bg-amber-900/30 text-amber-300 hover:bg-amber-700/40 hover:text-white border-dashed border-amber-500/40 hover:border-amber-400/60'
                    : 'bg-emerald-900/30 text-emerald-300 hover:bg-emerald-700/40 hover:text-white border-emerald-500/30 hover:border-emerald-400/50'
                  : 'bg-[#1a1640]/60 text-gray-300 hover:bg-purple-600/40 hover:text-white border-transparent hover:border-purple-500/30'
              }`}
            >
              {preset.icon} {preset.name}{needsSetup ? ' +' : ''}
            </button>
          );
        })}
        {customFacePresets.map((face) => (
          <div key={face.persistKey} className="relative group flex items-center">
            <button
              onClick={() => {
                const dataUrl = localStorage.getItem(face.persistKey);
                if (!dataUrl) return;
                const img = new Image();
                img.onload = () => {
                  const newGrid = imageToGrid(img);
                  setGrid(newGrid);
                  capturedRecordingRef.current = null;
                };
                img.src = dataUrl;
              }}
              title={face.name}
              className="px-2.5 py-1 rounded-l-md text-xs transition-colors border border-r-0 bg-cyan-900/40 text-cyan-300 hover:bg-cyan-700/40 hover:text-white border-transparent hover:border-purple-500/30"
            >
              {face.name}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                localStorage.removeItem(face.persistKey);
                setCustomFacePresets((prev) => prev.filter((f) => f.persistKey !== face.persistKey));
              }}
              title={`Delete ${face.name}`}
              className="px-1.5 py-1 rounded-r-md text-xs transition-colors border border-l-0 bg-cyan-900/40 text-red-400 hover:bg-red-600/40 hover:text-white border-transparent hover:border-red-500/30"
            >
              ✕
            </button>
          </div>
        ))}

      </div>

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handlePlay}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            isPlaying
              ? 'bg-yellow-600 hover:bg-yellow-700 text-white shadow-lg shadow-yellow-600/20'
              : 'bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-600/20'
          }`}
        >
          {isPlaying ? '⏸ Pause' : isPaused ? '▶ Resume' : '▶ Play'}
        </button>

        {(isPlaying || isPaused) && (
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all
                       bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20"
          >
            ⏹ Stop
          </button>
        )}

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

      {/* Playback seek slider */}
      {(isPlaying || isPaused) && (
        <div className="flex items-center gap-3 mt-2 bg-[#1a1640]/60 rounded-lg px-3 py-2">
          <span className="text-xs text-gray-400 w-10 text-right font-mono">
            {formatTime(playbackProgress * duration)}
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={playbackProgress}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            className="flex-1 accent-green-400 h-1.5"
          />
          <span className="text-xs text-gray-400 w-10 font-mono">
            {formatTime(duration)}
          </span>
        </div>
      )}

      {/* Webcam capture modal */}
      {showWebcam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0f0d2e] border border-purple-500/30 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">📸 Item Capture</h3>
              <button
                onClick={stopWebcam}
                className="text-gray-400 hover:text-white text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Position the item in the frame. High contrast + edge detection will give you 
              the ghostly ΔMi−1 spectral look — just like Aphex Twin's formula track.
            </p>
            <div className="relative rounded-lg overflow-hidden bg-black mb-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-lg"
                style={{ transform: 'scaleX(-1)' }}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveWebcamAsPreset}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm
                           bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 
                           text-white shadow-lg shadow-purple-600/20 transition-all"
              >
                📸 Capture
              </button>
              <button
                onClick={stopWebcam}
                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-[#1a1640] hover:bg-[#252060] 
                           text-gray-300 border border-purple-500/20 hover:border-purple-500/40 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
