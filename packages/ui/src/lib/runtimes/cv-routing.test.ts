import { describe, it, expect } from 'vitest';
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';

// Proof of the per-note modulation routing (new CV model): the dispatcher forwards
// the modulator REGISTRY to its transports, and a note's BRANCHEMENT control
// (`cutoff: 'env1'`, resolved into leaf.controls) is passed through to the
// transport's `send()` — where the transport renders env1's curve onto that note's
// cutoff. No CV tokens, no shared bus; modulation is per note.

interface MockCtx {
  currentTime: number;
  state: string;
  resume(): void;
}
function makeCtx(): MockCtx {
  return { currentTime: 0, state: 'running', resume() {} };
}

class MockTransport {
  modulators: Record<string, unknown> | null = null;
  notes: Array<Record<string, unknown>> = [];
  setModulators(reg: Record<string, unknown>) {
    this.modulators = reg;
  }
  send(msg: Record<string, unknown>) {
    this.notes.push(msg);
  }
  close() {}
}

type DispAny = InstanceType<typeof Dispatcher> & {
  _running: boolean;
  clock: { _running: boolean; _startTime: number; _anchorAudio: number; _anchorMusical: number };
  audioCtx: MockCtx;
  setSoundPredicate(fn: (t: string) => boolean): void;
  setModulators(r: Record<string, unknown>): void;
  loadEvents(ev: unknown[]): void;
  _schedule(until: number): void;
};

function arm(d: DispAny) {
  d._running = true;
  d.clock._running = true;
  d.clock._startTime = d.audioCtx.currentTime;
  d.clock._anchorAudio = d.audioCtx.currentTime;
  d.clock._anchorMusical = 0;
}

const REGISTRY = {
  env1: {
    objectType: 'adsr',
    params: { attack: 5, decay: 150, sustain: 0.2, release: 400 },
    curve: { kind: 'segments', segments: [{ to: 1, dur: 'attack', shape: 'exp' }] }
  }
};

describe('per-note modulation routing (branchement → send)', () => {
  it('forwards the registry to transports and passes the branchement control on the note', () => {
    const ctx = makeCtx();
    const d = new Dispatcher(ctx as unknown as AudioContext) as unknown as DispAny;
    const out = new MockTransport();
    d.addTransport('default', out);
    d.setSoundPredicate(() => true);

    d.setModulators(REGISTRY);
    // Note carrying the resolved branchement control `cutoff: 'env1'`.
    d.loadEvents([
      { token: 'C2', type: 'note', startSec: 0, durSec: 0.5, controls: { cutoff: 'env1' } }
    ]);
    arm(d);
    ctx.currentTime = 0;
    d._schedule(Number.POSITIVE_INFINITY);

    // The modulator registry reached the transport.
    expect(out.modulators).toEqual(REGISTRY);
    // The note routed to send carrying its modulator reference verbatim.
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0].token).toBe('C2');
    expect(out.notes[0].cutoff).toBe('env1');
  });

  it('a transport added AFTER setModulators still receives the registry', () => {
    const ctx = makeCtx();
    const d = new Dispatcher(ctx as unknown as AudioContext) as unknown as DispAny;
    d.setModulators(REGISTRY);
    const out = new MockTransport();
    d.addTransport('default', out); // added after → addTransport forwards the stored registry
    expect(out.modulators).toEqual(REGISTRY);
  });
});
