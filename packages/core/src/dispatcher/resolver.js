/**
 * BPscript Resolver — 5-layer pitch resolution
 *
 * Chain: token → parse (octaves) → note + alteration (alphabet)
 *        → degree (tuning) → ratio (temperament) → frequency
 *
 * Two modes:
 *   Table:      temperament has fixed ratios[] → lookup
 *   Parametric: temperament has period + generator + mapping → compute
 *
 * One resolver per actor. Not a singleton.
 */

import { normalizeRatio, normalizeRatios } from './ratios.js';

export class Resolver {
  /**
   * @param {Object} config
   * @param {Object} config.alphabet    - from alphabets.json: { notes: [], alterations: { name: stepOffset, ... } }
   * @param {Object} config.octaves     - from octaves.json: { position, separator, registers, default }
   * @param {Object} config.tuning      - from tunings.json: { temperament, degrees, alterations, baseHz, baseNote, baseRegister }
   * @param {Object} config.temperament - from temperaments.json: { type?, period_ratio|period, divisions|generator, ratios|mapping }
   */
  constructor(config = {}) {
    this._cache = {};

    // Alphabet
    this.notes = config.alphabet?.notes || [];
    // Alphabet alterations: object { name: stepOffset } or legacy array
    const rawAlts = config.alphabet?.alterations || {};
    if (Array.isArray(rawAlts)) {
      // Legacy array format — convert to names list
      this.alterations = rawAlts;
      this.alterationSteps = {};
    } else {
      this.alterations = Object.keys(rawAlts);
      this.alterationSteps = rawAlts;  // { "#": 1, "b": -1, ... }
    }
    this._noteSet = new Set(this.notes);

    // Octaves — use tuning's baseRegister as default if available
    this.octaveConfig = config.octaves || { position: 'suffix', separator: '', registers: ['0','1','2','3','4','5','6','7','8','9'], default: 4 };
    if (config.tuning?.baseRegister != null) {
      this.octaveConfig = { ...this.octaveConfig, default: config.tuning.baseRegister };
    }

    // Tuning
    this.degrees = config.tuning?.degrees || null;
    this.ascending = config.tuning?.ascending || null;
    this.descending = config.tuning?.descending || null;
    this.alterationRatios = {};
    if (config.tuning?.alterations) {
      for (const [k, v] of Object.entries(config.tuning.alterations)) {
        this.alterationRatios[k] = normalizeRatio(v);
      }
    }
    this.baseHz = config.tuning?.baseHz || 440;
    this.baseNote = config.tuning?.baseNote || 'A';
    this.baseRegister = config.tuning?.baseRegister ?? 4;

    // Temperament
    this.temperament = config.temperament || null;
    this._isParametric = this.temperament?.type === 'parametric';

    // Pre-normalize table ratios
    if (this.temperament && !this._isParametric && this.temperament.ratios) {
      this._ratios = normalizeRatios(this.temperament.ratios);
      this._periodRatio = this.temperament.period_ratio || 2;
    } else if (this._isParametric) {
      this._period = this.temperament.period || 1200;  // cents
      this._generator = this.temperament.generator || 700;  // cents
      this._mapping = this.temperament.mapping || null;
    }

    // Compute base note offset for frequency calculation
    this._baseNoteIndex = this.notes.indexOf(this.baseNote);
    this._baseDegreeStep = this._getStep(this._baseNoteIndex);

    // Transpose: build reverse lookup table (step → [{note, alt}])
    this._divisions = this.temperament?.divisions || null;
    this._stepToNames = this._buildStepTable();

    // Save initial config for scale(0,0) reset
    this._initialTuning = config.tuning || null;
    this._initialTemperament = config.temperament || null;
  }

