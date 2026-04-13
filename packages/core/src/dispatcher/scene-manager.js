/**
 * SceneManager — Multi-instance BP3 orchestrator
 *
 * For each @scene directive, compiles the child .bps file,
 * creates a BP3 WASM instance, and manages the lifecycle.
 * Scene terminals in the parent grammar trigger child playback.
 *
 * Each scene has its own:
 *   - BP3 WASM instance
 *   - Dispatcher (with controlState, flagState)
 *   - Timed tokens
 *   - ExposeTable (flags visible to parent)
 */

export class SceneManager {
  /**
   * @param {Object} options
   * @param {Function} options.compileBPS - (source) => compiledResult
   * @param {Function} options.readFile - (path) => string (file content)
   * @param {Function} options.createWASMInstance - () => { module, api } (BP3 WASM factory)
   * @param {Function} options.createDispatcher - (audioCtx) => Dispatcher
   * @param {AudioContext} options.audioCtx
   */
  constructor({ compileBPS, readFile, createWASMInstance, createDispatcher, audioCtx }) {
    this._compileBPS = compileBPS;
    this._readFile = readFile;
    this._createWASMInstance = createWASMInstance;
    this._createDispatcher = createDispatcher;
    this._audioCtx = audioCtx;

    this._scenes = {};       // sceneName → SceneInstance
    this._parentDispatcher = null;
  }

  /**
   * Set the parent dispatcher that owns these scenes.
   * @param {Dispatcher} dispatcher
   */
  setParent(dispatcher) {
    this._parentDispatcher = dispatcher;
  }

  /**
   * Load scenes from sceneTable (transpiler output).
   * Compiles each child scene and prepares instances.
   * @param {Object} sceneTable - { sceneName: { file: "path" } }
   * @param {string} [basePath] - base directory for resolving relative paths
   * @returns {Object} sceneSummary - { sceneName: { compiled, errors } }
   */
  async load(sceneTable, basePath = '') {
    const summary = {};
    const sceneNames = Object.keys(sceneTable || {});

    for (const name of sceneNames) {
      const entry = sceneTable[name];
      const filePath = basePath ? `${basePath}/${entry.file}` : entry.file;

      try {
        const source = await this._readFile(filePath);
        const compiled = this._compileBPS(source);

        if (compiled.errors?.length > 0) {
          summary[name] = { compiled, errors: compiled.errors };
          console.warn(`[scene-manager] ${name}: compilation errors`, compiled.errors);
          continue;
        }

        // Extract @duration metadata from compiled directives
        const durationDir = (compiled.directives || []).find(d => d.name === 'duration');
        const durationMeta = durationDir ? durationDir.value : null;

        // Create scene instance
        const instance = {
          name,
          file: filePath,
          compiled,
          duration: durationMeta, // { amount, unit } or null
          dispatcher: null,      // created on first play
          wasmInstance: null,     // created on first play
          flagState: {},
          exposeTable: compiled.exposeTable || [],
          sceneTable: compiled.sceneTable || {},
          controlState: {},
          running: false,
        };

        this._scenes[name] = instance;

        // Register with parent dispatcher
        if (this._parentDispatcher) {
          this._parentDispatcher.registerScene(name, instance);
        }

        // Recursive: if child has its own @scene directives, create a nested SceneManager
        if (Object.keys(instance.sceneTable).length > 0) {
          instance.childManager = new SceneManager({
            compileBPS: this._compileBPS,
            readFile: this._readFile,
            createWASMInstance: this._createWASMInstance,
            createDispatcher: this._createDispatcher,
            audioCtx: this._audioCtx,
          });
        }

        summary[name] = { compiled, errors: [] };
      } catch (e) {
        summary[name] = { compiled: null, errors: [{ message: e.message }] };
        console.error(`[scene-manager] ${name}: load failed`, e);
      }
    }

    return summary;
  }

