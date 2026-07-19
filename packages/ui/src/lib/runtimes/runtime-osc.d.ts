/**
 * Local type surface for the cross-tree `runtime-osc` dependency, mapped via
 * `tsconfig.paths`. UNLIKE runtime-audio/runtime-midi/runtime-codevoices (migrated to
 * their PUBLISHED types, chantier single-source 2026-07-19 — cf.
 * hub/decisions/2026-07-19-copies-de-surface-cross-repo-single-source-ou-declaree-outillee.md),
 * this ONE copy stays: runtime-OSC's own generated `types/create-runtime.d.ts` DROPS
 * `oscWsUrl`/`actors`/`profile` from `createOscRuntime`'s options type (tsc's
 * `--declaration --allowJs --emitDeclarationOnly` fails to carry destructured
 * parameters that have no inline default into the emitted object type, even though
 * they're `@param`-documented in `src/create-runtime.js`) — confirmed by regenerating
 * the package's own types fresh. Kanopi's `kronos-audio.ts` genuinely calls
 * `createOscRuntime({ oscWsUrl, actors, log })`, so the published surface is
 * insufficient here; reported upstream (runtime-OSC), not routed around. Only the
 * exports Kanopi consumes are declared.
 *
 * ⚠️ COPIE TEMPORAIRE — dernier recours DÉCLARÉ (décision single-source 2026-07-19,
 * arbitrage architecte [866]), PAS une copie permanente. Elle existe UNIQUEMENT le temps
 * que runtime-OSC corrige la génération de ses types (défaut inline / interface annotée
 * sur `createOscRuntime` pour que `oscWsUrl`/`actors`/`profile` survivent à l'émission).
 * DÈS leur correctif poussé : SUPPRIMER ce fichier + son entrée `tsconfig.paths` et importer
 * le vrai type publié (`from 'runtime-osc/browser'`), comme audio/midi/codevoices. Correctif
 * exact envoyé à runtime-osc (courrier tour). Ne rien AJOUTER ici : le seul mouvement permis
 * est la suppression.
 *
 * runtime-OSC OWNS OSC output: a pluggable output PROFILE turns a Kronos
 * `ScheduledEvent` into addressed OSC emissions, an interchangeable TRANSPORT
 * carries the bytes (browser → WebSocket → osc-bridge relay → UDP). Kanopi only
 * builds the adapter on the shared clock, names the actor→'osc' route, and hands
 * up the per-actor `{device, channel}` bindings at setup. It resolves no address.
 */

/** The graven output address (KAI-9): Kairos stamps it per event; the runtime ROUTES
 *  on `runtime` and reads `device`/`channel` here — never a host actor binding. */
export interface OscOutputRef {
  runtime: string;
  device?: string;
  channel?: number;
}

/** A scheduled event handed to the adapter (already timed in t_audio). */
export interface OscScheduledEvent {
  onset: number;
  duration: number;
  actor?: string | null;
  kind?: string;
  /** KAI-9 routing layer: device/channel ride here, graven by Kairos from the tree. */
  output?: OscOutputRef;
  content: {
    token: string;
    controls?: Record<string, unknown> | null;
    modulations?: unknown[] | null;
  };
}

/** Transport layer: carries raw OSC bytes. Browser variant = WebSocket → relay. */
export interface OscTransport {
  send(bytes: unknown): void;
  close?(): void;
}

/** WebSocket transport (browser → WS→UDP relay, e.g. osc-bridge). */
export declare class WebSocketTransport implements OscTransport {
  constructor(opts: { socket?: unknown; url?: string; WebSocketImpl?: unknown });
  send(bytes: unknown): void;
  close(): void;
}

/** Output profile: maps a ScheduledEvent → addressed OSC emissions. */
export interface OscOutputProfile {
  map(event: OscScheduledEvent): Array<{ offsetSec: number; address: string; args: unknown[] }>;
  /** Pre-load the enumerated device surfaces at setup (sync hot path after). */
  prepareSurfaces?(deviceNames?: string[]): Promise<void>;
}

