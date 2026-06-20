// Generic CV curve evaluator — the renderer side of the modular CV model.
//
// A modulator (ADSR, LFO, ramp, custom) is a function of time, DECLARED IN A
// LIBRARY (no engine built-in). Its shape lives in the library JSON as a `curve`
// block; this evaluator interprets that block into the value-over-time the audio
// transport applies to a voice's CV input (cutoff / amplitude / frequency). The
// transport stays generic — it knows nothing about ADSR; it only applies what
// this produces. Schema = BPScript's proposal (CV mail [97]):
//
//   curve = { kind:"segments", segments:[
//     { to:1,          dur:"attack",  shape:"exp" },
//     { to:"$sustain", dur:"decay",   shape:"exp" },
//     { hold:"$sustain", until:"gate_off" },
//     { to:0,          dur:"release", shape:"exp" } ] }
//
// Conventions: "$name" = the modulator param's value; `dur` = a param NAME (ms) or
// a literal (ms); `shape` = lin|exp|log (default lin); `hold … until:"gate_off"` =
// the sustain phase, held until the gate (note) releases. Other kinds: `periodic`
// (LFO), `samples` (buffer/data), `expr` (backtick t,dur→value) — passed through
// as a descriptor for the transport to render (oscillator / buffer / worklet).
//
// `params`  = the modulator's resolved named args, e.g. {attack:5, decay:150,
//             sustain:0.2, release:400}. Times in ms, levels as ratios.
// `gateSec` = the duration the grammar allocates to the CV (the `gate_off` instant).

/** Resolve a `$param` reference or a literal to a number. */
function resolveValue(v, params) {
  if (typeof v === 'string' && v.charAt(0) === '$') return Number(params[v.slice(1)]);
  return Number(v);
}

/** Resolve a duration: a param NAME (value in ms) or a literal (ms) → seconds. */
function resolveDurSec(v, params) {
  const ms = typeof v === 'string' ? Number(params[v]) : Number(v);
  return (Number.isFinite(ms) ? ms : 0) / 1000;
}

/**
 * Evaluate a library `curve` into the renderer's value-over-time.
 *
 * For `kind:"segments"` returns `{ kind:'breakpoints', points:[{tSec,value,shape}] }`
 * — a piecewise envelope the transport applies to a normalized [0..1] CV input
 * (the CV input then scales to its own range). The first point is the start value
 * (an explicit `from` on the first segment, else 0). `hold … until:"gate_off"`
 * holds until `gateSec`; a release segment after it starts at `gateSec`.
 *
 * For `periodic` / `samples` / `expr` returns the descriptor unchanged (the
 * transport renders those via an oscillator / buffer / worklet).
 *
 * @param {object} curve   the library object's `curve` block
 * @param {object} params  resolved named args (ms times, ratio levels)
 * @param {number} gateSec gate duration (the `gate_off` instant), seconds
 * @returns {{kind:string, points?:Array<{tSec:number,value:number,shape:string}>}}
 */
export function renderCVCurve(curve, params = {}, gateSec = 0) {
  if (!curve || curve.kind === undefined) return { kind: 'none' };
  if (curve.kind !== 'segments') {
    return { kind: curve.kind, spec: curve, params, gateSec };
  }

  const segments = Array.isArray(curve.segments) ? curve.segments : [];
  const first = segments[0];
  const start = first && first.from !== undefined ? resolveValue(first.from, params) : 0;
  const points = [{ tSec: 0, value: start, shape: 'lin' }];
  let t = 0;

  for (const seg of segments) {
    if (seg.hold !== undefined) {
      // Sustain: hold its value until the gate releases (gate_off). Never moves
      // time backward (a very short gate keeps t at the attack+decay edge).
      const until = seg.until === 'gate_off' ? gateSec : t;
      t = Math.max(t, until);
      points.push({ tSec: t, value: resolveValue(seg.hold, params), shape: 'lin' });
    } else {
      // Timed ramp to `to`. With a `dur` (param name in ms, or literal) it lasts
      // that long; WITHOUT a `dur` it spans the whole placed duration (gate_off) —
      // that's the `ramp` object (a single from/to over the allocated time).
      if (seg.dur === undefined) t = Math.max(t, gateSec);
      else t += resolveDurSec(seg.dur, params);
      points.push({
        tSec: t,
        value: resolveValue(seg.to, params),
        shape: seg.shape || 'lin'
      });
    }
  }

  return { kind: 'breakpoints', points };
}
