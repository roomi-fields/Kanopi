import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// runtime-ui (display runtime, linked via `link:`) imports bpscript's SHARED order
// tokenizer with a deep specifier (`bpscript/src/transpiler/orderTokens.js`). runtime-ui
// declares `bpscript` as an OPTIONAL peer and carries no copy, so Vite — resolving that
// import from runtime-ui's own location — substitutes a `__vite-optional-peer-dep` stub
// that exports nothing → `tokenizeOrder` is undefined and the whole graph throws (blank
// screen). bpscript IS present in Kanopi's tree (hoisted to the repo-root node_modules);
// this alias pins the deep specifier to Kanopi's real bpscript. Resolved off `import.meta.url`
// (no `node:` import — the type-checker has no @types/node) against THIS package's node_modules,
// where npm symlinks the `file:` bpscript dep (`packages/ui/node_modules/bpscript -> .../BPscript`,
// lockfile `link:true`). NB: bpscript is NOT hoisted to the repo root (the others are) — pointing
// this alias at the root used to rely on a STALE MANUAL COPY there (removed 2026-06-30, deps-fraîches);
// the npm-managed per-package symlink is the durable source. Host-side wiring glue — not a contract change.
const BPSCRIPT_ORDER_TOKENS = new URL(
  './node_modules/bpscript/src/transpiler/orderTokens.js',
  import.meta.url
).pathname;

// Same class of glue for the BPScript EDITOR MODE (`bpscript/public/editor/bpscript-lang.js`,
// consumed AS-IS): it imports @codemirror/language + @lezer/highlight as bare specifiers, but
// the BPscript repo ships no node_modules — dev resolution falls back to Kanopi's copy while
// Rollup (vite build) resolves from the file's REAL path and FAILS. Alias both to Kanopi's
// hoisted copies (also required for CM6 correctness: two @codemirror/language instances would
// break facets/highlighting).
const CM_LANGUAGE = new URL('../../node_modules/@codemirror/language', import.meta.url).pathname;
const LEZER_HIGHLIGHT = new URL('../../node_modules/@lezer/highlight', import.meta.url).pathname;

