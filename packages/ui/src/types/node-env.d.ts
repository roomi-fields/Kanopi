// Minimal Node `process.env` typing for build-time configuration files
// (`vite.config.ts`, `playwright.config.ts`). We intentionally avoid the full
// `@types/node` package — only the env var lookup surface is needed.
declare const process: {
  env: Record<string, string | undefined>;
};
