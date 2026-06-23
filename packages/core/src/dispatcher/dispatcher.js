/**
 * BPscript Dispatcher
 *
 * Loads timed tokens from BP3 WASM (symbolic labels with timing),
 * maintains control state, and distributes to transports
 * via a lookahead clock for sample-accurate scheduling.
 *
 * Loop mode: when enabled, the dispatcher calls a re-derive function
 * at the end of each cycle to get a new sequence (potentially different
 * in random mode). The live coder can swap the grammar between cycles.
 */

/**
 * Coerce a leaf's resolved controls to runtime types. BPx delivers control values
 * VERBATIM (`vel:'80'` as a string, `wave:'sawtooth'` as a string) — type
 * interpretation is the consumer's job (R2). Numeric-looking strings become
 * numbers (so velocity/filterQ/… apply); non-numeric strings pass through (so the
 * oscillator waveform stays a string). Returns a fresh object; `null`/absent → {}.
 * @param {Record<string, unknown>|null|undefined} controls
 * @returns {Record<string, unknown>}
 */
export function coerceControlValues(controls) {
  if (!controls) return {};
  const out = {};
  for (const [k, v] of Object.entries(controls)) {
    out[k] = typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v;
  }
  return out;
}

export class Dispatcher {
  /**
   * @param {AudioContext} audioCtx
   */
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.transports = {};     // name → Transport instance
    this.events = [];         // sorted by startSec
    this._cursor = 0;
    this._onEnd = null;
    this._running = false;
    this._loopOffset = 0;     // accumulated time offset from previous cycles
    this._derivedTempo = 0;   // tempo BPx derived the loaded events at (live retune)

    // Loop mode
    this.loop = false;
    this._reDerive = null;    // function that returns new timed tokens
    this._reRandom = false;   // live flag: re-roll the grammar each loop cycle

    // Control state — updated by control tokens during playback
    this._controlDefaults = {};  // set via setControlDefaults()
    this.controlState = {};
    this._controlStack = []; // for scoped () controls with start/end pairs

    // Actor system: per-actor resolver and transport. Routing keys on each
    // event's OWN `payload.actor` (carried off the BPx tree) — there is no flat
    // symbol→actor map: a terminal shared by two actors routes by occurrence,
    // never collapsed. A note WITHOUT an actor routes to the 'default' transport.
    this._actors = {};              // actorName → { resolver, transportName, transport }

    // Per-actor flux state (M5+ multi-actor refacto): a `flux`/transport-control
    // marker updates only its OWN actor's running state, applied to that actor's
    // SUBSEQUENT notes in order — never globally (the old global controlState bled
    // velocity from one actor to another). Keyed by actor name.
    this._fluxByActor = {};         // actorName → { vel?, transpose?, chan?, ... }

    // Live arm/disarm: a disarmed actor's sounding notes are NOT routed to its
    // transport (skipped at fire time) without re-deriving or stopping the other
    // actors. The UI's Actors panel toggles this per actor while the transport
    // keeps running. Empty by default → every declared actor sounds.
    this._mutedActors = new Set(); // actorName(s) whose notes are currently silenced

