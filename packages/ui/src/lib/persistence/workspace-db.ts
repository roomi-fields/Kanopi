import type { VirtualFile } from '../workspace/types';

const LS_KEY = 'kanopi:workspace:v1';

export interface PersistedWorkspace {
  files: VirtualFile[];
  openTabIds: string[];
  activeTabId: string | null;
  /** @deprecated KAN-C17 — plus écrit (le tempo n'a pas de source amont à
   *  restaurer) ; gardé optionnel pour tolérer la lecture d'anciens snapshots. */
  bpm?: number;
  activeScene: string | null;
  activeActors: string[];
  sidebarWidth?: number;
  rightPanelWidth?: number;
  bottomPanelHeight?: number;
  bottomPanelCollapsed?: boolean;
  // 'timeline' is the legacy id for today's 'structure' view (mapped on restore).
  bottomPanelTab?: 'console' | 'text' | 'structure' | 'timeline';
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
