import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';

// Memoized BPScript compile. Several reactive consumers compile the SAME active
// source on EVERY keystroke — the libraries panel (`referencedLibraries`), the
// compile indicator (`programCompileStatus`), the scene bar (`modelFromFile`) and
// the editor linter. Without memoization each keystroke ran 3-4 full compiles,
// which made typing laggy. A small LRU keyed by the exact source string collapses
// them to ONE compile per content (and keeps a few recent files warm).
//
// The result is read-only for these consumers (errors / ast.directives / scenes),
// so sharing the cached reference is safe.

const CACHE = new Map<string, unknown>();
const MAX = 8;

/** `compileToBPxAST(source)` memoized by source string (LRU, size 8). */
export function compileBps(source: string): unknown {
  if (CACHE.has(source)) {
    // Refresh LRU recency.
    const v = CACHE.get(source);
    CACHE.delete(source);
    CACHE.set(source, v);
    return v;
  }
  const result = compileToBPxAST(source);
  CACHE.set(source, result);
  if (CACHE.size > MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  return result;
}
