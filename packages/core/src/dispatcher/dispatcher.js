/**
 * BPscript Dispatcher — INERT STRUCTURE ONLY (post-RA-6).
 *
 * Kronos is the single emitter: it reads this object's per-actor map (`_actors`)
 * and its `transports` to route + fire. The dispatcher NO LONGER schedules or emits
 * anything — its old lookahead clock / scheduler / FSM / position + the live
 * tempo/loop/re-random/mute knobs that fed them are GONE (dead emitter, never called).
 * What survives is the STRUCTURE Kronos consumes (transports + actor routing) plus
 * `loadEvents`/`duration` (Kronos reads `duration` as a fallback) and `coerceControlValues`.
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
    this.events = [];         // timing-only events — feeds `duration` (Kronos's fallback)

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

  /**
   * Load tree-derived dispatch events — the SINGLE load path for ALL grammars
   * (orchestrated AND mono / `.gr` / text). Each event CARRIES its own payload
   * off the BPx tree: a note's `payload.actor`/`payload.params` and the sealed
   * E-016 `rq` (`runtimeQualifiers`), a control's marker payload + `nature`.
   * Times are already in SECONDS.
   *
   * Routing keys on `payload.actor` per event: a terminal shared by two actors
   * routes to two transports. A note WITHOUT an actor routes to the 'default'
   * transport. A MUTE token (`soundsFn` false in `_schedule`) is skipped, not
   * routed — uniformly for every grammar. There is NO flat symbol→actor map.
   *
   * @param {Array<{token:string,startSec:number,durSec:number,type:'note'|'control'|'rest',payload?:object,nature?:string,rq?:object}>} events
   */
  loadEvents(events) {
    // `this.events` feeds ONLY `duration` (Kronos's fallback); the rich per-leaf
    // shape (isControl/payload/nature/rq/controls) + the control-priority sort the
    // removed emitter needed are gone. Keep just the timing fields.
    this.events =
      events && events.length
        ? events.map((e) => ({
            token: e.token,
            startSec: e.startSec,
            durSec: Math.max(0, e.durSec || 0),
          }))
        : [];
  }

  /**
   * Total duration of loaded sequence in seconds = the latest event END
   * (max startSec+durSec) — not the last-by-start (a long earlier note can end last).
   */
  get duration() {
    return this.events.reduce((m, e) => {
      const end = e.startSec + e.durSec;
      return end > m ? end : m;
    }, 0);
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
