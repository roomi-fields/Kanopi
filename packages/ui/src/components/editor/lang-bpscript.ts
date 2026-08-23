import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { hoverTooltip, EditorView, type Tooltip } from '@codemirror/view';
import { linter, type Diagnostic } from '@codemirror/lint';
import { compileBps } from '../../lib/runtimes/compile-cache';
import {
  describeVocabulary,
  type VocabControl,
  type VocabValue
} from 'bpscript/src/transpiler/index.js';

// BPScript editor intelligence, ALL sourced from BPScript's LIVING vocabulary
// authority `describeVocabulary()` (the same aggregation its compile guard uses),
// NOT a static catalog. As user libraries register new controls/values/catalog
// entries, the editor sees them with zero code change. It drives:
//   - autocompletion: invocations, control names + their enum VALUES
//     (`wave:` → sine/triangle/…), catalog axes after `alphabet.`/`tuning.`/
//     `octaves.`, and the CV / control-point union inside `( … )`;
//   - a linter that underlines transpiler errors (unchanged, transpiler-driven);
//   - hover tooltips (metadata + description) for directives, catalog entries,
//     controls, values, functions and address keys.
// We don't reinvent the vocabulary — we render the authority's answer.

// Queried ONCE at module load, like the old static import. Covers the COMPLETE
// registry (built-in + user libs), not just a given scene.
const vocab = describeVocabulary();

/** Enum options as a list of words, accepting the authority's two shapes:
 *  a comma string ("sine, triangle, …") OR an array. Numeric-range controls
 *  (no word-like options) yield an empty list → no value completion. */
function enumValues(values: string | string[] | undefined): string[] {
  if (!values) return [];
  const arr = Array.isArray(values) ? values : values.split(',');
  return arr.map((v) => v.trim()).filter((v) => /^[A-Za-z][\w-]*$/.test(v));
}

/** Short inline `detail` for a control popup entry (its transport group if any). */
function controlDetail(c: VocabControl): string {
  return c.transportGroup ? `control · ${c.transportGroup}` : 'control';
}

/** Expanded `info` doc for a control (description + range/default/args). */
function controlInfo(c: VocabControl): string | undefined {
  const parts: string[] = [];
  if (c.description) parts.push(c.description);
  if (c.args && c.args.length) parts.push(`args: ${c.args.join(', ')}`);
  if (c.range) parts.push(`range ${c.range[0]}–${c.range[1]}`);
  if (c.default !== undefined) parts.push(`default ${c.default}`);
  return parts.length ? parts.join(' · ') : undefined;
}

/** Expanded `info` doc for an overridable value (e.g. `diapason`). */
function valueInfo(v: VocabValue): string | undefined {
  const parts: string[] = [];
  if (v.description) parts.push(v.description);
  if (v.range) parts.push(`range ${v.range[0]}–${v.range[1]}${v.unit ? ' ' + v.unit : ''}`);
  else if (v.unit) parts.push(v.unit);
  return parts.length ? parts.join(' · ') : undefined;
}

// Invocation completions: the reserved words, offered BARE — the form in which
// they appear in a scene (`mode`, `alphabet.western`, …).
const DIRECTIVE_COMPLETIONS: Completion[] = vocab.keywords.map((name) => ({
  label: name,
  type: 'keyword',
  detail: 'directive'
}));

// Control completions (bare name), the default control-point vocabulary.
const CONTROL_COMPLETIONS: Completion[] = vocab.controls.map((c) => ({
  label: c.name,
  type: 'property',
  detail: controlDetail(c),
  info: controlInfo(c)
}));

// Fixed SYNTAX keywords — the bare words the authority exposes via `syntaxWords` under
// kind `keyword`. Operators live in the same map under kind `operator`: they are syntax
// too but not word-completable, so only the `keyword` kind joins the popup.
// ⛔ ON NE LES ÉNUMÈRE PAS ICI. La liste se dérive à chaque chargement, et l'amont la fait
//   varier : `lambda` en est sorti le 2026-08-24 quand le mot a quitté le langage. Une
//   énumération en commentaire ne rougit nulle part le jour où elle devient fausse.
const SYNTAX_KEYWORD_COMPLETIONS: Completion[] = Object.entries(vocab.syntaxWords)
  .filter(([, d]) => d.kind === 'keyword')
  .map(([name, d]) => ({ label: name, type: 'keyword', detail: 'keyword', info: d.description }));

