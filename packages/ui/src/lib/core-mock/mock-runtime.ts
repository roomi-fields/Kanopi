import type {
  Actor,
  ActorManager,
  Clock,
  ClockState,
  ConsoleBus,
  CoreApi,
  LogEntry,
  MapEngine,
  Mapping,
  Runtime,
  Scene,
  SceneManager,
  Unsubscribe
} from './types';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';

function bus<T>() {
  const subs = new Set<(v: T) => void>();
  return {
    subscribe(cb: (v: T) => void): Unsubscribe {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    emit(v: T) {
      for (const cb of subs) cb(v);
    }
  };
}

export class MockClock implements Clock {
  state: ClockState = { bpm: 128, bar: 1, beat: 0, beatsPerBar: 4, phase: 0, playing: false };
  private lastTick = performance.now();
  private tapTimes: number[] = [];
  private b = bus<ClockState>();
  private rafId = 0;
  private onTransport?: (playing: boolean) => void;
  private onTempo?: (bpm: number) => void;
  private absBeat = 0;
  private absBar = 0;
  private absPhase = 0;
  private eventsBus?: EventBus;

  setOnTransport(fn: (playing: boolean) => void) {
    this.onTransport = fn;
  }
  setOnTempo(fn: (bpm: number) => void) {
    this.onTempo = fn;
  }
  setEventBus(bus: EventBus) {
    this.eventsBus = bus;
  }

  constructor() {
    this.loop = this.loop.bind(this);
    this.rafId = requestAnimationFrame(this.loop);
  }

  private loop(now: number) {
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    if (this.state.playing) {
      const beatsPerSec = this.state.bpm / 60;
      const prevAbsPhase = this.absPhase;
      this.absPhase += dt * beatsPerSec;
      const newBeatAbs = Math.floor(this.absPhase);
      const beatInc = newBeatAbs - Math.floor(prevAbsPhase);
      const bpb = this.state.beatsPerBar || 4;
      const newBarAbs = Math.floor(newBeatAbs / bpb);
      const barInc = newBarAbs - Math.floor(Math.floor(prevAbsPhase) / bpb);
      this.state = {
        ...this.state,
        beat: newBeatAbs % bpb,
        phase: this.absPhase - newBeatAbs,
        bar: 1 + newBarAbs
      };
      this.b.emit(this.state);
      if (beatInc > 0 && this.eventsBus) {
        for (let i = 0; i < beatInc; i++) {
          this.absBeat += 1;
          this.eventsBus.emit({
            schemaVersion: 1,
            type: 'beat',
            runtime: 'clock',
            t: now,
            count: this.absBeat,
            bpm: this.state.bpm,
            phase: this.state.phase
          });
        }
      }
      if (barInc > 0 && this.eventsBus) {
        for (let i = 0; i < barInc; i++) {
          this.absBar += 1;
          this.eventsBus.emit({
            schemaVersion: 1,
            type: 'bar',
            runtime: 'clock',
            t: now,
            count: this.absBar
          });
        }
      }
    }
    this.rafId = requestAnimationFrame(this.loop);
  }

  play() {
    const was = this.state.playing;
    this.state = { ...this.state, playing: true };
    this.b.emit(this.state);
    if (!was) {
      this.onTransport?.(true);
      this.eventsBus?.emit({
        schemaVersion: 1,
        type: 'transport',
        runtime: 'clock',
        t: performance.now(),
        playing: true,
        bpm: this.state.bpm
      });
    }
  }
  stop() {
    const was = this.state.playing;
    this.state = { ...this.state, playing: false, bar: 1, beat: 0, phase: 0 }; // preserve beatsPerBar on stop
    this.b.emit(this.state);
    if (was) {
      this.absBeat = 0;
      this.absBar = 0;
      this.absPhase = 0;
      this.onTransport?.(false);
      this.eventsBus?.emit({
        schemaVersion: 1,
        type: 'transport',
        runtime: 'clock',
        t: performance.now(),
        playing: false,
        bpm: this.state.bpm
      });
    }
  }
  toggle() {
    if (this.state.playing) this.stop();
    else this.play();
  }
  setBpm(n: number) {
    const bpm = Math.max(20, Math.min(300, Math.round(n * 10) / 10));
    const prev = this.state.bpm;
    this.state = { ...this.state, bpm };
    this.b.emit(this.state);
    if (prev !== bpm) this.onTempo?.(bpm);
  }
  setTimeSignature(beatsPerBar: number) {
    const n = Math.max(1, Math.min(32, Math.round(beatsPerBar)));
    if (this.state.beatsPerBar === n) return;
    this.state = { ...this.state, beatsPerBar: n };
    this.b.emit(this.state);
  }
  tap() {
    const now = performance.now();
    this.tapTimes.push(now);
    this.tapTimes = this.tapTimes.filter((t) => now - t < 2500);
    if (this.tapTimes.length >= 2) {
      const deltas: number[] = [];
      for (let i = 1; i < this.tapTimes.length; i++) {
        deltas.push(this.tapTimes[i] - this.tapTimes[i - 1]);
      }
      const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      this.setBpm(60000 / avg);
    }
  }
  subscribe(cb: (s: ClockState) => void) {
    cb(this.state);
    return this.b.subscribe(cb);
  }
  dispose() {
    cancelAnimationFrame(this.rafId);
  }
}

export class MockActors implements ActorManager {
  private actors: Actor[] = [];
  private b = bus<Actor[]>();

  list() {
    return this.actors;
  }
  toggle(name: string) {
    this.actors = this.actors.map((a) => (a.name === name ? { ...a, active: !a.active } : a));
    this.b.emit(this.actors);
  }
  setMuted(name: string, muted: boolean) {
    this.actors = this.actors.map((a) => (a.name === name ? { ...a, muted } : a));
    this.b.emit(this.actors);
  }
  toggleMute(name: string) {
    const a = this.actors.find((x) => x.name === name);
    if (!a) return;
    this.setMuted(name, !a.muted);
  }
  unmuteAll() {
    this.actors = this.actors.map((a) => (a.muted ? { ...a, muted: false } : a));
    this.b.emit(this.actors);
  }
  setActors(list: Actor[]) {
    this.actors = list;
    this.b.emit(this.actors);
  }
  subscribe(cb: (a: Actor[]) => void) {
    cb(this.actors);
    return this.b.subscribe(cb);
  }
}

export class MockScenes implements SceneManager {
  private scenes: Scene[] = [];
  private b = bus<Scene[]>();
  private onActivateHook?: (s: Scene) => void;

  setOnActivate(fn: (s: Scene) => void) {
    this.onActivateHook = fn;
  }

  setScenes(list: Scene[]) {
    this.scenes = list;
    this.b.emit(this.scenes);
  }

  list() {
    return this.scenes;
  }
  activate(name: string) {
    const target = this.scenes.find((s) => s.name === name);
    this.scenes = this.scenes.map((s) => ({ ...s, active: s.name === name }));
    this.b.emit(this.scenes);
    if (target) this.onActivateHook?.(target);
  }
  subscribe(cb: (s: Scene[]) => void) {
    cb(this.scenes);
    return this.b.subscribe(cb);
  }
}

export class MockMaps implements MapEngine {
  private mappings: Mapping[] = [];
  private b = bus<Mapping[]>();

  list() {
    return this.mappings;
  }
  setMappings(list: Mapping[]) {
    this.mappings = list;
    this.b.emit(this.mappings);
  }
  emitIncoming(id: string, value: number) {
    this.mappings = this.mappings.map((m) =>
      m.id === id ? { ...m, lastValue: value, lastTs: Date.now() } : m
    );
    this.b.emit(this.mappings);
  }
  subscribe(cb: (m: Mapping[]) => void) {
    cb(this.mappings);
    return this.b.subscribe(cb);
  }
}

export class MockConsole implements ConsoleBus {
  private log: LogEntry[] = [];
  private b = bus<LogEntry[]>();

  entries() {
    return this.log;
  }
  push(e: Omit<LogEntry, 'ts'> & { ts?: number }) {
    const entry: LogEntry = { ts: e.ts ?? Date.now(), runtime: e.runtime, level: e.level, msg: e.msg };
    this.log = [...this.log, entry].slice(-500);
    this.b.emit(this.log);
  }
  clear() {
    this.log = [];
    this.b.emit(this.log);
  }
  subscribe(cb: (e: LogEntry[]) => void) {
    cb(this.log);
    return this.b.subscribe(cb);
  }
}

class MockCore implements CoreApi {
  clock = new MockClock();
  actors = new MockActors();
  scenes = new MockScenes();
  maps = new MockMaps();
  console = new MockConsole();
  events: EventBus = createEventBus();

  constructor() {
    this.clock.setEventBus(this.events);
    this.console.push({ runtime: 'system', level: 'info', msg: 'kanopi mock runtime online' });
  }

  async loadSession(_text: string) {
    this.console.push({ runtime: 'system', level: 'info', msg: 'loadSession (mock)' });
  }

  async evaluateBlock(runtime: Runtime, code: string, sourceId: string, _docOffset?: number, _actorId?: string): Promise<void> {
    this.console.push({ runtime, level: 'info', msg: `eval mock (${code.length}b @ ${sourceId})` });
  }

  bindActorFiles(_get: (name: string) => unknown) {
    /* mock no-op */
  }

  async enableMidiInput() {
    /* mock no-op */
  }

  async hushAll() {
    /* mock no-op */
  }
}

export function createMockCore(): CoreApi {
  return new MockCore();
}
