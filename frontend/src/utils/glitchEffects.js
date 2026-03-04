/**
 * Shared Glitch Effects Utility
 * 
 * Provides the same glitch visual effects used by AudioReactiveVideo's sky segmentation,
 * adapted for both canvas-based and CSS-based rendering.
 * 
 * Used by:
 * - AudioReactiveVideo (canvas transform + sky pixel distortion)
 * - OnsetImageCard (CSS filter-based glitch on AI images)
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Duration of a single glitch burst (ms) — same as AudioReactiveVideo */
export const GLITCH_DURATION_MS = 100;

// ─── Canvas-level glitch (used by skySegmentation.processFrame) ──────────────

/**
 * Apply glitch distortion to a sky pixel's RGB values.
 * Extracted from skySegmentation.processFrame's applyGlitch branch so both
 * components share the exact same per-pixel logic.
 *
 * @param {number} r - Original red channel (0-255)
 * @param {number} g - Original green channel (0-255)
 * @param {number} b - Original blue channel (0-255)
 * @param {number[]} color - Target sky color [r, g, b]
 * @returns {{ r: number, g: number, b: number, blendFactor: number }}
 */
export function glitchPixel(r, g, b, color) {
  const blendFactor = 0.85; // Stronger blend during glitch

  // Hue rotation effect — shift/swap RGB channels
  const hueShift = Math.random() * 0.3 + 0.7;
  let finalR = Math.min(255, color[2] * hueShift + 50); // Swap B→R and shift
  let finalG = Math.min(255, color[0] * hueShift);       // Swap R→G
  let finalB = Math.min(255, color[1] * hueShift + 80);  // Swap G→B and shift

  // Add noise/grain
  const noise = (Math.random() - 0.5) * 40;
  finalR = Math.max(0, Math.min(255, finalR + noise));
  finalG = Math.max(0, Math.min(255, finalG + noise));
  finalB = Math.max(0, Math.min(255, finalB + noise));

  return { r: finalR, g: finalG, b: finalB, blendFactor };
}

// ─── CSS-level glitch (used by both AudioReactiveVideo and OnsetImageCard) ───

/**
 * Generate a random screen-shake translate transform.
 * Matches AudioReactiveVideo's `translate(±2px, ±2px)`.
 *
 * @returns {string} CSS transform value
 */
export function glitchShakeTransform() {
  const dx = Math.random() * 4 - 2; // -2 to +2 px
  const dy = Math.random() * 4 - 2;
  return `translate(${dx}px, ${dy}px)`;
}

/**
 * Build a CSS filter string that replicates the canvas-level glitch visually:
 * - hue-rotate:   mirrors the RGB channel swap (hueShift factor ≈ 0.7-1.0)
 * - saturate:     mirrors the stronger blend (blendFactor 0.85)
 * - brightness:   mirrors the +50/+80 channel shifts
 * - contrast:     mirrors the per-pixel noise/grain (±40 range)
 *
 * Each call produces slightly different random values, just like the per-pixel
 * approach in skySegmentation.
 *
 * @returns {string} CSS filter value
 */
export function glitchCSSFilter() {
  // Hue rotation — the canvas swaps channels, CSS equivalent is a hue-rotate
  // The swap pattern (B→R, R→G, G→B) is roughly a 120° hue rotation ± jitter
  const hueRotate = 90 + Math.random() * 60; // 90-150°

  // Saturate — the 0.85 blend factor intensifies colours
  const saturate = 150 + Math.random() * 100; // 150-250%

  // Brightness — the +50/+80 additive shifts brighten the image
  const brightness = 110 + Math.random() * 30; // 110-140%

  // Contrast — per-pixel noise is perceptually similar to a contrast spike
  const contrast = 120 + Math.random() * 40; // 120-160%

  return `hue-rotate(${hueRotate}deg) saturate(${saturate}%) brightness(${brightness}%) contrast(${contrast}%)`;
}

/**
 * Build inline style object for a glitching element (img or canvas).
 * Combines shake transform + CSS filter + hard transition.
 *
 * @param {boolean} isGlitching - Whether glitch is currently active
 * @returns {Object} Style properties to spread onto the element
 */
export function glitchStyle(isGlitching) {
  if (!isGlitching) {
    return {
      transform: 'none',
      filter: 'none',
      transition: 'transform 0.1s ease-out, filter 0.1s ease-out',
    };
  }

  return {
    transform: glitchShakeTransform(),
    filter: glitchCSSFilter(),
    transition: 'none', // Instantaneous snap — matches AudioReactiveVideo
  };
}
