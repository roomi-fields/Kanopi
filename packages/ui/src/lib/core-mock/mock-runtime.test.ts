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

  it('MockActors unmuteAll routes through setMuted (subclass override fires)', () => {
    // Proves the fix: unmuteAll must dispatch via `this.setMuted` so a subclass
    // override (RealActors.setMuted → onMute → re-arm the Kronos voice) actually runs,
    // instead of writing the `muted` field directly and bypassing it.
    const seen: Array<[string, boolean]> = [];
    class SpyActors extends MockActors {
      setMuted(name: string, muted: boolean) {
        seen.push([name, muted]);
        super.setMuted(name, muted);
      }
    }
    const a = new SpyActors();
    a.setActors([
      { name: 'x', file: 'x.bps', runtime: 'bpscript', active: true, muted: true },
      { name: 'y', file: 'y.bps', runtime: 'bpscript', active: true, muted: false },
      { name: 'z', file: 'z.bps', runtime: 'bpscript', active: true, muted: true }
    ]);
    a.unmuteAll();
    // Override invoked for each MUTED actor only, with `false`.
    expect(seen).toEqual([
      ['x', false],
      ['z', false]
    ]);
    expect(a.list().every((act) => !act.muted)).toBe(true);
  });

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
