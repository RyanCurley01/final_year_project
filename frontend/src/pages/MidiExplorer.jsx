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
import { setActiveSong, playPause } from '../redux/features/playerSlice';
import { productService } from '../redux/services';
import { Loader } from '../components';
import { fixText } from '../utils/fixText';

// ── Helpers ─────────────────────────────────────────────────────────
const POLL_MS = 400; // recommendation refresh rate when knobs move
const ARTISTS = ['Aphex Twin', 'Boards of Canada', 'Squarepusher'];

export default function MidiExplorer() {
  const dispatch = useDispatch();
  const { activeSong, isPlaying } = useSelector((s) => s.player);

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
  const [target, setTarget] = useState(() => {
    const t = {};
    for (const [k, v] of Object.entries(AUDIO_FEATURES)) t[k] = v.default;
    return t;
  });

  // Recommendations from backend
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [showMapping, setShowMapping] = useState(false);

  // Dirty flag — knobs moved, need to re-query
  const dirtyRef = useRef(false);
  const targetRef = useRef(target);
  targetRef.current = target;
  const allowedIdsRef = useRef(null); // [int] — only these product IDs can be recommended

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
                .forEach((t) => ids.push(-t.trackId)); // negative = DB convention
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
    setTarget(newTarget);
    dirtyRef.current = true;
  }, [lastCC, ccValues, ccMap]);

  // ── Update target from note analysis (playing-driven) ─────────
  const [noteMode, setNoteMode] = useState(false); // true = deriving features from playing
  useEffect(() => {
    if (audioMode) return; // audio analysis takes priority when active
    if (noteHistory.length < 3) return;
    // Only analyse notes from the last 10 seconds
    const cutoff = Date.now() - 10000;
    const recent = noteHistory.filter((n) => n.ts > cutoff);
    if (recent.length < 3) return;

    const derived = analyseNoteWindow(recent);
    if (!derived) return;

    setNoteMode(true);
    setTarget(derived);
    dirtyRef.current = true;
  }, [noteHistory, audioMode]);

  // ── Update target from live audio analysis ─────────────────────
  useEffect(() => {
    if (!audioFeatures || !listening) return;
    setAudioMode(true);
    setNoteMode(false);
    const { rms, dominantFreq, ...features } = audioFeatures;
    // Only update if there's meaningful audio (not silence)
    if (rms > 0.01) {
      setTarget(features);
      dirtyRef.current = true;
    }
  }, [audioFeatures, listening]);

  // Reset audio mode when stopped
  useEffect(() => {
    if (!listening) setAudioMode(false);
  }, [listening]);

  // Allow manual slider input (for users without hardware)
  const handleManualChange = useCallback((featureKey, val) => {
    setTarget((prev) => ({ ...prev, [featureKey]: Math.min(1, Math.max(0, val)) }));
    dirtyRef.current = true;
  }, []);

  // ── Poll backend when dirty ───────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;

      try {
        setLoading(true);
        const apiUrl = envConfig.getApiBaseUrl();
        const resp = await fetch(`${apiUrl}/api/audio/midi-recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_features: targetRef.current,
            limit: 12,
            allowed_ids: allowedIdsRef.current,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setRecommendations(data.recommendations || []);
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
    const musicProducts = products.filter(
      (p) => p.albumTitle && p.fileUrl && !p.fileUrl.toLowerCase().includes('.zip'),
    );
    const idx = musicProducts.findIndex((p) => String(p.id) === String(rec.product_id));
    const song = idx !== -1
      ? musicProducts[idx]
      : {
          id: rec.product_id,
          albumTitle: fixText(rec.trackName) || `Song ${rec.product_id}`,
          albumCoverImageUrl: rec.artworkUrl100,
          fileUrl: rec.previewUrl,
          previewUrl: rec.previewUrl,
        };
    dispatch(setActiveSong({ song, data: musicProducts.length ? musicProducts : [song], i: Math.max(idx, 0) }));
    dispatch(playPause(true));
  };

  // ── Mood derived from target ──────────────────────────────────
  const { mood, emoji } = deriveMood(target.energy, target.valence);

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
                  value={target[fk]}
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
                  value={Math.round(target[fk] * 100)}
                  onChange={(e) => handleManualChange(fk, Number(e.target.value) / 100)}
                  className="w-16 h-1 accent-indigo-500 opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                  title={`${meta.label}: ${(target[fk] * 100).toFixed(0)}%`}
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
                  {rec.artworkUrl100 && !rec.artworkUrl100.toLowerCase().includes('.mp4') ? (
                    <img src={rec.artworkUrl100} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-linear-to-br from-indigo-600 to-purple-700 flex items-center justify-center text-white text-lg shrink-0">
                      🎵
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {fixText(rec.trackName) || `Song #${rec.product_id}`}
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

                {/* Genre / mood badges */}
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {rec.genre && rec.genre !== 'Unknown' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">{rec.genre}</span>
                  )}
                  {rec.mood && rec.mood !== 'Unknown' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">{rec.mood}</span>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