  /**
   * Reconfigure tuning + temperament at runtime (for scale() control).
   * Alphabet and octaves are preserved — only pitch mapping changes.
   * @param {Object} tuning - from tunings.json entry
   * @param {Object} temperament - from temperaments.json entry
   * @param {string} [blockkey] - override baseNote (e.g. "C4" → baseNote="C", baseRegister=4)
   */
  reconfigure(tuning, temperament, blockkey) {
    // Parse blockkey if provided: "C4" → note=C, register=4
    if (blockkey && blockkey !== '0') {
      const parsed = this._parseRegister(blockkey);
      if (parsed) {
        const { noteName, register } = this._parseNoteAlteration(parsed.body, parsed.register);
        if (noteName) {
          tuning = { ...tuning, baseNote: noteName, baseRegister: register };
        }
      }
    }

    // Re-apply tuning
    this.degrees = tuning?.degrees || null;
    this.ascending = tuning?.ascending || null;
    this.descending = tuning?.descending || null;
    this.alterationRatios = {};
    if (tuning?.alterations) {
      for (const [k, v] of Object.entries(tuning.alterations)) {
        this.alterationRatios[k] = normalizeRatio(v);
      }
    }
    this.baseHz = tuning?.baseHz || 440;
    this.baseNote = tuning?.baseNote || 'A';
    this.baseRegister = tuning?.baseRegister ?? 4;

    // Re-apply temperament
    this.temperament = temperament || null;
    this._isParametric = this.temperament?.type === 'parametric';

    if (this.temperament && !this._isParametric && this.temperament.ratios) {
      this._ratios = normalizeRatios(this.temperament.ratios);
      this._periodRatio = this.temperament.period_ratio || 2;
    } else if (this._isParametric) {
      this._period = this.temperament.period || 1200;
      this._generator = this.temperament.generator || 700;
      this._mapping = this.temperament.mapping || null;
    }

    // Recompute derived values
    this._baseNoteIndex = this.notes.indexOf(this.baseNote);
    this._baseDegreeStep = this._getStep(this._baseNoteIndex);
    this._divisions = this.temperament?.divisions || null;
    this._stepToNames = this._buildStepTable();
    this._cache = {};
  }

  /**
   * Reset to initial tuning (scale(0,0)).
   */
  resetScale() {
    if (this._initialTuning || this._initialTemperament) {
      this.reconfigure(this._initialTuning, this._initialTemperament);
    }
  }

  /**
   * Build reverse lookup: step → [{ note, alt }] for all note+alteration combos.
   * Used by transposeToken() to find a name for a target step.
   */
  _buildStepTable() {
    const table = new Map();
    const degs = this.degrees || this.ascending;
    if (!degs || !this._divisions) return table;

    for (let i = 0; i < this.notes.length; i++) {
      if (i >= degs.length) break;
      const baseStep = degs[i];
      const entries = this.alterationSteps || {};

      for (const [altName, altOffset] of Object.entries(entries)) {
        const step = ((baseStep + altOffset) % this._divisions + this._divisions) % this._divisions;
        if (!table.has(step)) table.set(step, []);
        table.get(step).push({ note: this.notes[i], alt: altName || null });
      }

      // Also add the bare note (no alteration) if "" is not in alterationSteps
      if (!('' in entries)) {
        const step = ((baseStep) % this._divisions + this._divisions) % this._divisions;
        if (!table.has(step)) table.set(step, []);
        table.get(step).push({ note: this.notes[i], alt: null });
      }
    }

    return table;
  }

  /**
   * Get the step (in temperament grid) for a note at a given degree index.
   * @param {number} degreeIndex - index in alphabet.notes
   * @returns {number|null}
   */
  _getStep(degreeIndex) {
    if (degreeIndex < 0) return null;
    const degs = this.degrees || this.ascending;
    if (!degs || degreeIndex >= degs.length) return null;
    return degs[degreeIndex];
  }

  /**
   * Set the generator value (for parametric temperaments, real-time CV).
   * @param {number} cents - generator value in cents
   */
  setGenerator(cents) {
    if (!this._isParametric) return;
    this._generator = cents;
    this._cache = {};
  }

