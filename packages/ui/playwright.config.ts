import { defineConfig, devices } from '@playwright/test';

// WSL2-aware Playwright config. Audio runtimes cannot safely run in parallel
// (shared AudioContext, single device output), so workers stays at 1. Retries
// compensate for occasional WSL2 timing flakiness around the dev server boot.
//
// `webServer` : le portillon POSSÈDE son serveur, sur un port DÉDIÉ au gate (`GATE_PORT`,
// jamais 5173/5174), avec `reuseExistingServer: false` → TOUJOURS un serveur FRAIS, jamais la
// réutilisation d'un serveur de dev qui tourne. Ferme pour de bon la classe de collision
// e2e↔serveur-de-dev : l'ancienne config ciblait 5173 avec `reuseExistingServer: !CI` (donc
// `true` en local), et RÉUTILISAIT le serveur de dev actif de l'utilisateur — les e2e
// martelaient son 5173. Playwright démarre ET teardown ce serveur. Quand KANOPI_BASE_URL est
// posé (build déployé externe), on ne spawn rien.
//
// Serveur de DEV (pas preview) : les e2e s'appuient sur la surface de pilotage `window.kanopi`,
// affordance DEV-ONLY absente du build de prod (un preview casse 28 e2e sur
// `undefined (reading 'workspace')`). Le port dédié + `reuseExistingServer:false` suffisent à
// isoler le gate ; inutile — et cassant — de passer par un build de prod.
//
// KANOPI_CROSS_BROWSER=1 enables firefox + webkit projects in addition to the
// chromium default — useful for the self-test layer's cross-browser sweep.
const GATE_PORT = 4321;
const baseURL = process.env.KANOPI_BASE_URL ?? `http://localhost:${GATE_PORT}`;
const crossBrowser = process.env.KANOPI_CROSS_BROWSER === '1';

const projects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] }
  }
];

if (crossBrowser) {
  projects.push(
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  );
}

export default defineConfig({
  // MÊME mise en place que la campagne unitaire, MÊME fichier : la légende de l'état des voisins
  // lus vivants, et son refus de s'afficher vide. Une campagne d'écran mesure contre les mêmes
  // arbres de travail ; deux moitiés de bancs dont une seule porte sa légende laisseraient un
  // vert d'écran illisible.
  globalSetup: './test/regime-voisins.globalSetup.mjs',
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 2,
  reporter: 'list',
  expect: {
    timeout: 5000
  },
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects,
  webServer: process.env.KANOPI_BASE_URL
    ? undefined
    : {
        // Serveur de DEV frais sur le port dédié au gate. `--strictPort` : échoue plutôt que
        // de glisser sur un autre port (sinon `url` ne correspondrait plus).
        // `reuseExistingServer: false` : jamais la réutilisation d'un serveur qui tourne — le
        // gate possède le sien, frais, et le teardown.
        // `KANOPI_GATE=1` coupe le HMR de CE serveur (vite.config.ts). Le portillon n'édite
        // aucun fichier : le HMR n'y sert à rien, mais son client RECHARGE LA PAGE dès que la
        // liaison de rechargement se coupe et se rétablit — ce qui arrive quand la machine est
        // chargée. Symptôme observé (2 portillons de suite, 2026-07-24) : « Execution context
        // was destroyed, most likely because of a navigation » en plein échantillonnage de RMS
        // (tests/helpers.ts:119) et `window.__kanopi` devenu undefined — sur des tests DIFFÉRENTS
        // à chaque passe, qui repassent tous en isolation. On retire la source de rechargement,
        // on ne touche à AUCUNE assertion.
        command: `KANOPI_GATE=1 npm run dev -- --port ${GATE_PORT} --strictPort`,
        url: `http://localhost:${GATE_PORT}`,
        reuseExistingServer: false,
        // Le preview démarre vite, mais le CPU peut être chargé — marge large.
        timeout: 240_000
      }
});
