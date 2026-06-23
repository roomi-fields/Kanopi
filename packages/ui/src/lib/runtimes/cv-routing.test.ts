import { describe, it, expect } from 'vitest';
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';

// Proof of the per-note modulation routing (new CV model): the dispatcher forwards
// the modulator REGISTRY to its transports — including a transport registered AFTER
// setModulators (order-independent). The dispatcher is the inert structure Kronos
// reads; the per-note curve rendering itself lives on the Kronos send path.

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
  setModulators(reg: Record<string, unknown>) {
    this.modulators = reg;
  }
  send() {}
  close() {}
}

type DispAny = InstanceType<typeof Dispatcher> & {
  setModulators(r: Record<string, unknown>): void;
};

const REGISTRY = {
  env1: {
    objectType: 'adsr',
    params: { attack: 5, decay: 150, sustain: 0.2, release: 400 },
    curve: { kind: 'segments', segments: [{ to: 1, dur: 'attack', shape: 'exp' }] }
  }
};

describe('per-note modulation routing (registry forwarding)', () => {
  it('a transport added AFTER setModulators still receives the registry', () => {
    const ctx = makeCtx();
    const d = new Dispatcher(ctx as unknown as AudioContext) as unknown as DispAny;
    d.setModulators(REGISTRY);
    const out = new MockTransport();
    d.addTransport('default', out); // added after → addTransport forwards the stored registry
    expect(out.modulators).toEqual(REGISTRY);
  });
});
