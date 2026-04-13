/**
 * Python REPL Eval Transport
 *
 * Sends Python code strings via WebSocket to a Python REPL bridge.
 */

export class PythonEval {
  /**
   * @param {Object} [options]
   * @param {string} [options.url='ws://localhost:9002'] - WebSocket URL to Python bridge
   */
  constructor({ url = 'ws://localhost:9002' } = {}) {
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
   * Send Python code for evaluation.
   * @param {Object} event - { code, tag:'py' }
   * @param {number} absTime - scheduling time
   */
  send(event, absTime) {
    if (!this._ready || !this._ws) return;
    this._ws.send(JSON.stringify({
      type: 'eval',
      lang: 'python',
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
