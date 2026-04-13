/**
 * MapEngine — Reactive I/O binding engine for @map directives
 *
 * Takes the mapTable from the transpiler and creates reactive bindings
 * between MIDI CC, OSC, flags, triggers, and sys commands.
 *
 * Endpoint kinds: cc, osc, flag, trigger, sys, scoped, alias
 * Arrow types: -> (source to target), <- (target to source), <-> (bidirectional)
 */

export class MapEngine {
  /**
   * @param {Object} options
   * @param {Function} options.getFlagState - () => flagState object (read)
   * @param {Function} options.setFlag - (name, value) => void (write flag)
   * @param {Function} options.execSys - (scene, command, value) => void
   * @param {Function} options.emitTrigger - (name, value) => void
   * @param {Function} options.emitCC - (cc, value, channel) => void
   * @param {Function} options.emitOSC - (address, value) => void
   */
  constructor({ getFlagState, setFlag, execSys, emitTrigger, emitCC, emitOSC }) {
    this._getFlagState = getFlagState;
    this._setFlag = setFlag;
    this._execSys = execSys;
    this._emitTrigger = emitTrigger;
    this._emitCC = emitCC;
    this._emitOSC = emitOSC;

    this._entries = [];       // resolved map entries
    this._aliases = {};       // alias name → resolved endpoint
    this._prevFlags = {};     // snapshot for change detection
    this._midiInput = null;
    this._oscHandlers = [];   // registered OSC listeners
    this._onPropertyChange = null; // callback for label.prop changes
  }

  /**
   * Load alias table from transpiler output.
   * Aliases map a name to a resolved endpoint (e.g. breath → { kind: 'cc', number: 2 }).
   * @param {Array} aliasTable - [{ name, source }]
   */
  loadAliases(aliasTable) {
    this._aliases = {};
    for (const alias of (aliasTable || [])) {
      this._aliases[alias.name] = alias.source;
    }
  }

  /**
   * Load map entries from transpiler output.
   * Expands bidirectional (<->) into two unidirectional entries.
   * Pre-resolves alias endpoints to their real kind.
   * @param {Array} mapTable - [{ source, arrow, target }]
   */
  load(mapTable) {
    this._entries = [];
    for (const entry of (mapTable || [])) {
      const source = this._resolveAlias(entry.source);
      const target = this._resolveAlias(entry.target);
      if (entry.arrow === '->') {
        this._entries.push({ source, target });
      } else if (entry.arrow === '<-') {
        this._entries.push({ source: target, target: source });
      } else if (entry.arrow === '<->') {
        this._entries.push({ source, target });
        this._entries.push({ source: target, target: source });
      }
    }
  }

  /**
   * Resolve an alias endpoint to its real endpoint.
   * If the endpoint is kind:'alias', replace with the aliased source.
   * Preserves params from the original endpoint.
   * @param {Object} endpoint
   * @returns {Object} resolved endpoint
   */
  _resolveAlias(endpoint) {
    if (endpoint.kind === 'alias' && this._aliases[endpoint.name]) {
      return { ...this._aliases[endpoint.name], params: endpoint.params || null };
    }
    return endpoint;
  }

  /**
   * Wire MIDI input port for CC listening.
   * @param {MIDIInput} midiInput
   */
  setMidiInput(midiInput) {
    if (this._midiInput) this._midiInput.onmidimessage = null;
    this._midiInput = midiInput;
    if (midiInput) {
      midiInput.onmidimessage = (msg) => this._onMidiMessage(msg);
    }
  }

  /**
   * Handle incoming MIDI message — route through matching map entries.
   */
  _onMidiMessage(msg) {
    const [status, data1, data2] = msg.data;
    const type = status & 0xF0;

    // CC message
    if (type === 0xB0) {
      this._routeFromCC(data1, data2);
    }
  }

  /**
   * Route a CC input value through all matching entries.
   * @param {number} ccNum - CC number
   * @param {number} rawValue - 0-127
   */
  _routeFromCC(ccNum, rawValue) {
    for (const entry of this._entries) {
      if (entry.source.kind !== 'cc' || entry.source.number !== ccNum) continue;

      const value = this._scaleValue(rawValue, entry.source.params);
      if (value === null) continue; // threshold not met

      this._writeTarget(entry.target, value);
    }
  }

