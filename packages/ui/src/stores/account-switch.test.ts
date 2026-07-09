import { describe, it, expect, beforeEach } from 'vitest';

// KAN-UX5 — bascule de compte au niveau des VRAIS stores : changer de compte
// sauve l'espace courant sous SA clé, charge celui du compte cible, et un
// compte neuf reproduit le premier lancement (starters, aucun onglet ouvert) —
// jamais de fichiers inventés, jamais de fuite d'un compte à l'autre.
import { workspace } from './workspace.svelte';
import { account } from './account.svelte';
import { hasAccountSnapshot, setCurrentAccountName } from '../lib/persistence/workspace-db';
import { starterFiles } from '../lib/workspace/fixtures';

const STARTER_PATHS = starterFiles().map((f) => f.path);

beforeEach(() => {
  localStorage.clear();
  // Le singleton `account` survit d'un test à l'autre : après le clear, on
  // re-synchronise la clé localStorage sur son nom courant (comme en vrai,
  // où les deux ne divergent jamais).
  setCurrentAccountName(account.current);
});

describe('KAN-UX5 — account.switchTo', () => {
  it('nom vide ou déjà actif → refus, rien ne bouge', () => {
    const before = workspace.files;
    expect(account.switchTo('')).toBe(false);
    expect(account.switchTo('   ')).toBe(false);
    expect(account.switchTo(account.current)).toBe(false);
    expect(workspace.files).toBe(before);
  });

  it("bascule : sauve l'espace sortant sous SA clé, le compte neuf a les starters sans onglet", () => {
    const from = account.current;
    workspace.loadFiles([{ path: 'mine.bps', contents: 'S -> a' }], 'mine.bps');
    expect(workspace.openTabIds.length).toBe(1);

    expect(account.switchTo('alice')).toBe(true);
    expect(account.current).toBe('alice');

    // L'espace sortant est persisté sous la clé de SON compte.
    const saved = JSON.parse(localStorage.getItem(`kanopi:workspace:v1:${from}`)!);
    expect(saved.files.map((f: { path: string }) => f.path)).toEqual(['mine.bps']);

    // Compte neuf = premier lancement reproduit : starters, aucun onglet.
    expect(workspace.files.map((f) => f.path)).toEqual(STARTER_PATHS);
    expect(workspace.openTabIds).toEqual([]);
    expect(workspace.activeTabId).toBeNull();

    // Le compte est matérialisé tout de suite (survit à un reload).
    expect(hasAccountSnapshot('alice')).toBe(true);
    expect(account.known).toContain('alice');
    expect(account.known).toContain(from);
  });

  it('aller-retour : chaque compte retrouve SON espace (fichiers ET onglets)', () => {
    const from = account.current;
    workspace.loadFiles([{ path: 'mine.bps', contents: 'S -> a' }], 'mine.bps');

    account.switchTo('bob');
    workspace.loadFiles([{ path: 'bob.bps', contents: 'S -> b' }], 'bob.bps');

    account.switchTo(from);
    expect(workspace.files.map((f) => f.path)).toEqual(['mine.bps']);
    expect(workspace.openTabIds.length).toBe(1);
    expect(workspace.fileById(workspace.activeTabId!)?.path).toBe('mine.bps');

    account.switchTo('bob');
    expect(workspace.files.map((f) => f.path)).toEqual(['bob.bps']);
    expect(workspace.fileById(workspace.activeTabId!)?.path).toBe('bob.bps');
  });
});
