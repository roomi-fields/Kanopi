import { describe, it, expect } from 'vitest';
import { createMockCore } from './mock-runtime';
import { MockActors, MockScenes } from './mock-runtime';

describe('mock core', () => {
  it('starts empty (populated via setActors)', () => {
    const core = createMockCore();
    expect(core.actors.list()).toEqual([]);
    expect(core.scenes.list()).toEqual([]);
  });

  it('emits console entries', () => {
    const core = createMockCore();
    const before = core.console.entries().length;
    core.console.push({ runtime: 'system', level: 'info', msg: 'hello' });
    expect(core.console.entries().length).toBe(before + 1);
    core.console.clear();
    expect(core.console.entries().length).toBe(0);
  });

  it('MockActors setActors + toggle', () => {
    const a = new MockActors();
    a.setActors([{ name: 'x', file: 'x.strudel', runtime: 'strudel', active: false }]);
    a.toggle('x');
    expect(a.list()[0].active).toBe(true);
  });

  // (Le test « unmuteAll route par setMuted » a disparu AVEC la couche de mute
  //  d'armement, supprimée le 2026-07-24 : elle faisait double emploi avec le
  //  désarmement. Le seul mute restant est celui du mixer, couvert par
  //  `stores/mixer.svelte.test.ts` et l'e2e `mute-code-voice.spec.ts`.)

  it('MockScenes activate marks exactly one active', () => {
    const s = new MockScenes();
    s.setScenes([
      { name: 'a', actors: {}, active: false },
      { name: 'b', actors: {}, active: false }
    ]);
    s.activate('b');
    const actives = s.list().filter((x) => x.active);
    expect(actives.length).toBe(1);
    expect(actives[0].name).toBe('b');
  });
});
