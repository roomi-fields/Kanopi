/**
 * Test-only stub for `runtime-ui`, aliased in `vitest.config.ts` — same pattern
 * as the `@csound/browser` / `@strudel/codemirror` aliases there.
 *
 * The real barrel (`runtime-ui/src/index.ts`) statically re-exports the view
 * modules (`textView`, `timelineView`, `traceView`), which pull in `.svelte`
 * view components (`TextStreamPanel.svelte`, `TimelinePanel.svelte`) carrying
 * `<style>` blocks. Vitest/jsdom can't preprocess that CSS and crashes
 * (`Cannot create proxy with a non-object as target or handler`, at
 * `preprocessCSS`). No test mounts `productionViews` at runtime (verified) —
 * only the `traceEnabled`/`setTraceEnabled` getter (consumed synchronously by
 * `bpx-adapter.ts`) is a real value import from this barrel in tests.
 *
 * The getter is re-exported VERBATIM from its real source module
 * (`trace-switch.svelte.ts` — a pure rune module, no CSS, no `.svelte` view
 * import) — single-source, no reimplementation. `productionViews` is stubbed
 * empty since nothing exercises it under vitest.
 */
export {
  traceEnabled,
  setTraceEnabled
} from '../../../../../runtime-ui/src/views/trace/trace-switch.svelte';

export const productionViews: readonly unknown[] = [];
