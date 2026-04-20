import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from './bus';
import type { KanopiEvent } from './types';

function beat(count: number): KanopiEvent {
  return { schemaVersion: 1, type: 'beat', runtime: 'clock', t: count * 100, count, bpm: 120, phase: 0 };
}

function token(t: number, name = 'bd'): KanopiEvent {
  return {
    schemaVersion: 1,
    type: 'token',
    runtime: 'strudel',
    source: 'drums',
    t,
    name,
    duration: 250
  };
}

describe('event bus', () => {
  it('delivers events to listeners subscribed to the matching topic', () => {
    const bus = createEventBus();
    const spy = vi.fn();
    bus.on('beat', spy);
    bus.emit(beat(1));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].count).toBe(1);
  });

  it('does not deliver off-topic events', () => {
    const bus = createEventBus();
    const beatSpy = vi.fn();
    const tokenSpy = vi.fn();
    bus.on('beat', beatSpy);
    bus.on('token', tokenSpy);
    bus.emit(token(10));
    expect(beatSpy).not.toHaveBeenCalled();
    expect(tokenSpy).toHaveBeenCalledTimes(1);
  });

  it('fans out to every listener on the same topic', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('beat', a);
    bus.on('beat', b);
    bus.emit(beat(1));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('onAny receives every event regardless of type', () => {
    const bus = createEventBus();
    const any = vi.fn();
    bus.onAny(any);
    bus.emit(beat(1));
    bus.emit(token(200));
    expect(any).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops delivery', () => {
    const bus = createEventBus();
    const spy = vi.fn();
    const off = bus.on('beat', spy);
    bus.emit(beat(1));
    off();
    bus.emit(beat(2));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe from onAny stops delivery', () => {
    const bus = createEventBus();
    const spy = vi.fn();
    const off = bus.onAny(spy);
    bus.emit(beat(1));
    off();
    bus.emit(beat(2));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not leak listeners across topics after unsubscribe', () => {
    const bus = createEventBus();
    const spy = vi.fn();
    for (let i = 0; i < 10; i++) {
      const off = bus.on('beat', spy);
      off();
    }
    bus.emit(beat(1));
    expect(spy).not.toHaveBeenCalled();
  });

  it('tolerates emit with zero listeners', () => {
    const bus = createEventBus();
    expect(() => bus.emit(beat(1))).not.toThrow();
  });

  it('preserves emission order: topic listeners then any-listeners', () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.on('beat', () => order.push('topic'));
    bus.onAny(() => order.push('any'));
    bus.emit(beat(1));
    expect(order).toEqual(['topic', 'any']);
  });
});
