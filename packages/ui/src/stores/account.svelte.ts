import { workspace } from './workspace.svelte';
import { starterFiles } from '../lib/workspace/fixtures';
import { flushPersist, restoreWorkspace } from '../lib/persistence/snapshot.svelte';
import {
  currentAccountName,
  setCurrentAccountName,
  listAccountNames,
  hasAccountSnapshot
} from '../lib/persistence/workspace-db';

// KAN-UX5 — comptes minimaux, sans authentification : taper un nom inconnu crée
// le compte. Le store est une PROJECTION du localStorage (clé compte courant +
// clés de snapshots existantes) — il n'invente aucun état : le workspace d'un
// compte neuf reproduit le premier lancement (starters, aucun onglet), jamais
// des fichiers fabriqués.
class AccountStore {
  current = $state(currentAccountName());
  known = $state<string[]>(listAccountNames());

  /** Re-read the known-accounts list from localStorage (e.g. before showing
   * the picker — another tab may have created accounts meanwhile). */
  refresh() {
    this.known = listAccountNames();
  }

  /**
   * Switch to (or create) the named account: save the outgoing account's
   * space under ITS key, then load the target's snapshot — or, for a brand
   * new account, reproduce the first-launch workspace (starter files, no
   * open tab). Returns false when the name is empty or already active.
   */
  switchTo(rawName: string): boolean {
    const name = rawName.trim();
    if (!name || name === this.current) return false;

    // Persist the outgoing space synchronously BEFORE the key changes.
    flushPersist();

    setCurrentAccountName(name);
    this.current = name;

    // Empty the workspace first (also drops per-file block memos — ids from
    // another account's snapshot are foreign to this page's minted ids), so
    // nothing from the previous account leaks into the loaded space.
    workspace.loadFiles([]);
    if (hasAccountSnapshot(name)) {
      restoreWorkspace();
    } else {
      // First launch of this account — same as the app's own first launch.
      workspace.loadFiles(starterFiles().map((f) => ({ path: f.path, contents: f.contents })));
    }

    // Materialize the account immediately (a new name must survive a reload
    // even before the debounced autosave fires).
    flushPersist();
    this.known = listAccountNames();
    return true;
  }
}

export const account = new AccountStore();
