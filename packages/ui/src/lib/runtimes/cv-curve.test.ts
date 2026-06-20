import { describe, it, expect } from 'vitest';
import { renderCVCurve } from '../../../../core/src/dispatcher/cv-curve.js';

// Concrete validation of BPScript's proposed CV `curve` schema (mail [97]) against
// Kanopi's generic renderer: the library declares the shape in segments, the
// renderer turns it into the value-over-time the WebAudio transport applies. No
// engine built-in — the renderer knows nothing about ADSR, only about segments.

// The exact schema BPScript proposed for filter.json's adsr.
const ADSR_CURVE = {
  kind: 'segments',
  segments: [
    { to: 1, dur: 'attack', shape: 'exp' },
    { to: '$sustain', dur: 'decay', shape: 'exp' },
    { hold: '$sustain', until: 'gate_off' },
    { to: 0, dur: 'release', shape: 'exp' }
  ]
};

describe('renderCVCurve — generic segment evaluator (no engine built-in)', () => {
  it('renders the ADSR(5,150,0.2,400) schema to the right breakpoints', () => {
    const params = { attack: 5, decay: 150, sustain: 0.2, release: 400 };
    const gateSec = 2.0; // the grammar allocates 2s to the CV (gate_off at 2s)
    const out = renderCVCurve(ADSR_CURVE, params, gateSec);

    expect(out.kind).toBe('breakpoints');
    expect(out.points).toEqual([
      { tSec: 0, value: 0, shape: 'lin' }, // start at 0
      { tSec: 0.005, value: 1, shape: 'exp' }, // attack → 1 over 5ms
      { tSec: 0.155, value: 0.2, shape: 'exp' }, // decay → sustain over 150ms
      { tSec: 2.0, value: 0.2, shape: 'lin' }, // hold sustain until gate_off (2s)
      { tSec: 2.4, value: 0, shape: 'exp' } // release → 0 over 400ms after gate_off
    ]);
  });

  it('a short gate cuts the sustain (time never goes backward)', () => {
    const params = { attack: 5, decay: 150, sustain: 0.2, release: 400 };
    // gate shorter than attack+decay → release starts right after decay (155ms)
    const out = renderCVCurve(ADSR_CURVE, params, 0.05);
    const points = out.points!;
    expect(points[3].tSec).toBeCloseTo(0.155, 9); // not pulled back to 50ms
    expect(points[4]).toMatchObject({ tSec: 0.555, value: 0 }); // 0.155 + 0.4
  });

  it('supports an explicit `from` start value (ramp objects)', () => {
    const ramp = { kind: 'segments', segments: [{ from: 0.2, to: 1, dur: 200 }] };
    const out = renderCVCurve(ramp, {}, 1);
    expect(out.points![0]).toEqual({ tSec: 0, value: 0.2, shape: 'lin' });
    expect(out.points![1]).toEqual({ tSec: 0.2, value: 1, shape: 'lin' });
  });

  it('a dur-less segment spans the whole placed duration (filter.json ramp)', () => {
    // filter.json ramp = [{ from:$from, to:$to, shape:lin }] — no dur → gate_off.
    const ramp = {
      kind: 'segments',
      segments: [{ from: '$from', to: '$to', shape: 'lin' }]
    };
    const out = renderCVCurve(ramp, { from: 0, to: 1 }, 1.5);
    expect(out.points![0]).toEqual({ tSec: 0, value: 0, shape: 'lin' });
    expect(out.points![1]).toEqual({ tSec: 1.5, value: 1, shape: 'lin' }); // spans to gate_off
  });

  it('passes through non-segment kinds (periodic/samples/expr) for the transport', () => {
    const lfo = { kind: 'periodic', shape: 'sine', rate: 4, amplitude: 0.5 };
    const out = renderCVCurve(lfo, { rate: 4 }, 1);
    expect(out.kind).toBe('periodic');
    expect(out.spec).toBe(lfo);
  });

  it('empty/absent curve → no-op', () => {
    expect(renderCVCurve(null).kind).toBe('none');
    expect(renderCVCurve({}).kind).toBe('none');
  });
});
