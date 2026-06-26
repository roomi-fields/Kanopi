import { describe, it, expect, vi, beforeEach } from 'vitest';

// KAN-C17 — non-regression. `restoreWorkspace` must NOT resurrect a tempo from
// localStorage: the tempo has no upstream source to restore (Kronos holds no
// session tempo, BPx derives its own via `@mm`). Even when a persisted snapshot
// still carries `bpm: 120` (older states could), restore must never call
// `clock.setBpm` — the tempo redécoule de la ré-évaluation de la scène.

// The snapshot module pulls in several stores; mock them all so the unit under
// test is just `restoreWorkspace`'s control flow. `clock` is the one we assert on.
// `vi.hoisted` lifts the spies above the hoisted `vi.mock` factories.
const { setBpm, loadWorkspace } = vi.hoisted(() => ({
  setBpm: vi.fn(),
  loadWorkspace: vi.fn()
}));

vi.mock('../../stores/clock.svelte', () => ({
  clock: { state: { bpm: 128 }, setBpm }
}));
vi.mock('../../stores/workspace.svelte', () => ({
  workspace: {
    files: [] as unknown[],
    openTabIds: [] as string[],
    activeTabId: null as string | null,
    fileById: () => undefined
  }
}));
vi.mock('../../stores/scenes.svelte', () => ({
  scenes: { active: null, activate: vi.fn() }
}));
vi.mock('../../stores/actors.svelte', () => ({
  actors: { list: [] as unknown[], toggle: vi.fn() }
}));
vi.mock('../../stores/ui.svelte', () => ({
  ui: {
    setSidebarWidth: vi.fn(),
    setRightPanelWidth: vi.fn(),
    setBottomPanelHeight: vi.fn(),
    bottomPanelCollapsed: false,
    bottomPanelTab: 'timeline'
  }
}));

// Control what the persisted snapshot looks like (`loadWorkspace` from vi.hoisted).
vi.mock('./workspace-db', () => ({
  loadWorkspace,
  saveWorkspace: vi.fn(),
  debounce: (fn: unknown) => fn
}));

import { restoreWorkspace } from './snapshot.svelte';

describe('KAN-C17 — restore does not resurrect a tempo from localStorage', () => {
  beforeEach(() => {
    setBpm.mockClear();
    loadWorkspace.mockReset();
  });

  it('a snapshot with bpm:120 does NOT push setBpm', () => {
    loadWorkspace.mockReturnValue({
      files: [],
      openTabIds: [],
      activeTabId: null,
      bpm: 120,
      activeScene: null,
      activeActors: []
    });
    expect(restoreWorkspace()).toBe(true);
    expect(setBpm).not.toHaveBeenCalled();
  });

  it('a snapshot without bpm also never touches the tempo', () => {
    loadWorkspace.mockReturnValue({
      files: [],
      openTabIds: [],
      activeTabId: null,
      activeScene: null,
      activeActors: []
    });
    expect(restoreWorkspace()).toBe(true);
    expect(setBpm).not.toHaveBeenCalled();
  });
});
