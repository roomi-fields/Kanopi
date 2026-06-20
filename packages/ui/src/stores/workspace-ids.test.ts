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

// Regression: opening several read-only resource browse files (`.json`, which
// resolve to the `kanopi` runtime via the unknown-extension fallback) used to
// evict one another through the single-session rule — opening a 3rd closed the
// 2nd. Read-only resources are NOT sessions; they must stack as ordinary tabs.
describe('workspace read-only resource tabs stack (no single-session eviction)', () => {
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

  it('an editable .kanopi session still evicts a previous one (rule intact)', () => {
    workspace.loadFiles([{ path: 'one.kanopi', contents: '@actor x: a.strudel' }], 'one.kanopi');
    const two = workspace.addFile('two.kanopi', '@actor y: b.strudel');
    workspace.openFile(two);
    const sessions = workspace.openTabIds.filter(
      (id) => workspace.fileById(id)?.runtime === 'kanopi' && !workspace.fileById(id)?.readOnly
    );
    expect(sessions.length).toBe(1); // only the newest editable session remains open
  });
});
