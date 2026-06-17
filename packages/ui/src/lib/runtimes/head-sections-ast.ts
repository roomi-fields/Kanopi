// Head-rule sections, read from the BPScript AST (`compileBPS(src).ast`) instead
// of the deprecated BP3 grammar TEXT. The macro structure of a `.bps` is the
// start rule's top-level RHS sequence: each plain `Symbol` is a section, a
// `{…}` Polymetric counts as ONE section, control terminals are filtered.
//
// This replaces the regex-on-grammar-text `headSections`/`headSectionNames` for
// the `.bps` path. The `.gr` path stays on the text reader (it never goes through
// compileBPS, so it has no AST). Two variants mirror the two former call sites:
//   - `headSectionsFromAst`     : the Scenes-bar variant (no control/note filter)
//   - `headSectionNamesFromAst` : the bp3 adapter variant (drops control terminals,
//                                 incl. bare notes, matching the old grFrontend)
//
// Verified to reproduce the former text functions on the bundled `.bps` corpus:
// identical section COUNTS everywhere (the STEP-relevant invariant) and identical
// names except the inner label of a single-section polymetric (cosmetic — that
// label is never surfaced: sections render only when count > 1).
//
// Kept standalone (imports only `isNoteName`) to avoid the adapter↔core cycle the
// former local copy in bp3.ts guarded against (bpsScenes → core → registry → …).

import { isNoteName } from 'bp3-frontend';

// Minimal AST shapes this reader walks (bpscript carries more).
interface RhsEl {
  type: string;
  name?: string;
  _btName?: string;
  voices?: RhsEl[][];
}
interface AstRule {
  lhs: { name?: string }[];
  rhs: RhsEl[];
}
interface AstSubgrammar {
  rules: AstRule[];
}
interface SceneAst {
  subgrammars?: AstSubgrammar[];
}

// A BP3 control/command terminal (`_vel(50)`, `_striated`), a bare note inlined in
// the head (a played event, not a section), or a rest/prolongation placeholder.
// Same predicate the former bp3.ts `isControlTerminal` used.
function isControlTerminal(sym: string): boolean {
  if (sym.startsWith('_')) return true;
  if (isNoteName(sym)) return true;
  if (sym === '-' || sym === '_') return true;
  return false;
}

// The grammar-text token a flat RHS element would have rendered to (the names the
// former regex reader saw on the `S -->` line). A standalone backtick carries its
// emitted `BT…` token in `_btName` (the exact text token the old reader matched).
function elementToken(el: RhsEl): string | null {
  switch (el.type) {
    case 'Symbol':
    case 'SymbolCall':
      return el.name ?? null;
    case 'BacktickStandalone':
      return el._btName ?? null;
    case 'Rest':
      return '-';
    case 'Prolongation':
      return '_';
    default:
      return el.name ?? null;
  }
}

// The inner label of a `{…}` polymetric section: voices joined by ',', each voice
// a space-joined token sequence (control markers dropped). One polymetric = one
// section; this string is only a display name (never the STEP unit).
function polymetricLabel(poly: RhsEl): string {
  const voices = poly.voices ?? [];
  return voices
    .map((voice) =>
      voice
        .map(elementToken)
        .filter((t): t is string => t !== null && !t.startsWith('_'))
        .join(' ')
    )
    .join(',');
}

// The start rule = the FIRST rule whose LHS is the start symbol `S`. Mirrors the
// former text reader, which took the first `S -->` line (even when several guarded
// `S` rules exist, e.g. `[scene==…] S -> …`).
function startRule(ast: SceneAst): AstRule | null {
  const sg = ast.subgrammars?.[0];
  if (!sg) return null;
  return sg.rules.find((r) => r.lhs.some((e) => e.name === 'S')) ?? null;
}

// Walk the start rule's top-level RHS into sections. `filterControl` drops control
// terminals (incl. bare notes) — the bp3-adapter variant; left false for the
// Scenes-bar variant, which kept every top-level element verbatim.
function sectionsFromAst(ast: SceneAst, filterControl: boolean): string[] {
  const rule = startRule(ast);
  if (!rule) return [];
  const out: string[] = [];
  for (const el of rule.rhs) {
    if (el.type === 'Polymetric') {
      out.push(polymetricLabel(el));
      continue;
    }
    if (el.type === 'Control' || el.type === 'InstantControl') continue;
    const tok = elementToken(el);
    if (!tok) continue;
    if (filterControl && isControlTerminal(tok)) continue;
    out.push(tok);
  }
  return out;
}

// Scenes-bar variant (former `bpsScenes.headSections`): keeps every top-level
// element, including bare notes and standalone backticks.
export function headSectionsFromAst(ast: unknown): string[] {
  return sectionsFromAst(ast as SceneAst, false);
}

// bp3-adapter variant (former bp3.ts `headSectionNames`): drops control terminals
// and bare notes, keeping only the structural section symbols.
export function headSectionNamesFromAst(ast: unknown): string[] {
  return sectionsFromAst(ast as SceneAst, true);
}
