/**
 * TextTransport — symbolic output for text-mode grammars.
 *
 * Half the BP3 corpus is *text* (bols, words, numbers): grammars whose
 * terminals are symbols to read, not pitches to sound. The routing decision
 * (decisions/2026-06-14-routage-texte-midi.md) routes a whole text grammar to
 * this transport instead of WebAudio/MIDI. It carries no audio — it records
 * each terminal as a timestamped symbol and forwards it to a sink, so the UI
 * can render a console/timeline of what the grammar emits, in time.
 *
 * Same shape as the audio transports (send/close): the dispatcher does not
 * know or care which transport a token lands on.
 */
export class TextTransport {
  /**
   * @param {Object} [opts]
   * @param {(symbol: { token: string, startSec: number, durSec: number, velocity: number|undefined, absTime: number }) => void} [opts.onSymbol]
   *   Called once per emitted terminal. The UI layer wires this to its store;
   *   core stays framework-agnostic.
   */
  constructor({ onSymbol = null } = {}) {
    this._onSymbol = onSymbol;
    // Kept so a headless caller (test, probe) can read the stream without a sink.
    this.symbols = [];
  }

  /**
   * @param {Object} event - { token, startSec, durSec, velocity, ... }
   * @param {number} absTime - absolute audio-clock time the symbol fires at
   */
  send(event, absTime) {
    const symbol = {
      token: event.token,
      startSec: event.startSec,
      durSec: event.durSec,
      velocity: event.velocity,
      absTime,
    };
    this.symbols.push(symbol);
    if (this._onSymbol) this._onSymbol(symbol);
  }

  /** No resources to release; history is left intact for inspection. */
  close() {}
}
