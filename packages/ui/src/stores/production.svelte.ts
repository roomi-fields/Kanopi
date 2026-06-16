// The FULL derived production of a BP3/BPScript voice, set ONCE per eval — the
// complete `TimedToken[]` BPx produces at derive time, BEFORE any time-scheduled
// playback. This is the single source of truth for "what was produced": unlike
// `textstream.svelte` (which the dispatcher feeds symbol-by-symbol over playback
// time), this holds the entire sequence immediately on eval.
//
// Consumers: the Text panel renders it all-at-once; the Structure visualizer +
// STEP read the same shape (section boundaries included so they don't re-derive).
//
// Backtick-only voices (Strudel/Hydra) derive no note tokens — the store is just
// `clear()`ed for them, so the Text panel degrades to an empty/"no production"
// state rather than erroring.

export interface ProductionToken {
  /** the terminal as written in the grammar (note name, bol, number, backtick ref) */
  token: string;
  /** onset relative to the start of the derivation, in seconds */
  startSec: number;
  /** duration in seconds */
  durSec: number;
  /** whether this token reaches audio/MIDI (true) or only the symbolic readout (false) */
  sounding: boolean;
}

// A top-level section of the derivation (head-rule RHS element). Boundaries are
// in seconds along the same timeline as the tokens, so a visualizer can draw
// section bands and STEP can map an index → a time window without re-deriving.
export interface ProductionSection {
  /** the section's label (head-rule terminal, e.g. `calm`, `full`) */
  name: string;
  /** onset of the section, in seconds */
  startSec: number;
  /** end of the section, in seconds */
  endSec: number;
}

export interface ProductionSet {
  /** the runtime/file label that produced this set (e.g. `bp3`, `bpscript`) */
  source: string;
  /** the complete derived sequence, in onset order */
  tokens: ProductionToken[];
  /** total duration of the derivation, in seconds */
  durationSec: number;
  /** head-rule sections with their time bounds (empty when the grammar has none) */
  sections: ProductionSection[];
}

class ProductionStore {
  // The whole derived production of the most recent eval (null before any).
  current = $state<ProductionSet | null>(null);

  /** Replace (never append) the production with the full derived set of one eval. */
  set(p: ProductionSet) {
    this.current = p;
  }

  /** A backtick-only / non-notes eval produced no symbolic tokens — clear the readout. */
  clear() {
    this.current = null;
  }
}

export const production = new ProductionStore();
