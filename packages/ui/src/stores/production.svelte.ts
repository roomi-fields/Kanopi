// The FULL derived production of a BP3/BPScript voice, set ONCE per eval — the
// complete `TimedToken[]` BPx produces at derive time, BEFORE any time-scheduled
// playback. This is the single source of truth for "what was produced": it holds
// the entire sequence immediately on eval.
//
// Consumers: the Text panel renders the production BY ORDER all-at-once (the
// symbolic readout is a VIEW of this tree — there is no routed text transport);
// the Structure visualizer + STEP read the same shape (sections + beat grid).
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

// A raw timed token straight from BPx `derive().tokens`, kept UNTRANSFORMED for
// the polymetric piano-roll (the vendored `timeline.js` visualizer). Unlike
// `ProductionToken`, times stay in MILLISECONDS (`start`/`end`), which is what
// `Timeline.load()` expects. The visualizer assigns voices by temporal overlap
// from these flat tokens alone; it needs no `{ , }` structure delimiters.
export interface RawTimedToken {
  /** the terminal as written in the grammar */
  token: string;
  /** onset in MILLISECONDS along the derivation timeline */
  start: number;
  /** end in MILLISECONDS along the derivation timeline */
  end: number;
  /** BPx token kind (`terminal` | `rest` | `control` | `out_time`) when present */
  type?: string;
  /** orchestrated actor name, or null/undefined when unassigned */
  actor?: string | null;
}

// A node of the BPx derivation tree, kept STRUCTURALLY MINIMAL: just the fields
// the polymetric piano-roll needs to rebuild voices + groups (`bpxTreeToTimelineStream`).
// Mirrors BPx's `DerivationTree`/`TreeNode` shape (BPx `src/types/node.ts`) but only
// the parts we read — times stay in MILLISECONDS via `span.startMs`/`span.endMs`.
export interface ProductionTreeSpan {
  startMs: number;
  endMs: number;
}
export type ProductionTreeNode =
  | { type: 'sequence'; children: ProductionTreeNode[]; span?: ProductionTreeSpan }
  | { type: 'polymetric'; voices: ProductionTreeNode[]; span?: ProductionTreeSpan }
  | { type: 'voice'; children: ProductionTreeNode[]; span?: ProductionTreeSpan }
  | {
      type: 'occupying';
      symbolId: number;
      role: 'leaf' | 'rest' | 'prolongation';
      span: ProductionTreeSpan;
    }
  | { type: 'event'; symbolId: number; span: ProductionTreeSpan };

export interface ProductionTree {
  root: ProductionTreeNode;
}

export interface ProductionSet {
  /** the runtime/file label that produced this set (e.g. `bp3`, `bpscript`) */
  source: string;
  /** the complete derived sequence, in onset order */
  tokens: ProductionToken[];
  /**
   * The same derivation as flat BPx tokens, times in MILLISECONDS, kept raw for
   * the polymetric piano-roll visualizer (`timeline.js`). Optional so older
   * producers that don't supply it still type-check.
   */
  rawTokens?: RawTimedToken[];
  /**
   * The BPx derivation tree (`derive().tree`), kept so the polymetric piano-roll
   * can rebuild the `{ , }` structure band (groups + voices + nesting) that the
   * flat `rawTokens` cannot carry. Optional so producers that don't supply it
   * (Strudel/Hydra, older bp3 paths) still type-check; the visualizer falls back
   * to flat tokens when absent.
   */
  tree?: ProductionTree;
  /** total duration of the derivation, in seconds */
  durationSec: number;
  /**
   * Duration of one clock beat in seconds at the tempo this set was derived at
   * (`60 / bpm`). STEP advances one beat at a time, so this is the size of a
   * STEP window — the unit of the step cursor. The number of steps is therefore
   * `ceil(durationSec / beatDurSec)`.
   */
  beatDurSec: number;
  /**
   * Head-rule sections with their time bounds (empty when the grammar has none).
   * Kept as PASSIVE visual landmarks (labels + bands) — they are NOT the STEP
   * unit anymore (the beat is).
   */
  sections: ProductionSection[];
  /**
   * DETERMINISTIC leaf-name table: `symbolId → terminal name` straight from the
   * BPx grammar's own symbol table (`bpx.grammar.symbols.getName`). This is the
   * authoritative resolver the tree-view adapters use to name a leaf, replacing
   * the fragile temporal correlation with the flat tokens (which collides on
   * polymetric voices). Optional so producers that can't build it (engine API
   * unavailable, Strudel/Hydra, older paths) still type-check; the adapters then
   * fall back to temporal correlation.
   */
  symbolNames?: Record<number, string>;
}

// Number of STEP beats a production spans. STEP advances one clock beat
// (`beatDurSec`) at a time, so the count is `durationSec / beatDurSec` — but a
// derivation usually ends EXACTLY on a beat boundary, and floating-point makes
// that land at e.g. 31.9999 or 32.00001. A naive `Math.ceil` then yields a
// phantom trailing beat (the "+2"/"+1" overshoot in the Structure view). Snap to
// the nearest integer when within one part in a thousand of it, otherwise round
// up (a genuine partial final beat is still its own step). Returns 0 for a
// non-positive beat length.
export function beatCount(durationSec: number, beatDurSec: number): number {
  if (!(beatDurSec > 0)) return 0;
  const raw = durationSec / beatDurSec;
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) < 1e-3) return Math.max(0, rounded);
  return Math.max(0, Math.ceil(raw));
}

class ProductionStore {
  // The whole derived production of the most recent eval (null before any).
  current = $state<ProductionSet | null>(null);

  // Which BEAT STEP last played (-1 = none / whole structure). The unit is a
  // clock beat (`beatDurSec`), NOT a head-rule section. Owned here because it's a
  // property OF the current production: every fresh eval replaces the production
  // and therefore resets the STEP cursor. The Structure visualizer draws a beat
  // cursor over `[stepIndex*beatDurSec, (stepIndex+1)*beatDurSec]`; STEP sets it
  // after re-evaluating a one-beat window.
  stepIndex = $state<number>(-1);

  /** Replace (never append) the production with the full derived set of one eval. */
  set(p: ProductionSet) {
    this.current = p;
    this.stepIndex = -1;
  }

  /** A backtick-only / non-notes eval produced no symbolic tokens — clear the readout. */
  clear() {
    this.current = null;
    this.stepIndex = -1;
  }
}

export const production = new ProductionStore();
