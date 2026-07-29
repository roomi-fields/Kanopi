// The FULL derived production of a BP3/BPScript voice, set ONCE per eval — the
// complete `TimedToken[]` BPx produces at derive time, BEFORE any time-scheduled
// playback. This is the single source of truth for "what was produced": it holds
// the entire sequence immediately on eval.
//
// Consumers: the Text panel renders the production BY ORDER all-at-once (the
// symbolic readout is a VIEW of this tree — there is no routed text transport);
// the Structure visualizer + STEP read the same shape (beat grid).
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

// (`beatCount` — le compteur de pas STEP hôte (`durationSec / beatDurSec`) — est RETIRÉ,
// chantier transport-SM RC-B + verdict (b) « battement écrit » [496/499] : le pas est UNE
// unité d'écriture, référent universel porté par Kronos (`transport.step(1)`) — l'hôte ne
// compte plus les temps d'une production, ni pour stepper ni pour afficher le bouton.)

class ProductionStore {
  // The whole derived production of the most recent eval (null before any). This
  // is a PROJECTION of BPx's `derive()` output (set by the adapter), NOT a host
  // re-derivation — the symbolic readout/piano-roll/STEP all read this snapshot.
  // The playhead position is NEVER stored here: STEP and the Structure cursor read
  // it from Kronos's Transport (contract kronos-architecture.md §2). The former
  // `stepIndex` host position counter was removed — it had become write-only dead
  // code once `playback.step` started deriving the beat from `transport.beatPosition()`.
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
