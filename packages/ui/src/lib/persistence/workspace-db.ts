import type { VirtualFile } from '../workspace/types';

// KAN-UX5 — deux espaces : la bibliothèque bundlée reste le "standard" (lecture
// seule, panneau Library) ; le workspace persisté est l'espace PERSO, namespacé
// par compte. Un compte = un nom tapé par l'utilisateur, sans authentification.
//
// Modèle de clés localStorage :
//   kanopi:account:current        → nom du compte actif
//   kanopi:workspace:v1:<nom>     → snapshot du workspace du compte <nom>
//   kanopi:workspace:v1 (legacy)  → snapshot global d'avant les comptes ; migré
//                                   une fois vers le compte par défaut, puis retiré.
const LEGACY_KEY = 'kanopi:workspace:v1';
const WS_PREFIX = 'kanopi:workspace:v1:';
const ACCOUNT_KEY = 'kanopi:account:current';
export const DEFAULT_ACCOUNT = 'default';

/** Name of the active account ('default' when none was ever chosen). */
export function currentAccountName(): string {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)?.trim();
    return raw || DEFAULT_ACCOUNT;
  } catch {
    return DEFAULT_ACCOUNT;
  }
}

export function setCurrentAccountName(name: string): void {
  try {
    localStorage.setItem(ACCOUNT_KEY, name);
  } catch {
    /* best-effort persistence only */
  }
}

/** Accounts known on this machine = one saved snapshot per name, plus the
 * active account (which may not have persisted yet). Sorted for stable UI. */
export function listAccountNames(): string[] {
  const names = new Set<string>([currentAccountName()]);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(WS_PREFIX)) names.add(k.slice(WS_PREFIX.length));
    }
  } catch {
    /* localStorage unavailable — only the active name */
  }
  return [...names].sort();
}

export function hasAccountSnapshot(name: string): boolean {
  try {
    return localStorage.getItem(WS_PREFIX + name) != null;
  } catch {
    return false;
  }
}

/** One-shot migration: the pre-account global snapshot becomes the default
 * account's personal space (nothing is lost, nothing is invented). Never
 * overwrites an already-namespaced snapshot; removes the legacy key so there
 * is a single source of truth afterwards. Call BEFORE the first load. */
export function migrateLegacyWorkspace(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw == null) return;
    const key = WS_PREFIX + currentAccountName();
    if (localStorage.getItem(key) == null) localStorage.setItem(key, raw);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore quota / disabled storage */
  }
}

function wsKey(): string {
  return WS_PREFIX + currentAccountName();
}

export interface PersistedWorkspace {
  files: VirtualFile[];
  openTabIds: string[];
  activeTabId: string | null;
  activeScene: string | null;
  activeActors: string[];
  sidebarWidth?: number;
  rightPanelWidth?: number;
  bottomPanelHeight?: number;
  bottomPanelCollapsed?: boolean;
  // 'timeline' is the legacy id for today's 'structure' view (mapped on restore).
  bottomPanelTab?: 'console' | 'text' | 'structure' | 'trace' | 'timeline';
}

export function loadWorkspace(): PersistedWorkspace | undefined {
  try {
    const raw = localStorage.getItem(wsKey());
    if (!raw) return undefined;
    return JSON.parse(raw) as PersistedWorkspace;
  } catch {
    return undefined;
  }
}

export function saveWorkspace(w: PersistedWorkspace): void {
  try {
    localStorage.setItem(wsKey(), JSON.stringify(w));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function clearWorkspace(): void {
  try {
    localStorage.removeItem(wsKey());
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
