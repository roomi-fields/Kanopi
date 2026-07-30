import { describe, it, expect, beforeEach } from 'vitest';

// KAN-UX5 — le snapshot du workspace est namespacé PAR COMPTE :
//   kanopi:account:current       → nom du compte actif
//   kanopi:workspace:v1:<nom>    → snapshot du compte <nom>
// et l'ancienne clé globale `kanopi:workspace:v1` migre une fois vers le compte
// par défaut (rien n'est perdu), puis disparaît (une seule source de vérité).
import {
  DEFAULT_ACCOUNT,
  currentAccountName,
  setCurrentAccountName,
  listAccountNames,
  hasAccountSnapshot,
  migrateLegacyWorkspace,
  loadWorkspace,
  saveWorkspace,
  clearWorkspace,
  type PersistedWorkspace
} from './workspace-db';

const LEGACY_KEY = 'kanopi:workspace:v1';

function snap(paths: string[]): PersistedWorkspace {
  return {
    files: paths.map((p, i) => ({
      id: `f${i}`,
      path: p,
      name: p,
      contents: '// x',
      runtime: 'bpscript' as PersistedWorkspace['files'][number]['runtime']
    })),
    openTabIds: [],
    activeTabId: null,
    activeActors: []
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('KAN-UX5 — clés namespacées par compte', () => {
  it("sans compte choisi, le compte actif est 'default'", () => {
    expect(currentAccountName()).toBe(DEFAULT_ACCOUNT);
  });

  it('save écrit sous la clé du compte courant', () => {
    setCurrentAccountName('alice');
    saveWorkspace(snap(['mine.bps']));
    const raw = localStorage.getItem('kanopi:workspace:v1:alice');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).files[0].path).toBe('mine.bps');
    // la clé globale legacy n'est PAS touchée
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("load lit le compte courant, jamais celui d'un autre", () => {
    setCurrentAccountName('alice');
    saveWorkspace(snap(['alice.bps']));
    setCurrentAccountName('bob');
    expect(loadWorkspace()).toBeUndefined(); // bob n'a rien
    setCurrentAccountName('alice');
    expect(loadWorkspace()?.files[0].path).toBe('alice.bps');
  });

  it('clear ne retire que le snapshot du compte courant', () => {
    setCurrentAccountName('alice');
    saveWorkspace(snap(['alice.bps']));
    setCurrentAccountName('bob');
    saveWorkspace(snap(['bob.bps']));
    clearWorkspace(); // bob
    expect(hasAccountSnapshot('bob')).toBe(false);
    expect(hasAccountSnapshot('alice')).toBe(true);
  });

  it('listAccountNames = comptes ayant un snapshot + le compte actif', () => {
    setCurrentAccountName('alice');
    saveWorkspace(snap(['a.bps']));
    setCurrentAccountName('zoe'); // active, pas encore de snapshot
    expect(listAccountNames()).toEqual(['alice', 'zoe']);
  });
});

describe('KAN-UX5 — migration du snapshot global legacy', () => {
  it("le snapshot global devient l'espace du compte par défaut, rien n'est perdu", () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(snap(['legacy.bps'])));
    migrateLegacyWorkspace();
    expect(currentAccountName()).toBe(DEFAULT_ACCOUNT);
    expect(loadWorkspace()?.files[0].path).toBe('legacy.bps');
    // la clé legacy disparaît — une seule source de vérité
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("n'écrase JAMAIS un snapshot namespacé déjà présent", () => {
    setCurrentAccountName('alice');
    saveWorkspace(snap(['alice.bps']));
    localStorage.setItem(LEGACY_KEY, JSON.stringify(snap(['stale.bps'])));
    migrateLegacyWorkspace();
    expect(loadWorkspace()?.files[0].path).toBe('alice.bps');
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('sans clé legacy : aucune écriture (premier lancement propre)', () => {
    migrateLegacyWorkspace();
    expect(loadWorkspace()).toBeUndefined();
    expect(hasAccountSnapshot(DEFAULT_ACCOUNT)).toBe(false);
  });

  it('la migration est idempotente (rejouable sans effet)', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(snap(['legacy.bps'])));
    migrateLegacyWorkspace();
    migrateLegacyWorkspace();
    expect(loadWorkspace()?.files[0].path).toBe('legacy.bps');
  });
});
