/**
 * Web Audio Transport
 *
 * Plays notes via oscillators scheduled with AudioContext.
 * Receives symbolic tokens and control state from the dispatcher.
 *
 * Primitives:
 *   wave     — oscillator type (sine, triangle, square, sawtooth)
 *   vel      — velocity → gain
 *   pan      — stereo panning (-100 to 100)
 *   attack   — envelope attack in ms
 *   release  — envelope release in ms
 *   detune   — pitch detune in cents
 *   filter   — lowpass filter cutoff Hz (0 = bypass)
 *   filterQ  — filter resonance
 */

import { renderCVCurve } from '../cv-curve.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Modulation INPUTS exposed by this synth (the registry BPScript validates), each
// mapping a normalized CV 0..1 to the input's real range. Cutoff is exponential
// (frequency perception is logarithmic); the rest are linear. See
// docs/design/MODULATION_INPUTS.md.
const MOD_SCALE = {
  cutoff: (v) => 20 * Math.pow(1000, clamp01(v)), // 20..20000 Hz
  amplitude: (v) => clamp01(v), // 0..1
  resonance: (v) => clamp01(v) * 30, // 0..30
  pitch: (v) => (clamp01(v) * 2 - 1) * 1200, // -1200..1200 cents
  pan: (v) => clamp01(v) * 2 - 1 // -1..1
};

export class WebAudioTransport {
  /**
   * @param {AudioContext} audioCtx
   * @param {Object} [options]
   * @param {Resolver} [options.resolver] - symbol → frequency resolver
   */
  constructor(audioCtx, { resolver = null } = {}) {
    this.audioCtx = audioCtx;
    this.resolver = resolver;
    this._nodes = [];
  }

