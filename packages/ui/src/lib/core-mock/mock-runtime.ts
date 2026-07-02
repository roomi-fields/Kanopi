import type {
  Actor,
  ActorManager,
  ConsoleBus,
  CoreApi,
  LogEntry,
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
    // Route through `setMuted` (NOT a direct field write) so a subclass override —
    // RealActors.setMuted fires `onMute → armOrchestratedActor`, re-arming an
    // orchestrated voice in Kronos — actually runs. A direct write here would clear
    // the LED but leave the voice silent (Ctrl+0 then needs two toggles to recover).
    for (const a of this.actors) {
      if (a.muted) this.setMuted(a.name, false);
    }
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
  actors = new MockActors();
  scenes = new MockScenes();
  console = new MockConsole();
  events: EventBus = createEventBus();

  constructor() {
    this.console.push({ runtime: 'system', level: 'info', msg: 'kanopi mock runtime online' });
  }

  async evaluateBlock(
    runtime: Runtime,
    code: string,
    sourceId: string,
    _docOffset?: number,
    _actorId?: string,
    _flags?: Record<string, number>,
    _produceOnly?: boolean
  ): Promise<void> {
    this.console.push({ runtime, level: 'info', msg: `eval mock (${code.length}b @ ${sourceId})` });
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

  async stopInPlace() {
    /* mock no-op */
  }

  async replayActiveScene() {
    /* mock no-op */
  }
}

export function createMockCore(): CoreApi {
  return new MockCore();
}
