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
  // PORT VERROUILLÉ — ÉCHOUER FORT plutôt que glisser en silence (incident Romain 2026-07-20).
  // Le service de stockage n'autorise QUE `localhost:5173` en CORS (voir storage-service.ts).
  // Par défaut, si 5173 est pris, Vite bascule SANS RIEN DIRE sur 5174 : l'app se charge
  // normalement, mais le navigateur bloque tout appel au stockage — connexion et inscription
  // échouent sans message compréhensible, et on croit son COMPTE cassé alors que c'est l'origine
  // qui est refusée. Romain a perdu du temps exactement là-dessus (compte créé sur un port,
  // inutilisable sur l'autre). `strictPort` transforme cette dérive muette en refus immédiat :
  // Vite s'arrête et dit que le port est occupé. Un serveur qui démarre sur une origine que le
  // service refuse est un faux vert — mieux vaut pas de serveur du tout.
  plugins: [
    svelte(),
    VitePWA({
      // WORKER PWA SUPPRIMÉ (demande Romain 2026-07-04) : le précache servait de VIEILLES
      // versions de l'app après rebuild/deploy (symptômes fantômes, rupture dev/prod ISO).
      // `selfDestroying` publie un worker d'AUTO-DESTRUCTION : chez tout client qui revient,
      // il désinstalle le worker existant et purge ses caches, puis ne cache plus rien.
      // NE PAS retirer le plugin à la place : les navigateurs déjà équipés garderaient
      // l'ancien worker (et l'ancienne app) indéfiniment. Coût assumé : plus d'offline ni
      // de précache d'échantillons — la fraîcheur prime (décision Romain).
      selfDestroying: true,
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
      // runtime-ui (dep source symlinkée) monte ses vues via `mount()` de `svelte` (îlots
      // impératifs : TextStreamPanel + les boutons de couches on/off). Étant symlinkée, ses
      // imports `svelte` résoudraient depuis SON node_modules → un 2ᵉ runtime Svelte 5, dont
      // le planificateur d'effets distinct FIGE les composants (les toggles de couches ne
      // réagiraient plus). Épingler `svelte` sur la copie de Kanopi = un seul runtime pour
      // l'app ET les vues montées (garde-fou intégration rappelé par runtime-ui, [607]).
      'svelte',
      '@strudel/core',
      '@strudel/mini',
      '@strudel/transpiler',
      '@strudel/tonal',
      '@strudel/draw',
      '@strudel/webaudio',
      '@strudel/codemirror',
      // PEERS OPTIONNELS de runtime-codevoices (dep source symlinkée) — pin BUILD [572].
      // `optimizeDeps.include` (plus bas) ne protège que le DEV : au `vite build`, Rollup
      // résout ces bare imports depuis le CHEMIN RÉEL de runtime-codevoices (pas de
      // node_modules là-bas) et, faute de résolution, substitue un STUB
      // `__vite-optional-peer-dep` VIDE (~0.03 kB) → en prod les moteurs de voix de code
      // (Strudel/Hydra/p5/Csound/Mercury) chargent un module vide = voix MUETTES pendant
      // que le dev sonne (rupture ISO dev/prod constatée 2026-07-04). Le dedupe épingle la
      // résolution sur la copie de Kanopi dans les DEUX modes.
      '@strudel/web',
      // Nouveaux peers optionnels bundlés (checklist runtime-codevoices [764] 22e9730) :
      // microtonal Strudel (@strudel/xen), soundfonts GM (@strudel/soundfonts) et p5.sound.
      // Même impératif de pin BUILD [572] que ci-dessus : sans dedupe+include, Rollup/vite
      // substitue un stub vide → voix microtonale/soundfont/p5-audio MUETTE.
      '@strudel/xen',
      '@strudel/soundfonts',
      'hydra-synth',
      'p5',
      'p5.sound',
      'mercury-engine',
      '@csound/browser'
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
      // Nouveaux peers bundlés (checklist [764] 22e9730) — pré-bundlés comme les autres
      // peers de runtime-codevoices pour éviter le stub vide (voix muette) en dev/--force.
      '@strudel/xen',
      '@strudel/soundfonts',
      'p5.sound',
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
  preview: {
    headers: { 'Document-Policy': 'js-profiling' }
  },
  server: {
    // JS Self-Profiling API (sonde `inspect.profileScroll`) : le navigateur ne l'expose
    // que si la RÉPONSE porte cet en-tête. Posé aussi sur le preview (bundle prod local).
    headers: { 'Document-Policy': 'js-profiling' },
    port: 5173,
    // VERROU (architecte 2026-07-20, cause mesurée) : le service de stockage n'autorise en
    // CORS que `localhost:5173`. Si 5173 est pris, Vite bascule SANS RIEN DIRE sur 5174 →
    // l'app se charge mais tout appel au stockage est bloqué par le navigateur, sans message
    // compréhensible (Romain a cru son COMPTE cassé). Échouer bruyamment vaut mieux que
    // servir une app muette sur une origine refusée.
    strictPort: true,
    // `bpx` and `bp3-frontend` are sibling repos linked via `file:` (npm
    // symlinks them into node_modules → their real paths live under
    // /home/romi/dev/bp, outside this project root). Vite's dev server
    // refuses to serve files outside the workspace by default; allow the
    // sibling tree so the Bol Processor adapter can import them.
    fs: {
      allow: ['..', '../../../bp']
    },
    // Serveur DU PORTILLON (`KANOPI_GATE=1`, posé par playwright.config.ts) : pas de HMR.
    // Le gate n'édite aucun fichier, donc le rechargement à chaud n'y a aucune utilité ; en
    // revanche son client RECHARGE LA PAGE quand la liaison se coupe puis revient (machine
    // chargée) — ce qui détruit le contexte d'exécution en plein test. Hors gate, le HMR
    // reste évidemment actif : c'est l'outil de travail quotidien.
    hmr: process.env.KANOPI_GATE ? false : undefined,
    // Native Linux (PC2, since 2026-06-14): inotify works, no polling needed.
    // Polling stays available as an opt-in for the legacy WSL2 path (edits
    // across a Windows/Linux boundary) via VITE_FORCE_POLLING / CHOKIDAR_USEPOLLING.
    watch: {
      usePolling: !!process.env.VITE_FORCE_POLLING || !!process.env.CHOKIDAR_USEPOLLING,
      interval: 200
    }
  }
});
