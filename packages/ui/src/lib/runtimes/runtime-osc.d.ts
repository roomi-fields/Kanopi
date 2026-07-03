/**
 * Local type surface for the cross-tree `runtime-osc` dependency (ESM-only JS, no
 * shipped `.d.ts`), mapped via `tsconfig.paths` — same pattern as
 * `runtime-audio.d.ts` / `runtime-midi.d.ts`. Only the exports Kanopi consumes are
 * declared.
 *
 * runtime-OSC OWNS OSC output: a pluggable output PROFILE turns a Kronos
 * `ScheduledEvent` into addressed OSC emissions, an interchangeable TRANSPORT
 * carries the bytes (browser → WebSocket → osc-bridge relay → UDP). Kanopi only
 * builds the adapter on the shared clock, names the actor→'osc' route, and hands
 * up the per-actor `{device, channel}` bindings at setup. It resolves no address.
 */

/** Per-actor binding (scene data: `@actor X device:<name> ch:<n>`). */
export interface OscBinding {
  device?: string;
  channel?: number;
}

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
  setBindings?(bindings: Record<string, OscBinding>): Promise<void>;
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
  setBindings(bindings: Record<string, OscBinding>): Promise<void>;
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
  /** Declare actor→device bindings (scene setup, off the hot path). */
  setBindings(bindings: Record<string, OscBinding>): Promise<void>;
  /** Emit one already-timed event (onset in t_audio). */
  send(event: OscScheduledEvent): void;
  /** Cancel scheduled-but-unsent emissions (transport stop). */
  stop(): void;
  /** Mute/unmute an actor's emission (arm/disarm). */
  setActorMuted(actor: string, muted: boolean): void;
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
  dispose(): void;
}

/** Fabrique de la sortie OSC (parallèle à `createMidiRuntime`/`createAudioRuntime`). Rend `null`
 *  si aucun acteur `runtime==='osc'` OU pas d'URL de relais. Point d'entrée hôte. */
export declare function createOscRuntime(opts?: OscRuntimeOptions): OscRuntime | null;
