import { workspace } from '../../stores/workspace.svelte';
import { scenes } from '../../stores/scenes.svelte';
import { actors } from '../../stores/actors.svelte';
import { ui } from '../../stores/ui.svelte';
import { debounce, loadWorkspace, saveWorkspace, type PersistedWorkspace } from './workspace-db';

function snapshot(): PersistedWorkspace {
  return {
    files: workspace.files,
    openTabIds: workspace.openTabIds,
    activeTabId: workspace.activeTabId,
    // KAN-C17 — le tempo n'est PAS snapshotté. Il n'a aucune source amont à
    // restaurer (Kronos n'a pas de tempo de session, BPx dérive le sien via
    // `@mm`/tree.metadata.tempo) : le persister puis le ré-injecter ressusciterait
    // une autorité tempo depuis le localStorage. Le tempo redécoule de la
    // ré-évaluation de la scène.
    activeScene: scenes.active?.name ?? null,
    activeActors: actors.list.filter((a) => a.active).map((a) => a.name),
    sidebarWidth: ui.sidebarWidth,
    rightPanelWidth: ui.rightPanelWidth,
    bottomPanelHeight: ui.bottomPanelHeight,
    bottomPanelCollapsed: ui.bottomPanelCollapsed,
    bottomPanelTab: ui.bottomPanelTab
  };
}

export function restoreWorkspace(): boolean {
  const w = loadWorkspace();
  if (!w) return false;

  if (w.files?.length) {
    workspace.files = w.files;
  }
  // De-duplicate AND filter out stale ids. Older persisted states could
  // hold duplicates because workspace.openTabIds was written directly from
  // restore without a Set pass.
  workspace.openTabIds = Array.from(new Set(w.openTabIds ?? [])).filter((id) =>
    workspace.fileById(id)
  );
  workspace.activeTabId = w.activeTabId && workspace.fileById(w.activeTabId) ? w.activeTabId : null;

  // KAN-C17 — on ne restaure PAS le tempo depuis le snapshot : pas de source
  // amont, le tempo redécoule de la ré-évaluation de la scène (`@mm`). Un ancien
  // snapshot peut encore porter `w.bpm` ; on l'ignore.
  if (typeof w.sidebarWidth === 'number') ui.setSidebarWidth(w.sidebarWidth);
  if (typeof w.rightPanelWidth === 'number') ui.setRightPanelWidth(w.rightPanelWidth);
  if (typeof w.bottomPanelHeight === 'number') ui.setBottomPanelHeight(w.bottomPanelHeight);
  if (typeof w.bottomPanelCollapsed === 'boolean') ui.bottomPanelCollapsed = w.bottomPanelCollapsed;
  // Old snapshots may carry 'structure'/'text' (production views now live in a
  // separate runtime, no longer rendered here): coerce them to 'console' so the
  // restored panel is never empty.
  if (w.bottomPanelTab)
    ui.bottomPanelTab = w.bottomPanelTab === 'console' ? w.bottomPanelTab : 'console';

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

/** Synchronous flush — bound to Ctrl+S so the user can force-save. */
export function flushPersist() {
  if (suppressPersist) return;
  saveWorkspace(snapshot());
}

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
      void scenes.active?.name;
      void actors.list.map((a) => `${a.name}:${a.active}`).join(',');
      void ui.sidebarWidth;
      void ui.rightPanelWidth;
      void ui.bottomPanelHeight;
      void ui.bottomPanelCollapsed;
      void ui.bottomPanelTab;
      persist();
    });
  });
}
