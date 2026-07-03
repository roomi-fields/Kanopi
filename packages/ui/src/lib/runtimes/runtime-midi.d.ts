/**
 * Local type surface for the cross-tree `runtime-midi` dependency, mapped via
 * `tsconfig.paths` (per the integration mandate — no edits to the sibling repo,
 * which ships ESM-only JS with no `.d.ts`).
 *
 * Mirrors the pinned interface in hub/contrats/kanopi-runtime-midi.md and the
 * actual `MidiSink` surface at runtime-MIDI/src/sink.js. Only the methods Kanopi
 * consumes are declared.
 */
import type { TimedToken } from './bp3-deps';

export interface MidiSinkOptions {
  outputIndex?: number;
  tuning?: string;
  controlDefaults?: Record<string, unknown>;
}

export declare class MidiSink {
  constructor(audioCtx: AudioContext, opts?: MidiSinkOptions);
  /** Web MIDI access (after user gesture); false when no MIDI port is present. */
  init(): Promise<boolean>;
  setOutput(port: unknown): void;
  load(bpxTimedTokens: TimedToken[], metadata?: Record<string, unknown>): void;
  start(onEnd?: () => void): void;
  stop(): void;
}

export interface MidiTransportOptions {
  outputIndex?: number;
  resolver?: unknown;
  /** Constant semitone offset (BP `c4key` convention): keyOffset = 60 - c4key. */
  keyOffset?: number;
}

/** Per-actor MIDI transport — the canonical Kronos `TransportLike` for MIDI. Kronos
 *  routes each scheduled note through `send(event, absTime)`; `init()` requests the
 *  Web MIDI port (no hardware → no-op, never throws). */
export declare class MidiTransport {
  constructor(opts?: MidiTransportOptions);
  init(): Promise<void>;
  send(event: Record<string, unknown>, absTime: number): void;
}

export interface MidiRuntimeOptions {
  latency?: number;
  outputIndex?: number;
  /** Constant semitone offset (BP `c4key`). Under KAI-10 keep 0 (graven Hz is absolute). */
  keyOffset?: number;
  mpe?: boolean;
  velocitySeed?: number;
}

/** Sortie MIDI — adaptateur UNIFORME (frontière hôte↔runtimes de sortie). POSSÈDE son
 *  MidiTransport, résout le canal (`output.channel`), normalise la vélocité, met en forme
 *  l'événement — l'hôte ne fait rien de tout ça. Kronos appelle `send(ev)`/`bindClock` ;
 *  l'hôte appelle `init()` (acquisition Web MIDI) et `dispose()` (teardown). */
export interface MidiRuntime {
  init(): Promise<boolean | void>;
  setOutput(port: unknown): void;
  bindClock(clock: unknown): void;
  send(event: unknown): void;
  stop(): void;
  setActorMuted(actor: string, muted: boolean): void;
  dispose(): void;
  close(): void;
}

/** Fabrique de la sortie MIDI (parallèle à `createAudioRuntime`). Point d'entrée hôte. */
export declare function createMidiRuntime(opts?: MidiRuntimeOptions): MidiRuntime;
