// Shared leaf-name resolver for the BPx tree adapters (canonical ORDER serializer
// and the piano-roll marker stream). Both walk `derive().tree`, whose leaves carry
// only `symbolId` — not the terminal name — so both need the SAME resolution rule.
// Factored out here to keep a single source for that rule.
//
// Resolution order:
//   PRIMARY   the deterministic `symbolNames` table (`symbolId → name`) read off
//             the grammar's own symbol table at derive time — no collision on
//             simultaneous polymetric voices.
//   FALLBACK  temporal correlation with the flat `derive().tokens`: bucket by
//             rounded (start,end), consume each once so ties resolve in stream order.
//   LAST RESORT  `#<symbolId>`.

/** One entry of the flat token list (`derive().tokens`, ms) we correlate names against. */
export interface FlatToken {
  token: string;
  start: number;
  end: number;
}

/**
 * Build a closure mapping a leaf (symbolId + ms span) to its terminal NAME, per the
 * PRIMARY → FALLBACK → LAST RESORT rule documented above.
 */
export function makeNameResolver(
  flatTokens: FlatToken[],
  symbolNames?: Record<number, string>
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
    // PRIMARY: deterministic name from the grammar symbol table.
    const named = symbolNames?.[symbolId];
    if (named !== undefined) return named;
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
