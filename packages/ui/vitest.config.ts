import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    // `@csound/browser`'s package.json has only `module` (no `main`/`exports`),
    // so vite's node resolver cannot find an entry. Tests never actually call
    // `await import('@csound/browser')` (the adapter does it lazily at runtime,
    // jsdom won't load WASM anyway), but vite still resolves the dynamic import
    // during transform of `csound.ts`. Aliasing the package to its built file
    // gives the resolver a definite target without changing dev/build behaviour.
    alias: {
      '@csound/browser': new URL(
        '../../node_modules/@csound/browser/dist/csound.js',
        import.meta.url
      ).pathname,
      // `runtime-codevoices`' barrel statically re-exports `strudel-cm`, which
      // eagerly imports `@strudel/codemirror` (→ `@kabelsalat/web`, broken ESM
      // interop under jsdom — fine in the browser). Tests never use the CM6
      // extensions; stub them so the registry import resolves. Dev/build use the
      // real package. Same rationale as the `@csound/browser` alias above.
      '@strudel/codemirror': new URL('./test/stubs/strudel-codemirror.ts', import.meta.url)
        .pathname,
      // `runtime-ui`'s barrel statically re-exports view modules that pull in
      // `.svelte` view components (`TextStreamPanel.svelte`, `TimelinePanel.svelte`)
      // carrying `<style>` blocks vitest/jsdom can't preprocess (`Cannot create
      // proxy with a non-object as target or handler`, at `preprocessCSS`). No
      // test mounts `productionViews` at runtime; the stub re-exports the real
      // `traceEnabled`/`setTraceEnabled` getter (single-source, no CSS import
      // chain) and stubs `productionViews` empty. Same rationale as the aliases
      // above.
      'runtime-ui': new URL('./test/stubs/runtime-ui.ts', import.meta.url).pathname
    },
    dedupe: ['svelte']
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    // DURCISSEMENT PC2 [450] — plafonne les workers : un run vitest à 8 workers a gonflé à
    // ~7,4 Go et contribué à un freeze machine (chaque worker ~1 Go). 3 garde le parallélisme
    // sans saturer la RAM. La ceinture OOM (choom + ulimit) est dans scripts/vitest-guard.sh.
    maxWorkers: 3,
    minWorkers: 1
  }
});
