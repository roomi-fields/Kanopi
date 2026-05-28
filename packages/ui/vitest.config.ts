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
      ).pathname
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts']
  }
});
