import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { hoverTooltip, EditorView, type Tooltip } from '@codemirror/view';
import { linter, type Diagnostic } from '@codemirror/lint';
import { compileBps } from '../../lib/runtimes/compile-cache';
import refJson from 'bpscript/public/help/reference.json';

// BPScript editor intelligence, ALL sourced from BPScript's OWN `reference.json`
// (the catalog its Help panel + web editor use) and its transpiler — the same
// features the old web editor shipped, ported AS-IS:
//   - autocompletion: directives (`@…`), control names + their enum VALUES
//     (`wave:` → sine/triangle/…), directive values (`@mode:` → ord/random/…),
//     keywords;
//   - a linter that underlines transpiler errors;
//   - hover tooltips (syntax + description) for directives, arrows, controls,
//     engine instructions, symbols and keywords.
// We don't reinvent the catalog — we render it.

interface RefEntry {
  name?: string;
  syntax?: string;
  desc?: string;
  description?: string;
  range?: string;
  /** Enum values: a comma string for controls, a {value: desc} map for directives. */
  values?: string | Record<string, string>;
}
type RefMap = Record<string, RefEntry | string>;
interface Reference {
  directives?: RefMap;
  controls_runtime?: RefMap;
  controls_engine?: RefMap;
  keywords?: RefMap;
  symbols?: RefMap;
}

const ref = refJson as unknown as Reference;

function infoOf(d: RefEntry | string | undefined): string | undefined {
  if (!d) return undefined;
  if (typeof d === 'string') return d;
  return d.desc ?? d.description;
}

function collect(
  map: RefMap | undefined,
  render: (name: string, info?: string) => Completion
): Completion[] {
  const out: Completion[] = [];
  for (const [name, d] of Object.entries(map ?? {})) {
    if (name.startsWith('_')) continue; // doc-only `_comment` keys are not entries
    out.push(render(name, infoOf(d)));
  }
  return out;
}

const COMPLETIONS: Completion[] = [
  ...collect(ref.directives, (name, info) => ({
    label: '@' + name,
    type: 'keyword',
    detail: 'directive',
    info
  })),
  ...collect(ref.controls_runtime, (name, info) => ({
    label: name,
    type: 'property',
    detail: 'control',
    info
  })),
  ...collect(ref.controls_engine, (name, info) => ({
    label: name,
    type: 'property',
    detail: 'engine',
    info
  })),
  ...collect(ref.keywords, (name, info) => ({
    label: name,
    type: 'keyword',
    detail: 'keyword',
    info
  }))
];

// Enum values per CONTROL, parsed from the reference's `values` string (a comma
// list like "sine, triangle, square, sawtooth"). Controls whose values are a
// numeric range (vel "0-127") have no word-like options → skipped.
const CONTROL_VALUE_MAP: Record<string, Completion[]> = (() => {
  const map: Record<string, Completion[]> = {};
  for (const src of [ref.controls_runtime, ref.controls_engine]) {
    for (const [name, d] of Object.entries(src ?? {})) {
      if (name.startsWith('_') || typeof d === 'string' || typeof d.values !== 'string') continue;
      const vals = d.values
        .split(',')
        .map((v) => v.trim())
        .filter((v) => /^[a-zA-Z][\w-]*$/.test(v));
      if (vals.length > 0) {
        map[name] = vals.map((v) => ({ label: v, type: 'enum', detail: name }));
      }
    }
  }
  return map;
})();

// Enum values per DIRECTIVE, from the reference's `values` MAP ({value: desc}) —
// e.g. `@mode:` → ord / random / lin / sub / … each with its description.
const DIRECTIVE_VALUE_MAP: Record<string, Completion[]> = (() => {
  const map: Record<string, Completion[]> = {};
  for (const [name, d] of Object.entries(ref.directives ?? {})) {
    if (
      name.startsWith('_') ||
      typeof d === 'string' ||
      !d.values ||
      typeof d.values === 'string'
    ) {
      continue;
    }
    map[name] = Object.entries(d.values).map(([v, info]) => ({
      label: v,
      type: 'enum',
      detail: name,
      info
    }));
  }
  return map;
})();

/**
 * CM6 completion source for `.bps`. Modes, in priority order:
 *  - after `@directive:` (e.g. `@mode:ra`) → the directive's allowed VALUES;
 *  - after `control:` (e.g. `wave:tr`) → the control's allowed VALUES;
 *  - otherwise → directives / control names / keywords from the reference.
 * Fuzzy-filtered by the word being typed. Attached via `languageData`.
 */
