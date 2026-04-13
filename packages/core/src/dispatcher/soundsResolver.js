/**
 * SoundsResolver — resolves terminal names to synthesis parameters.
 *
 * Reads a sounds JSON definition (templates + by_terminal mapping)
 * and returns a parameter dictionary for each terminal.
 *
 * Modes (inferred from data):
 *   - by_terminal: direct lookup per terminal name
 *   - templates: reusable components, composed via "layers"
 *   - defaults: base values applied to all terminals
 */

export class SoundsResolver {
  /**
   * @param {Object} soundsData - parsed sounds JSON
   * @param {Object} [soundsData.defaults] - base params for all terminals
   * @param {Object} [soundsData.templates] - named template components
   * @param {Object} [soundsData.by_terminal] - terminal → params or layers
   */
  constructor(soundsData) {
    this.defaults = soundsData.defaults || {};
    this.templates = soundsData.templates || {};
    this.byTerminal = soundsData.by_terminal || {};
  }

  /**
   * Resolve a terminal name to synthesis parameters.
   * @param {string} token - terminal name (e.g. "dhin", "ka", "tirakita")
   * @returns {Object|null} parameter dictionary or null if not found
   */
  resolve(token) {
    const entry = this.byTerminal[token];
    if (!entry) return null;

    if (entry.layers) {
      // Template composition: resolve each layer
      const layers = entry.layers.map(name => {
        const tmpl = { ...this.defaults, ...(this.templates[name] || {}) };
        return entry.override ? { ...tmpl, ...entry.override } : tmpl;
      });
      return { layers };
    }

    // Direct params (no layers)
    return { ...this.defaults, ...entry };
  }
}