/** osc-bridge output profile: resolves opaque control names to device addresses. */
export declare class OscBridgeProfile implements OscOutputProfile {
  constructor(opts?: {
    library?: { resolve(name: string): unknown } | null;
    resolveSurface?: ((name: string) => unknown) | null;
    resolveHz?: (token: unknown) => number | null;
    velocity?: number;
    pitchBendRange?: number;
    sendPitchBend?: boolean;
    log?: (msg: string) => void;
  });
  map(event: OscScheduledEvent): Array<{ offsetSec: number; address: string; args: unknown[] }>;
  /** Pre-load the enumerated device surfaces at setup (the sync hot path follows). */
  prepareSurfaces(deviceNames?: string[]): Promise<void>;
}

/** The OSC RuntimeAdapter: schedules profile emissions on the injected clock. */
export declare class OscAdapter {
  constructor(opts: {
    transport: OscTransport;
    profile?: OscOutputProfile;
    prefix?: string;
    latency?: number;
    now?: () => number;
  });
  readonly latency: number;
  /** Pre-load the enumerated device surfaces at setup (sync hot path after). */
  prepareSurfaces(deviceNames?: Iterable<string>): Promise<void>;
  /** FRONTIÈRE-OSC #5 : reçoit la table acteur→sortie BRUTE (`metadata.actors`) et en
   *  DÉRIVE les appareils OSC à pré-charger (remplace l'ancien `setBindings`, qui prenait
   *  des bindings déjà résolus côté hôte — l'hôte ne dérive plus rien). */
  setActorTable(
    actors: Record<string, { runtime: string; params?: Record<string, unknown> }>
  ): Promise<void>;
  /** Emit one already-timed event (onset in t_audio). */
  send(event: OscScheduledEvent): void;
  /** Cancel scheduled-but-unsent emissions (transport stop). */
  stop(): void;
  /** Mute/unmute an actor's emission (arm/disarm). */
  setActorMuted(actor: string, muted: boolean): void;
  /** MIXAGE (slot optionnel du contrat hote-runtimes-sortie.md:51, amendement 2026-07-09
   *  ratifié — même nom/signature que runtime-audio/runtime-midi). L'hôte porte l'INTENTION
   *  (0..1 linéaire, effectif = acteur × maître) ; la réalisation (mise à l'échelle de la
   *  vélocité, effet à la PROCHAINE note) est interne au paquet. État PRIVÉ D'INSTANCE
   *  (`#masterGain`/`#actorGains`, adapter.js:63-65) : un `OscAdapter` frais est créé à
   *  chaque play (pas de `buildOnly`) — le rôle de le ré-appliquer revient à l'hôte, aux
   *  mêmes points d'accroche `applyMixerGains()` déjà utilisés pour runtime-audio. */
  setMasterGain(value: number): void;
  setMasterMuted(muted: boolean): void;
  setActorGain(actor: string, value: number): void;
  /** Release timers + transport. */
  close(): void;
}

export interface OscRuntimeOptions {
  oscWsUrl?: string;
  /** Table BRUTE des acteurs (`metadata.actors`) — la fabrique DÉRIVE elle-même les devices. */
  actors?: Record<string, { runtime: string; params?: Record<string, unknown> }>;
  latency?: number;
  log?: (msg: string) => void;
  profile?: OscOutputProfile;
}

/** Sortie OSC — adaptateur UNIFORME (frontière hôte↔runtimes de sortie). POSSÈDE le socket
 *  WS→pont, le profil d'adressage, et DÉRIVE les devices depuis la table brute d'acteurs —
 *  l'hôte ne dérive rien, ne construit rien. Kronos appelle `send(ev)`/`bindClock`. */
export interface OscRuntime {
  readonly latency: number;
  bindClock(clock: unknown): void;
  send(event: unknown): void;
  stop(): void;
  setActorMuted(actor: string, muted: boolean): void;
  /** MIXAGE — voir `OscAdapter` ci-dessus (même contrat, l'instance rendue par la fabrique EST
   *  un `OscAdapter`). */
  setMasterGain(value: number): void;
  setMasterMuted(muted: boolean): void;
  setActorGain(actor: string, value: number): void;
  dispose(): void;
}

/** Fabrique de la sortie OSC (parallèle à `createMidiRuntime`/`createAudioRuntime`). Rend `null`
 *  si aucun acteur `runtime==='osc'` OU pas d'URL de relais. Point d'entrée hôte. */
export declare function createOscRuntime(opts?: OscRuntimeOptions): OscRuntime | null;
