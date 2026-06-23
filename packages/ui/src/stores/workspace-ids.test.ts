import { describe, it, expect } from 'vitest';
import { workspace } from './workspace.svelte';

// Regression: two `loadFiles` calls (or addFile + loadFiles) landing in the SAME
// millisecond used to mint COLLIDING ids (`f<ms>-<i>`), so a stale tab id left in
// `openTabIds` could resolve to a DIFFERENT freshly-loaded file — resurfacing the
// previous program's blocks (the phantom "02" open block). Ids must be unique for
// the page lifetime regardless of timing.
describe('workspace file id uniqueness', () => {
  it('mints distinct ids across rapid loadFiles calls', () => {
    workspace.loadFiles([{ path: 'a.bps', contents: 'S -> a' }], 'a.bps');
    const first = [...workspace.openTabIds];
    workspace.loadFiles([{ path: 'b.bps', contents: 'S -> b' }], 'b.bps');
    const second = [...workspace.openTabIds];

    expect(first.length).toBe(1);
    expect(second.length).toBe(1);
    // No collision — the new load's tab id differs from the previous one's.
    expect(second[0]).not.toBe(first[0]);
    // And the only files are the freshly-loaded one.
    expect(workspace.files.map((f) => f.name)).toEqual(['b.bps']);
  });

  it('addFile ids never collide with a loadFiles id minted the same tick', () => {
    workspace.loadFiles([{ path: 'x.bps', contents: 'S -> x' }], 'x.bps');
    const loadedId = workspace.files[0].id;
    const addedId = workspace.addFile('y.txt', 'hi');
    expect(addedId).not.toBe(loadedId);
  });
});

// Read-only resource browse files (`.json`) must stack as ordinary tabs —
// opening several never evicts one another.
describe('workspace read-only resource tabs stack', () => {
  it('opening multiple resources keeps every tab open', () => {
    workspace.loadFiles([{ path: 'scene.bps', contents: 'S -> a' }], 'scene.bps');
    const a = workspace.addFile('resources/alphabet/arabic.json', '{}', true);
    workspace.openFile(a);
    const b = workspace.addFile('resources/tuning/maqam_rast.json', '{}', true);
    workspace.openFile(b);
    const c = workspace.addFile('resources/module/core.json', '{}', true);
    workspace.openFile(c);
    // scene + 3 resources all present — none evicted.
    expect(workspace.openTabIds).toContain(a);
    expect(workspace.openTabIds).toContain(b);
    expect(workspace.openTabIds).toContain(c);
    expect(workspace.openTabIds.length).toBe(4);
  });
});
