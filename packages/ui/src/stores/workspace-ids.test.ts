import { describe, it, expect } from 'vitest';
import { workspace } from './workspace.svelte';

// Regression: two `openBundle` calls (or addFile + openBundle) landing in the SAME
// millisecond used to mint COLLIDING ids (`f<ms>-<i>`), so a stale tab id left in
// `openTabIds` could resolve to a DIFFERENT freshly-loaded file — resurfacing the
// previous program's blocks (the phantom "02" open block). Ids must be unique for
// the page lifetime regardless of timing.
describe('workspace file id uniqueness', () => {
  it('mints distinct ids across rapid openBundle calls', () => {
    const idA = workspace.openBundle([{ path: 'a-ids.bps', contents: 'S -> a' }], 'a-ids.bps');
    const idB = workspace.openBundle([{ path: 'b-ids.bps', contents: 'S -> b' }], 'b-ids.bps');

    expect(idA).not.toBeNull();
    expect(idB).not.toBeNull();
    // No collision — the new bundle's focused id differs from the previous one's.
    expect(idB).not.toBe(idA);
  });

  it('addFile ids never collide with an openBundle id minted the same tick', () => {
    const loadedId = workspace.openBundle([{ path: 'x-ids.bps', contents: 'S -> x' }], 'x-ids.bps');
    const addedId = workspace.addFile('y-ids.txt', 'hi');
    expect(addedId).not.toBe(loadedId);
  });
});

// Opening a scene from the library is EDIT-ONLY: it must APPEND a new tab, never
// wipe the tabs already open (Romain's tab semantics — the whole point of
// `openBundle` replacing the old wipe-and-reload `loadFiles`).
describe('workspace openBundle never wipes existing tabs', () => {
  it('opening a second bundle keeps the first tab open', () => {
    const first = workspace.openBundle([{ path: 'keep-a.bps', contents: 'S -> a' }], 'keep-a.bps');
    expect(first).not.toBeNull();
    const second = workspace.openBundle([{ path: 'keep-b.bps', contents: 'S -> b' }], 'keep-b.bps');
    expect(second).not.toBeNull();
    // Both tabs are still open — the second load did not evict the first.
    expect(workspace.openTabIds).toContain(first);
    expect(workspace.openTabIds).toContain(second);
    // The newly-opened bundle's file got focus.
    expect(workspace.activeTabId).toBe(second);
  });

  it('re-opening an already-open bundle refocuses it instead of duplicating it', () => {
    const first = workspace.openBundle([{ path: 'reopen.bps', contents: 'S -> a' }], 'reopen.bps');
    workspace.openBundle([{ path: 'other.bps', contents: 'S -> b' }], 'other.bps');
    const again = workspace.openBundle([{ path: 'reopen.bps', contents: 'S -> a' }], 'reopen.bps');
    expect(again).toBe(first);
    expect(workspace.activeTabId).toBe(first);
  });
});

// Read-only resource browse files (`.json`) must stack as ordinary tabs —
// opening several never evicts one another.
describe('workspace read-only resource tabs stack', () => {
  it('opening multiple resources keeps every tab open', () => {
    const sceneId = workspace.openBundle(
      [{ path: 'scene-ids.bps', contents: 'S -> a' }],
      'scene-ids.bps'
    );
    const a = workspace.addFile('resources/alphabet/arabic-ids.json', '{}', true);
    workspace.openFile(a);
    const b = workspace.addFile('resources/tuning/maqam_rast-ids.json', '{}', true);
    workspace.openFile(b);
    const c = workspace.addFile('resources/module/core-ids.json', '{}', true);
    workspace.openFile(c);
    // scene + 3 resources all present — none evicted.
    expect(workspace.openTabIds).toContain(sceneId);
    expect(workspace.openTabIds).toContain(a);
    expect(workspace.openTabIds).toContain(b);
    expect(workspace.openTabIds).toContain(c);
  });
});
