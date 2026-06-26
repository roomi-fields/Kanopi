import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  bpscriptAdapter,
  setActorsSink,
  armOrchestratedActor,
  disarmOrchestratedActor
} from './bpx-adapter';
import * as registry from './registry';
import * as kronosAudio from './kronos-audio';
import type { KronosAudioOptions } from './kronos-audio';

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

type Sink = (
  t: string,
  ts: { startSec: number; durSec: number; absTime: number },
  interp?: string
) => void;

describe('backtick sink consults the LIVE disarm state', () => {
  it('a re-fire of a disarmed code voice does NOT re-evaluate it; re-arm re-enables it', async () => {
    setActorsSink(() => {});

    // Capture the backtick sink the adapter hands to Kronos (the single emitter that fires
    // a code voice when an `output.runtime==='code'` event lands), so we can re-fire a BT
    // token exactly as a loop cycle would — and observe the LIVE mute guard (the regression:
    // the guard read a stale snapshot, so a disarmed voice kept re-firing each cycle). The
    // sink reaches Kronos via `startKronosAudio({ backtickSink })`; capturing its option is
    // the live firing path (the dispatcher is never started here).
    let captured: { sink: Sink } | undefined;
    const orig = kronosAudio.startKronosAudio;
    vi.spyOn(kronosAudio, 'startKronosAudio').mockImplementation((opts: KronosAudioOptions) => {
      captured = { sink: opts.backtickSink as Sink };
      return orig(opts);
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

    // Re-fire the BT tokens through the sink, exactly as the 'code' adapter does on a loop
    // cycle: token + its interpreter (KAI-9 carries it on `output.device`). The sink ignores
    // a non-BT token, so firing both is safe — each known token routes to its actor's slot,
    // honouring the LIVE mute guard.
    const fireAll = () => {
      evalSlots.length = 0;
      // BT tokens + their interpreter: BTauto0 → groove (strudel), BTauto1 → viz (hydra).
      for (const [tok, interp] of [
        ['BTauto0', 'strudel'],
        ['BTauto1', 'hydra']
      ] as const) {
        captured!.sink(tok, { startSec: 0, durSec: 1, absTime: 0 }, interp);
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
