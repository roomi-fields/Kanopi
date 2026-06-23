import { describe, it, expect, vi } from 'vitest';
import { createMockCore } from './mock-runtime';
import { MockActors, MockScenes, MockMaps, MockClock } from './mock-runtime';
import type { KanopiEvent } from '../events/types';

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

  it('setBpm is a no-op (no emit, no onTempo) when the tempo is unchanged', () => {
    const c = new MockClock();
    c.setBpm(120);
    let emits = 0;
    let tempoFanouts = 0;
    c.subscribe(() => emits++); // subscribe() fires once immediately
    c.setOnTempo(() => tempoFanouts++);
    const emitsAfterSubscribe = emits;
    // Re-setting the SAME tempo must not churn subscribers or re-fan-out onTempo.
    // A `.bps` with `@mm` re-applies its own tempo on every Play→replay; without
    // this guard the clock re-emits, re-entering the replay listener → recursion.
    c.setBpm(120);
    expect(emits).toBe(emitsAfterSubscribe);
    expect(tempoFanouts).toBe(0);
    // A genuine change still emits + fans out.
    c.setBpm(70);
    expect(emits).toBe(emitsAfterSubscribe + 1);
    expect(tempoFanouts).toBe(1);
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
    a.setActors([{ name: 'x', file: 'x.tidal', runtime: 'tidal', active: false }]);
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

  it('clock.play emits a transport event on the event bus', () => {
    const core = createMockCore();
    const spy = vi.fn();
    core.events.on('transport', spy);
    core.clock.play();
    expect(spy).toHaveBeenCalledTimes(1);
    const ev = spy.mock.calls[0][0] as KanopiEvent;
    expect(ev.type).toBe('transport');
    if (ev.type === 'transport') {
      expect(ev.playing).toBe(true);
      expect(ev.runtime).toBe('clock');
    }
    core.clock.stop();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('clock emits no duplicate transport when play called twice', () => {
    const core = createMockCore();
    const spy = vi.fn();
    core.events.on('transport', spy);
    core.clock.play();
    core.clock.play();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('clock.startSilently starts the transport WITHOUT firing the re-eval hook', () => {
    const c = new MockClock();
    const onTransport = vi.fn();
    c.setOnTransport(onTransport);
    c.startSilently();
    expect(c.state.playing).toBe(true);
    // The surgical start must NOT re-evaluate the armed set (no onTransport).
    expect(onTransport).not.toHaveBeenCalled();
    // A real Play, by contrast, does fire the re-eval hook.
    c.stop();
    c.play();
    expect(onTransport).toHaveBeenCalledWith(true);
  });

  it('clock.startSilently raises silentStart only during subscriber notification', () => {
    const c = new MockClock();
    let seenDuring: boolean | undefined;
    c.subscribe((s) => {
      if (s.playing) seenDuring = c.silentStart;
    });
    expect(c.silentStart).toBe(false);
    c.startSilently();
    expect(seenDuring).toBe(true); // the block-replay listener can detect it
    expect(c.silentStart).toBe(false); // cleared after the synchronous emit
  });

  it('clock.pause/stop toggle the transport flags (position lives in Kronos, not here)', () => {
    // The clock no longer carries bar/beat/phase — position is Kronos's Transport,
    // sampled by the kronos-cursor store. This only asserts the transport FLAGS the
    // clock still owns: paused (halt-in-place) vs stopped (teardown), never true while
    // playing. The frozen-vs-rewound POSITION is proven on the kronos-cursor store /
    // Kronos suite, not on the clock.
    const core = createMockCore();
    (core.clock as unknown as { state: { playing: boolean } }).state = {
      ...core.clock.state,
      playing: true
    };
    core.clock.pause();
    expect(core.clock.state.playing).toBe(false);
    // Paused ≠ stopped: the paused flag is set so the UI can tell them apart.
    expect(core.clock.state.paused).toBe(true);
    // play() clears paused and resumes; stop() clears paused too.
    core.clock.play();
    expect(core.clock.state.paused).toBe(false);
    expect(core.clock.state.playing).toBe(true);
    core.clock.stop();
    expect(core.clock.state.paused).toBe(false);
    expect(core.clock.state.playing).toBe(false);
  });
});
