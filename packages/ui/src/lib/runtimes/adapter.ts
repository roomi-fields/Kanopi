import type { Runtime } from '../core-mock';
import type { EventBus } from '../events/types';

export type EvalSource = { actorId?: string; fileId: string };

export type LogPush = (e: { runtime: Runtime; level: 'info' | 'warn' | 'error'; msg: string }) => void;

export interface RuntimeAdapter {
  readonly id: Runtime;
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
   * Optional per-adapter event bus. If present, the core relays `onAny` into
   * `core.events` at init so visualizers consume a single unified stream.
   */
  readonly events?: EventBus;
  dispose(): Promise<void>;
}
