// src/pages/MidiExplorer.jsx
// Tactile Music Discovery — physical MIDI knobs drive audio feature space navigation
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';

import useMidi from '../hooks/useMidi';
import useAudioInput from '../hooks/useAudioInput';
import MidiKnob from '../components/MidiKnob';
import MidiMappingPanel from '../components/MidiMappingPanel';
import {
  AUDIO_FEATURES,
  DEFAULT_CC_MAP,
  buildTargetFromCCs,
  deriveMood,
} from '../config/midiMappings';
import { analyseNoteWindow } from '../config/noteAnalysis';
import envConfig from '../config/environment';
import { setActiveSong, playPause, updateQueue } from '../redux/features/playerSlice';
import { productService } from '../redux/services';
import { Loader } from '../components';
import { fixText } from '../utils/fixText';

// ── Helpers ─────────────────────────────────────────────────────────
const POLL_MS = 400; // recommendation refresh rate when knobs move
const ARTISTS = ['Aphex Twin', 'Boards of Canada', 'Squarepusher'];

export default function MidiExplorer() {
  const dispatch = useDispatch();

  // MIDI hook
  const { midiSupported, devices, activeDevice, selectDevice, lastCC, lastNote, ccValues, error: midiError, retryAccess, rawMessages, noteHistory } = useMidi();

  // Audio input hook (live sound from synth/sampler)
  const { supported: audioSupported, audioDevices, listening, features: audioFeatures, level: audioLevel, error: audioError, startListening, stopListening, refreshDevices: refreshAudioDevices } = useAudioInput();
  const [audioMode, setAudioMode] = useState(false); // true = features derived from live audio

  // CC → feature mapping (persisted in localStorage)
  const [ccMap, setCcMap] = useState(() => {
    try {
      const stored = localStorage.getItem('midi_cc_map');
      return stored ? JSON.parse(stored) : { ...DEFAULT_CC_MAP };
    } catch { return { ...DEFAULT_CC_MAP }; }
  });

  // Feature target values (0-1)
  // The sliders on the screen natively map to the React state variable target. 
  // Any time the user does anything, it updates this central target object with 
  // the new 0-0.1 values and flags it as "dirty".
  const [targetFeatures, setTargetFeatures] = useState(() => {
    const t = {};

    // Loops through all the AUDIO_FEATURES defined in the midi mappings and sets them to their 
    // starting .default values so the sliders don't start at zero or crash the app.
    for (const [k, v] of Object.entries(AUDIO_FEATURES)) t[k] = v.default;

    return t;
  });

  // Recommendations from backend
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [showMapping, setShowMapping] = useState(false);
  const [melodySeedMatch, setMelodySeedMatch] = useState(null);
  const [melodyAlternatives, setMelodyAlternatives] = useState([]);
  const [melodyStatus, setMelodyStatus] = useState('idle');
  const [melodyLoading, setMelodyLoading] = useState(false);

  // Dirty flag — knobs moved, need to re-query
  const dirtyRef = useRef(false);
  const targetRef = useRef(targetFeatures);
  targetRef.current = targetFeatures;
  const allowedIdsRef = useRef(null); // [int] — only these product IDs can be recommended
  const itunesMetaRef = useRef({}); // Map<negativeTrackId, {trackName, artistName, artworkUrl100, previewUrl}>

  // enriches incoming recommendation objects with available catalog or iTunes metadata
  // to stop iTunes id's from showing
  const enrichRecommendations = (recs) => {
    if (!recs || !Array.isArray(recs)) return [];
    const musicProducts = products || [];
    return recs.map((r) => {
      try {
        const pid = r.product_id;
        const catalog = musicProducts.find((p) => String(p.id) === String(pid));
        const meta = itunesMetaRef.current && itunesMetaRef.current[pid];

        return {
          ...r,
          // Prefer already-provided backend fields, then catalog, then iTunes metadata
          trackName: r.trackName || catalog?.albumTitle || meta?.trackName || r.trackName,
          artistName: r.artistName || catalog?.artistName || meta?.artistName || r.artistName,
          artworkUrl100: r.artworkUrl100 || catalog?.albumCoverImageUrl || meta?.artworkUrl100 || r.artworkUrl100,
          previewUrl: r.previewUrl || catalog?.previewUrl || meta?.previewUrl || r.previewUrl,
        };
      } catch (err) {
        return r;
      }
    });
  };
  // ── Persist CC map ──────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('midi_cc_map', JSON.stringify(ccMap));
  }, [ccMap]);

  // ── Fetch allowed song IDs: 47 library + 150 artist songs ─────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const apiUrl = envConfig.getApiBaseUrl();
        const ids = [];

        // 1. Library songs (positive IDs)
        const allProducts = await productService.getAllProducts();
        allProducts.forEach((p) => {
          if (p.id > 0 && p.albumTitle && p.fileUrl && !p.fileUrl.toLowerCase().includes('.zip')) {
            ids.push(p.id);
          }
        });
        setProducts(allProducts);

        // 2. Artist songs from TopCharts (negative IDs = -trackId)
        for (const artist of ARTISTS) {
          try {
            const resp = await fetch(
              `${apiUrl}/api/itunes/search?term=${encodeURIComponent(artist)}&media=music&entity=song&limit=200`
            );
            const data = await resp.json();
            if (data.results) {
              const artistLower = artist.toLowerCase();
              data.results
                .filter((t) => t.previewUrl && t.artistName?.toLowerCase().includes(artistLower))
                .slice(0, 50)
                .forEach((t) => {
                  ids.push(-t.trackId); // negative = DB convention
                  itunesMetaRef.current[-t.trackId] = {
                    trackName: t.trackName,
                    artistName: t.artistName,
                    artworkUrl100: t.artworkUrl100,
                    previewUrl: t.previewUrl,
                  };
                });
            }
          } catch { /* skip artist on error */ }
        }

        if (!cancelled) {
          allowedIdsRef.current = ids;
          dirtyRef.current = true; // trigger initial recommendation fetch
        }
      } catch (err) {
        console.error('Failed to fetch allowed song IDs', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Update target when CC values change ───────────────────────
  useEffect(() => {
    if (!lastCC) return;
    const newTarget = buildTargetFromCCs(ccValues, ccMap);
    setTargetFeatures(newTarget);
    dirtyRef.current = true;
  }, [lastCC, ccValues, ccMap]);

  // ── Update target from note analysis (playing-driven) ─────────
  // React state variable used by the UI to light up an indicator telling the user: 
  // "Hey, your sliders are currently moving automatically based on the piano keys you are pressing."
  const [noteMode, setNoteMode] = useState(false); // true = deriving features from playing

  // Triggers every single time a new key is pressed (which updates the noteHistory array) 
  // or the user toggles the microphone (audioMode).
  useEffect(() => {

    // Priority Guard: The app has two ways to automatically move the 
    // sliders: playing a MIDI piano (noteMode) or playing real sound into a microphone (audioMode). 
    // This line says: "If the microphone is turned on, ignore the MIDI piano." 
    // It prevents the two systems from fighting over control of the sliders.
    if (audioMode) return; 

    // If the user has pressed fewer than 3 piano keys since they opened the app, 
    // it instantly stops. You can't calculate a meaningful tempo or melody from 1 or 2 notes, 
    // so it waits until a minimum threshold is met.
    if (noteHistory.length < 3) return;

    // Only analyse notes played from the last 10 seconds
    const cutoff = Date.now() - 10000;

    // Looks through the entire array of notes you've played and filters out any old ones.
    const recent = noteHistory.filter((n) => n.ts > cutoff);

    // Checks the newly filtered 10-second array. If the user played 20 notes, but stopped playing for 10 seconds, 
    // recent will be empty, and the function will stop. This ensures the sliders don't randomly jump around based on stale data.
    if (recent.length < 3) return;

    // Passes the filtered, 10-second window of notes into the math brain (analyseNoteWindow from noteAnalysis.js). 
    // This function crunches the velocities, timings, and intervals, and spits out an object containing the 0-1 values for Energy, Valence, Tempo, etc.
    const derived = analyseNoteWindow(recent);

    // returns null or undefined if the math function failed to calculate something
    // to prevent the entire webpage from crashing
    if (!derived) return;

    // Flips the UI flag to true, letting the visual components know 
    // that the piano is actively driving the app.
    setNoteMode(true);

    // Takes the newly calculated math object (e.g., { energy: 0.8, valence: 0.2 ... }) and overwrites the target state. 
    // This literally physically snaps the vertical sliders on your screen to their new calculated position
    setTargetFeatures(derived);

    // Timer is looking at dirtyRef.current twice a second.
    // When it sees that it has become true, 
    // it knows the sliders have moved, so it fires off a 
    // network request to the backend database to fetch new 
    // song recommendations matching the updated sliders.
    dirtyRef.current = true;

    // [noteHistory, audioMode] dictates the "dependencies" of this effect—meaning 
    // this whole block of code will re-evaluate every single time the note history 
    // grows handle single time a new note gets pushed into the noteHistorynoteHistory` array.
  }, [noteHistory, audioMode]);

  // ── Update target from live audio analysis ─────────────────────
  useEffect(() => {
    if (!audioFeatures || !listening) return;
    setAudioMode(true);
    setNoteMode(false);
    const { rms, dominantFreq, ...features } = audioFeatures;
    // Only update if there's meaningful audio (not silence)
    if (rms > 0.01) {
      setTargetFeatures(features);
      dirtyRef.current = true;
    }
  }, [audioFeatures, listening]);

  // Reset audio mode when stopped
  useEffect(() => {
    if (!listening) setAudioMode(false);
  }, [listening]);

  // Allow manual slider input (for users without hardware)
  // Uses React useCallback hook function with an empty array to guarantee
  // that React creates this function only once when the page loads, rather than 
  // recreating it 60 times a second while the user is dragging the mouse, 
  // which prevents UI lag/stuttering.
  const handleManualChange = useCallback((featureKey, val) => {

    // State Merging (...prev): It takes the current slider (featureKey) and 
    // safely updates its value (val) without erasing the values of the other sliders on the screen.
    // Number Safety (Math.min(...Math.max)): It strictly bounds the incoming mouse value between 0.0 and 1.0. 
    // This prevents bad coordinates from being sent to the database.
    setTargetFeatures((prev) => ({ ...prev, [featureKey]: Math.min(1, Math.max(0, val)) }));

    dirtyRef.current = true;
  }, []);

  // ── Melody Finder: backend contour matching from played notes ───────────────
  useEffect(() => {
    // Calculates a timestamp exactly 10 seconds in the past
    const cutoff = Date.now() - 10000;
    // Looks at the entire history of keys you've pressed and filters out anything older than 10 seconds.
    // This creates a rolling "listen window" so it only judges what you're playing right now.
    const recent = noteHistory.filter((n) => n.ts > cutoff);

    // Checks if at least 4 notes have been played in the last 10 seconds
    if (recent.length < 4) {
      // If not, clear out any previous melody matches from the screen
      setMelodySeedMatch(null);
      setMelodyAlternatives([]);
      // Update the UI status text. If there are songs on screen, tell the user "waiting for you to play notes". 
      // If no songs exist yet, set to 'idle'.
      setMelodyStatus(recommendations.length ? 'waiting-notes' : 'idle');
      return; // Stop the function here
    }

    // Checking if there are any songs actually loaded on the screen to match against
    if (!recommendations.length) {
      // If no songs are loaded, clear the melody finder UI
      setMelodySeedMatch(null);
      setMelodyAlternatives([]);
      setMelodyStatus('idle');
      return; // Stop the function here
    }

    // A flag used to safely ignore old network responses if the user plays a new note before the server replies
    let cancelled = false;
    
    // Starts a 450 millisecond timer. 
    // This "debounce" ensures we don't send a database request for EVERY single piano key press. 
    // It waits until you pause playing for half a second before firing the network request.
    const timeout = setTimeout(async () => {
      try {
        // Turn on the loading spinner specifically for the melody section
        setMelodyLoading(true);
        // Change the UI text to say "Searching for contour matches..."
        setMelodyStatus('searching');
        
        // Get the backend URL (e.g., http://localhost:8000)
        const apiUrl = envConfig.getApiBaseUrl();
        // Make a POST request to the Python melody-finder endpoint
        const resp = await fetch(`${apiUrl}/api/audio/melody-finder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Send the recent 10-seconds of notes (just the note number, how hard it was hit, and timestamp)
            notes: recent.map((n) => ({ note: n.note, velocity: n.velocity, ts: n.ts })),
            // Pass the master list of allowed song IDs (to prevent matching against broken database entries)
            allowed_ids: allowedIdsRef.current,
            // CRITICAL: Tells the backend to ONLY search inside the 12 songs currently visible on screen
            candidate_ids: recommendations.map((r) => Number(r.product_id)).filter((id) => Number.isFinite(id)),
            // Request 1 exact match (Seed Match)
            limit: 1,
            // Request up to 6 "Alternative" matches (same notes, different order)
            similar_limit: 6,
          }),
        });

        // Check if the server crashed or returned a 404/500 error
        if (!resp.ok) {
          // Check if this request was cancelled because the user played another note
          if (!cancelled) {
            // Reset the UI and tell the user "No match found"
            setMelodySeedMatch(null);
            setMelodyAlternatives([]);
            setMelodyStatus('no-match');
          }
          return;
        }

        // Unpack the successful JSON response from Python
        const data = await resp.json();
        // If the user played another note while the JSON was downloading, throw away this old result.
        if (cancelled) return;

        // Safely extract the exact match item and the list of alternative items
        const seed = data?.seed_match || null;
        const alts = data?.alternatives || [];

        // Check if mathematical match is too poor (score is less than 48% similar)
        // or if the backend returned no seed match at all
        if (!seed || (seed.melody_match || 0) < 0.48) {
          // If match is too weak, reject it and clear the UI to prevent showing bad recommendations
          setMelodySeedMatch(null);
          setMelodyAlternatives([]);
          setMelodyStatus('no-match');
          return;
        }

        // If we reach here, we have a strong mathematical melody match!
        // Save the exact match (this renders the top Cyan 'Seed Match' card)
        setMelodySeedMatch(seed);
        // Save the alternative matches (this renders the Indigo 'Alternative' tiles underneath it)
        setMelodyAlternatives(alts);
        // Change UI state to 'ready', which tells the React HTML to reveal the cyan/indigo cards.
        setMelodyStatus('ready');
      } catch (err) {
        // If an internet connection failure or code crash happens during the try block...
        if (!cancelled) {
          // Clear everything out and fail gracefully to 'no-match'
          setMelodySeedMatch(null);
          setMelodyAlternatives([]);
          setMelodyStatus('no-match');
        }
      } finally {
        // ALWAYS run this, whether it succeeded or crashed, to turn off the loading spinner
        if (!cancelled) setMelodyLoading(false);
      }
    }, 450);

    // This return function runs every time you press a new key OR the component unmounts.
    return () => {
      // 1. Flip cancelled to true, so any pending fetch responses instantly die
      cancelled = true;
      // 2. Erase the 450ms timer so it resets to 0. 
      // This is the core "Debounce" trick. If you hit 5 keys in a row rapidly, this ensures it only queries the database ONCE (half a second after your last keypress).
      clearTimeout(timeout);
    };
  // The dependencies: This entire useEffect evaluates from scratch every single time 
  // you press a new key (noteHistory changes) or the grid of songs updates (recommendations changes).
  }, [noteHistory, recommendations]);

  // ── Poll backend when dirty ───────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      // 1. Check if the sliders were moved in the last 400ms. If not, do nothing.
      if (!dirtyRef.current) return;
      
      // 2. Shut off the flag so it doesn't query again until you move a slider again
      dirtyRef.current = false;

      try {
        setLoading(true); // Show a spinning loader next to "Matching Songs"
        
        // 3. Send the exact current slider coordinates (targetRef.current) to the backend
        const apiUrl = envConfig.getApiBaseUrl();
        const resp = await fetch(`${apiUrl}/api/audio/midi-recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_features: targetRef.current, // E.g., { energy: 0.8, valence: 0.2 ... } 
            limit: 12,
            allowed_ids: allowedIdsRef.current,
          }),
        });
        
        // 4. Overwrite the `recommendations` array with the 12 new songs returned
        if (resp.ok) {
          const data = await resp.json();
          const recs = data.recommendations || [];
          // First-pass enrichment from local catalog / cached iTunes meta
          const enriched = enrichRecommendations(recs);

          // Identify missing iTunes metadata for negative (iTunes) IDs
          const missingIds = Array.from(new Set(
            enriched
              .filter((r) => {
                const pid = r.product_id;
                return (pid < 0) && !itunesMetaRef.current[pid];
              })
              .map((r) => Math.abs(r.product_id))
          ));

          // If any missing, fetch them directly from iTunes lookup API, store in ref, and re-enrich
          if (missingIds.length > 0) {
            try {
              await Promise.all(missingIds.map(async (tid) => {
                try {
                  const itResp = await fetch(`https://itunes.apple.com/lookup?id=${tid}`);
                  if (!itResp.ok) return;
                  const itData = await itResp.json();
                  const item = (itData.results && itData.results[0]) || null;
                  if (item) {
                    itunesMetaRef.current[-tid] = {
                      trackName: item.trackName,
                      artistName: item.artistName,
                      artworkUrl100: item.artworkUrl100,
                      previewUrl: item.previewUrl,
                    };
                  }
                } catch (err) {
                  /* ignore single lookup failures */
                }
              }));
            } catch (err) {
              /* ignore overall lookup failures */
            }
            const reEnriched = enrichRecommendations(recs);
            setRecommendations(reEnriched);
          } else {
            setRecommendations(enriched);
          }
        }
      } catch (err) {
        console.error('MIDI recs fetch failed', err);
      } finally {
        setLoading(false);
      }
    }, POLL_MS); 

    return () => clearInterval(interval);
  }, []);

  // ── Play a recommendation ─────────────────────────────────────
  const handlePlay = (rec) => {
    // 1. Filter out all non-music products (like ZIP files or metadata items) 
    // from the main products list to ensure we only try to play actual audio.
    const musicProducts = products.filter(
      (p) => p.albumTitle && p.fileUrl && !p.fileUrl.toLowerCase().includes('.zip'),
    );
    
    // 2. Build the playback queue from the current recommendations list.
    // Each recommendation is converted to a song-like object so the player
    // can cycle through the MIDI Explorer results (not the full catalog).
    const recsQueue = recommendations.map((r) => {
      const catalogIdx = musicProducts.findIndex((p) => String(p.id) === String(r.product_id));
      if (catalogIdx !== -1) return musicProducts[catalogIdx];
      const meta = itunesMetaRef.current[r.product_id];
      return {
            id: r.product_id,
            albumTitle: fixText(r.trackName) || fixText(meta?.trackName) || `Song ${r.product_id}`,
            artistName: meta?.artistName,
            albumCoverImageUrl: r.artworkUrl100 || meta?.artworkUrl100,
            fileUrl: r.previewUrl || meta?.previewUrl,
            previewUrl: r.previewUrl || meta?.previewUrl,
          };
    });

    // 3. Find the clicked song's position within the recommendations queue
    const queueIdx = recsQueue.findIndex((s) => String(s.id) === String(rec.product_id));
    const song = queueIdx !== -1 ? recsQueue[queueIdx] : recsQueue[0];
        
    // 4. Dispatch the selected song to the global Redux audio player.
    // The queue is the recommendations list so next/prev stays within MIDI Explorer results.
    dispatch(setActiveSong({ song, data: recsQueue, i: Math.max(queueIdx, 0) }));
    midiPlayerRef.current = true; // mark that the player was started from MIDI Explorer
    
    // 5. Instantly force the music player to start playing (toggles 'isPlaying' to true)
    dispatch(playPause(true));
  };

  // ── Keep player queue in sync with latest recommendations ────
  const { activeSong, isActive, currentSongs } = useSelector((state) => state.player);
  const midiPlayerRef = useRef(false); // tracks whether the player was started from MIDI Explorer
  useEffect(() => {
    if (!isActive || !recommendations.length) return;
    // Check if the player was originally started from MIDI Explorer
    // by seeing if the active song exists in either the old or new recommendations
    const activeId = String(activeSong?.id);
    const inCurrentRecs = recommendations.some((r) => String(r.product_id) === activeId);
    const wasFromMidi = midiPlayerRef.current;
    if (!inCurrentRecs && !wasFromMidi) return;

    const musicProducts = products.filter(
      (p) => p.albumTitle && p.fileUrl && !p.fileUrl.toLowerCase().includes('.zip'),
    );
    const recsQueue = recommendations.map((r) => {
      const catalogIdx = musicProducts.findIndex((p) => String(p.id) === String(r.product_id));
      if (catalogIdx !== -1) return musicProducts[catalogIdx];
      const meta = itunesMetaRef.current[r.product_id];
      return {
            id: r.product_id,
            albumTitle: fixText(r.trackName) || fixText(meta?.trackName) || `Song ${r.product_id}`,
            artistName: meta?.artistName,
            albumCoverImageUrl: r.artworkUrl100 || meta?.artworkUrl100,
            fileUrl: r.previewUrl || meta?.previewUrl,
            previewUrl: r.previewUrl || meta?.previewUrl,
          };
    });
    dispatch(updateQueue({ data: recsQueue, currentId: activeSong.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendations]);

  // Uses energy and valence features to create mood string 
  // and emoji from target features
  const { mood, emoji } = deriveMood(targetFeatures.energy, targetFeatures.valence);

  // ── Feature list sorted by mapped CCs (mapped first) ─────────
  const featureKeys = Object.keys(AUDIO_FEATURES);
  const mappedCCForFeature = (fk) => {
    for (const [cc, feat] of Object.entries(ccMap)) if (feat === fk) return cc;
    return null;
  };

  return (
    <div className="flex flex-col w-full pb-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-2">
            🎛️ MIDI Explorer
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Play your synth to discover music that matches your vibe — or use the sliders manually
          </p>
        </div>
        <button
          onClick={() => setShowMapping((v) => !v)}
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-gray-200 transition-colors"
        >
          {showMapping ? 'Hide Mapping' : '⚙ Configure Mapping'}
        </button>
      </div>

      {/* ── MIDI device selector ──────────────────────────────── */}
      <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 mb-6">
        {!midiSupported ? (
          <p className="text-yellow-400 text-sm">
            ⚠ Web MIDI is not supported in this browser. Use Chrome or Edge, or adjust the sliders below manually.
          </p>
        ) : devices.length === 0 ? (
          <div className="text-gray-400 text-sm space-y-3">
            <div className="flex items-center justify-between">
              <p>No MIDI devices detected.</p>
              <button
                onClick={retryAccess}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
              >
                🔄 Refresh Devices
              </button>
            </div>
            {midiError && <p className="text-red-400">{midiError}</p>}
            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer text-gray-400 hover:text-gray-300 transition-colors">
                Troubleshooting — device not showing?
              </summary>
              <ul className="mt-2 space-y-1.5 pl-4 list-disc">
                <li><strong>Check the USB cable</strong> — your synth needs a direct USB connection to the computer for MIDI data. Audio cables (instrument/TRS jacks) only carry sound, not MIDI.</li>
                <li><strong>USB hub issues</strong> — try connecting the synth directly to the computer, not through a hub.</li>
                <li><strong>Browser permissions</strong> — click the lock icon in the address bar → Site settings → allow MIDI devices.</li>
                <li><strong>OS detection</strong> — check if your OS recognises the synth:
                  <ul className="ml-4 mt-1 list-[circle] space-y-0.5">
                    <li>Windows: Device Manager → Sound, video and game controllers</li>
                    <li>macOS: Applications → Utilities → Audio MIDI Setup → Window → Show MIDI Studio</li>
                    <li>Linux: run <code className="bg-white/10 px-1 rounded">aconnect -l</code> in a terminal</li>
                  </ul>
                </li>
                <li><strong>Drivers</strong> — some synths need manufacturer USB drivers. Check Behringer's website for your model.</li>
                <li><strong>Try unplugging and re-plugging</strong> the USB cable, then click Refresh Devices above.</li>
              </ul>
            </details>
            <p className="text-gray-500 text-xs mt-2">You can still use the manual sliders below without a MIDI device.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-400 uppercase tracking-wider">Device:</span>
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() => selectDevice(d.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeDevice?.id === d.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {d.name}
                {d.manufacturer ? ` (${d.manufacturer})` : ''}
              </button>
            ))}
            {activeDevice && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Connected
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Audio input section ───────────────────────────────── */}
      {audioSupported && (
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-400 uppercase tracking-wider">🔊 Audio Input:</span>
            {!listening ? (
              <>
                <select
                  onChange={(e) => e.target.value && startListening(e.target.value)}
                  className="bg-white/10 text-gray-200 text-sm rounded-lg px-3 py-1.5 border border-white/10 focus:border-indigo-500 outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>Select audio input…</option>
                  {audioDevices.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => startListening()}
                  className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-medium transition-colors"
                >
                  🎙️ Listen (default mic)
                </button>
                <button
                  onClick={refreshAudioDevices}
                  className="px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-400 text-xs transition-colors"
                >
                  🔄
                </button>
              </>
            ) : (
              <>
                <span className="flex items-center gap-2 text-xs text-green-400">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  Listening to audio
                </span>
                {/* VU meter */}
                <div className="flex-1 max-w-[200px] h-3 bg-black/30 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-100"
                    style={{
                      width: `${Math.min(audioLevel * 400, 100)}%`,
                      background: audioLevel > 0.15 ? '#ef4444' : audioLevel > 0.05 ? '#facc15' : '#22c55e',
                    }}
                  />
                </div>
                {audioFeatures && (
                  <span className="text-[10px] text-gray-500 font-mono">
                    {Math.round(audioFeatures.dominantFreq)}Hz
                  </span>
                )}
                <button
                  onClick={stopListening}
                  className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 text-white text-xs font-medium transition-colors"
                >
                  ⏹ Stop
                </button>
              </>
            )}
          </div>
          {audioError && <p className="text-red-400 text-xs mt-2">{audioError}</p>}
          {!listening && (
            <p className="text-gray-500 text-xs mt-2">
              Route your synth/sampler audio through your interface → select it above to analyse the sound in real-time
            </p>
          )}
        </div>
      )}

      {/* ── Mapping panel (collapsible) ───────────────────────── */}
      <AnimatePresence>
        {showMapping && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-6"
          >
            <MidiMappingPanel ccMap={ccMap} onMapChange={setCcMap} lastCC={lastCC} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Knob ring + mood display ─────────────────────────── */}
      <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Target Profile</h3>
            {audioMode && listening && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 animate-pulse">
                🔊 Derived from live audio
              </span>
            )}
            {noteMode && !audioMode && activeDevice && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 animate-pulse">
                🎹 Derived from your playing
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{emoji}</span>
            <span className="text-sm font-semibold text-gray-200">{mood}</span>
          </div>
        </div>

        {/* Knobs — show visual knob + manual range slider underneath */}
        <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-8 gap-4">
          {featureKeys.map((fk) => {
            const meta = AUDIO_FEATURES[fk];
            const cc = mappedCCForFeature(fk);
            return (
              <div key={fk} className="flex flex-col items-center gap-1">
                <MidiKnob
                  value={targetFeatures[fk]}
                  onChange={(val) => handleManualChange(fk, val)}
                  label={meta.label}
                  color={meta.color}
                  cc={cc}
                  description={meta.description}
                />
                {/* Manual fallback slider */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(targetFeatures[fk] * 100)}
                  onChange={(e) => handleManualChange(fk, Number(e.target.value) / 100)}
                  className="w-16 h-1 accent-indigo-500 opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                  title={`${meta.label}: ${(targetFeatures[fk] * 100).toFixed(0)}%`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Last MIDI activity indicator ─────────────────────── */}
      {lastNote && (
        <div className="text-xs text-gray-500 mb-4 font-mono">
          Last note: {lastNote.note} vel={lastNote.velocity} {lastNote.type}
          {lastCC && ` | CC${lastCC.cc}=${lastCC.value}`}
          {noteHistory.length >= 3 && ` | ${noteHistory.length} notes tracked`}
        </div>
      )}

      {/* ── Raw MIDI monitor (for diagnosing connection issues) ── */}
      {activeDevice && (
        <details className="mb-4">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors">
            🔍 MIDI Monitor — {rawMessages.length > 0 ? `${rawMessages.length} messages` : 'waiting for input… try pressing a key or moving a knob'}
          </summary>
          <div className="mt-2 bg-black/30 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[11px] space-y-0.5">
            {rawMessages.length === 0 ? (
              <p className="text-yellow-400">No MIDI messages received yet. Try pressing a key or moving a knob on your synth.</p>
            ) : (
              rawMessages.map((m, i) => {
                const status = m.bytes[0];
                const msgType = status & 0xf0;
                const ch = (status & 0x0f) + 1;
                let label = 'Unknown';
                let color = 'text-gray-400';
                if (msgType === 0x90) { label = 'Note On'; color = 'text-green-400'; }
                else if (msgType === 0x80) { label = 'Note Off'; color = 'text-gray-500'; }
                else if (msgType === 0xb0) { label = `CC ${m.bytes[1]}`; color = 'text-cyan-400'; }
                else if (msgType === 0xe0) { label = 'Pitch Bend'; color = 'text-purple-400'; }
                else if (msgType === 0xd0) { label = 'Ch Pressure'; color = 'text-yellow-400'; }
                else if (msgType === 0xc0) { label = 'Program Change'; color = 'text-orange-400'; }
                else if (status === 0xf8) { label = 'Clock'; color = 'text-gray-600'; }
                else if (status === 0xfe) { label = 'Active Sensing'; color = 'text-gray-600'; }
                return (
                  <div key={i} className={color}>
                    <span className="text-gray-600 mr-2">{String(i + 1).padStart(2)}</span>
                    Ch{ch} {label} [{m.hex}] {m.bytes.length > 2 ? `val=${m.bytes[2]}` : ''}
                  </div>
                );
              })
            )}
          </div>
        </details>
      )}

      {/* ── Recommendations grid ─────────────────────────────── */}
      <div className="bg-white/5 backdrop-blur-sm rounded-xl p-5 border border-white/10 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Melody Finder</h3>
          {melodySeedMatch && (
            <span className="text-xs text-cyan-300">
              Melody match {((melodySeedMatch.melody_match || 0) * 100).toFixed(0)}%
            </span>
          )}
        </div>

        {melodyStatus === 'searching' && (
          <p className="text-xs text-gray-400">Searching for contour matches...</p>
        )}

        {melodyStatus === 'waiting-notes' && (
          <p className="text-xs text-gray-400">Play at least 4 notes in the last 10 seconds to search melodies.</p>
        )}

        {melodyStatus === 'no-match' && (
          <p className="text-xs text-gray-400">No strong melody hit yet. Try a clearer motif or repeat your phrase once.</p>
        )}

        {melodyStatus === 'ready' && melodySeedMatch && (
          <div className="space-y-4">
            <div
              onClick={() => handlePlay(melodySeedMatch)}
              className="group bg-cyan-500/10 hover:bg-cyan-500/20 rounded-lg p-3 cursor-pointer border border-cyan-400/30 transition-all"
            >
              <div className="flex items-center gap-3">
                {(() => {
                  const meta = itunesMetaRef.current[melodySeedMatch.product_id];
                  const artUrl = melodySeedMatch.artworkUrl100 || meta?.artworkUrl100 || null;
                  const isLibrary = melodySeedMatch.product_id > 0 && melodySeedMatch.product_id < 1000000;
                  const isBadUrl = artUrl && /\.(mp4|m4v|mov|webm|wmv|wav|mp3|flac|ogg)(\?|$)/i.test(artUrl);
                  if (isLibrary || !artUrl || isBadUrl) {
                    return (
                      <div className="w-12 h-12 rounded-lg bg-linear-to-br from-cyan-600 via-purple-600 to-pink-600 flex items-center justify-center shrink-0">
                        <svg className="w-7 h-7 text-blue-900" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                      </div>
                    );
                  }
                  return <img src={artUrl.replace('100x100', '200x200')} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />;
                })()}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">
                    {fixText(melodySeedMatch.trackName) || fixText(itunesMetaRef.current[melodySeedMatch.product_id]?.trackName) || `Song #${melodySeedMatch.product_id}`}
                  </p>
                  <p className="text-xs text-cyan-200/80 truncate">Closest melody contour to your played phrase</p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-300 mb-2 uppercase tracking-wide">Similar Notes, Different Order</p>
              {melodyAlternatives.length === 0 ? (
                <p className="text-xs text-gray-400">No reordered alternatives yet. Keep playing or adjust your phrase timing.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {melodyAlternatives.map((rec) => (
                    <button
                      key={`melody-alt-${rec.product_id}`}
                      type="button"
                      onClick={() => handlePlay(rec)}
                      className="text-left rounded-lg border border-indigo-400/20 bg-indigo-500/10 hover:bg-indigo-500/20 px-3 py-2 transition-colors"
                    >
                      <p className="text-sm text-white truncate">{fixText(rec.trackName) || fixText(itunesMetaRef.current[rec.product_id]?.trackName) || `Song #${rec.product_id}`}</p>
                      <p className="text-[11px] text-indigo-200/80 truncate">
                        Reordered-note similarity {((rec.different_order_score || 0) * 100).toFixed(0)}%
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider">Matching Songs</h3>
        {loading && <Loader title="" />}
        {!loading && recommendations.length > 0 && (
          <span className="text-xs text-gray-500">{recommendations.length} results</span>
        )}
      </div>

      {recommendations.length === 0 && !loading ? (
        <div className="bg-white/5 rounded-xl p-8 text-center text-gray-400 border border-white/10">
          <p className="text-lg mb-2">🎹 Play your synth, enable audio listening, or adjust the sliders</p>
          <p className="text-sm">Notes you play, sound you make, or slider positions will find matching songs in real-time</p>
        </div>
      ) : (
        /* AnimatePresence to make the updates look smooth instead of violently flashing */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {recommendations.map((rec, i) => (
              <motion.div
                key={rec.product_id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                onClick={() => handlePlay(rec)}
                className="group bg-white/5 hover:bg-white/10 rounded-xl p-4 cursor-pointer border border-white/10 hover:border-indigo-500/50 transition-all"
              >
                {/* Artwork + title */}
                <div className="flex items-center gap-3 mb-3">
                  {(() => {
                    const meta = itunesMetaRef.current[rec.product_id];
                    const artUrl = rec.artworkUrl100 || meta?.artworkUrl100 || null;
                    const isLibrary = rec.product_id > 0 && rec.product_id < 1000000;
                    const isBadUrl = artUrl && /\.(mp4|m4v|mov|webm|wmv|wav|mp3|flac|ogg)(\?|$)/i.test(artUrl);
                    if (isLibrary || !artUrl || isBadUrl) {
                      return (
                        <div className="w-12 h-12 rounded-lg bg-linear-to-br from-cyan-600 via-purple-600 to-pink-600 flex items-center justify-center shrink-0">
                          <svg className="w-7 h-7 text-blue-900" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                        </div>
                      );
                    }
                    return <img src={artUrl.replace('100x100', '200x200')} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" onError={(e) => { e.target.style.display='none'; e.target.parentElement.innerHTML='<div class="w-12 h-12 rounded-lg bg-linear-to-br from-cyan-600 via-purple-600 to-pink-600 flex items-center justify-center"><svg class="w-7 h-7 text-blue-900" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg></div>'; }} />;
                  })()}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {fixText(rec.trackName) || fixText(itunesMetaRef.current[rec.product_id]?.trackName) || `Song #${rec.product_id}`}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{rec.reason}</p>
                  </div>
                  <span className="text-xs font-mono text-indigo-400 shrink-0">
                    {(rec.similarity_score * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Mini feature bars */}
                <div className="space-y-1">
                  {[
                    { key: 'energy', label: 'Energy', match: rec.energy_match },
                    { key: 'valence', label: 'Mood', match: rec.mood_match },
                    { key: 'tempo', label: 'Tempo', match: rec.tempo_match },
                    { key: 'danceability', label: 'Dance', match: rec.danceability_match },
                  ].map(({ key, label, match }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-10">{label}</span>
                      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${(match || 0) * 100}%`,
                            background: AUDIO_FEATURES[key]?.color || '#6366f1',
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-gray-500 w-8 text-right">
                        {((match || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Audio Feature Diagnostic Badge Array - Quantifies individual metric congruences */}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {rec.genre && rec.genre !== 'Unknown' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">{rec.genre}</span>
                  )}

                  {rec.mood && rec.mood !== 'Unknown' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      rec.mood.toLowerCase() === 'energetic' ? 'bg-purple-500/20 text-purple-300' :
                      rec.mood.toLowerCase() === 'happy' ? 'bg-green-500/20 text-green-300' :
                      rec.mood.toLowerCase() === 'sad' ? 'bg-red-500/20 text-red-300' :
                      'bg-blue-500/20 text-blue-300'
                    }`}>{rec.mood}</span>
                  )}
                </div>  
                
                <div className="flex gap-1.5 mt-2 flex-row">
                  {/* Specific Tempo metric readout bound to dynamic green/yellow/red styling */}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    rec.tempo_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                    rec.tempo_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                    'bg-red-500/30 text-red-300'
                  }`}>
                    Tempo:{Math.round(rec.tempo_match * 100)}%
                  </span>  

                  {/* Specific Energy metric readout bound to dynamic styling */}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    rec.energy_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                    rec.energy_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                    'bg-red-500/30 text-red-300'
                  }`}>
                    Energy:{Math.round(rec.energy_match * 100)}%
                  </span>   

                  {/* Specific Valence (Mood) metric readout bound to dynamic styling */}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    rec.mood_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                    rec.mood_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                    'bg-red-500/30 text-red-300'
                  }`}>
                    Mood:{Math.round(rec.mood_match * 100)}%
                  </span>   

                  {/* Specific Danceability metric readout bound to dynamic styling */}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    rec.danceability_match >= 0.7 ? 'bg-green-500/30 text-green-300' : 
                    rec.danceability_match >= 0.5 ? 'bg-yellow-500/30 text-yellow-300' : 
                    'bg-red-500/30 text-red-300'
                  }`}>
                    Dance:{Math.round(rec.danceability_match * 100)}%
                  </span>
                </div>   
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
