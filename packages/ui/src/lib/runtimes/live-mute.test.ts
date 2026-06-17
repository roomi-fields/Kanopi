import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bpscriptAdapter,
  setActorsSink,
  armOrchestratedActor,
  disarmOrchestratedActor
} from './bp3';
import * as registry from './registry';
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';

class FakeGain {
  gain = { value: 1, setValueAtTime() {} };
  connect() {
    return this;
  }
  disconnect() {}
}
class FakeOsc {
  frequency = { value: 0, setValueAtTime() {} };
  type = 'sine';
  connect() {
    return this;
  }
  start() {}
  stop() {}
  disconnect() {}
}
beforeEach(() => {
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
    currentTime = 0;
    state = 'running';
    destination = {};
    resume() {
      return Promise.resolve();
    }
    createGain() {
      return new FakeGain();
    }
    createOscillator() {
      return new FakeOsc();
    }
  };
  (globalThis as unknown as { requestAnimationFrame: () => number }).requestAnimationFrame = () =>
    0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

const ORCH = `@actor groove transport.audio eval.strudel
@actor viz transport.video eval.hydra
S -> { groove, viz }
groove -> \`stack(note("c2*4"))\`
viz -> \`osc(60).out()\`
`;

type Sink = (t: string, ts: { startSec: number; durSec: number; absTime: number }) => void;
type IsBT = (t: string) => boolean;

describe('backtick sink consults the LIVE disarm state', () => {
  it('a re-fire of a disarmed code voice does NOT re-evaluate it; re-arm re-enables it', async () => {
    setActorsSink(() => {});

    // Capture the backtick sink the adapter registers on its dispatcher, so we can
    // re-fire a BT token exactly as a loop cycle would — and observe the LIVE mute
    // guard (the regression: the guard read a stale snapshot, so a disarmed voice
    // kept re-firing each cycle).
    let captured: { isBT: IsBT; sink: Sink } | undefined;
    const orig = (Dispatcher.prototype as unknown as { setBacktickSink: unknown })
      .setBacktickSink as (this: unknown, isBT: IsBT, sink: Sink) => void;
    vi.spyOn(
      Dispatcher.prototype as unknown as { setBacktickSink: (i: IsBT, s: Sink) => void },
      'setBacktickSink'
    ).mockImplementation(function (this: unknown, isBT: IsBT, sink: Sink) {
      captured = { isBT, sink };
      return orig.call(this, isBT, sink);
    });

    const strudel = registry.getAdapter('strudel')!;
    const evalSlots: string[] = [];
    vi.spyOn(strudel, 'evaluate').mockImplementation(
      async (_code: string, s: { actorId?: string }) => {
        if (s.actorId) evalSlots.push(s.actorId);
      }
    );

    await bpscriptAdapter.evaluate(ORCH, { actorId: 'm.bps', fileId: 'm.bps' }, () => {});
    expect(captured).toBeDefined();

    // Find groove's BT token (the only strudel code voice).
    await new Promise((r) => setTimeout(r, 20));
    const grooveSlot = evalSlots.find((s) => s.endsWith('::groove'));
    expect(grooveSlot).toBe('m.bps::groove');

    // The BT token groove fired on — re-derive it from the sink's predicate. We
    // know the BT tokens are the ones isBT() accepts; fire the one that lands in
    // the groove slot by re-firing every BT and reading the slot.
    const fireAll = () => {
      evalSlots.length = 0;
      // BT tokens for this grammar: BTauto0 (groove) / BTauto1 (viz) per the
      // annotator. Re-fire both; the sink routes each to its actor's slot.
      for (const tok of ['BTauto0', 'BTauto1']) {
        if (captured!.isBT(tok)) captured!.sink(tok, { startSec: 0, durSec: 1, absTime: 0 });
      }
    };

    // DISARM groove, then re-fire: groove must NOT re-eval (live guard), viz may.
    disarmOrchestratedActor('groove');
    await new Promise((r) => setTimeout(r, 20));
    fireAll();
    await new Promise((r) => setTimeout(r, 20));
    expect(evalSlots).not.toContain('m.bps::groove');

    // RE-ARM groove, then re-fire: groove re-evals again (live guard cleared).
    armOrchestratedActor('groove');
    await new Promise((r) => setTimeout(r, 20));
    fireAll();
    await new Promise((r) => setTimeout(r, 20));
    expect(evalSlots).toContain('m.bps::groove');

    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'm.bps' }, () => {});
  });
});
