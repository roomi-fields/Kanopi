import { defineConfig, devices } from '@playwright/test';

// WSL2-aware Playwright config. Audio runtimes cannot safely run in parallel
// (shared AudioContext, single device output), so workers stays at 1. Retries
// compensate for occasional WSL2 timing flakiness around the dev server boot.
//
// `webServer` auto-spawns the Vite dev server with the same polling env vars
// the project relies on for HMR on WSL2 (see vite-hmr-reset skill). When
// KANOPI_BASE_URL is set (e.g. running specs against a deployed build), we
// skip the local dev server entirely.
//
// KANOPI_CROSS_BROWSER=1 enables firefox + webkit projects in addition to the
// chromium default — useful for the self-test layer's cross-browser sweep.
const baseURL = process.env.KANOPI_BASE_URL ?? 'http://localhost:5173';
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
        command: 'VITE_FORCE_POLLING=1 CHOKIDAR_USEPOLLING=1 npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
});
