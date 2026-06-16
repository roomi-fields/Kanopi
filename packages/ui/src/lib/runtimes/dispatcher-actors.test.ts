import { describe, it, expect, beforeEach } from 'vitest';
// The runtime dispatcher lives in @kanopi/core; imported via the same relative
// path the bp3 adapter uses. We drive `_schedule(Infinity)` directly so the test
// is synchronous (no Web Audio clock / timers), asserting on mock transports.
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';

// Minimal AudioContext stub: the dispatcher only reads `currentTime` and (on
// start) `state`/`resume`. We never call start() here — we drive _schedule.
function makeCtx() {
  return { currentTime: 0, state: 'running', resume() {} } as unknown as AudioContext;
}

interface Sent {
  token: string;
  velocity?: number;
  vel?: number;
  chan?: number;
  [k: string]: unknown;
}
class MockTransport {
  sent: Sent[] = [];
  controls: unknown[] = [];
  send(msg: Sent) {
    this.sent.push(msg);
  }
  sendControl(msg: unknown) {
    this.controls.push(msg);
  }
  close() {}
}

// Drain every loaded event synchronously through the scheduler.
function drain(d: InstanceType<typeof Dispatcher>) {
  const dd = d as unknown as {
    _running: boolean;
    _schedule(until: number): void;
    clock: { _startTime: number };
  };
  dd._running = true;
  dd.clock._startTime = 0;
  dd._schedule(Number.POSITIVE_INFINITY);
}

type DispAny = InstanceType<typeof Dispatcher> & {
  setActors(table: unknown, map: Record<string, string>): void;
  setActorTransport(actor: string, transport: string): void;
  loadEvents(ev: unknown[]): void;
};

describe('dispatcher multi-actor payload routing', () => {
  let d: DispAny;
  let sitarT: MockTransport;
  let tablaT: MockTransport;

  beforeEach(() => {
    d = new Dispatcher(makeCtx()) as DispAny;
    sitarT = new MockTransport();
    tablaT = new MockTransport();
    d.addTransport('sitarOut', sitarT);
    d.addTransport('tablaOut', tablaT);
    d.setActors({ sitar: {}, tabla: {} }, {});
    d.setActorTransport('sitar', 'sitarOut');
    d.setActorTransport('tabla', 'tablaOut');
  });

  it('(a) routes the SAME token to DISTINCT transports by payload.actor', () => {
    d.loadEvents([
      { token: 'Sa', startSec: 0, durSec: 0.5, type: 'note', payload: { actor: 'sitar' } },
      { token: 'Sa', startSec: 0.5, durSec: 0.5, type: 'note', payload: { actor: 'tabla' } }
    ]);
    drain(d);

    expect(sitarT.sent.map((s) => s.token)).toEqual(['Sa']);
    expect(tablaT.sent.map((s) => s.token)).toEqual(['Sa']);
  });

  it('(b) a flux control on actor A does NOT bleed onto actor B', () => {
    d.loadEvents([
      // Set vel=100 on sitar only.
      {
        token: '_vel',
        startSec: 0,
        durSec: 0,
        type: 'control',
        nature: 'transport-control',
        payload: { actor: 'sitar', payload: { pairs: [{ key: 'vel', value: 100 }] } }
      },
      { token: 'Sa', startSec: 0.1, durSec: 0.5, type: 'note', payload: { actor: 'sitar' } },
      { token: 'Sa', startSec: 0.2, durSec: 0.5, type: 'note', payload: { actor: 'tabla' } }
    ]);
    drain(d);

    // sitar note picks up vel 100 (velocity = 100/127); tabla untouched.
    expect(sitarT.sent[0].velocity).toBeCloseTo(100 / 127, 5);
    // tabla never got vel 100 — its flux bucket is empty, so velocity is NaN/undefined-derived,
    // crucially NOT 100/127.
    expect(tablaT.sent[0].velocity).not.toBeCloseTo(100 / 127, 5);
  });

  it('(c) an occurrence override (payload.params.vel) applies to that note', () => {
    d.loadEvents([
      {
        token: 'Sa',
        startSec: 0,
        durSec: 0.5,
        type: 'note',
        payload: { actor: 'sitar', params: { vel: 64 } }
      }
    ]);
    drain(d);
    expect(sitarT.sent[0].velocity).toBeCloseTo(64 / 127, 5);
  });

  it('(d) an engine-control marker is IGNORED (no double-apply on flux)', () => {
    d.loadEvents([
      {
        token: '_transpose',
        startSec: 0,
        durSec: 0,
        type: 'control',
        nature: 'engine-control',
        payload: { actor: 'sitar', payload: { pairs: [{ key: 'vel', value: 7 }] } }
      },
      {
        token: 'Sa',
        startSec: 0.1,
        durSec: 0.5,
        type: 'note',
        payload: { actor: 'sitar', params: { vel: 64 } }
      }
    ]);
    drain(d);
    // The engine-control did NOT write vel:7 into sitar flux; the occurrence
    // override (64) stands.
    expect(sitarT.sent[0].velocity).toBeCloseTo(64 / 127, 5);
  });

  it('emits a transport-control to the actor transport when supported', () => {
    d.loadEvents([
      {
        token: '_vel',
        startSec: 0,
        durSec: 0,
        type: 'control',
        nature: 'transport-control',
        payload: { actor: 'sitar', payload: { pairs: [{ key: 'vel', value: 90 }] } }
      }
    ]);
    drain(d);
    expect(sitarT.controls).toHaveLength(1);
    expect(tablaT.controls).toHaveLength(0);
  });
});
