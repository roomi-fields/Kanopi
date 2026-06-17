/**
 * BPscript Scale Resolution — concrete ratios from the scales catalog.
 *
 * A scales.json entry encodes its intonation in exactly ONE of three ways
 * (PITCH.md «Comment une gamme encode son intonation»):
 *
 *   ratios:  [...]                  intrinsic intonation (jins, non-decomposable
 *                                   maqam, raga). The scale IS its tuning.
 *   compose: ["jins_a","jins_b"]    decomposable maqam — the engine COMPUTES the
 *   + junction: "3/2"               ratios by stacking the jins; NO ratios stored.
 *   degrees: [...]                  western mode — indices into a temperament grid;
 *                                   resolved through the degrees+temperament path.
 *
 * This module returns the concrete (normalized float) ratio list for the first
 * two forms. For a `degrees` scale it returns null — the caller keeps the
 * existing degrees+temperament resolution path.
 *
 * compose+junction algorithm (AUTHORITATIVE — confirmed by BPScript):
 *   - `junction` is a single ratio OR an array (3+ jins). Each jins's START is
 *     EXPLICIT, not junction^i: start[0] = 1, start[i] = junction[i-1].
 *   - each note of jins i = its own ratio × start[i].
 *   - DEDUP BY COINCIDENCE: when laying jins i (i≥1), drop its FIRST note iff it
 *     coincides with the LAST note already laid (start[i] == last placed ratio,
 *     to epsilon). Arabic tetrachords end on 4/3 with junction 3/2 → no
 *     coincidence → keep (maqam_rast: 8 ratios). Turkish pentachords (cins) end
 *     on 3/2 with junction 3/2 → coincidence → dedup, else the fifth doubles on
 *     all 12 makams (makam_rast: 8 ratios). Multi-junction scales (saba) dedup
 *     wherever a junction coincides.
 * The result includes the octave (period) as its last element. An alphabet of N
 * notes takes the first N ratios; the (N+1)th is the period.
 */

import { normalizeRatio, normalizeRatios } from './ratios.js';

/**
 * Resolve a scale name to its concrete ratio list (normalized floats), or null
 * when the scale is `degrees`-based (signal: use the degrees+temperament path).
 *
 * @param {string} name - key in the scales catalog
 * @param {Object} scalesCatalog - parsed scales.json (`{ [name]: entry, ... }`)
 * @returns {number[]|null} concrete ratios, period (octave) last; null if `degrees`-based
 */
export function resolveScaleRatios(name, scalesCatalog) {
  const entry = scalesCatalog?.[name];
  if (!entry || typeof entry !== 'object') return null;

  // Intrinsic intonation — the scale carries its ratios directly.
  if (Array.isArray(entry.ratios)) {
    return normalizeRatios(entry.ratios);
  }

  // Decomposable maqam — compute by stacking the jins, no stored ratios.
  if (Array.isArray(entry.compose)) {
    return composeScaleRatios(entry, scalesCatalog);
  }

  // Western mode (degrees into a temperament grid) — not our path.
  return null;
}

const EPSILON = 1e-9;

/**
 * Compute a composed scale's ratios from its `compose` (ordered jins) and
 * `junction` (the explicit start ratio of each successive jins).
 *
 *   start[0] = 1, start[i] = junction[i-1] (junction normalized to an array).
 *   each note of jins i = its own ratio × start[i].
 *   dedup: drop jins i's first note iff start[i] equals the last placed ratio.
 *
 * `junction` is a single ratio (2 jins) or an array (3+ jins, one per gap).
 *
 * @param {Object} entry - scales entry with `compose` and `junction`
 * @param {Object} scalesCatalog - parsed scales.json (for recursion into jins)
 * @returns {number[]|null} concrete ratios (period last), or null if a jins is missing
 */
function composeScaleRatios(entry, scalesCatalog) {
  const junctions = Array.isArray(entry.junction)
    ? entry.junction.map(normalizeRatio)
    : entry.junction != null
      ? [normalizeRatio(entry.junction)]
      : [];

  const out = [];
  for (let i = 0; i < entry.compose.length; i++) {
    const jinsRatios = resolveScaleRatios(entry.compose[i], scalesCatalog);
    // A jins must resolve to its own ratios (intrinsic). Missing/unresolvable → bail.
    if (!jinsRatios || jinsRatios.length === 0) return null;

    // Explicit start ratio of this jins: 1 for the first, junction[i-1] after.
    const start = i === 0 ? 1 : (junctions[i - 1] ?? 1);

    // Dedup by coincidence: skip this jins's first note when it lands on the
    // last note already placed (shared junction note — e.g. Turkish pentachords).
    let k = 0;
    if (i > 0 && out.length > 0 && Math.abs(start - out[out.length - 1]) < EPSILON) {
      k = 1;
    }

    for (; k < jinsRatios.length; k++) {
      out.push(jinsRatios[k] * start);
    }
  }

  return out;
}
