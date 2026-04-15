import { describe, it, expect } from 'vitest';
import { createMockCore } from './mock-runtime';
import { MockActors, MockScenes, MockMaps } from './mock-runtime';

describe('mock core', () => {
  it('starts empty (populated via loadSession)', () => {
    const core = createMockCore();
    expect(core.actors.list()).toEqual([]);
    expect(core.scenes.list()).toEqual([]);
    expect(core.maps.list()).toEqual([]);
  });

  it('clamps bpm', () => {
    const core = createMockCore();
    core.clock.setBpm(5);
    expect(core.clock.state.bpm).toBe(20);
    core.clock.setBpm(500);
    expect(core.clock.state.bpm).toBe(300);
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
    a.setActors([
      { name: 'x', file: 'x.tidal', runtime: 'tidal', active: false }
    ]);
    a.toggle('x');
    expect(a.list()[0].active).toBe(true);
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

  it('MockMaps setMappings', () => {
    const m = new MockMaps();
    m.setMappings([{ id: 'm1', source: { kind: 'cv', index: 1 }, target: { kind: 'tempo' } }]);
    expect(m.list()).toHaveLength(1);
  });
});
