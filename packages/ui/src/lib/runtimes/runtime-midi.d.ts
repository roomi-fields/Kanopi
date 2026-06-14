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
