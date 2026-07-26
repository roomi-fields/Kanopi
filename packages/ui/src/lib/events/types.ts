// KanopiEvent — unified runtime event bus types.
// See docs/design/EVENTS.md for the full specification.

import type { Runtime } from '../core-mock/types';

// 'clock' = le temps (Kronos) ; 'in' = le runtime d'ENTRÉE (`runtime-in`), symétrique des
// runtimes de sortie. Ce n'est pas un langage de voix, d'où l'ajout ici et non dans `Runtime`.
export type EventSourceTag = Runtime | 'clock' | 'in';

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

// L'ÉVÉNEMENT D'ENTRÉE — charge OPAQUE. Contrat `hub/contrats/hote-runtime-in.md`
// § « L'événement d'entrée » (RATIFIÉ 2026-07-27), forme reprise à l'identique.
//
// L'HÔTE L'ACCUEILLE, IL NE L'INTERPRÈTE PAS. Il tient le bus ; c'est tout. Un nom de note se
// résout par l'alphabet déclaré, EN AVAL — `runtime-in` n'émet que des NUMÉROS, et l'hôte n'en
// fait pas davantage un nom. Aucun routage non plus (`@map` route), aucun état de scène (armer un
// point d'attente est le mandat de Kairos).
//
// PAS DE SECOND BUS : le contrat l'interdit explicitement, parce qu'un bus séparé dupliquerait la
// règle de temps. `t` est TOUJOURS du temps mural, converti à l'émission par le périphérique
// depuis `sink.now()` — un time tag natif (estampille MIDI, time tag OSC) est une donnée à
// convertir, jamais une autorité. C'est cette règle, et elle seule, qui rend une note MIDI et un
// message OSC comparables sur ce bus.
//
// IDENTITÉ STRUCTURELLE, pas import mutuel : chaque dépôt garde sa copie de la forme (même
// principe que `hote-runtimes-sortie.md`). Toute évolution se propose à l'architecte avant d'être
// figée des deux côtés.
export type InputSignal =
  | {
      readonly kind: 'note';
      readonly number: number;
      readonly channel: number;
      readonly velocity: number;
      readonly on: boolean;
    }
  | {
      readonly kind: 'control';
      readonly number: number;
      readonly channel: number;
      readonly value: number;
    }
  | { readonly kind: 'address'; readonly path: string; readonly args: readonly unknown[] } // OSC
  | { readonly kind: 'key'; readonly code: string; readonly down: boolean }; // clavier, code PHYSIQUE

export interface InputEvent extends KanopiEventBase {
  readonly type: 'input';
  readonly runtime: 'in';
  /** Le port, l'adresse, ou le clavier — étiquette de provenance, jamais un routage. */
  readonly source?: string;
  readonly device: 'midi' | 'osc' | 'keyboard';
  readonly signal: InputSignal;
}

export type KanopiEvent =
  | BeatEvent
  | BarEvent
  | TransportEvent
  | TriggerEvent
  | TokenEvent
  | FlagEvent
  | InputEvent;

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
