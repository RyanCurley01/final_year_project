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
  // to connect the browser to the physical MIDI hardware like a piano keyboard or knob controller
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
    // Checks for valid MIDI messages which is typically an array of 2 or 3 bytes 
    // (numbers between 0 and 255).
    if (!event.data || event.data.length < 2) return;

    // The Web MIDI API returns the data as a Uint8Array 
    // (a typed array of raw binary bytes). 
    // This line converts it into a standard, easier-to-manipulate JavaScript Array
    const bytes = Array.from(event.data);

    setRawMessages((prev) => [
      { bytes, hex: bytes.map(b => b.toString(16).padStart(2, '0')).join(' '), ts: Date.now() },
      ...prev.slice(0, 19),
    ]);

    if (event.data.length < 3) return;
    const [status, data1, data2] = event.data;
    const msgType = status & 0xf0;
    const channel = (status & 0x0f) + 1; // 1-16

    // Checks if the message type is 0xb0 (176 in decimal). This is the universal MIDI standard code for a "Control Change" (CC). 
    // This happens when the user twists a physical knob or moves a slider on their device.
    if (msgType === 0xb0) {
      
      // Updates the lastCC state to notify the rest of the React app that a knob just moved.
      // cc: data1 tells us which knob was moved (e.g., Knob #74).
      // value: data2 tells us the new dial position (from 0 to 127
      setLastCC({ channel, cc: data1, value: data2, _ts: Date.now() });

      // Updates an overarching Map state that remembers the current position of every single knob on the device.
      // The key is a string combining the channel and knob number (e.g., "1.74"), and the value is the knob's position (data2).
      setCcValues((prev) => {
        const next = new Map(prev);
        next.set(`${channel}.${data1}`, data2);
        return next;
      });
    } else if (msgType === 0x90 && data2 > 0) {

      // Updates the lastNote state to notify the app that a key was pressed.
      // note: data1: the pitch of the key (e.g., 60 is Middle C).
      // velocity: data2: how loudly it was played (0 to 127).
      setLastNote({ channel, note: data1, velocity: data2, type: 'on' });
      
      // This is the exact history array used by analyseNoteWindow() 
      // to calculate the Energy, Tempo, and Happiness sliders.
      // .slice(-49) keeps only the most recent 49 notes, and then sticks the new 
      // one at the end, maintaining a strict 50-note rolling window to ensure 
      // the browser doesn't run out of memory during a long jam session.
      setNoteHistory((prev) => [
        ...prev.slice(-49),
        { note: data1, velocity: data2, ts: Date.now() },
      ]);

    } else if (msgType === 0x80 || (msgType === 0x90 && data2 === 0)) {

      // Notifies the app that the key (data1) was let go, updating the type to 'off'. 
      // This tells the visualizer that the piano key has bounced back up.
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
