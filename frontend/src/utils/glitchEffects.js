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

  // Blur — simulates motion blur / defocus during glitch
  const blur = 1 + Math.random() * 2; // 1-3px

  return `hue-rotate(${hueRotate}deg) saturate(${saturate}%) brightness(${brightness}%) contrast(${contrast}%) blur(${blur}px)`;
}

/**
 * Generate a blur-only CSS filter for canvas elements that already have
 * per-pixel distortion (e.g. sky segmentation glitchPixel).
 *
 * @returns {string} CSS filter value containing only blur
 */
export function glitchBlurFilter() {
  const blur = 1 + Math.random() * 2; // 1-3px
  return `blur(${blur}px)`;
}

/**
 * Generate a posterization/low-bit-depth CSS filter that makes the image
 * look pixelated and crunchy — like a low-resolution retro display.
 * Extreme contrast collapses smooth gradients into hard colour bands,
 * and crushed saturation gives a reduced-palette / 8-bit feel.
 *
 * @returns {{ filter: string, imageRendering: string }}
 */
export function glitchDistortFilter() {
  // Extreme contrast → posterization (smooth gradients collapse into flat bands)
  const contrast = 300 + Math.random() * 200; // 300-500%
  // Crushed saturation → reduced colour palette (retro / low-bit feel)
  const saturate = 15 + Math.random() * 35;   // 15-50%
  // Slight brightness jitter
  const brightness = 80 + Math.random() * 40; // 80-120%

  return {
    filter: `contrast(${contrast}%) saturate(${saturate}%) brightness(${brightness}%)`,
    imageRendering: 'pixelated',
  };
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
      imageRendering: 'auto',
      transition: 'transform 0.1s ease-out, filter 0.1s ease-out',
    };
  }

  // Randomly pick a glitch effect — individual or all combined
  const roll = Math.random();
  if (roll < 0.25) {
    // Full CSS glitch only (hue-rotate + saturate + brightness + contrast + blur)
    return {
      transform: glitchShakeTransform(),
      filter: glitchCSSFilter(),
      imageRendering: 'auto',
      transition: 'none',
    };
  } else if (roll < 0.45) {
    // Pixelated / low-bit distortion only
    const distort = glitchDistortFilter();
    return {
      transform: glitchShakeTransform(),
      filter: distort.filter,
      imageRendering: distort.imageRendering,
      transition: 'none',
    };
  } else if (roll < 0.6) {
    // Blur only
    return {
      transform: glitchShakeTransform(),
      filter: glitchBlurFilter(),
      imageRendering: 'auto',
      transition: 'none',
    };
  } else {
    // Ensemble — all effects layered together
    const distort = glitchDistortFilter();
    const blur = 1 + Math.random() * 2;
    const hueRotate = 90 + Math.random() * 60;
    const saturate = 15 + Math.random() * 35;
    const brightness = 80 + Math.random() * 40;
    const contrast = 300 + Math.random() * 200;
    return {
      transform: glitchShakeTransform(),
      filter: `hue-rotate(${hueRotate}deg) saturate(${saturate}%) brightness(${brightness}%) contrast(${contrast}%) blur(${blur}px)`,
      imageRendering: distort.imageRendering,
      transition: 'none',
    };
  }
}
