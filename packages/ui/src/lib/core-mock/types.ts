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

/**
 * The READOUT shape of the tempo/transport store (`stores/clock.svelte.ts`). It is NOT a
 * host clock: `beatsPerBar` is a persisted SESSION value; `bpm` is the live Kronos handle's
 * tempo while a scene plays, else the user's local typed/tapped tempo, else `null` (nothing
 * live + no input → no tempo to show, the readout renders « — »; never a host-invented
 * default). `playing`/`paused` are PROJECTED from Kronos's Transport state. Kanopi holds no
 * clock object — position + transport state belong to Kronos.
 */
export interface ClockState {
  bpm: number | null;
  beatsPerBar: number; // numerator of the current @time signature (default 4)
  playing: boolean; // projected: Kronos transport === 'running'
  paused: boolean; // projected: Kronos transport === 'paused'
}

export interface Actor {
  name: string;
  file?: string;
  runtime: Runtime;
  active: boolean;
  muted?: boolean;
  /**
   * The actor's declared OUTPUT TRANSPORT family — 'audio'/'webaudio' | 'midi' | 'osc' |
   * 'code' | a custom @devices name, read VERBATIM off BPx's `tree.metadata.actors[name]
   * .runtime` (the same `output.runtime` key Kronos routes events on — contrat
   * hote-runtimes-sortie.md, décision archi [624]; see `PublishedActor.outputTransport`
   * in bpx-adapter.ts for the exact read site). Undeclared transport ⇒ the AST's implicit
   * default, 'audio' (the webaudio bus). Used ONLY to gate host-side UI (the per-actor
   * mixer slider only reaches the webaudio bus) — NEVER for event routing, which Kronos
   * alone performs off the SAME upstream field.
   */
  outputTransport?: string;
  /** Erreur de branchement hôte pour cet acteur (sortie indisponible au Play, ex.
   *  MIDI sans device). État UI par-acteur, reconstruit à chaque publication. */
  error?: string;
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
  actors: ActorManager;
  scenes: SceneManager;
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
