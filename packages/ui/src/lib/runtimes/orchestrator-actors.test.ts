import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import {
  bpscriptAdapter,
  setActorsSink,
  isOrchestratedActor,
  armOrchestratedActor,
  disarmOrchestratedActor,
  btTokenByActor,
  type PublishedActor
} from './bpx-adapter';
import * as registry from './registry';

// Minimal WebAudio + node stubs so the orchestrator eval can build its dispatcher.
class FakeGain {
  gain = {
    value: 1,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    cancelScheduledValues() {}
  };
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

const SRC = `@actor groove  transport.audio  eval.strudel
@actor viz     transport.video  eval.hydra
S -> { groove, viz }
groove -> \`stack(note("c2*4"))\`
viz -> \`osc(60).out()\`
`;

// Verbatim copy of the bundled orchestrator the UI ships
// (packages/library/bundled/02-strudel-hydra.bps) — the very file the live
// arm/disarm must work on. Kept inline (multi-line backticks + comments) so the
// mapping is exercised against the REAL rule shape, not a simplified fixture.
const BUNDLED = `// 02 — Strudel + Hydra synchronisés sur le transport Kanopi.
@actor groove  transport.audio  eval.strudel
@actor viz     transport.video  eval.hydra

S -> { groove, viz }

groove -> \`stack(
  note("c2*4").s("sawtooth").gain(0.5),
  note("c5*8").s("square").gain(0.2)
)\`

viz -> \`osc(60, 0.1, () => 0.5 + 0.5 * Math.sin(beat * Math.PI))
  .rotate(() => bar * 0.05)
  .out()\`
`;

describe('btTokenByActor (actor → backtick token)', () => {
  it('maps every code-voice actor of the bundled orchestrator to its BT token', () => {
    const ast = (compileToBPxAST(BUNDLED) as { ast: unknown }).ast;
    const map = btTokenByActor(ast);
    // Both actors map to a (distinct) backtick token; the slot routing + the
    // sink's mute guard depend on this being non-empty (the regression: an empty
    // map collapsed groove + viz into the whole-file slot).
    expect(Object.keys(map).sort()).toEqual(['groove', 'viz']);
    expect(map.groove).toMatch(/^BT/);
    expect(map.viz).toMatch(/^BT/);
    expect(map.groove).not.toBe(map.viz);
  });
});

describe('orchestrator actor publication', () => {
  it('publishes groove + viz to the Actors sink', async () => {
    let published: PublishedActor[] = [];
    setActorsSink((a) => {
      published = a;
    });
    await bpscriptAdapter.evaluate(SRC, { actorId: 'x.bps', fileId: 'x.bps' }, () => {});
    expect(published.map((p) => p.name).sort()).toEqual(['groove', 'viz']);
    expect(isOrchestratedActor('groove')).toBe(true);
    expect(isOrchestratedActor('viz')).toBe(true);
    // runtime mapped from eval tag
    const byName = Object.fromEntries(published.map((p) => [p.name, p.runtime]));
    expect(byName.groove).toBe('strudel');
    expect(byName.viz).toBe('hydra');
    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'x.bps' }, () => {});
  });
});

// Verbatim copy of the bundled demo (packages/library/bundled/demos/midi-actors.bps):
// one actor on MIDI, one on WebAudio. In vitest/jsdom there is no
// `navigator.requestMIDIAccess`, so `createMidiRuntime(...).init()` resolves to
// `ready:false, reason:'no-webmidi'` for real — the actual "MIDI unavailable"
// condition, no mocking of runtime-midi needed.
const MIDI_PLUS_WEBAUDIO = `@core
@controls

@actor melody  alphabet:western  transport:midi(ch:1)
@actor bass    alphabet:western  transport:webaudio

S -> {Mel, Low}

Mel -> melody.C4 melody.E4 melody.G4 melody.C5 melody.B4 melody.G4 melody.E4 melody.C4
Low -> bass.C2(wave:sawtooth)(vel:80) - bass.G2 - bass.C2 - bass.E2 -
`;