  /**
   * Set reference pitch.
   * @param {number} hz
   */
  setReference(hz) {
    this.baseHz = hz;
    this._cache = {};
  }

  /**
   * Transpose a token by N steps on the temperament grid.
   * Pre-resolver operation: returns a new token string, does NOT resolve to frequency.
   *
   * Algorithm:
   *   1. Parse token → note + alteration + register
   *   2. Forward: step = degrees[noteIdx] + alterationSteps[alt]
   *   3. newStep = (step + N) % divisions
   *   4. Reverse lookup: find note+alt for newStep
   *   5. Reconstruct token with original register (±1 if wrap)
   *
   * @param {string} token - e.g. "C4", "D#5", "ga_komal"
   * @param {number} N - signed step count (positive = up, negative = down)
   * @returns {string} transposed token, or original if not transposable
   */
  transposeToken(token, N) {
    if (!N || !this._divisions || this._stepToNames.size === 0) return token;

    // Step 1: Parse
    const parsed = this._parseRegister(token);
    if (!parsed) return token;
    const { noteName, alteration, register } = this._parseNoteAlteration(parsed.body, parsed.register);
    if (noteName == null) return token;  // percussion or unrecognized — pass through

    // Step 2: Forward — current step on the grid
    const degreeIndex = this.notes.indexOf(noteName);
    if (degreeIndex < 0) return token;
    const degs = this.degrees || this.ascending;
    if (!degs || degreeIndex >= degs.length) return token;
    const altOffset = (alteration && this.alterationSteps[alteration]) || 0;
    const currentStep = degs[degreeIndex] + altOffset;

    // Step 3: New step (with wrap tracking for register adjustment)
    const rawNewStep = currentStep + N;
    const newStep = ((rawNewStep % this._divisions) + this._divisions) % this._divisions;
    const registerDelta = Math.floor(rawNewStep / this._divisions) - Math.floor(currentStep / this._divisions);

    // Step 4: Reverse lookup
    const candidates = this._stepToNames.get(newStep);
    if (!candidates || candidates.length === 0) return token;

    // Choose: prefer sharp (N>0) or flat (N<0), or natural
    let best = candidates[0];
    for (const c of candidates) {
      if (!c.alt || c.alt === '') { best = c; break; }  // natural note = best
    }
    if (best.alt && best.alt !== '') {
      // No natural found — prefer smallest alteration in the right direction (# over ##, b over bb)
      const sorted = candidates
        .filter(c => {
          const s = this.alterationSteps[c.alt] || 0;
          return N > 0 ? s > 0 : s < 0;
        })
        .sort((a, b) => Math.abs(this.alterationSteps[a.alt] || 0) - Math.abs(this.alterationSteps[b.alt] || 0));
      if (sorted.length) best = sorted[0];
    }

    // Step 5: Reconstruct token
    const newRegister = register + registerDelta;
    return this._buildToken(best.note, best.alt, newRegister);
  }

  /**
   * Reconstruct a token string from note + alteration + register.
   * Inverse of _parseRegister + _parseNoteAlteration.
   */
  _buildToken(noteName, alteration, register) {
    // Build note+alteration part
    let body = noteName;
    if (alteration && alteration !== '') {
      // Use separator _ for multi-char alterations (komal, tivra), direct for single-char (#, b)
      if (alteration.length > 1) {
        body = noteName + '_' + alteration;
      } else {
        body = noteName + alteration;
      }
    }

    // Add register using octave convention
    const oct = this.octaveConfig;
    const regs = oct.registers || [];
    if (register >= 0 && register < regs.length && regs[register] !== '') {
      const sep = oct.separator || '';
      if (oct.position === 'suffix') {
        return body + sep + regs[register];
      } else if (oct.position === 'prefix') {
        return regs[register] + sep + body;
      }
    }

    return body;
  }