// Subpath deployment support: GitHub Actions exports VITE_BASE_PATH=/kanopi/
// before `npm run build` so assets and the service-worker scope resolve under
// https://roomi-fields.com/kanopi/. Dev and tests keep the default `/`.
const BASE_PATH = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      base: BASE_PATH,
      scope: BASE_PATH,
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Kanopi',
        short_name: 'Kanopi',
        description: 'An in-browser IDE for live coding music (Strudel, Hydra, JS/WebAudio).',
        theme_color: '#13161a',
        background_color: '#13161a',
        display: 'standalone',
        start_url: BASE_PATH,
        scope: BASE_PATH,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Cache app shell + the big Strudel sample bundles so things work offline
        // after the first run. Keep it liberal for v1 — we can tighten later.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Doc utilisateur EMBARQUÉE (/docs, MkDocs, source unique — [463]) : NE PAS la
        // précacher (elle a sa propre navigation et ses centaines de pages) NI servir la
        // coquille SPA sur ses navigations — sinon /kanopi/docs/* tomberait sur l'app au
        // lieu des pages .html RÉELLES. En dev il n'y a pas de service worker → sans effet.
        globIgnores: ['**/docs/**'],
        navigateFallbackDenylist: [/^\/kanopi\/docs\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/tidalcycles\/dirt-samples\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'dirt-samples',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  define: {
    global: 'globalThis'
  },
  // Strudel ships the same @strudel/core as a dep of @strudel/web AND
  // @strudel/codemirror. Vite pre-bundling still creates two prebundled
  // chunks (one per top-level package), so the "@strudel/core loaded more
  // than once" warning persists in dev — but dedupe below guarantees both
  // chunks resolve the same module graph, so only one scheduler runs and
  // haps aren't duplicated. Verified via a per-hap counter run on 2026-04-19.
  resolve: {
    alias: {
      // Pin runtime-ui's deep bpscript import to Kanopi's real copy (see note above).
      'bpscript/src/transpiler/orderTokens.js': BPSCRIPT_ORDER_TOKENS,
      // Pin the editor mode's CM6/Lezer bare imports to Kanopi's copies (see note above).
      '@codemirror/language': CM_LANGUAGE,
      '@lezer/highlight': LEZER_HIGHLIGHT
    },
    dedupe: [
      '@strudel/core',
      '@strudel/mini',
      '@strudel/transpiler',
      '@strudel/tonal',
      '@strudel/draw',
      '@strudel/webaudio',
      '@strudel/codemirror'
    ]
  },
  optimizeDeps: {
    include: [
      '@strudel/web',
      '@strudel/codemirror',
      '@strudel/core',
      '@strudel/mini',
      '@strudel/transpiler',
      '@strudel/tonal',
      '@strudel/draw',
      '@strudel/webaudio',
      // Pre-bundle the ~1.5 MB browserify bundle (Tone.js included): without
      // this, the first `import('mercury-engine')` pays a 20-25s on-demand
      // transform on a cold dev server under load — long enough for the
      // Ctrl+Enter user activation to expire before Tone.start() runs.
      'mercury-engine',
      // The remaining code-voice OPTIONAL peers of `runtime-codevoices` (a symlinked
      // source dep). Vite resolves a symlinked dep's imports from its REAL upstream
      // path, NOT Kanopi's node_modules — so on a fresh optimize (`--force`) it can't
      // find these host-installed peers and substitutes a `__vite-optional-peer-dep`
      // STUB → Hydra/p5/Csound load nothing (black canvas, 0 pixels). Pre-bundling them
      // here (exactly like @strudel/* + mercury-engine above) pins them to Kanopi's copy.
      'hydra-synth',
      'p5',
      '@csound/browser',
      // The BPScript editor mode (`bpscript/public/editor/bpscript-lang.js`, a symlinked
      // source dep consumed AS-IS) imports these CM6/Lezer packages, but the BPscript repo
      // ships no node_modules: dev resolution falls back to Kanopi's copy, while Rollup
      // (vite build) resolves from the file's REAL path and fails ("Rollup failed to
      // resolve import '@codemirror/language'"). Dedupe pins both to Kanopi's copy — which
      // is also required for CM6 correctness (two @codemirror/language instances would
      // break facets/highlighting).
      '@codemirror/language',
      '@lezer/highlight'
    ],
    // DEPS-FRAÎCHES (décision 2026-06-30) : les amonts BPx/kairos/kronos sont des
    // liens (symlinks) vers leur dépôt source. On les CONSOMME EN SOURCE pour la
    // boucle de dev — leur package.json expose une condition d'export `development`
    // → `./src/index.ts`, que Vite choisit en dev. Les EXCLURE du pré-bundling fait
    // que Vite sert/compile leur `src` à la volée : éditer leur source se reflète sur
    // 5173 sans rebuild ni rsync (zéro `dist` dans la boucle → impossible de périmer).
    // Le `dist` ne sert plus QU'À la prod (condition d'export `import`).
    exclude: ['@kairos/core', '@kronos/core', 'bpx']
  },
  server: {
    port: 5173,
    strictPort: false,
    // `bpx` and `bp3-frontend` are sibling repos linked via `file:` (npm
    // symlinks them into node_modules → their real paths live under
    // /home/romi/dev/bp, outside this project root). Vite's dev server
    // refuses to serve files outside the workspace by default; allow the
    // sibling tree so the Bol Processor adapter can import them.
    fs: {
      allow: ['..', '../../../bp']
    },
    // Native Linux (PC2, since 2026-06-14): inotify works, no polling needed.
    // Polling stays available as an opt-in for the legacy WSL2 path (edits
    // across a Windows/Linux boundary) via VITE_FORCE_POLLING / CHOKIDAR_USEPOLLING.
    watch: {
      usePolling: !!process.env.VITE_FORCE_POLLING || !!process.env.CHOKIDAR_USEPOLLING,
      interval: 200
    }
  }
});
