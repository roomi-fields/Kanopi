// Live stream of symbols emitted by text-mode grammars (bols, words, numbers).
// The bp3 adapter wires a TextTransport's `onSymbol` callback into `push`; the
// TextStreamPanel renders `symbols`. Capped so a looping grammar can't grow it
// without bound — newest symbols win.

export interface TextSymbol {
  /** the terminal as written in the grammar (e.g. "dha", "tigida", "7") */
  token: string;
  /** onset relative to the grammar's cycle, in seconds */
  startSec: number;
  /** duration in seconds */
  durSec: number;
  /** wall-clock arrival order (monotonic), used as a stable key */
  seq: number;
}

const MAX = 240;

class TextStreamStore {
  symbols = $state<TextSymbol[]>([]);
  private _seq = 0;

  /** the runtime that last fed the stream — shown as the panel's source label */
  source = $state<string | null>(null);

  push(s: { token: string; startSec: number; durSec: number }) {
    const entry: TextSymbol = { ...s, seq: this._seq++ };
    const next = this.symbols.length >= MAX ? this.symbols.slice(1) : this.symbols.slice();
    next.push(entry);
    this.symbols = next;
  }

  setSource(runtime: string | null) {
    this.source = runtime;
  }

  clear() {
    this.symbols = [];
    this.source = null;
  }
}

export const textStream = new TextStreamStore();
