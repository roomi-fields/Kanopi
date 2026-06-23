/**
 * Test-only stub for `@strudel/codemirror`, aliased in `vitest.config.ts` — same
 * pattern as the `@csound/browser` alias there.
 *
 * `runtime-codevoices`' index barrel statically re-exports `voices/strudel-cm`,
 * which does `import * as cm from '@strudel/codemirror'` at module load. The real
 * package pulls `@kabelsalat/web`, whose ESM named exports don't interop under
 * jsdom (works fine in the browser — Strudel sounds in dev). Any unit test that
 * touches the runtime registry imports that barrel, so the eager load must
 * resolve. Tests never use these CM6 extensions; the stub just gives the
 * resolver a definite, loadable target. Dev/build keep the real package.
 */
export const widgetPlugin: unknown[] = [];
export const updateWidgets = () => {};
export const setWidget = () => {};
export const addWidget = () => {};
export const extensions: Record<string, unknown> = {};
export const highlightExtension: unknown[] = [];
export const highlightMiniLocations = () => {};
export const updateMiniLocations = () => {};
