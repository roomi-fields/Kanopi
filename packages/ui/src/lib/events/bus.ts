import type {
  AnyListener,
  EventBus,
  EventOf,
  EventType,
  KanopiEvent,
  Listener,
  Unsubscribe
} from './types';

export function createEventBus(): EventBus {
  const topics = new Map<EventType, Set<AnyListener>>();
  const anyListeners = new Set<AnyListener>();

  function on<T extends EventType>(type: T, cb: Listener<T>): Unsubscribe {
    let set = topics.get(type);
    if (!set) {
      set = new Set();
      topics.set(type, set);
    }
    const wrapped: AnyListener = (e) => cb(e as EventOf<T>);
    set.add(wrapped);
    return () => {
      const s = topics.get(type);
      if (!s) return;
      s.delete(wrapped);
      if (s.size === 0) topics.delete(type);
    };
  }

  function onAny(cb: AnyListener): Unsubscribe {
    anyListeners.add(cb);
    return () => {
      anyListeners.delete(cb);
    };
  }

  function emit(e: KanopiEvent) {
    const set = topics.get(e.type);
    if (set) for (const cb of set) cb(e);
    for (const cb of anyListeners) cb(e);
  }

  return { on, onAny, emit };
}
