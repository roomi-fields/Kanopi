/**
 * BPscript Ratio Normalizer
 *
 * Converts the 3 ratio formats used in temperaments.json, tunings.json, and octaves.json
 * into float values for frequency calculation.
 *
 * Formats:
 *   Fraction : "9/8"    → 1.125
 *   Cents    : "100c"   → 2^(100/1200) ≈ 1.05946
 *   Decimal  : 1.05946  → 1.05946 (passthrough)
 *   Integer  : 1        → 1.0
 */

/**
 * Normalize a single ratio value to a float.
 * @param {string|number} ratio - "9/8", "100c", "-100c", 1.05946, 1
 * @returns {number} float ratio (multiplicative factor)
 */
export function normalizeRatio(ratio) {
  if (typeof ratio === 'number') return ratio;
  if (typeof ratio !== 'string') return NaN;

  const s = ratio.trim();

  // Cents: "100c", "-50c", "22.642c"
  if (s.endsWith('c')) {
    const cents = parseFloat(s.slice(0, -1));
    if (isNaN(cents)) return NaN;
    return Math.pow(2, cents / 1200);
  }

  // Fraction: "9/8", "256/243"
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length !== 2) return NaN;
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    if (isNaN(num) || isNaN(den) || den === 0) return NaN;
    return num / den;
  }

  // Decimal or integer string: "1.05946", "1"
  const val = parseFloat(s);
  return isNaN(val) ? NaN : val;
}

/**
 * Normalize an array of ratios.
 * @param {(string|number)[]} ratios
 * @returns {number[]} array of float ratios
 */
export function normalizeRatios(ratios) {
  if (!Array.isArray(ratios)) return [];
  return ratios.map(normalizeRatio);
}

/**
 * Normalize all ratios in a temperament object (mutates in place, returns same ref).
 * @param {Object} temperament - { period_ratio, divisions, ratios: [...] }
 * @returns {Object} same object with ratios normalized to floats
 */
export function normalizeTemperament(temperament) {
  if (temperament?.ratios) {
    temperament.ratios = normalizeRatios(temperament.ratios);
  }
  return temperament;
}

/**
 * Normalize all alteration ratios in a tuning object (mutates in place).
 * @param {Object} tuning - { temperament, degrees, alterations: { "#": "25/24", ... }, ... }
 * @returns {Object} same object with alteration values normalized to floats
 */
export function normalizeTuning(tuning) {
  if (tuning?.alterations) {
    for (const key of Object.keys(tuning.alterations)) {
      tuning.alterations[key] = normalizeRatio(tuning.alterations[key]);
    }
  }
  return tuning;
}
