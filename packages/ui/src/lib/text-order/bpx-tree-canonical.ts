// Pure serializer: BPx derivation tree → canonical ORDER string → ordered token list.
//
// The TEXT-BY-ORDER view shows the derived production by ORDER (not by time):
// the sequence of produced symbols, structure preserved, no metric expansion.
//
// This module walks `derive().tree` left→right, depth-first, and emits the
// canonical string of the SYMBOLS/RESTS/STRUCTURE subset (the part BPx seals in
// the tree — inline controls `_vel`/`_transpose` and `=`/`:` markers are NOT in
// the tree, so they are out of scope here, by design). It then feeds that string
// to bpscript's SHARED tokenizer `tokenizeOrder` (the single source of truth for
// the order-token cut: `{ } & / ,` are non-emitted separators, controls `_x(args)`
// are one whole token, sounding tokens are maximal runs). We do NOT re-implement
// that cut — we consume it.
//
// Tree leaves carry only `symbolId`, not the terminal name. We resolve names
// PRIMARILY from `symbolNames` (`symbolId → name`, read off the grammar's own
// symbol table at derive time — deterministic, no collision on simultaneous
// polymetric voices). When that table is absent (older paths) we FALL BACK to
// TEMPORAL CORRELATION with the flat `derive().tokens` — the SAME technique the
// piano-roll adapter `bpx-tree-stream.ts` uses: bucket flat tokens by rounded
// (start,end), consume each once. `#<symbolId>` is the last resort.

import { tokenizeOrder } from 'bpscript/src/transpiler/orderTokens.js';
import type { ProductionTreeNode, ProductionTree } from '../../stores/production.svelte';
import { makeNameResolver, type FlatToken } from './bpx-tree-names';

export type { FlatToken };

type TreeRoot = ProductionTree | { root: ProductionTreeNode } | ProductionTreeNode;

/**
 * Serialize the derivation tree to the canonical ORDER string of the symbols
 * subset:
 * - `sequence` → children in order, space-separated
 * - `polymetric` → `{` + voices joined by `,` (each voice = its children spaced) + `}`
 * - `voice` → its children, space-separated
 * - `occupying` `role:'rest'` → `-`; otherwise the name resolved from `flatTokens`
 * - `occupying` `role:'prolongation'` → `_` (the order-token prolongation marker)
 * - `event` (zero-duration) → skipped (not a sounding order token)
 *
 * @param tree        `derive().tree` (or its `.root`); tolerant of either shape.
 * @param flatTokens  `derive().tokens` (ms), the temporal-correlation FALLBACK.
 * @param symbolNames `symbolId → name` from the grammar's symbol table (PRIMARY).
 */
export function bpxTreeToCanonical(
  tree: TreeRoot | null | undefined,
  flatTokens: FlatToken[] = [],
  symbolNames?: Record<number, string>
): string {
  const root = resolveRoot(tree);
  if (!root) return '';

  const resolve = makeNameResolver(flatTokens, symbolNames);

  const emit = (node: ProductionTreeNode): string => {
    switch (node.type) {
      case 'sequence':
        return node.children.map(emit).filter(Boolean).join(' ');
      case 'polymetric': {
        const voices = node.voices.map(emit).join(',');
        return `{${voices}}`;
      }
      case 'voice':
        return node.children.map(emit).filter(Boolean).join(' ');
      case 'occupying':
        if (node.role === 'rest') return '-';
        if (node.role === 'prolongation') return '_';
        return resolve(node.symbolId, node.span.startMs, node.span.endMs);
      case 'event':
        return '';
    }
  };

  return emit(root);
}

/**
 * Convenience: serialize the tree, then run bpscript's shared `tokenizeOrder` to
 * get the ORDERED token list (separators dropped, controls kept whole).
 */
export function orderedTokensFromTree(
  tree: TreeRoot | null | undefined,
  flatTokens: FlatToken[] = [],
  symbolNames?: Record<number, string>
): string[] {
  const canonical = bpxTreeToCanonical(tree, flatTokens, symbolNames);
  if (!canonical) return [];
  return tokenizeOrder(canonical);
}

function resolveRoot(tree: TreeRoot | null | undefined): ProductionTreeNode | null {
  if (!tree) return null;
  if ('root' in tree && tree.root) return tree.root as ProductionTreeNode;
  if ('type' in tree) return tree as ProductionTreeNode;
  return null;
}