  /**
   * Rotate a token by N degrees in the alphabet (diatonic shift).
   * Unlike transposeToken (grid shift), this shifts by position in notes[].
   * rotate(2) on C in [C,D,E,F,G,A,B] → E. Alteration is preserved.
   * Register wraps: rotate(1) on B4 → C5.
   *
   * @param {string} token - e.g. "C4", "D#5"
   * @param {number} N - signed degree count
   * @returns {string} rotated token, or original if not rotatable
   */
  rotateToken(token, N) {
    if (!N || this.notes.length === 0) return token;

    const parsed = this._parseRegister(token);
    if (!parsed) return token;
    const { noteName, alteration, register } = this._parseNoteAlteration(parsed.body, parsed.register);
    if (noteName == null) return token;

    const idx = this.notes.indexOf(noteName);
    if (idx < 0) return token;

    const len = this.notes.length;
    const rawIdx = idx + N;
    const newIdx = ((rawIdx % len) + len) % len;
    const registerDelta = Math.floor(rawIdx / len) - Math.floor(idx / len);

    const newNote = this.notes[newIdx];
    return this._buildToken(newNote, alteration, register + registerDelta);
  }

  /**
   * Expand/contract intervals around a pivot note.
   * Formula: newStep = pivotStep + round((currentStep - pivotStep) × factor)
   * factor=2 doubles intervals, factor=-1 inverts, factor=0.5 contracts.
   * Wraps into [0, divisions) with register adjustment.
   *
   * @param {string} token - e.g. "C4", "D#5"
   * @param {string} pivot - pivot note token e.g. "G4", "sa_4"
   * @param {number} factor - multiplication factor
   * @returns {string} expanded token, or original if not expandable
   */
  keyxpandToken(token, pivot, factor) {
    if (factor === 1 || !this._divisions || this._stepToNames.size === 0) return token;

    // Parse current token → step
    const parsed = this._parseRegister(token);
    if (!parsed) return token;
    const { noteName, alteration, register } = this._parseNoteAlteration(parsed.body, parsed.register);
    if (noteName == null) return token;

    const degreeIndex = this.notes.indexOf(noteName);
    if (degreeIndex < 0) return token;
    const degs = this.degrees || this.ascending;
    if (!degs || degreeIndex >= degs.length) return token;
    const altOffset = (alteration && this.alterationSteps[alteration]) || 0;
    const currentStep = degs[degreeIndex] + altOffset + register * this._divisions;

    // Parse pivot → step
    const pivotParsed = this._parseRegister(pivot);
    if (!pivotParsed) return token;
    const pivotNote = this._parseNoteAlteration(pivotParsed.body, pivotParsed.register);
    if (pivotNote.noteName == null) return token;
    const pivotDegIdx = this.notes.indexOf(pivotNote.noteName);
    if (pivotDegIdx < 0 || pivotDegIdx >= degs.length) return token;
    const pivotAltOff = (pivotNote.alteration && this.alterationSteps[pivotNote.alteration]) || 0;
    const pivotStep = degs[pivotDegIdx] + pivotAltOff + pivotNote.register * this._divisions;

    // Apply expansion: newStep = pivot + round((current - pivot) * factor)
    const rawNewStep = pivotStep + Math.round((currentStep - pivotStep) * factor);
    const newStep = ((rawNewStep % this._divisions) + this._divisions) % this._divisions;
    const newRegister = Math.floor(rawNewStep / this._divisions);

    // Reverse lookup
    const candidates = this._stepToNames.get(newStep);
    if (!candidates || candidates.length === 0) return token;

    // Prefer natural, then smallest alteration
    let best = candidates[0];
    for (const c of candidates) {
      if (!c.alt || c.alt === '') { best = c; break; }
    }
    if (best.alt && best.alt !== '') {
      const dir = rawNewStep >= pivotStep ? 1 : -1;
      const sorted = candidates
        .filter(c => {
          const s = this.alterationSteps[c.alt] || 0;
          return dir > 0 ? s > 0 : s < 0;
        })
        .sort((a, b) => Math.abs(this.alterationSteps[a.alt] || 0) - Math.abs(this.alterationSteps[b.alt] || 0));
      if (sorted.length) best = sorted[0];
    }

    return this._buildToken(best.note, best.alt, newRegister);
  }

