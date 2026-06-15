import type { Runtime } from '../core-mock';
import type { EventBus } from '../events/types';

export type EvalSource = {
  actorId?: string;
  fileId: string;
  /**
   * Offset of the evaluated code inside the source document. 0 when the
   * whole file is evaluated (actor toggle). Non-zero when Ctrl+Enter
   * evaluates a partial block — without this, visualizer `locations`
   * would point to the start of the doc instead of the eval'd block.
   */
  docOffset?: number;
};

export type LogPush = (e: {
  runtime: Runtime;
  level: 'info' | 'warn' | 'error';
  msg: string;
}) => void;

/**
 * What a voice PRODUCES (≠ DeviceType, what a device ACCEPTS — see
 * DEVICES_SPEC.md). The dispatcher checks voice.outputType against the target
 * device's accepted set before routing; an incompatible voice is refused at
 * eval, never silently dropped (ADAPTER_SPEC §1bis (b)).
 */
export type VoiceOutputType =
  | 'notes' // pitched events (→ midi / audio)
  | 'signal' // raw audio signal, no discrete pitch (→ audio)
  | 'visual' // pixels / canvas / video (→ video)
  | 'control' // CC / control messages (→ osc)
  | 'light' // intensities / colours (→ dmx)
  | 'text'; // symbols to read (→ text / console)

export interface RuntimeAdapter {
  readonly id: Runtime;
  /**
   * Type of output this voice produces — drives voice↔device compatibility
   * checking (ADAPTER_SPEC §1bis (b)). OBLIGATOIRE.
   */
  readonly outputType: VoiceOutputType;
  /**
   * File extensions owned by this adapter, with the leading dot (`.hydra`,
   * `.p5`). The FilesView `+ New file` dialog, `runtimeFromExt`, and any
   * future dispatcher that needs to map an extension to a runtime derive
   * from these lists. Adding a new language is therefore entirely
   * self-contained in its adapter — no separate mapping table to keep
   * in sync.
   */
  readonly extensions: readonly string[];
  /** Resolves when the code evaluated cleanly; throws on any eval error. */
  evaluate(code: string, src: EvalSource, log: LogPush): Promise<void>;
  /**
   * Stop a specific source (actor or block). For runtimes that don't support
   * per-source stop (Strudel global hush), implementations may stop everything.
   */
  stop(src: EvalSource, log: LogPush): Promise<void>;
  /** Propagate global tempo change. Optional. */
  setBpm?(bpm: number, log: LogPush): void;
  /**
   * Notifications de battement du clock central. `count` est l'indice
   * monotonic (absBeat/absBar) depuis start. Permet à un adapter dont
   * le langage s'appuie sur une horloge visuelle (ex: Hydra `.rotate(beat)`)
   * de rester calé sur le transport Kanopi. Optionnels.
   */
  onBeat?(count: number, log: LogPush): void;
  onBar?(count: number, log: LogPush): void;
  /**
   * Optional per-adapter event bus. If present, the core relays `onAny` into
   * `core.events` at init so visualizers consume a single unified stream.
   */
  readonly events?: EventBus;
  dispose(): Promise<void>;
}
