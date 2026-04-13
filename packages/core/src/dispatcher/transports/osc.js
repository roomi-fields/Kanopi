/**
 * OSC Transport (via WebSocket bridge)
 *
 * Sends OSC messages through a WebSocket connection to a bridge server
 * that converts WebSocket messages to UDP OSC packets.
 * See src/bridge/osc-bridge.js for the bridge server.
 */

export class OscTransport {
  /**
   * @param {Object} [options]
   * @param {string} [options.url='ws://localhost:9000'] - WebSocket bridge URL
   * @param {string} [options.address='/bpscript/note'] - OSC address pattern
   */
  constructor({ url = 'ws://localhost:9000', address = '/bpscript/note' } = {}) {
    this._url = url;
    this._address = address;
    this._ws = null;
    this._ready = false;
    this._queue = [];
  }

  /**
   * Connect to the OSC bridge.
   * @returns {Promise<boolean>}
   */
  async init() {
    return new Promise((resolve) => {
      try {
        this._ws = new WebSocket(this._url);
        this._ws.onopen = () => {
          this._ready = true;
          // Flush queued messages
          for (const msg of this._queue) this._ws.send(msg);
          this._queue = [];
          resolve(true);
        };
        this._ws.onerror = () => resolve(false);
        this._ws.onclose = () => { this._ready = false; };
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Send a note event as OSC message.
   * Format: JSON { address, args: [note, velocity, duration, channel], time }
   *
   * @param {Object} event - { note, velocity, durSec, channel }
   * @param {number} absTime - absolute audio time
   */
  send(event, absTime) {
    const msg = JSON.stringify({
      address: this._address,
      args: [event.note, Math.round(event.velocity * 127), event.durSec, event.channel || 0],
      time: absTime
    });

    if (this._ready && this._ws) {
      this._ws.send(msg);
    } else {
      this._queue.push(msg);
    }
  }

  close() {
    if (this._ws) {
      try { this._ws.close(); } catch {}
      this._ws = null;
      this._ready = false;
    }
    this._queue = [];
  }
}