  /**
   * Resolve a token to frequency or sound parameters.
   * @param {string} token - e.g. "C4", "Sa_^", "ga_komal", "D#5", "dhin"
   * @param {string} [direction] - 'ascending' or 'descending' (for directional tunings)
   * @returns {{ frequency: number, noteName: string, alteration: string|null, register: number } | { layers: Array } | { freq: number, ... } | null}
   */
  resolve(token, direction) {
    const cacheKey = direction ? token + ':' + direction : token;
    if (this._cache[cacheKey]) return this._cache[cacheKey];

    // Try 5-layer pitch resolution
    const pitched = this._resolvePitch(token, direction);
    if (pitched) {
      this._cache[cacheKey] = pitched;
      return pitched;
    }

    // Fallback: sounds resolver (percussion, samples, etc.)
    if (this.soundsResolver) {
      const sounds = this.soundsResolver.resolve(token);
      if (sounds) {
        this._cache[cacheKey] = sounds;
        return sounds;
      }
    }

    return null;
  }

  /**
   * 5-layer pitch resolution: register → note → degree → step → frequency.
   * @returns {{ frequency: number, noteName: string, alteration: string|null, register: number } | null}
   */
  _resolvePitch(token, direction) {
    // Step 1: Parse register (octave convention)
    const parsed = this._parseRegister(token);
    if (!parsed) return null;

    // Step 2: Parse note + alteration
    const { noteName, alteration, register } = this._parseNoteAlteration(parsed.body, parsed.register);
    if (noteName == null) return null;

    // Step 3: Get degree index from alphabet
    const degreeIndex = this.notes.indexOf(noteName);
    if (degreeIndex < 0) return null;

    // Step 4: Get step from tuning (respecting direction if applicable)
    let step;
    if (direction === 'descending' && this.descending) {
      step = degreeIndex < this.descending.length ? this.descending[degreeIndex] : null;
    } else if (this.ascending) {
      step = degreeIndex < this.ascending.length ? this.ascending[degreeIndex] : null;
    } else if (this.degrees) {
      step = degreeIndex < this.degrees.length ? this.degrees[degreeIndex] : null;
    } else {
      step = null;
    }
    if (step == null) return null;

    // Step 5: Compute frequency
    let frequency;

    if (this._isParametric) {
      frequency = this._resolveParametric(step, alteration, register);
    } else {
      frequency = this._resolveTable(step, alteration, register);
    }

    if (frequency == null || isNaN(frequency)) return null;

    return {
      frequency: Math.round(frequency * 100) / 100,
      noteName,
      alteration,
      register,
      step,
      degreeIndex,
    };
  }

  /**
   * Resolve using table mode (fixed ratios).
   */
  _resolveTable(step, alteration, register) {
    if (!this._ratios || step >= this._ratios.length) return null;

    const ratio = this._ratios[step];
    const altRatio = alteration ? (this.alterationRatios[alteration] || 1) : 1;
    const periodPow = Math.pow(this._periodRatio, register - this.baseRegister);

    // Base frequency: resolve baseNote at baseRegister
    const baseStep = this._baseDegreeStep;
    const baseRatio = (baseStep != null && baseStep < this._ratios.length) ? this._ratios[baseStep] : 1;

    return this.baseHz / baseRatio * periodPow * ratio * altRatio;
  }

