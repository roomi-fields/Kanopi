/**
 * SuperCollider (sclang) Eval Transport
 *
 * Sends code strings to sclang via WebSocket.
 * Requires a running sclang with a WebSocket listener,
 * or the OSC bridge (src/bridge/osc-bridge.js).
 */

export class SclangEval {
  /**
   * @param {Object} [options]
   * @param {string} [options.url='ws://localhost:9001'] - WebSocket URL to sclang bridge
   */
  constructor({ url = 'ws://localhost:9001' } = {}) {
    this._url = url;
    this._ws = null;
    this._ready = false;
  }

  async init() {
    return new Promise((resolve) => {
      try {
        this._ws = new WebSocket(this._url);
        this._ws.onopen = () => { this._ready = true; resolve(true); };
        this._ws.onerror = () => resolve(false);
        this._ws.onclose = () => { this._ready = false; };
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Send SC code for evaluation.
   * @param {Object} event - { code, tag:'sc' }
   * @param {number} absTime - scheduling time (for future use)
   */
  send(event, absTime) {
    if (!this._ready || !this._ws) return;
    this._ws.send(JSON.stringify({
      type: 'eval',
      lang: 'sclang',
      code: event.code,
      time: absTime
    }));
  }

  close() {
    if (this._ws) {
      try { this._ws.close(); } catch {}
      this._ws = null;
      this._ready = false;
    }
  }
}
