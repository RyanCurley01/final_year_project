// src/components/MidiMappingPanel.jsx
// Lets the user re-assign which MIDI CC controls which audio feature.
// Also has a "MIDI Learn" button — move a knob to auto-assign it.
import { useState, useEffect, useRef } from 'react';
import { AUDIO_FEATURES } from '../config/midiMappings';

/**
 * Props:
 *  - ccMap: object { ccNumber: featureKey }
 *  - onMapChange: (newMap) => void
 *  - lastCC: { channel, cc, value } from useMidi
 */
export default function MidiMappingPanel({ ccMap, onMapChange, lastCC }) {

  // Stores the ID of the feature currently waiting for a physical knob twist.
  const [learning, setLearning] = useState(null); 
  const learningRef = useRef(null);
  learningRef.current = learning;

  // When a CC arrives and we're in learn mode, assign it
  useEffect(() => {
    if (!lastCC || !learningRef.current) return;

    // Gets the target featureKey
    const featureKey = learningRef.current;

    // Gets the physical knob ID
    const ccNum = String(lastCC.cc);

    // Remove any previous mapping for this CC
    const newMap = { ...ccMap };
    for (const [k, v] of Object.entries(newMap)) {
      if (v === featureKey) delete newMap[k];
    }

    // Assigns the new knob ID to the feature
    newMap[ccNum] = featureKey;

    onMapChange(newMap);
    setLearning(null);
  }, [lastCC]);

  const featureKeys = Object.keys(AUDIO_FEATURES);

  // Find which CC is mapped to a feature
  const ccForFeature = (fk) => {
    for (const [cc, feat] of Object.entries(ccMap)) {
      if (feat === fk) return cc;
    }
    return null;
  };

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
      <h3 className="text-sm font-bold text-white/80 uppercase tracking-wider mb-3">
        MIDI Mapping
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Click <strong>Learn</strong> on a feature, then move a knob/fader on your controller to assign it.
      </p>

      <div className="space-y-2">
        {featureKeys.map((fk) => {
          const meta = AUDIO_FEATURES[fk];
          const assignedCC = ccForFeature(fk);
          const isLearning = learning === fk;

          return (
            <div key={fk} className="flex items-center gap-3">
              {/* Feature color dot */}
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.color }} />

              {/* Feature label */}
              <span className="text-xs text-gray-200 w-28 truncate">{meta.label}</span>

              {/* Current CC assignment */}
              <span className="text-xs text-gray-400 font-mono w-14 text-center">
                {assignedCC !== null ? `CC ${assignedCC}` : '—'}
              </span>

              {/* Learn button */}
              <button
                onClick={() => setLearning(isLearning ? null : fk)}
                className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors ${
                  isLearning
                    ? 'bg-red-500/80 text-white animate-pulse'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                }`}
              >
                {isLearning ? 'Move knob…' : 'Learn'}
              </button>

              {/* Unmap */}
              {assignedCC !== null && (
                <button
                  onClick={() => {
                    const newMap = { ...ccMap };
                    delete newMap[assignedCC];
                    onMapChange(newMap);
                  }}
                  className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
                  title="Remove mapping"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