  /**
   * Resolve using parametric mode (Dynamic Tonality).
   * pitch_cents = step × generator, reduced mod period.
   */
  _resolveParametric(step, alteration, register) {
    const period = this._period;
    const generator = this._generator;

    // step is number of generators
    let pitchCents = step * generator;

    // Reduce into [0, period)
    pitchCents = ((pitchCents % period) + period) % period;

    // Alteration
    const altRatio = alteration ? (this.alterationRatios[alteration] || 1) : 1;

    // Base note pitch
    const baseStep = this._baseDegreeStep;
    let baseCents = baseStep != null ? ((baseStep * generator % period) + period) % period : 0;

    // Absolute cents from base
    const deltaCents = pitchCents - baseCents + (register - this.baseRegister) * period;

    return this.baseHz * Math.pow(2, deltaCents / 1200) * altRatio;
  }

  /**
   * Parse register (octave) from token using octaves config.
   * @returns {{ body: string, register: number } | null}
   */
  _parseRegister(token) {
    if (!token || typeof token !== 'string') return null;

    const oct = this.octaveConfig;
    const sep = oct.separator || '';
    const regs = oct.registers || [];
    const defaultReg = oct.default ?? 0;

    if (oct.position === 'suffix') {
      // Try longest register suffix first
      const sorted = [...regs].sort((a, b) => b.length - a.length);
      for (const reg of sorted) {
        if (reg === '') continue; // empty = default, try last
        const suffix = sep + reg;
        if (token.endsWith(suffix)) {
          const body = token.slice(0, -suffix.length);
          if (body.length > 0) {
            return { body, register: regs.indexOf(reg) };
          }
        }
      }
      // No suffix matched → default register
      return { body: token, register: defaultReg };
    }

    if (oct.position === 'prefix') {
      const sorted = [...regs].sort((a, b) => b.length - a.length);
      for (const reg of sorted) {
        if (reg === '') continue;
        const prefix = reg + sep;
        if (token.startsWith(prefix)) {
          const body = token.slice(prefix.length);
          if (body.length > 0) {
            return { body, register: regs.indexOf(reg) };
          }
        }
      }
      return { body: token, register: defaultReg };
    }

    return { body: token, register: defaultReg };
  }

  /**
   * Parse note name + alteration from body string.
   * Tries longest alteration match first.
   * @returns {{ noteName: string|null, alteration: string|null, register: number }}
   */
  _parseNoteAlteration(body, register) {
    // Try exact match first (no alteration)
    if (this._noteSet.has(body)) {
      return { noteName: body, alteration: null, register };
    }

    // Try note + alteration (suffix): "ga_komal" → note="ga", alt="komal"
    // Also handle "C#" → note="C", alt="#"
    const alts = [...this.alterations].filter(a => a !== '').sort((a, b) => b.length - a.length);
    for (const alt of alts) {
      // Alteration as suffix with separator _
      if (body.endsWith('_' + alt)) {
        const noteName = body.slice(0, -(alt.length + 1));
        if (this._noteSet.has(noteName)) {
          return { noteName, alteration: alt, register };
        }
      }
      // Alteration as direct suffix (C#, Db)
      if (body.endsWith(alt)) {
        const noteName = body.slice(0, -alt.length);
        if (this._noteSet.has(noteName)) {
          return { noteName, alteration: alt, register };
        }
      }
    }

    // Legacy fallback: try splitting letter(s) + digits for old formats
    const legacy = body.match(/^([A-Ga-g][#b]?)(\d+)$/);
    if (legacy) {
      const noteName = legacy[1].replace(/#/, '').replace(/b/, '');
      const alt = legacy[1].includes('#') ? '#' : legacy[1].includes('b') ? 'b' : null;
      const legacyReg = parseInt(legacy[2]);
      if (this._noteSet.has(noteName)) {
        return { noteName, alteration: alt, register: legacyReg };
      }
    }

    return { noteName: null, alteration: null, register };
  }
}
