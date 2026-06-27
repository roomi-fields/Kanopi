/**
 * BPscript Dispatcher — INERT TRANSPORT CONTAINER ONLY (post-RA-6 / post-KAI-9).
 *
 * Routing is per-event by `event.output.runtime` (graven by Kairos off the BPx tree),
 * NOT by any host-held actor→transport map: the dispatcher keeps no `_actors` table.
 * It NO LONGER schedules or emits anything — its old lookahead clock / scheduler / FSM /
 * position + the live tempo/loop/re-random/mute knobs that fed them are GONE. What
 * survives is the per-name `transports` registry the host opens for LIFECYCLE (`stop()`
 * closes them) plus `coerceControlValues`. The old `loadEvents`/`duration` pair is GONE:
 * the loop length is the timeline's own duration, read back via Kronos's
 * `loopDurationScene()` primitive — never a second reduce(max) here.
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
    // exponent is UNBOUNDED in the source, so `'1e400'` passes the regex yet
    // `Number(s)` overflows to ±Infinity; a non-finite value handed to a Web Audio
    // AudioParam throws a RangeError (silent muted note). So when `Number(s)` is not
    // finite we keep the original STRING — clean degradation, never Infinity.
    const s = typeof v === 'string' ? v.trim() : null;
    if (s !== null && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) {
      const num = Number(s);
      out[k] = Number.isFinite(num) ? num : v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export class Dispatcher {
  /**
   * @param {AudioContext} audioCtx
   */
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.transports = {};     // name → Transport instance (opened by the host for lifecycle)
  }

  /**
   * Register a transport by name.
   */
  addTransport(name, transport) {
    this.transports[name] = transport;
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
