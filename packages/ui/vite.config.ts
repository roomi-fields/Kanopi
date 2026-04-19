import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Kanopi',
        short_name: 'Kanopi',
        description: 'An in-browser IDE for live coding music (Strudel, Hydra, JS/WebAudio).',
        theme_color: '#13161a',
        background_color: '#13161a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
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
  // @strudel/codemirror. Without this, Vite pre-bundles two copies and the
  // runtime complains ("@strudel/core was loaded more than once"), patterns
  // created in one never register with the other's scheduler → silence.
  resolve: {
    dedupe: [
      '@strudel/core',
      '@strudel/mini',
      '@strudel/transpiler',
      '@strudel/tonal',
      '@strudel/draw',
      '@strudel/webaudio'
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
      '@strudel/webaudio'
    ]
  },
  server: {
    port: 5173,
    strictPort: false,
    // WSL2: native inotify events don't propagate reliably across the
    // Windows/Linux boundary. Polling is the only way HMR catches edits
    // made from Windows-side editors or from Claude Code sessions running
    // in WSL on a Windows-mounted path. See .claude/skills/vite-hmr-reset/.
    watch: {
      usePolling: true,
      interval: 200
    }
  }
});
