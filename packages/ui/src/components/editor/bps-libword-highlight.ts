import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { describeVocabulary } from 'bpscript/src/transpiler/index.js';

// A DECORATION overlay for `.bps`: it re-colours the words that belong to the
// language's LIBRARY vocabulary (controls, values, digital functions, catalog
// entries, address keys, modulation inputs) so they read distinctly from bare
// note terminals (`C4`, `Sa`, …). BPScript's Lezer grammar is a FLAT tokenizer —
// every bare identifier lands on the same `Symbol` → `variableName` token — so it
// cannot tell `cutoff` (a library word) from `C4` (a note). We do NOT touch that
// upstream grammar; we lay a thin overlay on top of it, driven by the SAME living
// authority the autocompletion/hover use (`describeVocabulary()`).
//
// No 2nd authority: a word that the authority does NOT know is NOT decorated — it
// keeps the default `variableName` colour. Zero frozen list; a user library that
// registers a new control/entry is highlighted with no code change here.

// Queried ONCE at module load (covers the COMPLETE registry: built-ins + libs),
// flattened into a single membership Set of every library word.
const LIB_WORDS: Set<string> = (() => {
  const vocab = describeVocabulary();
  const set = new Set<string>();
  for (const c of vocab.controls) set.add(c.name);
  for (const v of vocab.values) set.add(v.name);
  for (const f of vocab.functions) set.add(f);
  for (const entries of Object.values(vocab.components)) for (const e of entries) set.add(e);
  for (const k of vocab.addressKeys) set.add(k);
  for (const m of vocab.modulationInputs) set.add(m);
  return set;
})();

const libword = Decoration.mark({ class: 'cm-bps-libword' });

// A single identifier run (letter-led). We match WHOLE runs against the set —
// never substrings — so `panLfo` never matches `pan`, and `C4`/`Sa` never match.
const WORD_RE = /[A-Za-z][\w]*/g;

// Token node names we must NOT recolour: prose (may name vocabulary words) and
// backtick runtime code (another language's own highlighting).
const SKIP_NODES = new Set(['LineComment', 'BlockComment', 'Comment', 'BacktickCode', 'String']);

/** Mark every library-word RUN inside `text` (offset by `base`) that the
 *  authority knows. `lastFrom` keeps the RangeSetBuilder adds monotonic across
 *  tokens/ranges. Returns the updated cursor. */
function markRuns(
  text: string,
  base: number,
  builder: RangeSetBuilder<Decoration>,
  lastFrom: number
): number {
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text))) {
    if (!LIB_WORDS.has(m[0])) continue;
    const start = base + m.index;
    if (start < lastFrom) continue;
    builder.add(start, start + m[0].length, libword);
    lastFrom = start;
  }
  return lastFrom;
}

function decorate(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);
  let lastFrom = -1;
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (SKIP_NODES.has(node.name)) return false; // don't descend into prose/code
        if (node.node.firstChild) return undefined; // only leaf tokens carry text
        const text = view.state.doc.sliceString(node.from, node.to);
        if (node.name === 'Directive') {
          // The flat tokenizer lumps `axis.entry` into ONE keyword token. Colour
          // ONLY the catalog ENTRY (after the first `.`), so the directive head
          // stays `keyword` — and a head that doubles as a control (`sound.`) is
          // not recoloured. No dot ⇒ nothing to mark (`tempo`, `mode:random`).
          const dot = text.indexOf('.');
          if (dot >= 0)
            lastFrom = markRuns(text.slice(dot + 1), node.from + dot + 1, builder, lastFrom);
        } else {
          // Content tokens lump `subject:control:target` around `:`/`.` — scan
          // the runs so the control word colours while its value/ref stay default.
          lastFrom = markRuns(text, node.from, builder, lastFrom);
        }
        return undefined;
      }
    });
  }
  return builder.finish();
}

/** CM6 overlay that marks library-vocabulary words in `.bps` with the
 *  `cm-bps-libword` class (coloured in the Kanopi theme). Wired for `.bps` only. */
export const bpsLibwordHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorate(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = decorate(u.view);
    }
  },
  { decorations: (v) => v.decorations }
);
