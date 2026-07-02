import { mount } from 'svelte';
import './styles/tokens.css';
import './styles/reset.css';
import './styles/global.css';
import App from './App.svelte';
import { restoreWorkspace } from './lib/persistence/snapshot.svelte';
import { core } from './lib/core';
import { workspace } from './stores/workspace.svelte';
import { clock } from './stores/clock.svelte';
import { actors } from './stores/actors.svelte';
import { scenes } from './stores/scenes.svelte';
import { openBlocks, installSlotErrorBridge } from './stores/blocks.svelte';
import { ui } from './stores/ui.svelte';
import { production } from './stores/production.svelte';
import { transport } from './stores/transport.svelte';
import { installKanopiApi } from './lib/pilot/kanopi-api';

const target = document.getElementById('app');
if (!target) throw new Error('#app root not found');

restoreWorkspace();
installSlotErrorBridge();
const app = mount(App, { target });

// Dev-only: expose raw stores on `window.__kanopi` for Playwright-based verification.
// Not used in prod code — purely a testing hatch. Kept guarded by `import.meta.env.DEV`
// so tree-shaking drops it from the production bundle.
if (import.meta.env.DEV) {
  (window as unknown as { __kanopi: unknown }).__kanopi = {
    core,
    workspace,
    clock,
    actors,
    scenes,
    openBlocks,
    ui,
    // The most recent derived production (PROJECTION of BPx `derive()`), re-published
    // each loop cycle when re-random re-rolls — read by the re-random e2e to compare
    // consecutive cycles. DEV-only hatch, dropped from the prod bundle.
    production,
    // Loop / re-random session toggles (default loop ON, re-random OFF). The re-random
    // e2e flips `reRandom` ON before evaluating so the Kairos re-derive arms at load.
    transport
  };
}

// `window.kanopi` — PUBLIC piloting API (« second front ») : commands + inspection that
// DELEGATE to the same entry points as the UI (see lib/pilot/kanopi-api.ts). Unlike the
// `__kanopi` testing hatch above, this is a SUPPORTED, VERSIONED public surface
// (`window.kanopi.version`) installed in EVERY build — prod included (décision Romain
// 2026-07-02). It exposes no raw stores and holds no state: every method delegates.
installKanopiApi();

export default app;