  /**
   * Schedule a note event at the given absolute audio time.
   * @param {Object} event - { token, velocity, durSec, wave, pan, attack, release, detune, filter, filterQ }
   * @param {number} absTime - absolute AudioContext time
   */
  send(event, absTime) {
    // Resolve token via resolver (handles pitched + sounds)
    let resolved = null;
    if (this.resolver) {
      resolved = this.resolver.resolve(event.token);
    }

    // Layers → multi-voice percussion (e.g. dhin = bayan + dayan)
    if (resolved && resolved.layers) {
      this._sendLayers(event, resolved, absTime);
      return;
    }

    // Pitched → oscillator
    const freq = resolved?.frequency;
    if (freq > 0) {
      // fall through to oscillator code below
    } else if (resolved && resolved.freq) {
      // Sounds-based percussion (single layer, e.g. ka = bayan_muted)
      this._sendPercussion(event, absTime, resolved);
      return;
    } else {
      // Unresolved terminal — error, not silent fallback
      console.warn(`[webaudio] unresolved terminal: "${event.token}" — no pitch, no sounds`);
      return;
    }

    const dur = Math.max(0.05, event.durSec);
    const velocity = event.velocity || 0.5;
    const wave = event.wave || 'triangle';
    const attackSec = (event.attack || 20) / 1000;
    const releaseSec = Math.min((event.release || 100) / 1000, dur * 0.4);
    const detune = event.detune || 0;
    const panValue = ((event.pan || 64) - 64) / 64; // MIDI 0-127 → -1 to 1
    const filterFreq = event.filter || 0;
    const filterQ = event.filterQ || 1;

    // Pitch bend → additional detune in cents
    const pitchbend = event.pitchbend || 0;
    const pitchrange = event.pitchrange || 200; // cents
    const pitchbendCents = (pitchbend / 8192) * pitchrange;
    const totalDetune = detune + pitchbendCents;

    // Per-note modulation (CV.md): a control whose VALUE is a modulator NAME (in
    // the registry, e.g. `cutoff: 'env1'`) is a BRANCHEMENT — modulate THIS note's
    // input with that modulator over the note's duration. A numeric/literal value
    // is a plain control. `mod(input)` → the modulator def, or null.
    const reg = this._modulators || {};
    const mod = (input) => {
      const v = event[input];
      return typeof v === 'string' && reg[v] ? reg[v] : null;
    };
    const cutoffMod = mod('cutoff');
    const resoMod = mod('resonance');
    const pitchMod = mod('pitch');
    const ampMod = mod('amplitude');
    const panMod = mod('pan');

    // Build audio graph: osc → [filter] → gain(env) → [ampGain] → [panner] → dest
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = wave;
    osc.frequency.value = freq;

    // Pitch: modulated detune (cents), else literal detune.
    if (pitchMod) {
      this._applyMod(pitchMod, osc.detune, MOD_SCALE.pitch, absTime, dur);
    } else if (totalDetune !== 0) {
      if (event.pitchcont && this._prevDetune !== undefined) {
        osc.detune.setValueAtTime(this._prevDetune, absTime);
        osc.detune.linearRampToValueAtTime(totalDetune, absTime + dur);
      } else {
        osc.detune.value = totalDetune;
      }
    }
    this._prevDetune = totalDetune;

    // Envelope
    const sustainLevel = velocity * 0.4;
    gain.gain.setValueAtTime(0, absTime);
    gain.gain.linearRampToValueAtTime(sustainLevel, absTime + attackSec);
    gain.gain.setValueAtTime(sustainLevel, absTime + dur - releaseSec);
    gain.gain.linearRampToValueAtTime(0, absTime + dur);

    // Connect graph
    let source = osc;

    // Filter: present for a literal cutoff OR when cutoff/resonance is modulated.
    if (filterFreq > 0 || cutoffMod || resoMod) {
      const biquad = this.audioCtx.createBiquadFilter();
      biquad.type = 'lowpass';
      if (cutoffMod) this._applyMod(cutoffMod, biquad.frequency, MOD_SCALE.cutoff, absTime, dur);
      else biquad.frequency.value = filterFreq > 0 ? filterFreq : 20000;
      if (resoMod) this._applyMod(resoMod, biquad.Q, MOD_SCALE.resonance, absTime, dur);
      else biquad.Q.value = filterQ;
      source.connect(biquad);
      source = biquad;
      this._nodes.push({ node: biquad });
    }

    source.connect(gain);
    let tail = gain;

    // Amplitude modulation: a dedicated gain stage after the note envelope.
    if (ampMod) {
      const cvGain = this.audioCtx.createGain();
      this._applyMod(ampMod, cvGain.gain, MOD_SCALE.amplitude, absTime, dur);
      gain.connect(cvGain);
      tail = cvGain;
      this._nodes.push({ node: cvGain });
    }

    // Pan: modulated panner, else literal pan, else direct to destination.
    if (panMod || panValue !== 0) {
      const panner = this.audioCtx.createStereoPanner();
      if (panMod) this._applyMod(panMod, panner.pan, MOD_SCALE.pan, absTime, dur);
      else panner.pan.value = Math.max(-1, Math.min(1, panValue));
      tail.connect(panner);
      panner.connect(this.audioCtx.destination);
      this._nodes.push({ node: panner });
    } else {
      tail.connect(this.audioCtx.destination);
    }

    osc.start(absTime);
    osc.stop(absTime + dur + 0.01);

    this._nodes.push({ osc, gain });
  }

  /** Set the modulator registry (name → { objectType, params, curve }). `send()`
   *  reads it per note from a branchement control (`cutoff: 'env1'`). */
  setModulators(registry) {
    this._modulators = registry || {};
  }

