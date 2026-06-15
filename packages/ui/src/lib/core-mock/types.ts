import type { EventBus } from '../events/types';

export type Unsubscribe = () => void;

export type Runtime =
  | 'kanopi'
  | 'strudel'
  | 'hydra'
  | 'p5'
  | 'mercury'
  | 'csound'
  | 'bp3'
  | 'bpscript'
  | 'tidal'
  | 'sc'
  | 'python'
  | 'js'
  | 'system';

export interface ClockState {
  bpm: number;
  bar: number;
  beat: number; // 0..(beatsPerBar-1)
  beatsPerBar: number; // numerator of the current @time signature (default 4)
  phase: number; // 0..1 within current beat
  playing: boolean;
}

export interface Clock {
  readonly state: ClockState;
  play(): void;
  stop(): void;
  pause(): void;
  toggle(): void;
  setBpm(n: number): void;
  setTimeSignature(beatsPerBar: number): void;
  tap(): void;
  subscribe(cb: (s: ClockState) => void): Unsubscribe;
}

export interface Actor {
  name: string;
  file?: string;
  runtime: Runtime;
  active: boolean;
  muted?: boolean;
}

export interface ActorManager {
  list(): Actor[];
  toggle(name: string): void;
  setMuted(name: string, muted: boolean): void;
  toggleMute(name: string): void;
  unmuteAll(): void;
  subscribe(cb: (actors: Actor[]) => void): Unsubscribe;
}

export interface Scene {
  name: string;
  actors: Record<string, boolean>;
  active: boolean;
  /**
   * A `.bps` file-scene (`@scene calm "calm.bps"`) references a CHILD `.bps`
   * file instead of arming in-session actors. When set, activating the scene
   * loads + evaluates that child program (see real-core `handleSceneActivate`).
   * Absent for `.kanopi` actor-set scenes (the `actors` map drives those).
   */
  file?: string;
}

export interface SceneManager {
  list(): Scene[];
  activate(name: string): void;
  subscribe(cb: (scenes: Scene[]) => void): Unsubscribe;
}

export type MapSource =
  | { kind: 'cv'; index: number; ch?: number } // continuous (CC)
  | { kind: 'gate'; index: number; ch?: number } // note on/off
  | { kind: 'trig'; index: number; ch?: number }; // note-on with vel > 0 only

export type MapTarget =
  | { kind: 'tempo' }
  | { kind: 'scene'; ref: string }
  | { kind: 'actor.toggle'; ref: string }
  | { kind: 'actor.param'; ref: string; param: string };

export interface Mapping {
  id: string;
  source: MapSource;
  target: MapTarget;
  lastValue?: number;
  lastTs?: number;
}

export interface MapEngine {
  list(): Mapping[];
  subscribe(cb: (mappings: Mapping[]) => void): Unsubscribe;
}

export interface LogEntry {
  ts: number;
  runtime: Runtime;
  level: 'info' | 'warn' | 'error';
  msg: string;
}

export interface ConsoleBus {
  entries(): LogEntry[];
  push(e: Omit<LogEntry, 'ts'> & { ts?: number }): void;
  clear(): void;
  subscribe(cb: (entries: LogEntry[]) => void): Unsubscribe;
}

export interface ActorFileRef {
  contents: string;
  runtime: Runtime;
  fileName?: string;
}

export interface CoreApi {
  clock: Clock;
  actors: ActorManager;
  scenes: SceneManager;
  maps: MapEngine;
  console: ConsoleBus;
  events: EventBus;
  loadSession(text: string): Promise<void>;
  /**
   * Evaluate a code block in the given runtime. Rejects on eval error.
   * `docOffset` is the position of the block inside the source document,
   * used by visualizers to place highlights on the actual evaluated range
   * instead of the start of the doc. Defaults to 0 (whole-file eval).
   */
  evaluateBlock(
    runtime: Runtime,
    code: string,
    sourceId: string,
    docOffset?: number,
    actorId?: string,
    flags?: Record<string, number>,
    section?: { index: number; count: number }
  ): Promise<void>;
  /** Inject a lookup so the core can resolve which file an actor refers to. */
  bindActorFiles(get: (actorName: string) => ActorFileRef | undefined): void;
  /**
   * Feed the Scenes panel from a `.bps`'s `@scene <name> "<file>"` table.
   * Activating a resulting scene loads + plays the referenced child `.bps`
   * (resolved via `resolve`). An empty table clears the panel.
   */
  loadBpsFileScenes(
    sceneTable: Record<string, { file: string }>,
    resolve: (fileName: string) => string | undefined
  ): void;
  /** Request WebMIDI access and start dispatching mappings. */
  enableMidiInput(): Promise<void>;
  /** Hard-stop every runtime (panic): clears Strudel patterns, blanks Hydra, kills WebAudio sources. */
  hushAll(): Promise<void>;
}
