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

import { Clock } from './clock.js';
import { MapEngine } from './map-engine.js';

export class Dispatcher {
  /**
   * @param {AudioContext} audioCtx
   */
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.clock = new Clock(audioCtx);
    this.transports = {};     // name → Transport instance
    this.events = [];         // sorted by startSec
    this._cursor = 0;
    this._onEnd = null;
    this._running = false;
    this._loopOffset = 0;     // accumulated time offset from previous cycles

    // Loop mode
    this.loop = false;
    this._reDerive = null;    // function that returns new timed tokens

    // Control state — updated by control tokens during playback
    this._controlDefaults = {};  // set via setControlDefaults()
    this.controlState = {};
    this._controlStack = []; // for scoped () controls with start/end pairs

    // Flag state — BP3 K-parameters (separate from runtime controlState)
    this.flagState = {};       // { flagName: value } — synced from BP3 after produce
    this._flagNames = [];      // ordered flag names from BP3

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

    // I/O mapping via MapEngine
    this._mapEngine = new MapEngine({
      getFlagState: () => this.flagState,
      setFlag: (name, value) => this._setFlag(name, value),
      execSys: (scene, cmd, value) => this.execSysCommand(scene, cmd, value),
      emitTrigger: (name, value) => this._emitTrigger(name, value),
      emitCC: (cc, value, ch) => this._emitCC(cc, value),
      emitOSC: (addr, value) => this._emitOSC(addr, value),
    });

    // Scene management (set externally by SceneManager)
    this._sceneInstances = {};  // sceneName → { dispatcher, flagState, ... }

