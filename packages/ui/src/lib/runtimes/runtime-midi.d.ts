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

/** Raison de non-disponibilité de la sortie MIDI (fail-loud, contrat §3). `no-selection` :
 *  l'accès Web MIDI est ouvert et des ports existent, mais aucun n'a été explicitement
 *  choisi par l'utilisateur (le loopback ALSA « Midi Through » est TOUJOURS présent mais
 *  ne compte jamais comme jouable). */
export type MidiUnavailableReason = null | 'no-webmidi' | 'no-output' | 'denied' | 'no-selection';

/** Sortie MIDI — adaptateur UNIFORME (frontière hôte↔runtimes de sortie). POSSÈDE SEUL
 *  l'accès Web MIDI (singleton de module, persistant inter-scènes) + son MidiTransport ;
 *  résout le canal (`output.channel`), normalise la vélocité, met en forme l'événement —
 *  l'hôte ne fait rien de tout ça et n'ouvre JAMAIS son propre `requestMIDIAccess`.
 *  Kronos appelle `send(ev)`/`bindClock` ; l'hôte appelle `init()` (ouvre/réutilise
 *  l'accès), `listOutputs()`/`setOutput(id)` (sélection display-only par ID — l'objet
 *  `MIDIOutput` ne traverse JAMAIS la frontière), `status()` (gate AU PLAY), `dispose()`.
 *
 *  Contrat pinné : hub/contrats/kanopi-runtime-midi.md §3 (2bcbdc9). */
export interface MidiRuntime {
  /** Ouvre (ou réutilise) l'accès Web MIDI singleton. `ok` reflète UNIQUEMENT « l'accès
   *  est ouvert ET ≥1 port existe », INDÉPENDAMMENT de toute sélection — la sélection
   *  réelle se lit via `status()`. Ne PAS gater sur `init().ok` (un port existe presque
   *  toujours — loopback ALSA — même sans device choisi : le gate mordrait jamais). */
  init(): Promise<{ ok: boolean; reason: null | 'no-webmidi' | 'no-output' | 'denied' }>;
  /** Énumération DISPLAY-ONLY des sorties ({id, name}, jamais l'objet MIDIOutput) — peuple
   *  le sélecteur hôte. Vide tant que `init()` n'a pas ouvert l'accès. */
  listOutputs(): { id: string; name: string }[];
  /** Sélectionne la sortie PAR ID (RUPTURE : remplace l'ancien `setOutput(port)` qui
   *  acceptait l'objet MIDIOutput — root cause du silence croisé-accès). La sélection
   *  persiste en session (singleton) : une prochaine scène la retrouve sans rien retenir
   *  côté hôte. */
  setOutput(id: string | null): void;
  /** Sondage synchrone de disponibilité — l'hôte le sonde AU PLAY pour GATER (ready=false
   *  → cri actionnable mappé sur `reason`, jamais un play muet). `ready` reflète un device
   *  EXPLICITEMENT sélectionné, pas juste « un accès est ouvert ». */
  status(): { ready: boolean; reason: MidiUnavailableReason };
  /** Relais bonus du hot-plug ALSA/OS — rafraîchit le dropdown hôte (pas un fail-loud
   *  runtime). Renvoie le désabonnement. */
  onDevicesChanged(cb: (outputs: { id: string; name: string }[]) => void): () => void;
  bindClock(clock: unknown): void;
  send(event: unknown): void;
  stop(): void;
  setActorMuted(actor: string, muted: boolean): void;
  /** MIXAGE (slot optionnel du contrat hote-runtimes-sortie.md:51, amendement 2026-07-09
   *  ratifié — même nom/signature que runtime-audio). L'hôte porte l'INTENTION (0..1 linéaire,
   *  effectif = acteur × maître) ; la réalisation (mise à l'échelle de la vélocité, effet à la
   *  PROCHAINE note — protocole discret, pas de rampe anti-clic) est interne au paquet. État
   *  MODULE-LEVEL (`_mixer`, midi-runtime.js:50) : survit à un `stop()`→`play()` et à un
   *  MidiRuntime recréé par scène, PAS besoin de re-pousser après un play. */
  setMasterGain(value: number): void;
  setMasterMuted(muted: boolean): void;
  setActorGain(actor: string, value: number): void;
  dispose(): void;
  close(): void;
}

/** Fabrique de la sortie MIDI (parallèle à `createAudioRuntime`). Point d'entrée hôte. */
export declare function createMidiRuntime(opts?: MidiRuntimeOptions): MidiRuntime;
