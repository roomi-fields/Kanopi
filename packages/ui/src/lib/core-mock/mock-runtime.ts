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
  state: ClockState = {
    bpm: 128,
    bar: 1,
    beat: 0,
    beatsPerBar: 4,
    phase: 0,
    playing: false,
    paused: false
  };
  private tapTimes: number[] = [];
  private b = bus<ClockState>();
  private rafId = 0;
  private onTransport?: (playing: boolean) => void;
  private onTempo?: (bpm: number) => void;
  private onPauseResume?: (paused: boolean) => void;
  /** Optional audio beat source (requirement B). When it returns a position, the
   * transport beat dots + bar·beat·phase counter phase-lock to the HEARD audio
   * (a playing dispatcher) instead of the free rAF integrator. Null → rAF clock. */
  private beatSource?: () => {
    beatsTotal: number;
    bar: number;
    beat: number;
    phase: number;
    gen?: number;
  } | null;
  /** Last beat-source generation seen — a change means a NEW dispatcher took over
   *  (fresh Play / Ctrl+Enter restart); used to allow the cursor to jump back to
   *  the top on a genuine restart while clamping the harmless launch hand-off. */
  private absBeat = 0;
  private absBar = 0;
  // Last integer beat/bar the render loop saw, for crossing detection (−1 = no baseline
  // yet). Replaces the old `absPhase` rAF position integrator — position now comes from
  // the Transport's beatPosition; this only marks where the last beat/bar event fired.
  private lastBeatFloor = -1;
  private lastBarFloor = -1;
  private eventsBus?: EventBus;
  /** True only during the synchronous subscriber notification of a
   * `startSilently()` — lets the block-replay listener skip a surgical eval. */
  silentStart = false;
  /** True only during the synchronous emit of a pause→play RESUME, so the
   * block-replay listener skips re-evaluating (the voices are still scheduled). */
  resuming = false;

  setOnTransport(fn: (playing: boolean) => void) {
    this.onTransport = fn;
  }
  setOnTempo(fn: (bpm: number) => void) {
    this.onTempo = fn;
  }
  /** Hook the audio pause/resume to the transport: pause suspends audio in place
   * (no teardown), resume continues it. Wired by the core to the bp3 audio ctx. */
  setOnPauseResume(fn: (paused: boolean) => void) {
    this.onPauseResume = fn;
  }
  /** Wire the audio beat source (requirement B). Returns the current musical
   * position of a playing dispatcher, or null when none plays (rAF fallback). */
  setBeatSource(
    fn: () => { beatsTotal: number; bar: number; beat: number; phase: number; gen?: number } | null
  ) {
    this.beatSource = fn;
  }
  setEventBus(bus: EventBus) {
    this.eventsBus = bus;
  }

  constructor() {
    this.loop = this.loop.bind(this);
    this.rafId = requestAnimationFrame(this.loop);
  }

  private loop(now: number) {
    if (this.state.playing) {
      const ext = this.beatSource?.();
      if (ext) {
        // POSITION = the Transport's (Kronos cursor), DERIVED here — never integrated.
        // The old free rAF position integrator (and its monotonic clamp, the "15-25
        // réajustements de barre") is GONE: Kronos's Transport is the single position
        // authority (contract kanopi-architecture.md). This loop only PROJECTS it onto
        // `clock.state` (the per-frame tick readers consult) and DERIVES the beat/bar UI
        // events (p5/hydra `onBeat`/`onBar`) from beat crossings of that position.
        const bpb = this.state.beatsPerBar || 4;
        const totalBeats = Math.max(0, ext.beatsTotal);
        const beatAbs = Math.floor(totalBeats);
        const barAbs = Math.floor(beatAbs / bpb);
        this.state = {
          ...this.state,
          beat: beatAbs % bpb,
          phase: totalBeats - beatAbs,
          bar: 1 + barAbs
        };
        this.b.emit(this.state);
        // Beat/bar EVENTS on each crossing of the integer beat — INCLUDING the loop wrap
        // (n-1 → 0), so the monotone `count` keeps climbing across loops. At musical
        // tempi a beat is ≫16 ms, so 60 fps sees one crossing per frame (a dropped frame
        // at most skips one purely-visual event). The first frame sets the baseline only
        // (so the downbeat isn't counted, matching the previous while-loop semantics).
        if (this.lastBeatFloor === -1) {
          this.lastBeatFloor = beatAbs;
          this.lastBarFloor = barAbs;
        } else {
          if (beatAbs !== this.lastBeatFloor) {
            this.lastBeatFloor = beatAbs;
            this.absBeat += 1;
            this.eventsBus?.emit({
              schemaVersion: 1,
              type: 'beat',
              runtime: 'clock',
              t: now,
              count: this.absBeat,
              bpm: this.state.bpm,
              phase: this.state.phase
            });
          }
          if (barAbs !== this.lastBarFloor) {
            this.lastBarFloor = barAbs;
            this.absBar += 1;
            this.eventsBus?.emit({
              schemaVersion: 1,
              type: 'bar',
              runtime: 'clock',
              t: now,
              count: this.absBar
            });
          }
        }
      }
      // No beatSource (no live Transport) → nothing to advance: the rAF position
      // integrator was removed. An idle/empty transport has no position to derive.
    }
    this.rafId = requestAnimationFrame(this.loop);
  }

  play() {
    const was = this.state.playing;
    const wasPaused = this.state.paused;
    this.state = { ...this.state, playing: true, paused: false };
    if (was) {
      this.b.emit(this.state);
      return;
    }
    if (wasPaused) {
      // RESUME from pause: the dispatchers were never torn down (pause only
      // suspended their audio), so DON'T re-evaluate the armed voices — that would
      // restart them from the top. `resuming` is raised for the synchronous emit
      // so the block-replay listener skips its play-edge re-eval (the same guard
      // `silentStart` provides for a surgical manual eval). Then resume the audio.
      // The beat integrator is NOT reset — playback continues where it paused.
      this.resuming = true;
      try {
        this.b.emit(this.state);
      } finally {
        this.resuming = false;
      }
      this.onPauseResume?.(false);
    } else {
      // FRESH continuous play (from stop or a stepped position): reset the beat
      // integrator so the monotonic clamp above has a clean baseline and the
      // dispatcher handoff can't appear to rewind the cursor.
      this.absBeat = 0;
      this.absBar = 0;
      this.lastBeatFloor = -1;
      this.lastBarFloor = -1;
      this.b.emit(this.state);
      this.onTransport?.(true);
    }
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
    // voice" hook is skipped.
    //
    // `silentStart` is raised for the duration of the synchronous subscriber
    // notification so the block-replay listener (installBlockReplay) can tell a
    // surgical manual eval from a real Play and skip re-evaluating armed blocks.
    if (this.state.playing) return;
    this.state = { ...this.state, playing: true, paused: false };
    this.silentStart = true;
    try {
      this.b.emit(this.state);
    } finally {
      this.silentStart = false;
    }
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
    // stop() zeroes the position (pause() doesn't) and clears the paused flag.
    this.state = { ...this.state, playing: false, paused: false, bar: 1, beat: 0, phase: 0 }; // preserve beatsPerBar on stop
    this.b.emit(this.state);
    if (was) {
      this.absBeat = 0;
      this.absBar = 0;
      this.lastBeatFloor = -1;
      this.lastBarFloor = -1;
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
  /**
   * Pause: halt the transport WITHOUT resetting position. The bar/beat/phase
   * and the absolute counters are left intact, so the next play() resumes from
   * where it stopped (stop() zeroes them; pause() doesn't). Audio is suspended
   * the same way stop does — onTransport(false) hushes every runtime — but the
   * clock keeps its place so resuming re-evaluates the armed voices in time.
   */
  pause() {
    if (!this.state.playing) return;
    this.state = { ...this.state, playing: false, paused: true };
    this.b.emit(this.state);
    // True pause: suspend the audio WITHOUT tearing down the dispatchers (unlike
    // stop, which hushes every runtime via onTransport(false) and forgets the
    // voices). The scheduled voices stay loaded so resuming continues in place;
    // their audio context is suspended by the onPauseResume hook (the dispatcher's
    // lookahead clock then freezes against the frozen `currentTime`). Position and
    // the absolute counters are preserved for the resume.
    this.onPauseResume?.(true);
    this.eventsBus?.emit({
      schemaVersion: 1,
      type: 'transport',
      runtime: 'clock',
      t: performance.now(),
      playing: false,
      bpm: this.state.bpm
    });
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