  /**
   * Start a scene by name. Creates WASM instance + dispatcher on demand.
   * @param {string} name - scene terminal name
   * @param {number} [startTime] - absolute audio time to start at
   * @param {number} [duration] - scene duration in seconds (from parent timing)
   * @param {Object} [parentFlags] - inherited flags from parent (read-only copy)
   */
  async startScene(name, startTime, duration, parentFlags = {}) {
    const scene = this._scenes[name];
    if (!scene) {
      console.warn(`[scene-manager] unknown scene: ${name}`);
      return;
    }

    // Lazy init: create WASM instance and dispatcher on first play
    if (!scene.wasmInstance) {
      scene.wasmInstance = await this._createWASMInstance();
    }
    if (!scene.dispatcher) {
      scene.dispatcher = this._createDispatcher(this._audioCtx);
    }

    const { compiled, dispatcher, wasmInstance } = scene;
    const api = wasmInstance.api;

    // Load grammar into this scene's WASM instance
    api.bp3_init();
    if (compiled.alphabetFile) api.bp3_load_alphabet(compiled.alphabetFile);
    api.bp3_load_grammar(compiled.grammar);
    api.bp3_produce();

    // Get timed tokens
    let timedTokens = null;
    try {
      timedTokens = JSON.parse(api.bp3_get_timed_tokens());
    } catch (e) {
      console.warn(`[scene-manager] ${name}: token parse error`, e);
      return;
    }

    // Setup dispatcher for this scene
    if (compiled.controlTable) dispatcher.setControlTable(compiled.controlTable);
    if (compiled.cvTable) dispatcher.setCVTable(compiled.cvTable);
    if (compiled.mapTable?.length) dispatcher.setMapTable(compiled.mapTable);

    // Inherit parent flags (read-only copy as initial flagState)
    scene.flagState = { ...parentFlags };
    dispatcher.flagState = { ...parentFlags };

    // Sync BP3 flags from this scene's production
    try {
      dispatcher.syncFlagState(api.bp3_get_flag_state());
    } catch (e) { /* ignore */ }

    // Load timed tokens with @duration scaling if declared
    dispatcher.load(timedTokens, { duration: scene.duration || undefined });
    scene.running = true;

    dispatcher.start(
      () => { scene.running = false; },
      { loop: false, reDerive: () => {
        api.bp3_produce();
        try { return JSON.parse(api.bp3_get_timed_tokens()); }
        catch { return null; }
      }}
    );
  }

  /**
   * Stop a scene by name.
   * @param {string} name
   */
  stopScene(name) {
    const scene = this._scenes[name];
    if (scene?.dispatcher) {
      scene.dispatcher.stop();
      scene.running = false;
    }
  }

  /**
   * Stop all scenes.
   */
  stopAll() {
    for (const name of Object.keys(this._scenes)) {
      this.stopScene(name);
    }
  }

  /**
   * Get the declared @duration of a scene in seconds, or null if not declared.
   * @param {string} name - scene name
   * @param {number} [tempo=60] - current tempo for beat→seconds conversion
   * @returns {number|null} - duration in seconds, or null
   */
  getSceneDuration(name, tempo = 60) {
    const scene = this._scenes[name];
    if (!scene?.duration) return null;

    if (scene.duration.unit === 'b') {
      return scene.duration.amount * 60 / (tempo || 60);
    }
    return scene.duration.amount;
  }

  /**
   * Get exposed flags from a child scene (for parent observation).
   * Only returns flags listed in the scene's exposeTable.
   * @param {string} name - scene name
   * @returns {Object} - { flagName: value } (only exposed flags)
   */
  getExposedFlags(name) {
    const scene = this._scenes[name];
    if (!scene) return {};

    const exposed = {};
    for (const flagName of scene.exposeTable) {
      if (flagName in scene.flagState) {
        exposed[flagName] = scene.flagState[flagName];
      }
      // Also check dispatcher's flagState (synced from BP3)
      if (scene.dispatcher && flagName in scene.dispatcher.flagState) {
        exposed[flagName] = scene.dispatcher.flagState[flagName];
      }
    }
    return exposed;
  }

  /**
   * Get all scene names.
   * @returns {string[]}
   */
  getSceneNames() {
    return Object.keys(this._scenes);
  }

  /**
   * Check if a token is a scene terminal.
   * @param {string} token
   * @returns {boolean}
   */
  isSceneTerminal(token) {
    return token in this._scenes;
  }
}
