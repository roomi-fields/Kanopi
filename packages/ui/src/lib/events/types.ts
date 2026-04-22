// KanopiEvent — unified runtime event bus types.
// See docs/design/EVENTS.md for the full specification.

import type { Runtime } from '../core-mock/types';

export type EventSourceTag = Runtime | 'clock';

interface KanopiEventBase {
  readonly schemaVersion: 1;
  readonly t: number; // wall-clock ms via performance.now()
  readonly runtime: EventSourceTag;
  readonly source?: string;
}

export interface BeatEvent extends KanopiEventBase {
  readonly type: 'beat';
  readonly runtime: 'clock';
  readonly count: number;
  readonly bpm: number;
  readonly phase: number;
}

export interface BarEvent extends KanopiEventBase {
  readonly type: 'bar';
  readonly runtime: 'clock';
  readonly count: number;
}

export interface TransportEvent extends KanopiEventBase {
  readonly type: 'transport';
  readonly runtime: 'clock';
  readonly playing: boolean;
  readonly bpm: number;
}

export interface TriggerEvent extends KanopiEventBase {
  readonly type: 'trigger';
  readonly name: string;
}

export type TokenLocation = readonly [from: number, to: number, fileId: string];

export interface TokenEvent extends KanopiEventBase {
  readonly type: 'token';
  readonly name: string;
  readonly pitch?: number;
  readonly gain?: number;
  readonly duration: number;
  readonly locations?: ReadonlyArray<TokenLocation>;
}

export interface FlagEvent extends KanopiEventBase {
  readonly type: 'flag';
  readonly name: string;
  readonly value: number | string | boolean;
}

export type KanopiEvent =
  | BeatEvent
  | BarEvent
  | TransportEvent
  | TriggerEvent
  | TokenEvent
  | FlagEvent;

export type EventType = KanopiEvent['type'];
export type EventOf<T extends EventType> = Extract<KanopiEvent, { type: T }>;
export type Listener<T extends EventType> = (e: EventOf<T>) => void;
export type AnyListener = (e: KanopiEvent) => void;
export type Unsubscribe = () => void;

export interface EventBus {
  on<T extends EventType>(type: T, cb: Listener<T>): Unsubscribe;
  onAny(cb: AnyListener): Unsubscribe;
  emit(e: KanopiEvent): void;
}
