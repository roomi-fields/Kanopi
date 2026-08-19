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
    // La LÉGENDE de cette campagne : l'état des voisins lus vivants, imprimé en tête et refusant
    // de s'afficher vide (voir le fichier). Mise en place GLOBALE, jamais amorce de banc — la
    // raison est écrite ci-dessous, à `setupFiles`.
    globalSetup: ['./test/regime-voisins.globalSetup.mjs'],
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
    // ⚠️ PAS DE `setupFiles` POUR CONSTRUIRE LE REGISTRE, ET C'EST MESURÉ : un fichier d'amorce
    // qui importe le registre instancie TOUTE la chaîne (registre → adaptateur → `bpx`) AVANT que
    // les simulacres d'un fichier de banc s'appliquent. L'adaptateur capture alors la VRAIE
    // fonction, et un espion posé sur le module ne voit plus rien — `createSession` appelé quatre
    // fois, zéro vu. Trois bancs ont rougi ainsi le 2026-08-10, et j'ai éliminé six causes avant
    // de trouver que la septième était mon propre fichier d'amorce.
    // Chaque banc qui lit le registre l'initialise donc LUI-MÊME, comme le cœur le fait.
    // DURCISSEMENT PC2 [450] — plafonne les workers : un run vitest à 8 workers a gonflé à
    // ~7,4 Go et contribué à un freeze machine (chaque worker ~1 Go). 3 garde le parallélisme
    // sans saturer la RAM. La ceinture OOM (choom + ulimit) est dans scripts/vitest-guard.sh.
    maxWorkers: 3,
    minWorkers: 1
  }
});
