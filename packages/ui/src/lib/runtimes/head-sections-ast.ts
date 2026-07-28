// Head-rule sections, read from the BPScript AST (`compileBPS(src).ast`) instead
// of the deprecated BP3 grammar TEXT. The macro structure of a `.bps` is the
// start rule's top-level RHS sequence: each plain `Symbol` is a section, a
// `{…}` Polymetric counts as ONE section, control terminals are filtered.
//
// This replaces the regex-on-grammar-text `headSections`/`headSectionNames` for
// the `.bps` path. The `.gr` path stays on the text reader (it never goes through
// compileBPS, so it has no AST).
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
// ⚠️ LA CONVENTION EST OBLIGATOIRE, et c'est délibéré (2026-07-28). `isNoteName` amont demande
// « ce mot est-il une note SOUS CETTE CONVENTION ? » : la réponse change pour 33 des 113 grammaires
// selon qu'on lit anglais, français ou sargam (chiffré par bp3-frontend). Une surface recopiée à la
// main ici déclarait UN argument et masquait le second — d'où ce paramètre SANS défaut : aucun
// appelant ne peut plus l'oublier en silence. `undefined` reste une valeur légitime (= anglais, le
// défaut BP3 documenté amont), mais il faut alors l'ÉCRIRE.
function isControlTerminal(sym: string, noteConvention: number | null | undefined): boolean {
  if (sym.startsWith('_')) return true;
  if (isNoteName(sym, noteConvention)) return true;
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

// Walk the start rule's top-level RHS into sections, dropping control terminals
// (incl. bare notes) — the bp3-adapter variant.
function sectionsFromAst(ast: SceneAst, noteConvention: number | null | undefined): string[] {
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
    if (isControlTerminal(tok, noteConvention)) continue;
    out.push(tok);
  }
  return out;
}

// bp3-adapter variant (former bp3.ts `headSectionNames`): drops control terminals
// and bare notes, keeping only the structural section symbols.
export function headSectionNamesFromAst(
  ast: unknown,
  noteConvention: number | null | undefined
): string[] {
  return sectionsFromAst(ast as SceneAst, noteConvention);
}

// How many SOUNDING leaves each top-level head-rule section expands into — used to
// give the Structure visualizer the REAL section boundaries (Sayr 7 notes, Rujoo 7,
// Qarar 4 notes + a held tail) instead of an equal three-way split. The head rule
// `S -> Sayr Rujoo Qarar` references sub-rules; the engine flattens them into one
// flat leaf sequence on derivation, so the sub-rule structure is lost in the tree.
// We recover each section's leaf span by counting, off the AST, how many terminal
// leaves its sub-rule produces (recursively, since a sub-rule may itself reference
// another). One count per top-level section, IN ORDER. Returns [] when the macro
// shape isn't a plain symbol sequence (polymetric/guarded/recursive cycles) — the
// caller then falls back to the equal split.
export function sectionLeafCounts(
  ast: unknown,
  noteConvention: number | null | undefined
): number[] {
  const a = ast as SceneAst;
  const rule = startRule(a);
  if (!rule) return [];
  // name → its (first) defining rule, so a section symbol can be expanded.
  const ruleByName = new Map<string, AstRule>();
  for (const sg of a.subgrammars ?? []) {
    for (const r of sg.rules) {
      const lhs = r.lhs.find((e) => e.name)?.name;
      if (lhs && !ruleByName.has(lhs)) ruleByName.set(lhs, r);
    }
  }
  // Count the leaves an RHS element expands into. A prolongation/rest is its OWN
  // leaf (the engine emits a node for each, e.g. Qarar's held tail). A symbol that
  // names a sub-rule recurses; a bare terminal/note is one leaf. `seen` breaks a
  // pathological recursive cycle (returns 0, which trips the sum guard → fallback).
  const countEl = (el: RhsEl, seen: Set<string>): number => {
    if (el.type === 'Prolongation' || el.type === 'Rest') return 1;
    if (el.type === 'Polymetric') return NaN; // not a flat section — bail
    const tok = elementToken(el);
    if (!tok) return 0;
    if (el.type === 'Symbol' || el.type === 'SymbolCall') {
      const sub = ruleByName.get(tok);
      if (sub && !isControlTerminal(tok, noteConvention)) {
        if (seen.has(tok)) return NaN; // cycle
        const next = new Set(seen);
        next.add(tok);
        return sub.rhs.reduce((acc, e) => acc + countEl(e, next), 0);
      }
    }
    // A control terminal occupies no audible leaf; everything else is one leaf.
    return isControlTerminal(tok, noteConvention) && tok.startsWith('_') ? 0 : 1;
  };
  const counts: number[] = [];
  for (const el of rule.rhs) {
    if (el.type === 'Control' || el.type === 'InstantControl') continue;
    const tok = elementToken(el);
    if (!tok) continue;
    if (isControlTerminal(tok, noteConvention) && tok.startsWith('_')) continue;
    const n = countEl(el, new Set());
    if (!Number.isFinite(n) || n <= 0) return []; // unmappable → fallback
    counts.push(n);
  }
  return counts;
}
