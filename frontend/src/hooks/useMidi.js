// src/hooks/useMidi.js
// Web MIDI API hook — works with any sampler, synth, or MIDI controller over USB/BLE
import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for connecting to MIDI devices via the Web MIDI API.
 *
 * Returns:
 *  - midiSupported: boolean — browser supports Web MIDI
 *  - midiAccess: MIDIAccess object (or null)
 *  - devices: array of { id, name, manufacturer, state } for all inputs
 *  - activeDevice: the currently selected MIDIInput (or null)
 *  - selectDevice: (deviceId) => void — pick which input to listen on
 *  - lastCC: { channel, cc, value } — most recent Control Change message
 *  - lastNote: { channel, note, velocity, type } — most recent Note On/Off
 *  - ccValues: Map<string, number> — running state of every CC ("ch.cc" → 0-127)
 *  - error: string | null
 *  - retryAccess: () => void — manually re-request MIDI access
 */
export default function useMidi() {
  const [midiSupported] = useState(() => !!navigator.requestMIDIAccess);
  const [midiAccess, setMidiAccess] = useState(null);
  const [devices, setDevices] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState(null);
  const [lastCC, setLastCC] = useState(null);
  const [lastNote, setLastNote] = useState(null);
  const [ccValues, setCcValues] = useState(new Map());
  const [error, setError] = useState(null);
  const [rawMessages, setRawMessages] = useState([]); // last N raw MIDI messages for debugging
  const [noteHistory, setNoteHistory] = useState([]); // last N note-on events for analysis

  // Refs for stable callbacks (avoid stale closures in MIDI handlers)
  const midiAccessRef = useRef(null);
  const activeDeviceIdRef = useRef(null);
  activeDeviceIdRef.current = activeDeviceId;

  // ── Stable MIDI message handler (no deps — uses only setters) ──
  const handleMidiMessage = useCallback((event) => {
    if (!event.data || event.data.length < 2) return;

    // Log raw bytes for diagnostics (keep last 20)
    const bytes = Array.from(event.data);
    setRawMessages((prev) => [
      { bytes, hex: bytes.map(b => b.toString(16).padStart(2, '0')).join(' '), ts: Date.now() },
      ...prev.slice(0, 19),
    ]);

    if (event.data.length < 3) return;
    const [status, data1, data2] = event.data;
    const msgType = status & 0xf0;
    const channel = (status & 0x0f) + 1; // 1-16

    if (msgType === 0xb0) {
      // Control Change
      setLastCC({ channel, cc: data1, value: data2, _ts: Date.now() });
      setCcValues((prev) => {
        const next = new Map(prev);
        next.set(`${channel}.${data1}`, data2);
        return next;
      });
    } else if (msgType === 0x90 && data2 > 0) {
      setLastNote({ channel, note: data1, velocity: data2, type: 'on' });
      // Track note-on events for playing analysis (keep last 50)
      setNoteHistory((prev) => [
        ...prev.slice(-49),
        { note: data1, velocity: data2, ts: Date.now() },
      ]);
    } else if (msgType === 0x80 || (msgType === 0x90 && data2 === 0)) {
      setLastNote({ channel, note: data1, velocity: 0, type: 'off' });
    }
  }, []);

  // ── Build device list from MIDIAccess ────────────────────────
  const refreshDevices = useCallback((access) => {
    const inputs = [];
    for (const input of access.inputs.values()) {
      inputs.push({
        id: input.id,
        name: input.name || 'Unknown Device',
        manufacturer: input.manufacturer || '',
        state: input.state,
      });
    }
    setDevices(inputs);

    // If active device disconnected, clear selection
    if (activeDeviceIdRef.current) {
      const still = access.inputs.get(activeDeviceIdRef.current);
      if (!still || still.state === 'disconnected') {
        setActiveDeviceId(null);
      }
    }

    // Auto-select if exactly one device and nothing selected yet
    if (inputs.length === 1 && !activeDeviceIdRef.current) {
      const onlyInput = access.inputs.get(inputs[0].id);
      if (onlyInput) {
        onlyInput.onmidimessage = handleMidiMessage;
        setActiveDeviceId(inputs[0].id);
      }
    }
  }, [handleMidiMessage]);

  // ── Request MIDI access ───────────────────────────────────────
  const requestAccess = useCallback(() => {
    if (!midiSupported) return;

    navigator.requestMIDIAccess({ sysex: false })
      .then((access) => {
        midiAccessRef.current = access;
        setMidiAccess(access);
        setError(null);
        refreshDevices(access);

        // React to device connect / disconnect
        access.onstatechange = () => refreshDevices(access);
      })
      .catch((err) => {
        setError(`MIDI access denied: ${err.message}`);
      });
  }, [midiSupported, refreshDevices]);

  // Request on mount
  useEffect(() => {
    requestAccess();
  }, [requestAccess]);

  // ── Select a device to listen on ─────────────────────────────
  const selectDevice = useCallback((deviceId) => {
    const access = midiAccessRef.current;
    if (!access) return;

    // Detach previous listener
    if (activeDeviceIdRef.current) {
      const prev = access.inputs.get(activeDeviceIdRef.current);
      if (prev) prev.onmidimessage = null;
    }

    if (!deviceId) {
      setActiveDeviceId(null);
      return;
    }

    const input = access.inputs.get(deviceId);
    if (!input) {
      setError(`Device ${deviceId} not found`);
      return;
    }

    input.onmidimessage = handleMidiMessage;
    setActiveDeviceId(deviceId);
    setError(null);
  }, [handleMidiMessage]);

  // Resolve activeDevice object from ID for consumers
  const activeDevice = midiAccess && activeDeviceId
    ? midiAccess.inputs.get(activeDeviceId) || null
    : null;

  return {
    midiSupported,
    midiAccess,
    devices,
    activeDevice,
    selectDevice,
    lastCC,
    lastNote,
    ccValues,
    error,
    retryAccess: requestAccess,
    rawMessages,
    noteHistory,
  };
}
