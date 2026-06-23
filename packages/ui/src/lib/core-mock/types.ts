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
  beatsPerBar: number; // numerator of the current @time signature (default 4)
  playing: boolean;
  // True after a `pause()` (transport halted but position kept), false after a
  // `play()` or a `stop()` (which also zeroes the position). Lets the transport
  // UI distinguish paused-at-position from stopped-at-zero. Never true while
  // `playing` is true. Position itself lives in Kronos's Transport (read via the
  // kronos-cursor store), NOT here — this carries only the tempo + transport flags.
  paused: boolean;
}

export interface Clock {
  readonly state: ClockState;
  play(): void;
  /**
   * Start the transport WITHOUT firing the re-eval hook (onTransport). Used by a
   * surgical manual Ctrl+Enter: the evaluated block is already sounding, so we
   * only want the clock ticking + the UI to read "playing" — the rest of the
   * armed set must NOT be re-triggered. `play()` re-evaluates every armed voice;
   * this does not.
   */
  startSilently(): void;
  stop(): void;
  /** Enter STEP mode: clear playing+paused WITHOUT zeroing position or hushing.
   * A discrete manual advance — never resumes a paused transport. */
  enterStep(): void;
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
   * Absent for actor-set scenes (the `actors` map drives those).
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

export interface CoreApi {
  clock: Clock;
  actors: ActorManager;
  scenes: SceneManager;
  maps: MapEngine;
  console: ConsoleBus;
  events: EventBus;
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
    section?: { index: number; count: number },
    produceOnly?: boolean
  ): Promise<void>;
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
  /**
   * Silence every runtime + deactivate actors WITHOUT stopping the transport
   * clock. Used by the "swap scene" gesture (load a library scene while another
   * plays): the outgoing scene's audio/backtick runtimes are cut and its actors
   * disarmed, but the clock keeps running so the incoming scene can be armed +
   * evaluated immediately on the live clock — no stop/restart race, no spurious
   * "Playing" with no sound.
   */
  silenceRuntimes(): Promise<void>;
  /**
   * STOP-IN-PLACE (Model C transport Stop): return every live scene's playhead to 0 and
   * cut its sound + sustained code voices, but KEEP the derived timeline persisted in
   * Kronos (the handle is not discarded). Only the playhead moves; a following
   * `replayActiveScene()` restarts the SAME scheduler from 0 with no re-derivation.
   */
  stopInPlace(): Promise<void>;
  /**
   * REPLAY (Model C transport Play from a stopped-in-place scene): restart every persisted
   * handle whose transport is stopped, from 0, WITHOUT re-deriving. No-op for handles that
   * are running/paused (Play-from-paused is the resume path).
   */
  replayActiveScene(): Promise<void>;
}