export function bpscriptCompletion(context: CompletionContext): CompletionResult | null {
  // Directive value: `@mode:ra` → ord/random/… (the value, not the directive name).
  const dirVal = context.matchBefore(/@(\w+):(\w*)/);
  if (dirVal) {
    const m = /^@(\w+):(\w*)$/.exec(dirVal.text);
    const options = m && DIRECTIVE_VALUE_MAP[m[1]];
    if (options) return { from: dirVal.to - (m![2]?.length ?? 0), options, validFor: /^\w*$/ };
  }
  // Control value: `wave:tr` → triangle/… (the value, not the control name).
  const valueCtx = context.matchBefore(/[A-Za-z]\w*:\w*/);
  if (valueCtx) {
    const m = /^([A-Za-z]\w*):(\w*)$/.exec(valueCtx.text);
    const options = m && CONTROL_VALUE_MAP[m[1]];
    if (options) return { from: valueCtx.to - (m![2]?.length ?? 0), options, validFor: /^\w*$/ };
  }
  const word = context.matchBefore(/@?[\w]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return { from: word.from, options: COMPLETIONS, validFor: /^@?\w*$/ };
}

// ---- Linter: transpiler diagnostics (underlines errors) --------------------
// Ported from the old web editor: compile the doc, map each error to the line it
// reports (BPScript errors carry a 1-based `line`). Debounced so we don't compile
// on every keystroke.
interface BpsError {
  line?: number;
  message?: string;
}

export const bpscriptLinter = linter(
  (view) => {
    const source = view.state.doc.toString();
    if (!source.trim()) return [];
    let compiled: { errors?: BpsError[] };
    try {
      compiled = compileBps(source) as { errors?: BpsError[] };
    } catch (e) {
      return [
        {
          from: 0,
          to: view.state.doc.line(1).to,
          severity: 'error',
          message: 'Transpiler error: ' + String(e)
        }
      ];
    }
    const errors = compiled.errors ?? [];
    return errors.map((err): Diagnostic => {
      const lineNum = Math.min(Math.max(err.line || 1, 1), view.state.doc.lines);
      const line = view.state.doc.line(lineNum);
      return {
        from: line.from,
        to: line.to,
        severity: 'error',
        message: err.message || String(err)
      };
    });
  },
  { delay: 600 }
);

// ---- Hover tooltips (syntax + description from the reference) ---------------
// The first regex match that spans the hovered column wins, in the same order as
// the old web editor: directive → arrow → control → engine → symbol → keyword.
function findTokenAt(lineText: string, col: number, re: RegExp): RegExpExecArray | null {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineText)) !== null) {
    if (col >= m.index && col <= m.index + m[0].length) return m;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return null;
}

interface HoverHit {
  title: string;
  syntax?: string;
  desc?: string;
}

function refEntry(map: RefMap | undefined, key: string): RefEntry | undefined {
  const d = map?.[key];
  return d && typeof d !== 'string' ? d : undefined;
}

function hoverHitAt(lineText: string, col: number): HoverHit | null {
  // Directive: @xxx(.subkey)?(:binding)?
  const dir = findTokenAt(lineText, col, /@(\w[\w.]*(?::[\w./-]+)?)/g);
  if (dir) {
    const dirName = dir[1].split('.')[0].split(':')[0];
    const def = refEntry(ref.directives, dirName);
    if (def) return { title: '@' + dirName, syntax: def.syntax, desc: infoOf(def) };
  }
  // Arrow: -> <- <>
  const arrow = findTokenAt(lineText, col, /(->|<-|<>)/g);
  if (arrow) {
    const def = refEntry(ref.symbols, arrow[1]);
    if (def) return { title: def.name ?? arrow[1], syntax: def.syntax, desc: infoOf(def) };
  }
  // Control: (key:value)
  const ctrl = findTokenAt(lineText, col, /\((\w+):([^)]*)\)/g);
  if (ctrl) {
    const def = refEntry(ref.controls_runtime, ctrl[1]);
    if (def) {
      const extra = def.range ? ` [${def.range}]` : '';
      return { title: ctrl[1], syntax: def.syntax, desc: (infoOf(def) ?? '') + extra };
    }
  }
  // Engine instruction: [key:value] or [key]
  const eng = findTokenAt(lineText, col, /\[(\w+)(?::([^\]]*))?\]/g);
  if (eng) {
    const def = refEntry(ref.controls_engine, eng[1]);
    if (def) return { title: eng[1], syntax: def.syntax, desc: infoOf(def) };
  }
  // Keyword: gate / trigger / cv / lambda
  const kw = findTokenAt(lineText, col, /\b(gate|trigger|cv|lambda)\b/g);
  if (kw) {
    const def = refEntry(ref.keywords, kw[1]);
    if (def) return { title: def.name ?? kw[1], syntax: def.syntax, desc: infoOf(def) };
  }
  return null;
}

export const bpscriptHover = hoverTooltip((view, pos): Tooltip | null => {
  const line = view.state.doc.lineAt(pos);
  const hit = hoverHitAt(line.text, pos - line.from);
  if (!hit) return null;
  return {
    pos,
    above: true,
    create() {
      const dom = document.createElement('div');
      dom.className = 'cm-bps-hover';
      const title = document.createElement('div');
      title.className = 'cm-bps-hover-title';
      title.textContent = hit.title;
      dom.appendChild(title);
      if (hit.syntax) {
        const syn = document.createElement('div');
        syn.className = 'cm-bps-hover-syntax';
        syn.textContent = hit.syntax;
        dom.appendChild(syn);
      }
      if (hit.desc) {
        const desc = document.createElement('div');
        desc.className = 'cm-bps-hover-desc';
        desc.textContent = hit.desc;
        dom.appendChild(desc);
      }
      return { dom };
    }
  };
});

// Inner styling for the hover tooltip (the `.cm-tooltip` shell already gets its
// background/border from the Kanopi theme — match the palette here).
const bpscriptHoverTheme = EditorView.theme({
  '.cm-bps-hover': { padding: '8px 12px', maxWidth: '420px', fontSize: '12px', lineHeight: '1.5' },
  '.cm-bps-hover-title': {
    color: 'var(--amber)',
    fontWeight: '600',
    marginBottom: '4px',
    fontFamily: 'var(--font-mono)'
  },
  '.cm-bps-hover-syntax': {
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    marginBottom: '4px'
  },
  '.cm-bps-hover-desc': { color: 'var(--text)' }
});

/** All BPScript editor extras (linter + hover) — wired in lang-resolver. */
export const bpscriptExtras: Extension[] = [bpscriptLinter, bpscriptHover, bpscriptHoverTheme];