    // Modulator registry (name → { objectType, params, curve }), forwarded to
    // transports for per-note CV. Stored so a transport added AFTER setModulators
    // still gets it (order-independent).
    this._modulators = {};
  }

  /**
   * Register a transport by name.
   */
  addTransport(name, transport) {
    this.transports[name] = transport;
    if (transport && typeof transport.setModulators === 'function') {
      transport.setModulators(this._modulators);
    }
  }

  /**
   * Set actor system: per-actor definitions (resolver + transport). Routing is
   * by each event's own `payload.actor` (off the tree), so NO flat symbol→actor
   * map is needed — a terminal shared by two actors routes by occurrence.
   * @param {Object} actorTable - { actorName → { alphabet, transport, ... } }
   */
  setActors(actorTable) {
    this._actors = {};
    if (actorTable) {
      for (const [name, def] of Object.entries(actorTable)) {
        this._actors[name] = {
          resolver: null,
          transportName: null,
          transport: null,
          def,
        };
      }
    }
  }

  /**
   * Set the resolver for a specific actor.
   * @param {string} actorName
   * @param {Resolver} resolver
   */
  setActorResolver(actorName, resolver) {
    if (this._actors[actorName]) {
      this._actors[actorName].resolver = resolver;
    }
  }

  /**
   * Set the transport for a specific actor.
   * @param {string} actorName
   * @param {string} transportName - key in this.transports
   */
  setActorTransport(actorName, transportName) {
    if (this._actors[actorName]) {
      this._actors[actorName].transportName = transportName;
    }
  }

  /**
   * Arm/disarm an actor LIVE: a disarmed actor's notes are skipped at fire time
   * (`_sendActorNote`) while the transport and the other actors keep playing. No
   * re-derivation, no stop — the running dispatcher simply stops routing this
   * actor's sounding notes until it is re-armed. Code voices (Strudel/Hydra) are
   * not note-routed; the adapter handles those separately (stop / re-eval).
   * @param {string} actorName
   * @param {boolean} muted
   */
  setActorMuted(actorName, muted) {
    if (muted) this._mutedActors.add(actorName);
    else this._mutedActors.delete(actorName);
  }

  /**
   * Set the play-vs-skip predicate. `soundsFn(token)` returns true when the
   * token should sound (route to its actor transport), false when it is MUTE.
   * A mute token is simply NOT PLAYED — the dispatcher routes only sounding
   * tokens to runtime outputs; it no longer carries a text output. The symbolic
   * readout is a view of the production tree (Text panel), not a routed sink.
   * @param {(token: string) => boolean} soundsFn
   */
  setSoundPredicate(soundsFn) {
    this._soundsFn = soundsFn;
  }

  /**
   * Backtick voice routing (lot 4 cross-runtime, ADAPTER_SPEC §1bis):
   * a standalone backtick terminal compiles to a `BT<interp><id>` token placed
   * in the derived timeline. Such a token is NOT an audio/text terminal — it is
   * a reference to foreign code whose interpreter (Strudel/Hydra/…) must FIRE at
   * the scheduled time. The adapter (bp3.ts) injects the sink; the dispatcher
   * only places it in time, staying free of any UI/adapter import (layering).
   *
   * `isBacktick(token)` decides membership (table-driven by the caller, not a
   * brittle `startsWith('BT')`), and `sink(token, { startSec, durSec, absTime })`
   * is fired instead of routing the token to an audio/text transport.
   * @param {(token: string) => boolean} isBacktick
   * @param {(token: string, t: { startSec: number, durSec: number, absTime: number }) => void} sink
   */
  setBacktickSink(isBacktick, sink) {
    this._isBacktick = isBacktick;
    this._backtickSink = sink;
  }

  /**
   * Set control defaults from controls.json runtime section.
   * Called once at init. The dispatcher uses these to reset controlState.
   * @param {Object} defaults - { vel: 64, chan: 1, wave: "triangle", ... }
   */
  setControlDefaults(defaults) {
    this._controlDefaults = { ...defaults };
    this.controlState = { ...defaults };
  }

  /**
   * Set tuning/temperament data for runtime scale() lookup.
   * @param {Object} tunings - full tunings.json content
   * @param {Object} temperaments - full temperaments.json content
   */
  setTuningData(tunings, temperaments) {
    this._tunings = tunings || {};
    this._temperaments = temperaments || {};
  }

  /**
   * Set the control table (from transpiler output).
   * Maps CT0, CT1... to their assignments.
   */
  setControlTable(controlTable) {
    this._controlTable = {};
    this._controlScopes = {};
    if (controlTable) {
      for (const entry of controlTable) {
        this._controlTable[entry.id] = entry.assignments;
        if (entry.scope) {
          this._controlScopes[entry.id] = { scope: entry.scope, restores: entry.restores };
        }
      }
    }
  }

  /**
   * Set the modulator registry (name → { objectType, params, curve }) from the
   * `cv … : mod.x(…)` declarations, and forward it to every transport. Per-note
   * modulation is applied at `transport.send()` from a note's branchement controls
   * (e.g. `cutoff: 'env1'` in `leaf.controls`) — no CV tokens in the stream.
   */
  setModulators(registry) {
    this._modulators = registry || {};
    for (const t of Object.values(this.transports)) {
      if (t && typeof t.setModulators === 'function') t.setModulators(this._modulators);
    }
  }

  /**
   * Load timed tokens from bp3_get_timed_tokens().
   * Each token: { token: "C4", start: 0, end: 1000 }
   * @param {Array} timedTokens
   * @param {Object} [metadata] - { duration: { amount, unit } } from @duration directive
   */
  load(timedTokens, metadata = {}) {
    if (!timedTokens || timedTokens.length === 0) {
      this.events = [];
      return;
    }

    this.controlState = { ...this._controlDefaults };

    this.events = timedTokens.map(t => {
      const evt = {
        token: t.token,
        startSec: t.start / 1000,
        durSec: Math.max(0, (t.end - t.start)) / 1000,
        isControl: t.token.startsWith('_'),
        isSilence: t.token === '-',
        isProlongation: t.token === '_',
      };
      if (t.label) evt.label = t.label;
      // Per-token runtime payload (M5+ contract): the engine seals the resolved
      // velocity/transpose/channel state onto each terminal as `runtimeQualifiers`.
      // Carried through so the send path can apply it (see _applyRuntimeQualifiers).
      if (t.runtimeQualifiers) evt.rq = t.runtimeQualifiers;
      return evt;
    }).sort((a, b) => {
      if (a.startSec !== b.startSec) return a.startSec - b.startSec;
      const pri = (e) => (e.isControl ? 0 : 1);
      return pri(a) - pri(b);
    });

    // @duration: scale all timestamps to fit declared duration
    if (metadata.duration) {
      const naturalDur = this.duration; // seconds, float64
      if (naturalDur > 0) {
        let targetDur;
        if (metadata.duration.unit === 'b') {
          // beats → seconds at current tempo
          const bpm = this._tempo || 60;
          targetDur = metadata.duration.amount * 60 / bpm;
        } else {
          // seconds directly
          targetDur = metadata.duration.amount;
        }
        // Proportional rescale — each token independent, no error accumulation
        for (const evt of this.events) {
          evt.startSec = (evt.startSec / naturalDur) * targetDur;
          evt.durSec = (evt.durSec / naturalDur) * targetDur;
        }
      }
    }

    this._cursor = 0;
    this._loopOffset = 0;
  }

  /**
   * Load tree-derived dispatch events — the SINGLE load path for ALL grammars
   * (orchestrated AND mono / `.gr` / text). Each event CARRIES its own payload
   * off the BPx tree: a note's `payload.actor`/`payload.params` and the sealed
   * E-016 `rq` (`runtimeQualifiers`), a control's marker payload + `nature`.
   * Times are already in SECONDS.
   *
   * Routing keys on `payload.actor` per event: a terminal shared by two actors
   * routes to two transports. A note WITHOUT an actor routes to the 'default'
   * transport. A MUTE token (`soundsFn` false in `_schedule`) is skipped, not
   * routed — uniformly for every grammar. There is NO flat symbol→actor map.
   *
   * @param {Array<{token:string,startSec:number,durSec:number,type:'note'|'control'|'rest',payload?:object,nature?:string,rq?:object}>} events
   */
  loadEvents(events) {
    if (!events || events.length === 0) {
      this.events = [];
      return;
    }

    this.controlState = { ...this._controlDefaults };
    this._fluxByActor = {};

    this.events = events.map(e => {
      const isControl = e.type === 'control';
      const isRest = e.type === 'rest' || e.token === '-' || e.token === '_';
      return {
        token: e.token,
        startSec: e.startSec,
        durSec: Math.max(0, e.durSec || 0),
        isControl,
        isSilence: isRest && e.token === '-',
        isProlongation: isRest && e.token === '_',
        payload: e.payload ?? null,
        nature: e.nature,
        // E-016 sealed per-leaf runtime state, folded over controlState at send.
        rq: e.rq ?? null,
        // Resolved non-temporal controls (canonical `leaf.controls` channel),
        // spread over controlState at send so the terminal voices wave/vel/etc.
        controls: e.controls ?? null,
      };
    }).sort((a, b) => {
      if (a.startSec !== b.startSec) return a.startSec - b.startSec;
      const pri = (e) => (e.isControl ? 0 : 1);
      return pri(a) - pri(b);
    });

    this._cursor = 0;
    this._loopOffset = 0;
  }

  /**
   * Total duration of loaded sequence in seconds.
   */
  get duration() {
    if (this.events.length === 0) return 0;
    const last = this.events[this.events.length - 1];
    return last.startSec + last.durSec;
  }

  stop() {
    this._running = false;
    this.loop = false;
    for (const transport of Object.values(this.transports)) {
      transport.close();
    }
  }

  /**
   * Record the tempo BPx derived the loaded events at (requirement A). The loaded
   * events carry seconds computed at THIS tempo; the clock's anchored map uses it
   * as the reference for live rescaling. Call before start().
   * @param {number} bpm
   */
  setDerivedTempo(bpm) {
    if (bpm > 0) this._derivedTempo = bpm;
  }

  /**
   * Live tempo change WITHOUT re-derivation (requirement A). Rescales future
   * scheduled notes (and their durations) in place, anchored so the currently
   * playing position does not jump. The next derivation still uses the new
   * tempo (the adapter updates its own derive tempo separately).
   * @param {number} bpm
   */
  setLiveTempo(bpm) {
    if (!(bpm > 0)) return;
    this._tempo = bpm;
  }

  /** LIVE toggle: whether each loop cycle re-rolls the grammar (re-random). Takes
   *  effect at the next cycle without re-evaluating. The re-derive function stays
   *  available; this flag just decides whether it runs. */
  setReRandom(on) {
    this._reRandom = !!on;
  }

  /** LIVE toggle: whether playback loops at the end of the cycle. Turning it off
   *  while playing lets the current cycle finish, then stops. */
  setLoop(on) {
    this.loop = !!on;
  }

  /** Apply a control token — _script(CTN) → look up table, or _xxx(value) */
  _applyControl(token) {
    const m = token.match(/^_(\w+)\((.+)\)$/);
    if (!m) return;
    const [, name, value] = m;

    // _script(CTN) → look up control table
    if (name === 'script' && value.startsWith('CT') && this._controlTable) {
      const scopeInfo = this._controlScopes?.[value];

      // Scoped end: restore previous state
      if (scopeInfo?.scope === 'end') {
        if (this._controlStack.length > 0) {
          const prev = this._controlStack.pop();
          // If scale changed, re-apply the restored scale
          if (prev.scale !== this.controlState.scale) {
            this.controlState = prev;
            this._applyScale(String(prev.scale || '0,0'));
          } else {
            this.controlState = prev;
          }
        }
        return;
      }

      // Scoped start: push current state before applying
      if (scopeInfo?.scope === 'start') {
        this._controlStack.push({ ...this.controlState });
      }

      const assignments = this._controlTable[value];
      if (assignments) {
        for (const [key, val] of Object.entries(assignments)) {
          this._setControl(key, val);
        }
      }
      return;
    }

    // Direct BP3 control: _vel(80), _chan(2), etc.
    this._setControl(name, value);
  }

  _setControl(name, value) {
    // String values (e.g. wave type) stored as-is, numeric values parsed
    const v = parseFloat(value);
    this.controlState[name] = isNaN(v) ? String(value) : v;

    // Paired flags: xxxcont/xxxfixed toggle continuous mode
    if (name.endsWith('cont')) {
      this.controlState[name] = true;
    } else if (name.endsWith('fixed')) {
      // pitchfixed → disable pitchcont, pressfixed → disable presscont, etc.
      const contName = name.replace(/fixed$/, 'cont');
      this.controlState[contName] = false;
      delete this.controlState[name]; // pitchfixed itself is not needed
    }

    // scale() — reconfigure resolver tuning in real-time
    if (name === 'scale') {
      this._applyScale(String(value));
    }

    // Notify UI callback
    if (this.onControlChange) this.onControlChange(name, this.controlState[name]);
  }

  /** Apply a scale change to the resolver. */
  _applyScale(value) {
    if (!this._resolver) return;

    // scale(0,0) → reset to initial tuning
    if (value === '0,0' || value === '0') {
      this._resolver.resetScale();
      return;
    }

    // Parse "tuningName,blockkey" or "tuningName"
    const parts = value.split(',');
    const tuningName = parts[0]?.trim();
    const blockkey = parts[1]?.trim() || null;

    if (!tuningName || !this._tunings) return;

    // Lookup tuning in tunings.json
    const tuning = this._tunings[tuningName];
    if (!tuning) {
      console.warn(`[dispatcher] scale: unknown tuning "${tuningName}"`);
      return;
    }

    // Lookup associated temperament in temperaments.json
    const temperament = tuning.temperament && this._temperaments
      ? this._temperaments[tuning.temperament]
      : null;

    this._resolver.reconfigure(tuning, temperament, blockkey);
  }

  /**
   * Dry-run: resolve all loaded events through the control pipeline
   * without audio playback. Requires load() to have been called first.
   * Returns tokens with controls applied (transpose, keyxpand, rotate).
   * Output is in temporal order (same as load() sorting).
   *
   * @param {Object} [options]
   * @param {boolean} [options.verbose=false] - include control tokens in output
   * @returns {Array<{token: string, start: number, end: number}>}
   */
  resolveTokens({ verbose = false } = {}) {
    const resolved = [];
    this.controlState = { ...this._controlDefaults };
    this._controlStack = [];

    for (const evt of this.events) {
      if (evt.isControl) {
        this._applyControl(evt.token);
        if (verbose) {
          resolved.push({
            token: evt.token,
            start: Math.round(evt.startSec * 1000),
            end: Math.round((evt.startSec + evt.durSec) * 1000),
          });
        }
        continue;
      }

      if (evt.isSilence || evt.isProlongation) continue;

      // Symbolic pitch operations: keyxpand → rotate → transpose. Per-actor
      // resolver when the event carries an actor (off the tree), else global.
      let token = evt.token;
      const actorName = evt.payload?.actor ?? null;
      const resolver =
        (actorName && this._actors[actorName]?.resolver) || this._resolver || null;
      if (resolver) {
        if (this.controlState.keyxpand && this.controlState.keyxpand !== '0,1') {
          const parts = String(this.controlState.keyxpand).split(',');
          const pivot = parts[0]?.trim();
          const factor = parseFloat(parts[1]);
          if (pivot && !isNaN(factor)) {
            token = resolver.keyxpandToken(token, pivot, factor);
          }
        }
        if (this.controlState.rotate) {
          token = resolver.rotateToken(token, this.controlState.rotate);
        }
        if (this.controlState.transpose) {
          token = resolver.transposeToken(token, this.controlState.transpose);
        }
      }

      resolved.push({
        token,
        start: Math.round(evt.startSec * 1000),
        end: Math.round((evt.startSec + evt.durSec) * 1000),
      });
    }

    return resolved;
  }
}
