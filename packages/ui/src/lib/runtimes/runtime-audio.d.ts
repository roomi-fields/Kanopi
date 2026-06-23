/**
 * Local type surface for the cross-tree `runtime-audio` dependency (ESM-only JS, no
 * shipped `.d.ts`), mapped via `tsconfig.paths` — same pattern as `runtime-midi.d.ts`.
 * Only the exports Kanopi consumes are declared.
 *
 * runtime-audio OWNS Web Audio synthesis + CV rendering. Kanopi hands it the shared
 * `PitchResolver` + clock and routes Kronos `ScheduledEvent`s to it; the AudioRuntime
 * resolves token→Hz and renders `content.modulations`. Kanopi renders nothing.
 */
import type { PitchResolver, ModulationSource } from '@kronos/core';

/** Shared clock provider: maps t_scene ↔ t_audio for CV windows. */
export interface AudioClock {
  musicalNow(audioTime: number): number;
  audioTimeFor(sceneSec: number): number;
}

export interface AudioRuntimeOptions {
  /** Shared pitch resolver (`@kronos/core/pitch`): token → { frequency }. */
  pitch?: PitchResolver;
  /** Percussion/sound resolver — EMPTY in Kanopi (no sound resolution here). */
  sounds?: { resolve(token: string): unknown } | undefined;
  /** Shared clock for t_scene↔t_audio mapping (CV). */
  clock?: AudioClock;
}

/** The RuntimeAdapter: receives Kronos `ScheduledEvent`s and renders Web Audio. */
export declare class AudioRuntime {
  constructor(audioCtx: AudioContext, opts?: AudioRuntimeOptions);
  /** Render one already-timed event (onset in t_audio). */
  send(event: {
    onset: number;
    duration: number;
    actor?: string | null;
    kind?: string;
    content: {
      token: string;
      controls?: Record<string, unknown> | null;
      modulations?: unknown[] | null;
    };
  }): void;
  /** Close all voices (transport stop). */
  stop(): void;
  /** Mute/unmute a sustained actor voice (arm/disarm). */
  setActorMuted(actor: string, muted: boolean): void;
}

export declare function createAudioRuntime(
  audioCtx: AudioContext,
  opts?: AudioRuntimeOptions
): AudioRuntime;

/** CV-curve factory: compiles an opaque backtick curve spec → a `ModulationSource`
 *  (sample(tScene) bounded to its window). Injected into Kronos's composition. */
export declare const exprSource: (req: {
  spec: unknown;
  params?: unknown;
  startScene: number;
  endScene: number;
  gateSec?: number;
}) => ModulationSource | null;
