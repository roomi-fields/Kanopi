import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { parseBP3 } from 'bp3-frontend';

// Memoized BPScript compile. Several reactive consumers compile the SAME active
// source on EVERY keystroke. Mesurés (2026-07-31), et volontairement ÉNUMÉRÉS plutôt
// que comptés — un nombre se périme dès qu'un consommateur s'ajoute :
//   · `referencedLibraries` + `programCompileStatus`  — lib/library/referenced.ts
//   · `declaredInputsForScene`                        — components/statusbar/Statusbar.svelte
//   · `interpsForScene`                               — components/topbar/StrudelStatusPill.svelte
//   · préchauffe à l'ouverture                        — lib/runtimes/preload-on-open.svelte.ts
//   · le linter de l'éditeur, lui DÉBOUNCÉ            — components/editor/lang-bpscript.ts
// Les trois du milieu passent par `bpx-adapter.ts`, qui appelle `compileBps` sans le
// savoir : c'est pour ça qu'un décompte par appel direct les manque.
// Sans mémoïsation, chaque frappe déclenchait autant de compilations complètes qu'il y
// a de consommateurs montés, ce qui rendait la frappe poussive. A small LRU keyed by the exact source string collapses
// them to ONE compile per content (and keeps a few recent files warm).
//
// The result is read-only for these consumers (errors / ast.directives / scenes),
// so sharing the cached reference is safe.

const CACHE = new Map<string, unknown>();
const MAX = 8;

/**
 * `compileToBPxAST(source, environnement)` memoized (LRU, size 8). The cache key
 * folds in `environnement.tempo`: the session default tempo is injected INTO the
 * AST when the scene declares no `@mm`, so two evals of the SAME source at a
 * DIFFERENT session tempo must NOT share the same cached AST (stale default).
 */
export function compileBps(source: string, environnement?: { tempo?: number }): unknown {
  const key = `${source}\u0000${environnement?.tempo ?? ''}`;
  if (CACHE.has(key)) {
    // Refresh LRU recency.
    const v = CACHE.get(key);
    CACHE.delete(key);
    CACHE.set(key, v);
    return v;
  }
  const result = compileToBPxAST(source, environnement);
  CACHE.set(key, result);
  if (CACHE.size > MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  return result;
}

const GR_CACHE = new Map<string, unknown>();
const GR_MAX = 8;

/**
 * `parseBP3(source)` memoized (LRU, size 8) — same pattern as `compileBps`, for
 * `.gr` native BP3 grammars. Several reactive consumers (compile chip, libraries
 * panel) call this on every keystroke; without memoization each keystroke ran a
 * full parse per consumer.
 */
export function parseGr(source: string): unknown {
  if (GR_CACHE.has(source)) {
    const v = GR_CACHE.get(source);
    GR_CACHE.delete(source);
    GR_CACHE.set(source, v);
    return v;
  }
  const result = parseBP3(source);
  GR_CACHE.set(source, result);
  if (GR_CACHE.size > GR_MAX) {
    const oldest = GR_CACHE.keys().next().value;
    if (oldest !== undefined) GR_CACHE.delete(oldest);
  }
  return result;
}
