/**
 * BPscript Dispatcher — INERT STRUCTURE ONLY (post-RA-6).
 *
 * Kronos is the single emitter: it reads this object's per-actor map (`_actors`)
 * and its `transports` to route + fire. The dispatcher NO LONGER schedules or emits
 * anything — its old lookahead clock / scheduler / FSM / position + the live
 * tempo/loop/re-random/mute knobs that fed them are GONE (dead emitter, never called).
 * What survives is the STRUCTURE Kronos consumes (transports + actor routing) plus
 * `coerceControlValues`. The old `loadEvents`/`duration` pair is GONE: the loop length
 * is the timeline's own duration, read back via Kronos's `loopDurationScene()` primitive
 * — the dispatcher never held a second reduce(max) of it (that was a duplicate authority).
 */

/**
 * Coerce a leaf's resolved controls to runtime types. BPx delivers control values
 * VERBATIM (`vel:'80'` as a string, `wave:'sawtooth'` as a string) — type
 * interpretation is the consumer's job (R2). Numeric-looking strings become
 * numbers (so velocity/filterQ/… apply); non-numeric strings pass through (so the
 * oscillator waveform stays a string). Returns a fresh object; `null`/absent → {}.
 * @param {Record<string, unknown>|null|undefined} controls
 * @returns {Record<string, unknown>}
 */
export function coerceControlValues(controls) {
  if (!controls) return {};
  const out = {};
  for (const [k, v] of Object.entries(controls)) {
    // Decimal AND scientific-notation numbers coerce (so `vel:'80'`,
    // `filterQ:'2.5'`, and exponent CV like `'1e3'` / `'2.5e-1'` apply); reject
    // hex (`'0x10'`), the special words `'Infinity'`/`'NaN'`, empty/whitespace,
    // and non-numeric strings (`wave:'sawtooth'`) — a control name that merely
    // happens to be JS-parseable as a number must NOT be silently retyped. The
    // regex only matches finite numeric literals, so `Number(s)` is always finite.
    const s = typeof v === 'string' ? v.trim() : null;
    out[k] =
      s !== null && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : v;
  }
  return out;
}

export class Dispatcher {
  /**
   * @param {AudioContext} audioCtx
   */
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.transports = {};     // name → Transport instance (read by Kronos for routing)

    // Actor system: per-actor transport binding. Routing keys on each event's OWN
    // `payload.actor` (carried off the BPx tree) — there is no flat symbol→actor
    // map: a terminal shared by two actors routes by occurrence, never collapsed.
    // A note WITHOUT an actor routes to 'default'.
    this._actors = {};              // actorName → { transportName }
  }

  /**
   * Register a transport by name.
   */
  addTransport(name, transport) {
    this.transports[name] = transport;
  }

  /**
   * Set actor system: keeps only the actor KEYS, each later bound to a transport
   * via `setActorTransport`. Routing is by each event's own `payload.actor` (off
   * the tree), so NO flat symbol→actor map is needed — a terminal shared by two
   * actors routes by occurrence. Each entry holds `{ transportName }`.
   * @param {Object} actorTable - { actorName → { alphabet, transport, ... } }
   */
  setActors(actorTable) {
    this._actors = {};
    if (actorTable) {
      for (const name of Object.keys(actorTable)) {
        this._actors[name] = { transportName: null };
      }
    }
  }

  /**
   * Set the transport for a specific actor.
   * @param {string} actorName
   * @param {string} transportName - key in this.transports
   */
  setActorTransport(actorName, transportName) {
    if (this._actors[actorName]) {
      this._actors[actorName].transportName = transportName;
    }
  }

  /** Teardown: close every transport (the host calls this on a same-file re-eval /
   *  scene swap). The dispatcher holds no running state to reset — Kronos owns the
   *  transport/clock; closing the transports releases their voices. */
  stop() {
    for (const transport of Object.values(this.transports)) {
      transport.close();
    }
  }
}
