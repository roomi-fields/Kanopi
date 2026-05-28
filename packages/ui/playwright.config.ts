import { defineConfig, devices } from '@playwright/test';

// WSL2-aware Playwright config. Audio runtimes cannot safely run in parallel
// (shared AudioContext, single device output), so workers stays at 1. Retries
// compensate for occasional WSL2 timing flakiness around the dev server boot.
//
// `webServer` auto-spawns the Vite dev server with the same polling env vars
// the project relies on for HMR on WSL2 (see vite-hmr-reset skill).
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
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'VITE_FORCE_POLLING=1 CHOKIDAR_USEPOLLING=1 npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
