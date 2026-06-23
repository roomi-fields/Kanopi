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
  // The clock holds the TEMPO intent (bpm + time signature) and the transport FLAGS
  // (playing/paused) — NOT the position. Position is Kronos's Transport, sampled by the
  // kronos-cursor store (`kronosCursor.beat`); the displays read it there, never here.
  state: ClockState = {
    bpm: 128,
    beatsPerBar: 4,
    playing: false,
    paused: false
  };
  private tapTimes: number[] = [];
  private b = bus<ClockState>();
  private onTransport?: (playing: boolean) => void;
  private onTempo?: (bpm: number) => void;
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

  play() {
    const was = this.state.playing;
    this.state = { ...this.state, playing: true, paused: false };
    if (was) {
      this.b.emit(this.state);
      return;
    }
    // FRESH continuous play (from stop or a stepped position): the beat/bar event
    // baselines live in the kronos-cursor store now (it resets them when a new
    // dispatcher handle takes over and when the transport isn't running). Resume from
    // pause does NOT come through here anymore — the playback store resumes IN PLACE on
    // the live Kronos Transport (`transport.play()` + `refireCodeVoices`), never via the
    // clock, so the clock never sees a paused→playing edge and needs no resume guard.
    this.b.emit(this.state);
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
  startSilently() {
    // Same as play() but WITHOUT onTransport(true): no re-eval of the armed set.
    // The transport event still fires so adapters/visuals that key off the
    // clock's playing edge stay in sync — only the "re-evaluate every armed
    // voice" hook is skipped. Used by the surgical Ctrl+Enter path (real-core
    // evaluateBlock): the block just evaluated is already live, so we only want
    // the clock ticking + the UI reading "playing", not the whole armed set.
    if (this.state.playing) return;
    this.state = { ...this.state, playing: true, paused: false };
    this.b.emit(this.state);
    this.eventsBus?.emit({
      schemaVersion: 1,
      type: 'transport',
      runtime: 'clock',
      t: performance.now(),
      playing: true,
      bpm: this.state.bpm
    });
  }
  /**
   * Enter STEP mode: a discrete manual advance, neither continuous play nor
   * pause. Clears playing+paused WITHOUT zeroing the position (unlike stop) and
   * WITHOUT hushing runtimes (unlike pause) — the dispatcher plays the single
   * stepped beat on its own clock, and the transport simply reads "not playing".
   * Idempotent + side-effect-free beyond the state emit, so STEP never resumes a
   * paused transport (it used to go through startSilently → playing=true).
   */
  enterStep() {
    if (!this.state.playing && !this.state.paused) return;
    this.state = { ...this.state, playing: false, paused: false };
    this.b.emit(this.state);
  }
  stop() {
    const was = this.state.playing || this.state.paused;
    // stop() clears playing+paused. The POSITION reset is Kronos's (its Transport.stop()
    // rewinds the cursor); the kronos-cursor store then reads `null` while stopped, so the
    // displays fall back to 001·01.00 (B16) — the clock no longer holds a position.
    this.state = { ...this.state, playing: false, paused: false }; // preserve beatsPerBar on stop
    this.b.emit(this.state);
    if (was) {
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
    // No-op on an unchanged tempo: don't re-emit or re-fan-out `onTempo`. A
    // grammar that re-applies its own `@mm` on every replay (Play → replayArmed →
    // eval → setTempoSink) would otherwise emit a redundant clock update each
    // time, churning every subscriber for nothing.
    if (prev === bpm) return;
    this.state = { ...this.state, bpm };
    this.b.emit(this.state);
    this.onTempo?.(bpm);
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
    const entry: LogEntry = {
      ts: e.ts ?? Date.now(),
      runtime: e.runtime,
      level: e.level,
      msg: e.msg
    };
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

  async evaluateBlock(
    runtime: Runtime,
    code: string,
    sourceId: string,
    _docOffset?: number,
    _actorId?: string,
    _flags?: Record<string, number>,
    _section?: { index: number; count: number },
    _produceOnly?: boolean
  ): Promise<void> {
    this.console.push({ runtime, level: 'info', msg: `eval mock (${code.length}b @ ${sourceId})` });
  }

  bindActorFiles(_get: (name: string) => unknown) {
    /* mock no-op */
  }

  loadBpsFileScenes(
    sceneTable: Record<string, { file: string }>,
    _resolve: (fileName: string) => string | undefined
  ) {
    const entries = Object.entries(sceneTable);
    const currentAreFileScenes = this.scenes.list().some((s) => s.file !== undefined);
    if (entries.length === 0) {
      if (currentAreFileScenes) this.scenes.setScenes([]);
      return;
    }
    this.scenes.setScenes(
      entries.map(([name, def]) => ({ name, actors: {}, file: def.file, active: false }))
    );
  }

  async enableMidiInput() {
    /* mock no-op */
  }

  async hushAll() {
    /* mock no-op */
  }

  async silenceRuntimes() {
    /* mock no-op */
  }
}

export function createMockCore(): CoreApi {
  return new MockCore();
}
