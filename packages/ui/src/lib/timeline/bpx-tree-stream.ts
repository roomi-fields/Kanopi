// Pure adapter: BPx derivation tree → the marker stream `timeline.js` parses.
//
// The vendored `timeline.js` `load()` does NOT take a tree. It takes a FLAT list
// of `{ token, start, end }` and reconstructs voices + polymetric groups from
// structural MARKER tokens in that stream:
//   - `{`            opens a polymetric group (timeline.js:190)
//   - `,`            adds a voice to the current group (timeline.js:192)
//   - `}`            closes the group (timeline.js:194)
//   - `-` (end>start) a silence/rest (timeline.js:202)
//   - anything else  a note block, voice-packed by non-overlap (timeline.js:204,235)
// Group span comes from the `{`/`}` markers' own start/end; nesting from marker
// stack depth (timeline.js:223-230). So to make the struct band appear we just
// REPLAY the tree as that marker stream — no change to timeline.js logic.
//
// The tree's leaves carry only `symbolId`, not the note name. We resolve names
// PRIMARILY from `symbolNames` (`symbolId → name`, read off the grammar's own
// symbol table at derive time — deterministic, no collision). When that table is
// absent (older paths) we FALL BACK to TEMPORAL CORRELATION with the flat
// `derive().tokens`: match each `leaf` to the next unconsumed flat token whose
// rounded start/end equals the leaf's rounded span; `#<symbolId>` is the last
// resort. `rest` leaves emit `-` (no name).

import type { ProductionTreeNode, ProductionTree } from '../../stores/production.svelte';
import { makeNameResolver, type FlatToken } from '../text-order/bpx-tree-names';

export type { FlatToken };

/** One entry of the flat stream `timeline.js` consumes (ms, as `Timeline.load` expects). */
export interface StreamToken {
  token: string;
  start: number;
  end: number;
}

type TreeRoot = ProductionTree | { root: ProductionTreeNode } | ProductionTreeNode;

/**
 * Walk the derivation tree and emit the ordered marker stream `timeline.js` parses.
 * - `polymetric` → `{`, voice0 leaves, `,`, voice1 leaves, …, `}` (recursive for nesting)
 * - `voice` children are emitted in order (an `occupying` leaf or a nested `polymetric`)
 * - `occupying` `role:'rest'` → `-`; otherwise the name resolved from `flatTokens`
 * - sequence-level `occupying` leaves are emitted as-is (no surrounding markers)
 *
 * @param tree        `derive().tree` (or its `.root`); tolerant of either shape.
 * @param flatTokens  `derive().tokens` (ms), the temporal-correlation FALLBACK.
 * @param symbolNames `symbolId → name` from the grammar's symbol table (PRIMARY).
 */
export function bpxTreeToTimelineStream(
  tree: TreeRoot | null | undefined,
  flatTokens: FlatToken[] = [],
  symbolNames?: Record<number, string>
): StreamToken[] {
  const root = resolveRoot(tree);
  if (!root) return [];

  const out: StreamToken[] = [];

  // Name resolver: prefer the deterministic `symbolNames` table; else correlate
  // by time (flat tokens indexed by rounded (start,end), consumed in order).
  const resolve = makeNameResolver(flatTokens, symbolNames);

  const emitNode = (node: ProductionTreeNode): void => {
    switch (node.type) {
      case 'sequence':
        for (const child of node.children) emitNode(child);
        break;
      case 'polymetric': {
        const span = node.span;
        // Group markers carry the group's own span so timeline.js sizes the band.
        out.push({ token: '{', start: span?.startMs ?? 0, end: span?.startMs ?? 0 });
        node.voices.forEach((voice, vi) => {
          if (vi > 0) {
            out.push({ token: ',', start: span?.startMs ?? 0, end: span?.startMs ?? 0 });
          }
          emitNode(voice);
        });
        out.push({ token: '}', start: span?.endMs ?? 0, end: span?.endMs ?? 0 });
        break;
      }
      case 'voice':
        for (const child of node.children) emitNode(child);
        break;
      case 'occupying': {
        const start = node.span.startMs;
        const end = node.span.endMs;
        if (node.role === 'rest') {
          // Silence: timeline.js wants `-` with end>start to draw the gap.
          out.push({ token: '-', start, end });
        } else {
          out.push({ token: resolve(node.symbolId, start, end), start, end });
        }
        break;
      }
      case 'event':
        // Zero-duration events aren't note blocks for the piano-roll; skip.
        break;
    }
  };

  emitNode(root);
  return out;
}

function resolveRoot(tree: TreeRoot | null | undefined): ProductionTreeNode | null {
  if (!tree) return null;
  if ('root' in tree && tree.root) return tree.root as ProductionTreeNode;
  if ('type' in tree) return tree as ProductionTreeNode;
  return null;
}
