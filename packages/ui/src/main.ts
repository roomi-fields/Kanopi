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
import { openBlocks, installBlockReplay } from './stores/blocks.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app root not found');

restoreWorkspace();
installBlockReplay();
const app = mount(App, { target });

// Dev-only: expose stores on window for Playwright-based verification.
// Not used in prod code — purely a testing hatch. Kept guarded by `import.meta.env.DEV`
// so tree-shaking drops it from the production bundle.
if (import.meta.env.DEV) {
  (window as unknown as { __kanopi: unknown }).__kanopi = { core, workspace, clock, actors, scenes, openBlocks };
}

export default app;