// Default popup outside any special context: directives + syntax keywords + controls.
const DEFAULT_COMPLETIONS: Completion[] = [
  ...DIRECTIVE_COMPLETIONS,
  ...SYNTAX_KEYWORD_COMPLETIONS,
  ...CONTROL_COMPLETIONS
];

// Inside `( … )` — a control point / CV target — the FULL union: controls,
// overridable values, digital functions, address keys.
// Deduped by label (a name may live in two categories).
const PAREN_COMPLETIONS: Completion[] = (() => {
  const seen = new Set<string>();
  const out: Completion[] = [];
  const push = (c: Completion) => {
    if (seen.has(c.label)) return;
    seen.add(c.label);
    out.push(c);
  };
  for (const c of vocab.controls)
    push({ label: c.name, type: 'property', detail: controlDetail(c), info: controlInfo(c) });
  for (const v of vocab.values)
    push({ label: v.name, type: 'variable', detail: 'value', info: valueInfo(v) });
  for (const f of vocab.functions) push({ label: f, type: 'function', detail: 'function' });
  for (const k of vocab.addressKeys) push({ label: k, type: 'property', detail: 'address' });
  return out;
})();

// Enum values per CONTROL (`wave:` → sine/triangle/…), from the authority's
// `values` (string or array). Range-only controls have no word-like options.
const CONTROL_VALUE_MAP: Record<string, Completion[]> = (() => {
  const map: Record<string, Completion[]> = {};
  for (const c of vocab.controls) {
    const vals = enumValues(c.values);
    if (vals.length > 0)
      map[c.name] = vals.map((v) => ({ label: v, type: 'enum', detail: c.name }));
  }
  return map;
})();

// Enum values per DIRECTIVE (`mode:` → ord/random/…, `scan:` → left/right/rnd),
// from the authority's `directiveValues`. Each value carries its own description.
const DIRECTIVE_VALUE_MAP: Record<string, Completion[]> = (() => {
  const map: Record<string, Completion[]> = {};
  for (const [name, d] of Object.entries(vocab.directiveValues)) {
    map[name] = d.values.map((v) => ({
      label: v.name,
      type: 'enum',
      detail: name,
      info: v.description
    }));
  }
  return map;
})();

// Catalog entries per axis (`alphabet.` → western/sargam/…, `tuning.` → …).
const COMPONENT_MAP: Record<string, Completion[]> = (() => {
  const map: Record<string, Completion[]> = {};
  for (const [axis, entries] of Object.entries(vocab.components)) {
    map[axis] = entries.map((e) => ({ label: e, type: 'constant', detail: axis }));
  }
  return map;
})();

/** True when the cursor sits inside an unclosed `(` on its own line — the
 *  control-point / CV zone where the full vocabulary union is offered. */
function insideParen(context: CompletionContext): boolean {
  const line = context.state.doc.lineAt(context.pos);
  const before = context.state.sliceDoc(line.from, context.pos);
  return before.lastIndexOf('(') > before.lastIndexOf(')');
}

/**
 * CM6 completion source for `.bps`. Modes, in priority order:
 *  - after `axis.` (`alphabet.`, `tuning.`, `octaves.`) → the axis' catalog;
 *  - after `directive:` → the directive's enum VALUES (if the authority has any);
 *  - after `control:` (e.g. `wave:tr`) → the control's enum VALUES;
 *  - inside `( … )` → controls ∪ values ∪ functions ∪ addressKeys ∪ modInputs;
 *  - otherwise → directives + control names.
 * Fuzzy-filtered by the word being typed. Attached via `languageData`.
 */
