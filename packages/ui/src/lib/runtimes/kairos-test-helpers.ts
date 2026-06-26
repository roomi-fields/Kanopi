// Test-only helper: build a minimal fake Kairos that PROJECTS a `DispatchEvent[]` as the
// played timeline, so the unit tests that used to pass `events` to `startKronosAudio` can
// drive the Kairos-only path. `startKronosAudio` now binds `kairos.sourceStructure()` on the
// Transport, which PULLs `pullArbre()` once at bind and swaps that `MaterializedTimeline` in
// (and sets the cursor loop length from it). Building the timeline here from the events — with
// the SAME `dur = durationSec ?? reduce(max)` rule the production used before — keeps these
// transport-mechanics tests probing the real wiring (cursor, tempo warp, loop/step bound,
// per-actor routing) without a full BPx `charger`.

import { MaterializedTimeline } from '@kronos/core';
import type {
  TimelineEvent,
  ControlModification,
  ModulationBinding,
  OutputRef
} from '@kronos/core';
import { Kairos } from '@kairos/core';

// `DispatchEvent` (and the two payload shapes it references) used to live in the now-removed
// host-side tree flattener. It survives ONLY as a test fixture FORM: the shape the transport-
// mechanics tests build events in. Kept here VERBATIM so this helper is self-contained and no
// test depends on the deleted module.

/** A control-marker payload as it lives on a `ControlNode` (opaque to BPx). */
export interface ControlMarkerPayload {
  role?: string;
  // The inner marker payload: `{ kind, nature?, pairs?, flux?, ... }`.
  payload?: {
    kind?: string;
    nature?: string;
    pairs?: Array<{ key: string; value: unknown }>;
    flux?: boolean;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/** A note payload as it lives on an `OccupyingNode` (opaque to BPx). */
export interface NotePayload {
  nature?: string;
  actor?: string | null;
  params?: Record<string, unknown>;
  [k: string]: unknown;
}

/** One dispatch event, times in SECONDS. The fixture FORM the transport tests build. */
export interface DispatchEvent {
  token: string;
  startSec: number;
  durSec: number;
  type: 'note' | 'control' | 'rest';
  /** The node's own opaque payload (note → actor/params, control → marker). */
  payload?: NotePayload | ControlMarkerPayload | null;
  /** AST nature scellée on a control node (`transport-control` | `instant` |
   *  `engine-control`), exposed so the dispatcher routes on it directly. */
  nature?: string;
  /** E-016 sealed per-leaf runtime state (`{ vel?, transpose?, chan?, … }`). */
  rq?: Record<string, number> | null;
  /** RESOLVED non-temporal controls (`{ wave:'sawtooth', vel:'30', … }`) off the
   *  leaf's CANONICAL `controls` channel. VERBATIM values (string or number). */
  controls?: Record<string, unknown> | null;
  /** Kronos modulation bindings composed for this leaf (one per modulated input). */
  modulations?: ModulationBinding[] | null;
  /** Routing label (KAI-9): the runtime sink + fine address. Real events carry it (graven
   *  by Kairos); a fixture sets it to route to a registered sink. Absent ⇒ routed by actor. */
  output?: OutputRef;
}

// Mirror of the events→TimelineEvent mapping the production module carried before the
// Kairos-only flip (kronos-audio.ts @35fe39c): `kind` from `type`, `actor` off the payload,
// and the full `content` (token/controls/payload/rq/nature/modulations + scene span).
function toTimelineEvent(e: DispatchEvent): TimelineEvent {
  const kind: 'note' | 'rest' | 'control' =
    e.type === 'rest' ? 'rest' : e.type === 'control' ? 'control' : 'note';
  return {
    sceneOnset: e.startSec,
    sceneDuration: e.durSec,
    kind,
    actor: (e.payload as { actor?: string } | null | undefined)?.actor,
    ...(e.output ? { output: e.output } : {}),
    content: {
      token: e.token,
      controls: e.controls,
      payload: e.payload,
      rq: e.rq,
      nature: e.nature,
      modulations: e.modulations,
      startSec: e.startSec,
      durSec: e.durSec
    }
  };
}

/**
 * A fake Kairos whose `sourceStructure()` PROJECTS the given events as a `MaterializedTimeline`
 * the Transport pulls at bind. `durationSec` (when given) is the timeline length; absent ⇒ the
 * events' `reduce(max(startSec + durSec))` — the SAME repli the production used. Live ops
 * (`demande`) are queued and handed back through `drainControlOps` (the Transport drains them
 * on `tick` while running, exactly as the driver does), and `setReDerive` is recorded so the
 * live re-random/loop-toggle tests can assert the arming.
 */
export function kairosFromEvents(
  events: DispatchEvent[],
  durationSec?: number
): Kairos & { setReDerive: (cb: (() => void) | null) => void } {
  const dur = durationSec ?? events.reduce((m, e) => Math.max(m, e.startSec + e.durSec), 0);
  const timeline = new MaterializedTimeline(events.map(toTimelineEvent), dur);
  let pending: ControlModification[] = [];
  const setReDerive = (_cb: (() => void) | null): void => {};
  return {
    setReDerive,
    sourceStructure: () => ({
      pullArbre: () => timeline,
      generation: () => 0,
      drainControlOps: () => {
        const ops = pending;
        pending = [];
        return ops;
      },
      auBord: () => {}
    }),
    demande: (op: ControlModification) => {
      pending.push(op);
      return { accepté: true, cycleApplication: null };
    }
  } as unknown as Kairos & { setReDerive: (cb: (() => void) | null) => void };
}

/**
 * Project a BPx derivation tree to `DispatchEvent[]` THROUGH THE REAL Kairos: `charger(tree, ctx)`
 * then read the materialized timeline. This is the INVERSE of `toTimelineEvent` above — the
 * fixture is now sourced on the actual projection engine, not a dead host-side flattener. The
 * `actor` rides into `payload.actor` (what the tests read).
 */
export function eventsFromKairosTree(tree: unknown, ctx: unknown): DispatchEvent[] {
  const kairos = new Kairos();
  kairos.charger(
    tree as unknown as Parameters<Kairos['charger']>[0],
    ctx as unknown as Parameters<Kairos['charger']>[1]
  );
  const tl = kairos.arbreCourant();
  return tl.query(0, tl.duration + 1).map((e: TimelineEvent): DispatchEvent => {
    const content = (e.content ?? {}) as {
      token?: string;
      controls?: Record<string, unknown> | null;
      payload?: Record<string, unknown> | null;
      rq?: Record<string, number> | null;
      nature?: string;
      modulations?: ModulationBinding[] | null;
    };
    const type: 'note' | 'control' | 'rest' = (e.kind ?? 'note') as 'note' | 'control' | 'rest';
    return {
      token: content.token ?? '',
      startSec: e.sceneOnset,
      durSec: e.sceneDuration,
      type,
      payload: { actor: e.actor ?? null, ...(content.payload || {}) },
      controls: content.controls ?? null,
      rq: content.rq ?? null,
      nature: content.nature,
      modulations: content.modulations ?? null
    };
  });
}
