/**
 * Type surface for bpscript's SHARED order tokenizer, mapped via `tsconfig.paths`
 * so the type-checker uses THIS instead of descending into the sibling repo's raw
 * JS (per the integration mandate — no edits to /home/romi/dev/bp/*). The module
 * ships plain ESM JS with no `.d.ts`; we declare only the one export we consume.
 *
 * Consumed by runtime-ui's text view (`bpx-tree-canonical.ts`) which Kanopi cables
 * in; the `paths` entry resolves the bare specifier to this shim.
 *
 * Upstream: /home/romi/dev/bp/BPscript/src/transpiler/orderTokens.js
 */

/** Tokenize a canonical BP3 production into the ORDERED list of sounding tokens. */
export function tokenizeOrder(canonical: string): string[];
export default tokenizeOrder;