  /**
   * Apply a modulator's curve to an AudioParam over [absTime, absTime+dur].
   * The modulator emits a normalized signal; `scale` maps it to the param's real
   * range. Segments → breakpoint ramps; periodic → an LFO added to the param;
   * `expr` (backtick) → a sampled value-curve. Per note (re-triggered each note).
   */
  _applyMod(modulator, param, scale, absTime, dur) {
    if (!modulator) return;
    const curve = modulator.curve;
    if (curve && curve.kind === 'expr') {
      try {
        const fn = new Function(
          'sampleRate',
          'dur',
          `
          const samples = Math.ceil(sampleRate * dur);
          const c = new Float32Array(samples);
          const userFn = ${curve.code};
          for (let i = 0; i < samples; i++) {
            const t = i / sampleRate;
            c[i] = typeof userFn === 'function' ? userFn(t, dur) : userFn;
          }
          return c;
        `
        );
        const raw = fn(this.audioCtx.sampleRate, dur);
        const scaled = new Float32Array(raw.length);
        for (let i = 0; i < raw.length; i++) scaled[i] = scale(raw[i]);
        param.setValueCurveAtTime(scaled, absTime, dur);
      } catch (e) {
        console.warn('CV expr error:', e.message);
      }
      return;
    }
    const rendered = renderCVCurve(curve, modulator.params || {}, dur);
    if (rendered.kind === 'breakpoints') {
      const points = rendered.points;
      if (!points || points.length === 0) return;
      let prev = scale(points[0].value);
      param.setValueAtTime(prev, absTime);
      for (let i = 1; i < points.length; i++) {
        const p = points[i];
        const v = scale(p.value);
        const t = absTime + p.tSec;
        if (p.shape === 'exp' && v > 0 && prev > 0) param.exponentialRampToValueAtTime(v, t);
        else param.linearRampToValueAtTime(v, t);
        prev = v;
      }
    } else if (rendered.kind === 'periodic') {
      const spec = rendered.spec;
      const mp = modulator.params || {};
      const ref = (x) => (typeof x === 'string' && x.charAt(0) === '$' ? mp[x.slice(1)] : x);
      const rate = Number(ref(spec.rate)) || 4;
      const amplitude = ref(spec.amplitude) != null ? Number(ref(spec.amplitude)) : 0.5;
      let shape = ref(spec.shape) || 'sine';
      if (shape === 'saw') shape = 'sawtooth';
      const center = scale(0.5);
      const depth = (scale(1) - scale(0)) * 0.5 * amplitude;
      param.setValueAtTime(center, absTime);
      const lfo = this.audioCtx.createOscillator();
      const lfoGain = this.audioCtx.createGain();
      lfo.type = ['triangle', 'square', 'sawtooth'].includes(shape) ? shape : 'sine';
      lfo.frequency.value = rate;
      lfoGain.gain.value = depth;
      lfo.connect(lfoGain);
      lfoGain.connect(param); // a-rate modulation added to the param's base value
      lfo.start(absTime);
      lfo.stop(absTime + dur);
      this._nodes.push({ osc: lfo, node: lfoGain });
    }
  }

  close() {
    const now = this.audioCtx.currentTime;
    for (const entry of this._nodes) {
      try {
        if (entry.gain) {
          entry.gain.gain.cancelScheduledValues(now);
          entry.gain.gain.setValueAtTime(0, now);
        }
        if (entry.osc) {
          entry.osc.stop(now + 0.01);
        }
      } catch {}
    }
    this._nodes = [];
  }

  /**
   * Multi-layer percussion: play each layer simultaneously.
   * Used for composite bols like dhin (bayan_open + dayan_ring).
   */
  _sendLayers(event, resolved, absTime) {
    for (const layer of resolved.layers) {
      this._sendPercussion(event, absTime, layer);
    }
  }

  /**
   * Percussive synthesis with explicit sound params.
   * @param {Object} event - { token, velocity, ... }
   * @param {number} absTime - absolute AudioContext time
   * @param {Object} params - { freq, brightness, decay, noise, pitch_drop } from sounds resolver
   */
  _sendPercussion(event, absTime, params) {
    const velocity = event.velocity || 0.5;

    const basePitch = params.freq;
    const brightness = params.brightness || 2000;
    const decaySec = (params.decay || 150) / 1000;
    const noiseAmount = params.noise != null ? params.noise : 0.3;
    const pitchDrop = params.pitch_drop != null ? params.pitch_drop : 0.5;

    // Percussion routes straight to the output (per-note modulation applies to
    // pitched voices in `send()`, not to the sample-based percussion path).
    const dest = this.audioCtx.destination;

    // 1. Pitched component (sine oscillator with pitch drop)
    const osc = this.audioCtx.createOscillator();
    const oscGain = this.audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(basePitch * 4, absTime);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(1, basePitch * pitchDrop), absTime + decaySec
    );
    oscGain.gain.setValueAtTime(velocity * (1 - noiseAmount) * 0.5, absTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, absTime + decaySec);
    osc.connect(oscGain);
    oscGain.connect(dest);
    osc.start(absTime);
    osc.stop(absTime + decaySec + 0.01);

    // 2. Noise component (filtered white noise burst)
    const bufferSize = this.audioCtx.sampleRate * decaySec;
    const noiseBuffer = this.audioCtx.createBuffer(1, Math.max(1, bufferSize), this.audioCtx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.audioCtx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = this.audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = brightness;
    noiseFilter.Q.value = 1.5;
    const noiseGain = this.audioCtx.createGain();
    noiseGain.gain.setValueAtTime(velocity * noiseAmount * 0.4, absTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, absTime + decaySec * 0.7);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(dest);
    noise.start(absTime);
    noise.stop(absTime + decaySec + 0.01);

    this._nodes.push({ osc, gain: oscGain }, { node: noiseFilter, gain: noiseGain });
  }
}
