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

    // Transport routing: symbol name → transport name (e.g. 'Sa' → 'midi')
    this._transportMap = {};  // set via setTransportMap()

    // Actor system: per-actor resolver and transport
    this._actors = {};              // actorName → { resolver, transportName, transport }
    this._terminalActorMap = {};    // terminal → actorName

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
   * Set transport routing map: symbol → transport name.
   * Symbols not in the map use the 'default' transport.
   * @param {Object} map - { 'Sa': 'midi', 'Re': 'midi', ... }
   */
  setTransportMap(map) {
    this._transportMap = map || {};
  }

  /**
   * Set actor system: terminal → actor mapping + actor definitions.
   * Each actor can have its own resolver and transport.
   * @param {Object} actorTable - { actorName → { alphabet, transport, ... } }
   * @param {Object} terminalActorMap - { terminal → actorName }
   */
  setActors(actorTable, terminalActorMap) {
    this._terminalActorMap = terminalActorMap || {};
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
   * Get the resolver for a given token (actor-specific or global fallback).
   * @param {string} token
   * @returns {Resolver|null}
   */
  _resolverForToken(token) {
    const actorName = this._terminalActorMap[token];
    if (actorName && this._actors[actorName]?.resolver) {
      return this._actors[actorName].resolver;
    }
    return this._resolver || null;
  }

  /**
   * Get the transport for a given token (actor-specific or global fallback).
   * @param {string} token
   * @returns {Transport|null}
   */
  _transportForToken(token) {
    const actorName = this._terminalActorMap[token];
    if (actorName && this._actors[actorName]?.transportName) {
      const t = this.transports[this._actors[actorName].transportName];
      if (t) return t;
    }
    // Global fallback: transportMap → 'default' → first available
    const mappedName = this._transportMap[token];
    return (mappedName && this.transports[mappedName])
      || this.transports['default']
      || Object.values(this.transports)[0]
      || null;
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
        this._applyControl(evt.token);
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
        // Scene terminal — launch child scene instead of routing to transport
        // Rule: parent always controls the envelope. Child @duration is ignored when nested.
        if (this._sceneManager && this._sceneManager.isSceneTerminal(evt.token)) {
          this._sceneManager.startScene(evt.token, absTime, evt.durSec, this.flagState);
          this._cursor++;
          continue;
        }

        // Pre-compiled child scene — schedule ALL its tokens at once
        // Rule: parent always controls the envelope. Child @duration is ignored.
        if (this._childScenes && this._childScenes[evt.token]) {
          const child = this._childScenes[evt.token];
          const childNaturalMs = child.duration || 1;
          const childTargetSec = evt.durSec; // parent decides

          for (const ct of child.tokens) {
            if (ct.token.startsWith('_') || ct.token === '-' || ct.token === '_') continue;
            if (ct.end <= ct.start) continue;
            // Proportional rescale
            const cStartRel = ct.start / childNaturalMs;
            const cDurRel = (ct.end - ct.start) / childNaturalMs;
            const cAbsTime = absTime + cStartRel * childTargetSec;
            const cDur = cDurRel * childTargetSec;
            const transport = this._transportForToken(ct.token);
            if (transport) {
              transport.send({
                token: ct.token,
                startSec: this._loopOffset + evt.startSec + cStartRel * childTargetSec,
                durSec: cDur,
                ...this.controlState,
                velocity: this.controlState.vel / 127,
              }, cAbsTime);
            }
          }
          this._cursor++;
          continue;
        }

        // Route to transport: actor-specific → transportMap → 'default'
        const transport = this._transportForToken(evt.token);

        if (transport) {
          // Symbolic pitch operations: keyxpand → rotate (degree) → transpose (grid)
          let token = evt.token;
          const resolver = this._resolverForToken(evt.token);
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
          // Actor transport params (e.g. ch:10 from @actor drums ... transport:midi(ch:10))
          const actorName = this._terminalActorMap[token] || this._terminalActorMap[evt.token];
          const actorParams = actorName && this._actors[actorName]?.def?.transportParams || {};

          transport.send({
            token,
            startSec: this._loopOffset + evt.startSec,
            durSec: evt.durSec,
            ...this.controlState,
            ...actorParams,  // actor params override controlState (e.g. chan from ch:10)
            velocity: (actorParams.vel ?? this.controlState.vel) / 127,
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

      // Symbolic pitch operations: keyxpand → rotate → transpose
      let token = evt.token;
      const resolver = this._resolverForToken(evt.token);
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
