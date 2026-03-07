// src/components/MidiKnob.jsx
// Interactive circular knob — click & drag to change value
import { useMemo, useRef, useCallback } from 'react';

const KNOB_RADIUS = 36;
const STROKE = 5;
const RANGE_DEG = 270; // sweep from -135° to +135°

/**
 * Renders a circular arc knob with a label and numeric readout.
 * Click and drag vertically or angularly to change the value.
 * Props:
 *  - value: 0-1 (feature value)
 *  - onChange: (newValue: number) => void
 *  - label: string
 *  - color: CSS color
 *  - cc: CC number string (shown in small text)
 *  - description: tooltip text
 */
export default function MidiKnob({ value = 0, onChange, label, color = '#f97316', cc, description }) {
  const pct = Math.max(0, Math.min(1, value));
  const dragging = useRef(false);
  const lastY = useRef(0);

  // SVG arc math
  const size = (KNOB_RADIUS + STROKE) * 2;
  const cx = size / 2;
  const cy = size / 2;

  const startAngle = -135;
  const endAngle = startAngle + RANGE_DEG * pct;

  const arc = useMemo(() => describeArc(cx, cy, KNOB_RADIUS, startAngle, endAngle), [cx, cy, pct]);
  const bgArc = useMemo(() => describeArc(cx, cy, KNOB_RADIUS, -135, 135), [cx, cy]);

  // Indicator dot position
  const dotAngle = endAngle * (Math.PI / 180);
  const dotX = cx + (KNOB_RADIUS - 10) * Math.cos(dotAngle);
  const dotY = cy + (KNOB_RADIUS - 10) * Math.sin(dotAngle);

  // Drag handling — drag up to increase, down to decrease
  const handlePointerDown = useCallback((e) => {
    if (!onChange) return;
    e.preventDefault();
    dragging.current = true;
    lastY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [onChange]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging.current || !onChange) return;
    const dy = lastY.current - e.clientY; // up = positive
    lastY.current = e.clientY;
    const sensitivity = 0.005;
    const newVal = Math.min(1, Math.max(0, value + dy * sensitivity));
    onChange(newVal);
  }, [onChange, value]);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div className="flex flex-col items-center gap-1 select-none" title={description}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ cursor: onChange ? 'grab' : 'default', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Background track */}
        <path d={bgArc} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={STROKE} strokeLinecap="round" />
        {/* Invisible wider hit area for easier grabbing */}
        <path d={bgArc} fill="none" stroke="transparent" strokeWidth={STROKE + 16} strokeLinecap="round" />
        {/* Value arc */}
        {pct > 0.005 && (
          <path d={arc} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${color}80)` }} />
        )}
        {/* Center value */}
        <text x={cx} y={cy + 2} textAnchor="middle" dominantBaseline="middle"
          fill="white" fontSize="13" fontWeight="600" fontFamily="monospace"
          style={{ pointerEvents: 'none' }}>
          {(pct * 100).toFixed(0)}
        </text>
        {/* Indicator dot */}
        <circle cx={dotX} cy={dotY} r={3} fill={color} style={{ pointerEvents: 'none' }} />
      </svg>
      <span className="text-xs font-semibold tracking-wide" style={{ color }}>{label}</span>
      {cc !== undefined && (
        <span className="text-[10px] text-gray-500">CC {cc}</span>
      )}
    </div>
  );
}

// ── SVG arc path helper ─────────────────────────────────────────────
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx, cy, r, startDeg, endDeg) {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}
