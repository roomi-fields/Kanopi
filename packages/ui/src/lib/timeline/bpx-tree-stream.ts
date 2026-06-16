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
// The tree's leaves carry only `symbolId`, not the note name. We resolve names by
// TEMPORAL CORRELATION with the flat `derive().tokens` (same events, integer ms):
// match each `leaf` to the next unconsumed flat token whose rounded start/end
// equals the leaf's rounded span. `rest` leaves emit `-` (no name).

import type { ProductionTreeNode, ProductionTree } from '../../stores/production.svelte';

/** One entry of the flat stream `timeline.js` consumes (ms, as `Timeline.load` expects). */
export interface StreamToken {
  token: string;
  start: number;
  end: number;
}

/** The flat tokens from `derive().tokens` we correlate leaf names against. */
export interface FlatToken {
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
 * @param tree       `derive().tree` (or its `.root`); tolerant of either shape.
 * @param flatTokens `derive().tokens` (ms), used only to resolve leaf names by time.
 */
export function bpxTreeToTimelineStream(
  tree: TreeRoot | null | undefined,
  flatTokens: FlatToken[] = []
): StreamToken[] {
  const root = resolveRoot(tree);
  if (!root) return [];

  const out: StreamToken[] = [];

  // Name resolver: index flat tokens by rounded (start,end), consuming in order so
  // simultaneous leaves (same span) map to distinct tokens deterministically.
  const resolve = makeNameResolver(flatTokens);

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

/**
 * Build a closure that maps a leaf (symbolId + ms span) to its terminal NAME by
 * correlating with the flat token list. The tree leaf has no name; the flat token
 * does. Matching is by rounded (start,end) — BPx spans are floats (e.g. 666.666),
 * flat tokens are integer ms for the SAME events. Each flat token is consumed once
 * so ties (simultaneous notes in different voices) resolve in stream order.
 */
function makeNameResolver(
  flatTokens: FlatToken[]
): (symbolId: number, startMs: number, endMs: number) => string {
  // Bucket flat tokens by rounded (start,end); keep insertion order within a bucket.
  const buckets = new Map<string, FlatToken[]>();
  for (const t of flatTokens) {
    const key = `${Math.round(t.start)}:${Math.round(t.end)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(t);
    else buckets.set(key, [t]);
  }
  const cursors = new Map<string, number>();

  return (symbolId, startMs, endMs) => {
    const key = `${Math.round(startMs)}:${Math.round(endMs)}`;
    const arr = buckets.get(key);
    if (arr) {
      const i = cursors.get(key) ?? 0;
      if (i < arr.length) {
        cursors.set(key, i + 1);
        return arr[i].token;
      }
    }
    // No temporal match (shouldn't happen for sounding leaves) — fall back to a
    // stable placeholder so the block still renders rather than silently dropping.
    return `#${symbolId}`;
  };
}
