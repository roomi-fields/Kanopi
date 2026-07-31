/**
 * Type surface for bpscript's SHARED order tokenizer, mapped via `tsconfig.paths`
 * so the type-checker uses THIS instead of descending into the sibling repo's raw
 * JS (per the integration mandate — no edits to /home/romi/dev/bp/*). The module
 * ships plain ESM JS with no `.d.ts`; we declare only the one export we consume.
 *
 * `bpx-tree-canonical.ts`, runtime-ui's former consumer, was deleted 2026-07-24
 * (commit f44c96b — zero live caller; Kanopi never imported it). The only remaining
 * import of `tokenizeOrder` in runtime-ui today is a test oracle
 * (`bpx-tree-annotations.test.ts`), not a production path; the live text view
 * (`bpx-tree-annotations.ts`) only references it in a comment. The `paths` entry
 * still resolves the bare specifier to this shim for whatever imports it.
 *
 * Upstream: /home/romi/dev/bp/BPscript/src/transpiler/orderTokens.js
 */

/** Tokenize a canonical BP3 production into the ORDERED list of sounding tokens. */
export function tokenizeOrder(canonical: string): string[];
export default tokenizeOrder;