describe('orchestrator MIDI gate scope (one actor MIDI-unavailable must not silence the whole scene)', () => {
  it('publishes + plays the webaudio actor even when the MIDI actor has no device', async () => {
    let published: PublishedActor[] = [];
    setActorsSink((a) => {
      published = a;
    });
    const logs: Array<{ runtime: string; level: string; msg: string }> = [];

    // Must NOT throw/reject: melody's MIDI gate failing is a per-actor cry, not a
    // scene-wide derive error (the bug: it used to abort evaluate() before
    // startKronosAudio + actor publication ran at all).
    await expect(
      bpscriptAdapter.evaluate(
        MIDI_PLUS_WEBAUDIO,
        { actorId: 'midi-actors.bps', fileId: 'midi-actors.bps' },
        (e) => logs.push(e)
      )
    ).resolves.not.toThrow();

    // Both actors published — bass (webaudio) is NOT collateral damage of melody's
    // (midi) missing hardware.
    expect(published.map((p) => p.name).sort()).toEqual(['bass', 'melody']);

    // outputTransport reflects the DECLARED transport per actor (BPx's
    // `tree.metadata.actors[name].runtime`, decision [624]) — the field the mixer
    // gates its slider on: melody (transport:midi) must read 'midi', bass
    // (transport:webaudio) must read the webaudio family so its slider stays live.
    const transportByName = Object.fromEntries(published.map((p) => [p.name, p.outputTransport]));
    expect(transportByName.melody).toBe('midi');
    expect(transportByName.bass).toBe('webaudio');

    // The cry still happens, scoped to the MIDI actor, with the established
    // no-webmidi actionable text (contract kanopi-runtime-midi.md §3, [619]).
    const midiCry = logs.find(
      (l) => l.level === 'error' && l.msg.includes('melody') && l.msg.includes('Web MIDI')
    );
    expect(midiCry).toBeDefined();

    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'midi-actors.bps' }, () => {});
  });
});

describe('orchestrator arm/disarm', () => {
  it('each code voice fires into its OWN per-actor slot (file::actor)', async () => {
    setActorsSink(() => {});
    const strudel = registry.getAdapter('strudel')!;
    const evalSlots: string[] = [];
    const evalSpy = vi
      .spyOn(strudel, 'evaluate')
      .mockImplementation(async (_code: string, s: { actorId?: string }) => {
        if (s.actorId) evalSlots.push(s.actorId);
      });

    await bpscriptAdapter.evaluate(BUNDLED, { actorId: 'z.bps', fileId: 'z.bps' }, () => {});
    await new Promise((r) => setTimeout(r, 30));

    // The strudel (groove) voice must land in the per-actor slot, NOT the whole
    // file — otherwise disarm can't isolate it (the fixed regression).
    expect(evalSlots).toContain('z.bps::groove');
    expect(evalSlots).not.toContain('z.bps');

    evalSpy.mockRestore();
    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'z.bps' }, () => {});
  });

  it('disarm stops the code voice; arm re-evaluates it', async () => {
    setActorsSink(() => {});
    await bpscriptAdapter.evaluate(SRC, { actorId: 'y.bps', fileId: 'y.bps' }, () => {});

    const strudel = registry.getAdapter('strudel')!;
    const stopSpy = vi.spyOn(strudel, 'stop').mockResolvedValue(undefined);
    const evalSpy = vi.spyOn(strudel, 'evaluate').mockResolvedValue(undefined);

    disarmOrchestratedActor('groove');
    await new Promise((r) => setTimeout(r, 10));
    expect(stopSpy).toHaveBeenCalled();
    // stop slot is the per-actor slot (file::actor), not the whole file
    expect(stopSpy.mock.calls[0][0]).toMatchObject({ actorId: 'y.bps::groove' });

    armOrchestratedActor('groove');
    await new Promise((r) => setTimeout(r, 10));
    expect(evalSpy).toHaveBeenCalled();
    expect(evalSpy.mock.calls[0][1]).toMatchObject({ actorId: 'y.bps::groove' });

    stopSpy.mockRestore();
    evalSpy.mockRestore();
    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'y.bps' }, () => {});
  });
});