    // CV state
    this._cvTable = {};    // CV0 → { name, target, transport, lib, objectType, args, code }
    this._cvNames = {};    // CV instance name → CV id
  }

  /**
   * Register a transport by name.
   */
  addTransport(name, transport) {
    this.transports[name] = transport;
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
   * Resolve the destination transport for a terminal, UNIFORMLY for every
   * grammar. The play-vs-skip split is BP3-specific (note-name OR sound
   * assignment), supplied by the adapter as `_soundsFn`; the dispatcher just
   * honours it. A token that does NOT sound is MUTE: it is NOT routed anywhere
   * (return null → the caller skips it). Text is no longer a routed output —
   * the symbolic readout is a VIEW of the production tree, not a transport. A
   * sounding token → its actor transport (`_transportForActor`); no actor (mono
   * / `.gr` / legacy) → 'default'.
   * @param {string} token
   * @param {string|undefined|null} actorName
   * @returns {Transport|null}
   */
  _transportForTerminal(token, actorName) {
    if (this._soundsFn && !this._soundsFn(token)) return null;
    return this._transportForActor(actorName);
  }

  /**
   * Resolve the destination transport for a SOUNDING note, by its actor: an
   * actor's declared transport, else 'default', else the first registered one. A
   * note WITHOUT an actor (mono / `.gr` / legacy) routes to 'default' — there is
   * no flat symbol→actor map to consult.
   * @param {string|undefined|null} actorName
   * @returns {Transport|null}
   */
  _transportForActor(actorName) {
    if (actorName && this._actors[actorName]?.transportName) {
      const t = this.transports[this._actors[actorName].transportName];
      if (t) return t;
    }
    return this.transports['default'] || Object.values(this.transports)[0] || null;
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
   * Set the CV table (from transpiler output).
   * Maps CV0, CV1... to their definitions.
   */
  setCVTable(cvTable) {
    this._cvTable = {};
    this._cvNames = {};
    if (cvTable) {
      for (const entry of cvTable) {
        this._cvTable[entry.id] = entry;
        this._cvNames[entry.name] = entry.id;
      }
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
        isCV: !!this._cvNames[t.token],
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
      const pri = (e) => e.isControl ? 0 : e.isCV ? 1 : 2;
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
        isCV: !!this._cvNames[e.token],
        isSilence: isRest && e.token === '-',
        isProlongation: isRest && e.token === '_',
        payload: e.payload ?? null,
        nature: e.nature,
        // E-016 sealed per-leaf runtime state, folded over controlState at send.
        rq: e.rq ?? null,
      };
    }).sort((a, b) => {
      if (a.startSec !== b.startSec) return a.startSec - b.startSec;
      const pri = (e) => e.isControl ? 0 : e.isCV ? 1 : 2;
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

  /**
   * Start playback.
   * @param {Function} [onEnd] - called when playback ends (non-loop) or on error
   * @param {Object} [options]
   * @param {boolean} [options.loop=false] - loop the sequence
   * @param {Function} [options.reDerive] - called at end of each cycle, must return timed tokens array
   */
  start(onEnd, { loop = false, reDerive = null } = {}) {
    if (this.events.length === 0) return;
    this._onEnd = onEnd;
    this._cursor = 0;
    this._running = true;
    this._loopOffset = 0;
    this.loop = loop;
    this._reDerive = reDerive;
    this.controlState = { ...this._controlDefaults };
    this._fluxByActor = {};

    // Wire beat/bar events → MapEngine
    this.clock.setOnBeat((beat, bar) => {
      this._mapEngine.routeFromSysEvent('beat', beat);
      this._mapEngine.routeFromSysEvent('bar', bar);
    });
    if (this._tempo) this.clock.tempo = this._tempo;

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    this.clock.start((scheduleUntil) => {
      this._schedule(scheduleUntil);
    });
  }

  stop() {
    this._running = false;
    this.loop = false;
    this.clock.stop();
    for (const transport of Object.values(this.transports)) {
      transport.close();
    }
  }

  /**
   * Hot-swap: replace the grammar for the next loop cycle.
   * In loop mode, the new reDerive function will be called at the next cycle boundary.
   * Outside loop mode, restarts with new tokens immediately.
   */
  hotSwap(timedTokens, reDerive) {
    if (this.loop && reDerive) {
      // Just swap the re-derive function — next cycle will use it
      this._reDerive = reDerive;
    } else {
      // Immediate swap: reload and reset cursor
      const currentTime = this.clock.now;
      this.load(timedTokens);
      this._loopOffset = currentTime;
    }
  }

  /** Internal: schedule events up to the given absolute audio time */
  _schedule(scheduleUntil) {
    while (this._cursor < this.events.length) {
      const evt = this.events[this._cursor];
      const absTime = this.clock.absTime(this._loopOffset + evt.startSec);

      if (absTime > scheduleUntil) break;

      if (evt.isControl) {
        // A tree-derived control carries its own marker payload / nature → route
        // it per-actor (`_applyControlNode`). A flat `load()` control token (no
        // payload) is the legacy `_xxx(value)` string form → `_applyControl`.
        if (evt.payload || evt.nature) {
          this._applyControlNode(evt, absTime);
        } else {
          this._applyControl(evt.token);
        }
      } else if (evt.isCV) {
        // CV token — create the audio bus before notes at this time
        const cvId = this._cvNames[evt.token];
        const cvDef = this._cvTable[cvId];
        if (cvDef) {
          const transport = this.transports[cvDef.transport]
            || this.transports['default']
            || Object.values(this.transports)[0];

          if (transport && transport.sendCV) {
            transport.sendCV({
              ...cvDef,
              durSec: evt.durSec > 0 ? evt.durSec : this.duration,
            }, absTime);
          }
        }
      } else if (!evt.isSilence && !evt.isProlongation && evt.durSec > 0) {
        // Backtick voice (lot 4): a `BT<interp><id>` terminal references foreign
        // code. Fire its interpreter sink at the scheduled time and DO NOT route
        // it to an audio/text transport (it isn't a note or a symbol). The sink
        // (injected by bp3.ts) looks up the code and evals it on the matching
        // adapter. NOTE: in loop mode a BT token re-fires every cycle, so the
        // engine is re-eval'd each loop — acceptable for the base increment.
        if (this._backtickSink && this._isBacktick && this._isBacktick(evt.token)) {
          this._backtickSink(evt.token, {
            startSec: this._loopOffset + evt.startSec,
            durSec: evt.durSec,
            absTime,
          });
          this._cursor++;
          continue;
        }

        // Scene terminal — launch child scene instead of routing to transport
        // Rule: parent always controls the envelope. Child @duration is ignored when nested.
        if (this._sceneManager && this._sceneManager.isSceneTerminal(evt.token)) {
          this._sceneManager.startScene(evt.token, absTime, evt.durSec, this.flagState);
          this._cursor++;
          continue;
        }

        // Unified payload routing: a note carrying its OWN `payload.actor` (off
        // the tree) routes by actor — distinct transports for a shared terminal,
        // per-actor flux + occurrence override (`_sendActorNote`). Checked FIRST
        // and routed UNCONDITIONALLY: the play-vs-skip predicate (`_soundsFn`) is
        // a MONO-actor BP3 concern (note-name OR sound assignment) and must NOT
        // gate a declared actor's notes — they sound through their actor's output.
        const actor = evt.payload?.actor ?? null;
        if (actor) {
          this._sendActorNote(evt, absTime);
          this._cursor++;
          continue;
        }

        // No-actor terminal (mono BP3): play-vs-skip. A token the predicate marks
        // MUTE is simply NOT PLAYED (no audio, no text transport — the symbolic
        // readout is a view of the production tree, not a routed output). Decided
        // per token, so a mixed grammar voices its sounding symbols and skips the rest.
        if (this._soundsFn && !this._soundsFn(evt.token)) {
          this._cursor++;
          continue;
        }

        // No-actor terminal: resolve the transport (null when muted → skipped).
        const transport = this._transportForTerminal(evt.token, null);

        if (transport) {
          // Fold the per-token runtime payload over the running controlState
          // (transpose stacks, vel/chan override). A sealed vel:0 mutes the
          // terminal — native silences it, so we emit nothing for this token.
          const eff = this._effectiveControls(evt.rq);
          if (eff.muted) {
            this._cursor++;
            continue;
          }

          // Symbolic pitch operations: keyxpand → rotate (degree) → transpose
          // (grid). A no-actor note uses the global resolver.
          let token = evt.token;
          const resolver = this._resolver || null;
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
            if (eff.transpose) {
              token = resolver.transposeToken(token, eff.transpose);
            }
          }

          transport.send({
            token,
            startSec: this._loopOffset + evt.startSec,
            durSec: evt.durSec,
            ...this.controlState,
            ...(eff.chan !== undefined ? { chan: eff.chan } : {}),
            velocity: eff.vel / 127,
          }, absTime);
        }
      }

      this._cursor++;
    }

    // End of sequence
    if (this._cursor >= this.events.length && this._running) {
      const cycleEnd = this.clock.absTime(this._loopOffset + this.duration);
      const remaining = (cycleEnd - this.audioCtx.currentTime) * 1000; // ms

      if (remaining <= this.clock.lookahead * 1000) {
        if (this.loop) {
          this._nextCycle();
        } else {
          // Schedule end callback after remaining time
          this.stop();
          const onEnd = this._onEnd;
          if (onEnd) {
            setTimeout(() => onEnd(), Math.max(0, remaining));
          }
        }
      }
    }
  }

  /** Start the next loop cycle */
  _nextCycle() {
    this._loopOffset += this.duration;
    this.controlState = { ...this._controlDefaults };
    this._fluxByActor = {};

    // Re-derive: call bp3_produce again for a new sequence
    if (this._reDerive) {
      const newTokens = this._reDerive();
      if (newTokens && newTokens.length > 0) {
        // Reload events without resetting loopOffset
        this.events = newTokens.map(t => {
          const evt = {
            token: t.token,
            startSec: t.start / 1000,
            durSec: Math.max(0, (t.end - t.start)) / 1000,
            isControl: t.token.startsWith('_'),
            isCV: !!this._cvNames[t.token],
            isSilence: t.token === '-',
            isProlongation: t.token === '_',
          };
          if (t.label) evt.label = t.label;
          if (t.runtimeQualifiers) evt.rq = t.runtimeQualifiers;
          return evt;
        }).sort((a, b) => {
          if (a.startSec !== b.startSec) return a.startSec - b.startSec;
          const pri = (e) => e.isControl ? 0 : e.isCV ? 1 : 2;
          return pri(a) - pri(b);
        });
      }
    }

    this._cursor = 0;
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

  /**
   * Resolve the effective controls for a terminal, folding a per-token
   * `runtimeQualifiers` payload over the running controlState. Mirrors BPx's
   * own MIDI emitter (`emit/midiEvents.ts`): a sealed payload overrides the
   * running state for that one token (velocity, channel) and stacks on the
   * grid transpose. A sealed `vel:0` means "muted" (native silences the note).
   *
   * @param {Object|null} rq - token.runtimeQualifiers (plain object or null)
   * @returns {{ transpose: number, vel: number, chan: number|undefined, muted: boolean }}
   */
  _effectiveControls(rq) {
    const cs = this.controlState;
    let transpose = cs.transpose || 0;
    let vel = cs.vel;
    let chan = cs.chan;
    if (rq) {
      if (typeof rq.transpose === 'number') transpose += rq.transpose;
      const pv = rq.vel ?? rq.velocity;
      if (typeof pv === 'number') vel = pv;
      if (typeof rq.chan === 'number') chan = rq.chan;
    }
    return { transpose, vel, chan, muted: vel === 0 };
  }

  /**
   * Apply a tree-derived control node (M5+ payload routing). The marker payload
   * is `{ role:'control-marker', payload:{ kind, nature, pairs:[{key,value}], flux? } }`
   * with a typed `evt.nature` ('transport-control' | 'instant' | 'engine-control').
   *
   * Routing rule (per the BPx contract):
   *  - 'engine-control': already applied by BPx on the notes → IGNORE (no double-apply).
   *  - 'instant': zero-duration, apply ONCE to the actor's flux (a one-shot tweak).
   *  - 'transport-control' / `flux === true`: update the actor's running flux,
   *    applied to that actor's SUBSEQUENT notes; also emit it to the actor's
   *    transport if it accepts control messages.
   * The flux state is PER ACTOR (`_fluxByActor[actor]`) — never global, so actor
   * A's vel change never bleeds onto actor B.
   *
   * @param {Object} evt - dispatch event (carries `.payload`, `.nature`, `.payload.actor`)
   * @param {number} absTime - absolute audio time
   */
  _applyControlNode(evt, absTime) {
    const nature = evt.nature ?? evt.payload?.payload?.nature;
    // BPx already applied engine controls onto the notes; re-applying would
    // double them. Drop silently.
    if (nature === 'engine-control') return;

    const actor = evt.payload?.actor;
    const inner = evt.payload?.payload;
    const pairs = Array.isArray(inner?.pairs) ? inner.pairs : null;
    if (!pairs || pairs.length === 0) return;

    // Per-actor flux: a control with no actor falls back to a shared bucket keyed
    // by the empty string (mono/legacy), so it still applies to actor-less notes.
    const key = actor ?? '';
    const flux = this._fluxByActor[key] || (this._fluxByActor[key] = {});
    for (const { key: k, value } of pairs) {
      const v = typeof value === 'string' ? parseFloat(value) : value;
      flux[k] = (typeof v === 'number' && !isNaN(v)) ? v : value;
    }

    // Emit the transport-control to the actor's transport when it can take a
    // control message (e.g. a MIDI CC channel pressure). 'instant' tweaks the
    // actor's flux only — there is nothing standing to emit.
    if (nature === 'transport-control') {
      const transport = this._transportForActor(actor);
      if (transport && typeof transport.sendControl === 'function') {
        transport.sendControl({ actor, pairs, ...flux }, absTime);
      }
    }
  }

  /**
   * Send a tree-derived note for a specific actor (M5+ payload routing). The
   * resolved params are: actor declaration defaults ⊕ the actor's running flux
   * ⊕ the occurrence override (`payload.params`) ⊕ the sealed per-token E-016
   * `runtimeQualifiers` (`evt.rq`, unchanged — left intact for note rendering).
   *
   * @param {Object} evt - dispatch event with `.payload.actor`
   * @param {number} absTime
   */
  _sendActorNote(evt, absTime) {
    const actor = evt.payload.actor;
    // Disarmed actor: skip its notes (live arm/disarm) — the transport and the
    // other actors keep playing untouched.
    if (this._mutedActors.has(actor)) return;
    const transport = this._transportForActor(actor);
    if (!transport) return;

    const actorDef = this._actors[actor]?.def || {};
    const declDefaults = actorDef.params || {};
    const transportParams = actorDef.transportParams || {};
    const flux = this._fluxByActor[actor] || {};
    const override = evt.payload.params || {};

    // actor declaration ⊕ flux ⊕ occurrence override (last wins)
    const params = { ...declDefaults, ...flux, ...override };

    // E-016 (unchanged): the sealed per-token runtimeQualifiers still fold over
    // controlState for vel/transpose/chan. We keep that exact path for notes.
    const eff = this._effectiveControls(evt.rq);
    if (eff.muted) return;

    // Symbolic pitch ops via the actor's resolver: keyxpand → rotate → transpose.
    let token = evt.token;
    const resolver = this._actors[actor]?.resolver || this._resolver || null;
    if (resolver) {
      if (this.controlState.keyxpand && this.controlState.keyxpand !== '0,1') {
        const kp = String(this.controlState.keyxpand).split(',');
        const pivot = kp[0]?.trim();
        const factor = parseFloat(kp[1]);
        if (pivot && !isNaN(factor)) token = resolver.keyxpandToken(token, pivot, factor);
      }
      if (this.controlState.rotate) token = resolver.rotateToken(token, this.controlState.rotate);
      if (eff.transpose) token = resolver.transposeToken(token, eff.transpose);
    }

    // velocity: occurrence/flux vel wins, else the E-016 sealed vel.
    const velRaw = (typeof params.vel === 'number') ? params.vel : eff.vel;

    transport.send({
      token,
      startSec: this._loopOffset + evt.startSec,
      durSec: evt.durSec,
      ...this.controlState,
      ...params,
      ...(eff.chan !== undefined ? { chan: eff.chan } : {}),
      ...transportParams,  // actor transport params (e.g. ch:10) override
      velocity: (transportParams.vel ?? velRaw) / 127,
    }, absTime);
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

    // Route control changes through MapEngine (flag → CC/OSC/sys)
    this._mapEngine.routeFromFlag(name, isNaN(v) ? 0 : v);

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

  // ============ I/O Mapping (@map) ============

  /**
   * Set the I/O mapping table from @map directives.
   * @param {Array} mapTable - [{ source, arrow, target }]
   */
  setMapTable(mapTable) {
    this._mapEngine.load(mapTable);
  }

  /**
   * Set the MIDI input port for receiving CC messages.
   * @param {MIDIInput} midiInput
   */
  setMidiInput(midiInput) {
    this._mapEngine.setMidiInput(midiInput);
  }

  /**
   * Route an incoming OSC message through the map engine.
   * Called by an external WebSocket/OSC bridge.
   * @param {string} address - OSC address
   * @param {number} value
   */
  routeOSC(address, value) {
    this._mapEngine.routeFromOSC(address, value);
  }

  // ============ Flag State (BP3 K-parameters) ============

  /**
   * Sync flag state from BP3 after a produce() call.
   * Reads bp3_get_flag_state() JSON and updates this.flagState.
   * @param {string} flagStateJSON - JSON from bp3_get_flag_state()
   */
  syncFlagState(flagStateJSON) {
    try {
      const data = typeof flagStateJSON === 'string'
        ? JSON.parse(flagStateJSON)
        : flagStateJSON;

      if (data.names && data.flags) {
        const prev = { ...this.flagState };
        this._flagNames = data.names;
        this.flagState = {};
        for (let i = 0; i < data.names.length; i++) {
          const name = data.names[i];
          const value = data.flags[i] ?? 0;
          this.flagState[name] = value;

          // Route changed flags through MapEngine
          if (prev[name] !== value) {
            this._mapEngine.routeFromFlag(name, value);
          }
        }
      }
    } catch (e) {
      console.warn('[dispatcher] syncFlagState parse error:', e.message);
    }
  }

  /**
   * Set a flag value (from MapEngine or external source).
   * Updates flagState and routes through map entries.
   * @param {string} name - flag name
   * @param {number} value
   */
  _setFlag(name, value) {
    const prev = this.flagState[name];
    this.flagState[name] = value;
    // Write to BP3 engine so next derivation sees the change
    if (this._bp3SetFlag) {
      this._bp3SetFlag(name, value);
    }
    if (prev !== value) {
      this._mapEngine.routeFromFlag(name, value);
    }
  }

  /**
   * Emit a trigger event (fire-and-forget, traverses hierarchy).
   * Triggers propagate: parent ↔ children, but NOT between siblings.
   * @param {string} name - trigger name
   * @param {number} [value=127]
   */
  _emitTrigger(name, value = 127) {
    // Dispatch globally (external listeners, UI)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bpscript-trigger', {
        detail: { name, value }
      }));
    }
    // Route through MapEngine (trigger → CC/OSC/sys)
    this._mapEngine.routeFromTrigger(name, value);

    // Propagate to child scenes (parent → children)
    for (const scene of Object.values(this._sceneInstances)) {
      if (scene.dispatcher) {
        scene.dispatcher._emitTrigger(name, value);
      }
    }
  }

  /**
   * Poll exposed flags from child scenes.
   * Called periodically or after child produce to sync parent's view of child state.
   * Maps exposed child flags through parent's mapTable.
   */
  pollExposedFlags() {
    if (!this._sceneManager) return;

    for (const name of this._sceneManager.getSceneNames()) {
      const exposed = this._sceneManager.getExposedFlags(name);
      for (const [flagName, value] of Object.entries(exposed)) {
        // Route as scoped flag: sceneName.flagName
        this._mapEngine.routeFromFlag(`${name}.${flagName}`, value);
      }
    }
  }

  // ============ sys commands ============

  /**
   * Execute a sys command (play, stop, tempo, etc.).
   * @param {string|null} scene - target scene name, null = this dispatcher
   * @param {string} command - sys command name
   * @param {*} [value] - optional value (e.g. tempo BPM)
   */
  execSysCommand(scene, command, value) {
    // Scoped to a child scene
    if (scene && this._sceneInstances[scene]) {
      const child = this._sceneInstances[scene];
      if (child.dispatcher) {
        child.dispatcher.execSysCommand(null, command, value);
      }
      return;
    }

    switch (command) {
      case 'play':
        if (!this._running) this.start(this._onEnd, { loop: this.loop, reDerive: this._reDerive });
        break;
      case 'stop':
        this.stop();
        break;
      case 'pause':
        if (this._running) this.stop();
        else this.start(this._onEnd, { loop: this.loop, reDerive: this._reDerive });
        break;
      case 'loop':
        this.loop = !this.loop;
        break;
      case 'tempo':
        // Value is BPM — update clock and store
        if (value > 0) {
          this._tempo = value;
          this.clock.tempo = value;
        }
        break;
      case 'produce':
        if (this._reDerive) {
          const newTokens = this._reDerive();
          if (newTokens) this.load(newTokens);
        }
        break;
      case 'panic':
        this.stop();
        for (const transport of Object.values(this.transports)) {
          transport.close();
        }
        break;
      default:
        console.warn(`[dispatcher] unknown sys command: ${command}`);
    }
  }

  /**
   * Register a child scene instance (called by SceneManager).
   * @param {string} name - scene terminal name
   * @param {Object} instance - { dispatcher, flagState, exposeTable }
   */
  registerScene(name, instance) {
    this._sceneInstances[name] = instance;
  }

  /**
   * Set the scene manager for multi-scene support.
   * @param {SceneManager} sceneManager
   */
  setSceneManager(sceneManager) {
    this._sceneManager = sceneManager;
  }

  // ============ Output helpers ============

  /**
   * Emit a CC message via the MIDI output.
   * @param {number} cc - CC number
   * @param {number} value - 0-127
   */
  _emitCC(cc, value) {
    const midi = this.transports['midi'];
    if (midi?.sendCC) {
      const channel = (this.controlState.chan || 1) - 1;
      midi.sendCC(cc, Math.max(0, Math.min(127, Math.round(value))), channel);
    }
  }

  /**
   * Emit an OSC message via CustomEvent.
   * A future WebSocket bridge can listen for these.
   */
  _emitOSC(address, value) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bpscript-osc', {
        detail: { address, value }
      }));
    }
  }
}