export function bpscriptCompletion(context: CompletionContext): CompletionResult | null {
  // Catalog axis: `alphabet.we` → western/… (the entry, not the axis name).
  // ⛔ SANS PRÉFIXE DEPUIS QUE L'AROBASE EST SORTIE DU LANGAGE (décision Romain 2026-08-17). Ce qui
  // borne la branche n'est donc plus la graphie mais le CATALOGUE : un mot qui n'est pas un axe
  // connu rend `COMPONENT_MAP[m[1]]` indéfini et retombe sur la branche suivante. `mod.adsr`,
  // `out.midi`, `eval.strudel` traversent ici sans rien proposer, et c'est le comportement voulu.
  const axisCtx = context.matchBefore(/(\w+)\.(\w*)/);
  if (axisCtx) {
    const m = /^(\w+)\.(\w*)$/.exec(axisCtx.text);
    const options = m && COMPONENT_MAP[m[1]];
    if (options) return { from: axisCtx.to - m![2].length, options, validFor: /^\w*$/ };
  }
  // Directive value: `mode:ra` → the directive's allowed values (from `directiveValues`).
  const dirVal = context.matchBefore(/(\w+):(\w*)/);
  if (dirVal) {
    const m = /^(\w+):(\w*)$/.exec(dirVal.text);
    const options = m && DIRECTIVE_VALUE_MAP[m[1]];
    if (options) return { from: dirVal.to - m![2].length, options, validFor: /^\w*$/ };
  }
  // Control value: `wave:tr` → triangle/… (the value, not the control name).
  const valueCtx = context.matchBefore(/[A-Za-z]\w*:\w*/);
  if (valueCtx) {
    const m = /^([A-Za-z]\w*):(\w*)$/.exec(valueCtx.text);
    const options = m && CONTROL_VALUE_MAP[m[1]];
    if (options) return { from: valueCtx.to - m![2].length, options, validFor: /^\w*$/ };
  }
  // Control-point / CV zone: inside `( … )` → the full vocabulary union.
  if (insideParen(context)) {
    const word = context.matchBefore(/[\w]*/);
    if (word && (word.from !== word.to || context.explicit)) {
      return { from: word.from, options: PAREN_COMPLETIONS, validFor: /^\w*$/ };
    }
  }
  const word = context.matchBefore(/[\w]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return { from: word.from, options: DEFAULT_COMPLETIONS, validFor: /^\w*$/ };
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

// ---- Hover tooltips (metadata + description from the authority) -------------
// The first regex match that spans the hovered column wins: an invocation
// (with optional `.catalogEntry`) first, then any bare vocabulary word (control,
// value, function, address key) resolved against the authority.
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

// Fast lookups by name into the authority's flat lists.
const CONTROL_BY_NAME = new Map(vocab.controls.map((c) => [c.name, c]));
const VALUE_BY_NAME = new Map(vocab.values.map((v) => [v.name, v]));
const FUNCTION_SET = new Set(vocab.functions);
const ADDRESS_SET = new Set(vocab.addressKeys);

/** Resolve a bare word against the vocabulary, richest category first. */
function vocabWordHover(word: string): HoverHit | null {
  const c = CONTROL_BY_NAME.get(word);
  if (c) {
    const syntax = c.args && c.args.length ? `${c.name}(${c.args.join(', ')})` : undefined;
    return { title: c.name, syntax, desc: controlInfo(c) };
  }
  const v = VALUE_BY_NAME.get(word);
  if (v) return { title: v.name, desc: valueInfo(v) };
  if (FUNCTION_SET.has(word)) return { title: word, desc: 'Digital function' };
  if (ADDRESS_SET.has(word)) return { title: word, desc: 'Address key' };
  return null;
}

function hoverHitAt(lineText: string, col: number): HoverHit | null {
  // Invocation: axis(.entry)? or a bare reserved word — no prefix since the arobase left the
  // language (décision Romain 2026-08-17). The catalog and the reserved-word list are what
  // qualify the token; a word in neither falls through to the bare-vocabulary lookup below.
  const dir = findTokenAt(lineText, col, /(\w+)(?:\.(\w+))?/g);
  if (dir) {
    const name = dir[1];
    const sub = dir[2];
    const axis = vocab.components[name];
    if (axis) {
      if (sub && axis.includes(sub)) {
        return { title: `${name}.${sub}`, desc: `${name} catalog entry` };
      }
      return { title: name, desc: `Catalog axis (${axis.length} entries)` };
    }
    if (vocab.keywords.includes(name)) return { title: name, desc: 'Invocation' };
  }
  // Syntax operators: -> <- <> (from the authority's `syntaxWords`).
  const op = findTokenAt(lineText, col, /(->|<-|<>)/g);
  if (op) {
    const s = vocab.syntaxWords[op[1]];
    if (s) return { title: op[1], syntax: s.syntax, desc: s.description };
  }
  // A bare vocabulary word (control / value / function / address),
  // else a fixed syntax keyword — whatever `syntaxWords` declares under kind `keyword`.
  const w = findTokenAt(lineText, col, /[A-Za-z][\w-]*/g);
  if (w) {
    const hit = vocabWordHover(w[0]);
    if (hit) return hit;
    const s = vocab.syntaxWords[w[0]];
    if (s && s.kind === 'keyword') return { title: w[0], syntax: s.syntax, desc: s.description };
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
