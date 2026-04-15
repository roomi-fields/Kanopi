import { workspace } from '../../stores/workspace.svelte';
import { clock } from '../../stores/clock.svelte';
import { scenes } from '../../stores/scenes.svelte';
import { actors } from '../../stores/actors.svelte';
import { ui } from '../../stores/ui.svelte';
import {
  debounce,
  loadWorkspace,
  saveWorkspace,
  type PersistedWorkspace
} from './workspace-db';

function snapshot(): PersistedWorkspace {
  return {
    files: workspace.files,
    openTabIds: workspace.openTabIds,
    activeTabId: workspace.activeTabId,
    bpm: clock.state.bpm,
    activeScene: scenes.active?.name ?? null,
    activeActors: actors.list.filter((a) => a.active).map((a) => a.name),
    sidebarWidth: ui.sidebarWidth,
    rightPanelWidth: ui.rightPanelWidth
  };
}

export function restoreWorkspace(): boolean {
  const w = loadWorkspace();
  if (!w) return false;

  if (w.files?.length) {
    workspace.files = w.files;
  }
  workspace.openTabIds = w.openTabIds.filter((id) => workspace.fileById(id));
  workspace.activeTabId = w.activeTabId && workspace.fileById(w.activeTabId) ? w.activeTabId : null;

  if (typeof w.bpm === 'number') clock.setBpm(w.bpm);
  if (typeof w.sidebarWidth === 'number') ui.setSidebarWidth(w.sidebarWidth);
  if (typeof w.rightPanelWidth === 'number') ui.setRightPanelWidth(w.rightPanelWidth);

  if (w.activeScene) scenes.activate(w.activeScene);

  const wantOn = new Set(w.activeActors);
  for (const a of actors.list) {
    if (a.active !== wantOn.has(a.name)) actors.toggle(a.name);
  }
  return true;
}

let suppressPersist = false;
export function suppressPersistOnce() {
  suppressPersist = true;
}

const persist = debounce(() => {
  if (suppressPersist) return;
  saveWorkspace(snapshot());
}, 50);

// Flush synchronously before the tab/reload unloads (localStorage is sync).
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (suppressPersist) return;
    saveWorkspace(snapshot());
  });
}

export function installAutosave() {
  $effect.root(() => {
    $effect(() => {
      // touch every reactive surface we care about
      void workspace.files.length;
      void workspace.files.map((f) => f.contents).join('|').length;
      void workspace.openTabIds.length;
      void workspace.activeTabId;
      void clock.state.bpm;
      void scenes.active?.name;
      void actors.list.map((a) => `${a.name}:${a.active}`).join(',');
      void ui.sidebarWidth;
      void ui.rightPanelWidth;
      persist();
    });
  });
}
