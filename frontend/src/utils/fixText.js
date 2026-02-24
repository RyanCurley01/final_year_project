/**
 * Fix mojibake and curly quote characters that appear when UTF-8 text
 * is decoded as Latin-1 by the Java backend (missing JDBC charset config).
 *
 * Common patterns:
 *   â€™  →  ' (right single quote decoded as Latin-1)
 *   â€œ  →  " (left double quote)
 *   â€   →  " (right double quote)
 *   â€"  →  — (em dash)
 *   â€"  →  – (en dash)
 *
 * Also normalises Unicode curly quotes to plain ASCII equivalents.
 */

export const fixText = (text) => {
  if (typeof text !== 'string') return text;
  return text
    // Mojibake sequences (UTF-8 bytes misread as Latin-1)
    .replace(/\u00e2\u20ac\u2122/g, "'")   // â€™ → '
    .replace(/\u00e2\u20ac\u0153/g, '"')   // â€œ → "
    .replace(/\u00e2\u20ac\u009d/g, '"')   // â€\u009d → "
    .replace(/\u00e2\u20ac\u201c/g, '—')   // â€" → —
    .replace(/\u00e2\u20ac\u201d/g, '–')   // â€" → –
    // Unicode curly quotes → ASCII
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014/g, '—')
    .replace(/\u2013/g, '–');
};

/**
 * Recursively walk a JSON value and fix all string leaves.
 * Useful for cleaning an entire API response.
 */
export const fixTextDeep = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return fixText(value);
  if (Array.isArray(value)) return value.map(fixTextDeep);
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = fixTextDeep(value[key]);
    }
    return out;
  }
  return value;
};

export default fixText;
