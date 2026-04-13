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

    // Build audio graph: osc → [filter] → gain → [panner] → destination
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.type = wave;
    osc.frequency.value = freq;
    if (totalDetune !== 0) {
      if (event.pitchcont && this._prevDetune !== undefined) {
        // Continuous mode: ramp from previous detune to current
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

    // Optional filter
    if (filterFreq > 0) {
      const biquad = this.audioCtx.createBiquadFilter();
      biquad.type = 'lowpass';
      biquad.frequency.value = filterFreq;
      biquad.Q.value = filterQ;
      source.connect(biquad);
      source = biquad;
      this._nodes.push({ node: biquad });
    }

    source.connect(gain);

    // Determine output destination: CV bus if active, else audioCtx.destination
    const dest = (this._cvBus && absTime < this._cvBus.endTime)
      ? this._cvBus.node
      : this.audioCtx.destination;

    // Optional panner
    if (panValue !== 0) {
      const panner = this.audioCtx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, panValue));
      gain.connect(panner);
      panner.connect(dest);
      this._nodes.push({ node: panner });
    } else {
      gain.connect(dest);
    }

    osc.start(absTime);
    osc.stop(absTime + dur + 0.01);

    this._nodes.push({ osc, gain });
  }

  /**
   * Schedule a CV event at the given absolute audio time.
   * The CV modulates an audio parameter (filter, gain, pan) over its duration.
   * @param {Object} cvEvent - { name, target, transport, lib, objectType, args, code, durSec }
   * @param {number} absTime - absolute AudioContext time
   */
  sendCV(cvEvent, absTime) {
    const dur = Math.max(0.05, cvEvent.durSec);
    const args = cvEvent.args || {};

    switch (cvEvent.objectType) {
      case 'adsr':
        this._cvADSR(args, dur, absTime);
        break;
      case 'lfo':
        this._cvLFO(args, dur, absTime);
        break;
      case 'ramp':
        this._cvRamp(args, dur, absTime);
        break;
      case 'backtick':
        this._cvBacktick(cvEvent.code, dur, absTime);
        break;
    }
  }

  /** ADSR envelope on a lowpass filter applied to destination */
  _cvADSR(args, dur, absTime) {
    const attackSec = (args.attack || 10) / 1000;
    const decaySec = (args.decay || 100) / 1000;
    const sustain = args.sustain != null ? args.sustain : 0.7;
    const releaseSec = (args.release || 200) / 1000;

    // Create a filter node on the destination bus
    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4;

    // ADSR on filter frequency: 200 Hz → 4000 Hz → sustain level → 200 Hz
    const minFreq = 200;
    const maxFreq = 4000;
    const sustainFreq = minFreq + (maxFreq - minFreq) * sustain;

    filter.frequency.setValueAtTime(minFreq, absTime);
    filter.frequency.linearRampToValueAtTime(maxFreq, absTime + attackSec);
    filter.frequency.linearRampToValueAtTime(sustainFreq, absTime + attackSec + decaySec);

    // Hold sustain until release starts
    const releaseStart = Math.max(absTime + attackSec + decaySec, absTime + dur - releaseSec);
    filter.frequency.setValueAtTime(sustainFreq, releaseStart);
    filter.frequency.linearRampToValueAtTime(minFreq, absTime + dur);

    // Insert filter into the audio graph: reconnect destination
    // Use a gain node as the CV bus entry point
    const bus = this.audioCtx.createGain();
    bus.gain.value = 1;
    bus.connect(filter);
    filter.connect(this.audioCtx.destination);

    // Store as the active CV bus — notes scheduled in this window will route through it
    this._cvBus = { node: bus, endTime: absTime + dur };
    this._nodes.push({ node: filter }, { node: bus });
  }

  /** LFO on stereo panning */
  _cvLFO(args, dur, absTime) {
    const rate = args.rate || 4;
    const amplitude = args.amplitude != null ? args.amplitude : 0.5;
    const shape = args.shape || 'sine';

    const lfo = this.audioCtx.createOscillator();
    const lfoGain = this.audioCtx.createGain();
    const panner = this.audioCtx.createStereoPanner();

    lfo.type = shape;
    lfo.frequency.value = rate;
    lfoGain.gain.value = amplitude;

    lfo.connect(lfoGain);
    lfoGain.connect(panner.pan);
    panner.connect(this.audioCtx.destination);

    lfo.start(absTime);
    lfo.stop(absTime + dur);

    // Store as CV bus for notes to route through
    const bus = this.audioCtx.createGain();
    bus.gain.value = 1;
    bus.connect(panner);
    this._cvBus = { node: bus, endTime: absTime + dur };
    this._nodes.push({ osc: lfo, node: lfoGain }, { node: panner }, { node: bus });
  }

  /** Linear ramp on filter frequency */
  _cvRamp(args, dur, absTime) {
    const fromVal = args.from != null ? args.from : 200;
    const toVal = args.to != null ? args.to : 4000;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;

    filter.frequency.setValueAtTime(fromVal, absTime);
    filter.frequency.linearRampToValueAtTime(toVal, absTime + dur);

    const bus = this.audioCtx.createGain();
    bus.gain.value = 1;
    bus.connect(filter);
    filter.connect(this.audioCtx.destination);

    this._cvBus = { node: bus, endTime: absTime + dur };
    this._nodes.push({ node: filter }, { node: bus });
  }

  /** Backtick CV: evaluate JS function to get a Float32Array curve */
  _cvBacktick(code, dur, absTime) {
    try {
      // The code should be a function (t, dur) => value or return a Float32Array
      const fn = new Function('sampleRate', 'dur', `
        const samples = Math.ceil(sampleRate * dur);
        const curve = new Float32Array(samples);
        const userFn = ${code};
        for (let i = 0; i < samples; i++) {
          const t = i / sampleRate;
          curve[i] = typeof userFn === 'function' ? userFn(t, dur) : userFn;
        }
        return curve;
      `);
      const curve = fn(this.audioCtx.sampleRate, dur);

      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 4;

      // Scale curve values (0-1) to frequency range (200-4000 Hz)
      const scaledCurve = new Float32Array(curve.length);
      for (let i = 0; i < curve.length; i++) {
        scaledCurve[i] = 200 + Math.max(0, Math.min(1, curve[i])) * 3800;
      }

      filter.frequency.setValueCurveAtTime(scaledCurve, absTime, dur);

      const bus = this.audioCtx.createGain();
      bus.gain.value = 1;
      bus.connect(filter);
      filter.connect(this.audioCtx.destination);

      this._cvBus = { node: bus, endTime: absTime + dur };
      this._nodes.push({ node: filter }, { node: bus });
    } catch (e) {
      console.warn('CV backtick error:', e.message);
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

    // Determine output destination: CV bus if active, else audioCtx.destination
    const dest = (this._cvBus && absTime < this._cvBus.endTime)
      ? this._cvBus.node
      : this.audioCtx.destination;

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