  /**
   * Route an OSC input value through matching entries.
   * Called by external OSC bridge (WebSocket listener).
   * @param {string} address - OSC address
   * @param {number} value
   */
  routeFromOSC(address, value) {
    for (const entry of this._entries) {
      if (entry.source.kind !== 'osc' || entry.source.address !== address) continue;

      const scaled = this._scaleValue(value, entry.source.params);
      if (scaled === null) continue;

      this._writeTarget(entry.target, scaled);
    }
  }

  /**
   * Called when a flag changes — route through matching entries.
   * The dispatcher calls this after _setControl or flagState update.
   * @param {string} name - flag name
   * @param {number|string} value
   */
  routeFromFlag(name, value) {
    for (const entry of this._entries) {
      if (entry.source.kind !== 'flag' || entry.source.name !== name) continue;

      const numVal = typeof value === 'number' ? value : parseFloat(value) || 0;
      this._writeTarget(entry.target, numVal);
    }
  }

  /**
   * Called when a trigger fires — route through matching entries.
   * @param {string} name - trigger name
   * @param {number} [value=127]
   */
  routeFromTrigger(name, value = 127) {
    for (const entry of this._entries) {
      if (entry.source.kind !== 'trigger' || entry.source.name !== name) continue;
      this._writeTarget(entry.target, value);
    }
  }

  /**
   * Called by clock on each beat/bar — route sys.beat/sys.bar sources.
   * @param {string} event - 'beat' or 'bar'
   * @param {number} count - beat/bar count
   */
  routeFromSysEvent(event, count) {
    for (const entry of this._entries) {
      if (entry.source.kind !== 'sys') continue;
      if (entry.source.command !== event) continue;
      this._writeTarget(entry.target, count);
    }
  }

  // ---- Internal ----

  /**
   * Scale a 0-127 raw value using endpoint params (min, max, threshold).
   * @returns {number|null} - null if threshold not met
   */
  _scaleValue(rawValue, params) {
    if (!params) return rawValue;

    // Threshold gate
    if (params.threshold != null && rawValue < params.threshold) return null;

    // Scale 0-127 to min..max
    if (params.min != null && params.max != null) {
      const scaled = params.min + (rawValue / 127) * (params.max - params.min);
      return Math.round(scaled * 100) / 100;
    }

    return rawValue;
  }

  /**
   * Write a value to a target endpoint.
   */
  /**
   * Register a callback for structural changes (flag, proportion, control).
   * Called on every _writeTarget — UI can refresh panels/timeline.
   * @param {Function} callback - (target, value) => void
   */
  setOnStructuralChange(callback) {
    this._onStructuralChange = callback;
  }

  /**
   * Register callback for label property changes (CC → label.prop).
   * Called when a @map targets a label property (e.g. kick.ratio).
   * @param {Function} callback - (label, prop, value) => void
   */
  setOnPropertyChange(callback) {
    this._onPropertyChange = callback;
  }

  _writeTarget(target, value) {
    switch (target.kind) {
      case 'flag':
        this._setFlag(target.name, value);
        break;

      case 'trigger':
        this._emitTrigger(target.name, value);
        break;

      case 'sys':
        this._execSys(target.scene || null, target.command, value);
        break;

      case 'cc':
        this._emitCC(target.number, Math.max(0, Math.min(127, Math.round(value))), 0);
        break;

      case 'osc':
        this._emitOSC(target.address, value);
        break;

      case 'property':
        // target = { kind: 'property', label: 'kick', prop: 'ratio' }
        if (this._onPropertyChange) {
          this._onPropertyChange(target.label, target.prop, value);
        }
        break;
    }

    // Notify UI of any structural change
    if (this._onStructuralChange) {
      this._onStructuralChange(target, value);
    }
  }

  /**
   * Dispose: remove MIDI listener.
   */
  dispose() {
    if (this._midiInput) {
      this._midiInput.onmidimessage = null;
      this._midiInput = null;
    }
    this._entries = [];
  }
}
