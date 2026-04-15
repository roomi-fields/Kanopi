import type { VirtualFile } from '../workspace/types';

const LS_KEY = 'kanopi:workspace:v1';

export interface PersistedWorkspace {
  files: VirtualFile[];
  openTabIds: string[];
  activeTabId: string | null;
  bpm: number;
  activeScene: string | null;
  activeActors: string[];
  sidebarWidth?: number;
  rightPanelWidth?: number;
}

export function loadWorkspace(): PersistedWorkspace | undefined {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as PersistedWorkspace;
  } catch {
    return undefined;
  }
}

export function saveWorkspace(w: PersistedWorkspace): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(w));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function clearWorkspace(): void {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
