import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';

const op = Decoration.mark({ class: 'cm-mini-op' });
const rest = Decoration.mark({ class: 'cm-mini-rest' });
const num = Decoration.mark({ class: 'cm-mini-num' });
const bracket = Decoration.mark({ class: 'cm-mini-bracket' });

// Find the content *inside* "..." or '...' strings on a line. Intentionally
// greedy-line-local: mini-notation strings are short, and we don't want to
// break template literals (backticks) or multi-line constructs.
const STRING_RE = /"([^"\\\n]*)"|'([^'\\\n]*)'/g;

// Tokens inside a string body.
const TOKEN = /(\[|\]|<|>|[*/|@!?.:'])|(~)|([0-9]+(?:\.[0-9]+)?)/g;

function decorate(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    let s: RegExpExecArray | null;
    STRING_RE.lastIndex = 0;
    while ((s = STRING_RE.exec(text))) {
      const body = s[1] ?? s[2] ?? '';
      if (body.length === 0) continue;
      const bodyStart = from + s.index + 1; // skip opening quote
      let m: RegExpExecArray | null;
      TOKEN.lastIndex = 0;
      while ((m = TOKEN.exec(body))) {
        const start = bodyStart + m.index;
        const end = start + m[0].length;
        if (m[1] !== undefined) {
          const c = m[1];
          builder.add(start, end, c === '[' || c === ']' || c === '<' || c === '>' ? bracket : op);
        } else if (m[2] !== undefined) {
          builder.add(start, end, rest);
        } else {
          builder.add(start, end, num);
        }
      }
    }
  }
  return builder.finish();
}

export const miniOverlay = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorate(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = decorate(u.view);
    }
  },
  { decorations: (v) => v.decorations }
);
