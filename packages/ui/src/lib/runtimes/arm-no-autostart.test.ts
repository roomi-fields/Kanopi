import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { Kairos } from '@kairos/core';
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
import { core } from '../core';
import { playback } from '../../stores/playback.svelte';
import { workspace } from '../../stores/workspace.svelte';
import { openBlocks } from '../../stores/blocks.svelte';

// Bug fix (Romain 2026-07-14): arming a track in the Actors panel must ONLY set the
// "ready" LED — it must NEVER start the transport itself. Before the fix,
// `handleActorToggle` (real-core.ts:279-307) called `openBlocks.replayArmed()`
// whenever an orchestrated actor was armed while Kronos was stopped, self-starting
// playback (the old "arm = play", beta issue 5). This proves the fix WITHOUT a
// browser (cv-verify-node): drive the REAL bpx adapter + the REAL host arm path
// (`core.actors.toggle`, exactly what the Actors panel button calls), then read
// Kronos's transport state, and observe the mute INTENT at its actual authority —
// `Kairos.demande({type:'mute', ...})`, the write-door `KronosAudioHandle.setActorMuted`
// forwards to (kronos-audio.ts:697-702). Spying there (not on the Kronos handle itself)
// sidesteps a Svelte-5 `$state` proxy-identity trap: `kronosCursor.active` is a reactive
// PROXY of the handle, a DIFFERENT object from the raw `kronosAudio` reference the
// adapter's closures actually call — a spy on the proxy silently never fires.
let demandeSpy: MockInstance<Kairos['demande']>;

const fakeParam = () => ({
  value: 0,
  setValueAtTime() {},
  setValueCurveAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
  cancelScheduledValues() {}
});
class FakeGain {
  gain = fakeParam();
  connect() {
    return this;
  }
  disconnect() {}
}
class FakeOsc {
  frequency = fakeParam();
  detune = fakeParam();
  type = 'sine';
  connect() {
    return this;
  }
  start() {}
  stop() {}
  disconnect() {}
}
class FakeFilter {
  frequency = fakeParam();
  Q = fakeParam();
  type = 'lowpass';
  connect() {
    return this;
  }
  disconnect() {}
}
class FakePanner {
  pan = fakeParam();
  connect() {
    return this;
  }
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
    createBiquadFilter() {
      return new FakeFilter();
    }
    createStereoPanner() {
      return new FakePanner();
    }
  };
  (globalThis as unknown as { requestAnimationFrame: () => number }).requestAnimationFrame = () =>
    0;
  // Observe (not stub) — `vi.spyOn` without `mockImplementation` calls through to the
  // real `demande`, so Kronos's own mute/tempo/loop bookkeeping stays exactly correct;
  // we only READ the calls afterwards.
  demandeSpy = vi.spyOn(Kairos.prototype, 'demande');
});
afterEach(() => {
  kronosCursor.set(null);
  openBlocks.armed = new Set();
  vi.restoreAllMocks();
});

// Two native (audio) orchestrated actors — no Strudel/Hydra code voices needed to
// exercise the arm/mute channel, which is uniform across actor kinds ([673]).
const SRC = `actor lead out.audio
actor bass out.audio

-----
S -> {Lead, Bass}

Lead -> lead.C4 lead.E4 lead.G4 lead.C5
Bass -> bass.C2 bass.G2
`;

/** Last recorded mute intent per actor from the spy's call log
 *  (`demande({type:'mute', acteur, muet, ...})`, most recent call wins). */
function lastMuteByActor(spy: MockInstance<Kairos['demande']>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const call of spy.mock.calls) {
    const r = call[0] as { type?: string; acteur?: string; muet?: boolean };
    if (r?.type === 'mute' && r.acteur !== undefined && r.muet !== undefined) {
      out[r.acteur] = r.muet;
    }
  }
  return out;
}

describe('Actors-panel arm no longer self-starts the transport (Romain 2026-07-14)', () => {
  it('(a) arming an orchestrated actor while Kronos is stopped leaves it stopped', async () => {
    // NOTE: deliberately do NOT call `setActorsSink` here — RealCore's constructor
    // already wired it to `core.actors.setActors` (the REAL Actors-panel store); a
    // test-local override would silently disconnect `core.actors` from the eval and
    // hide the exact wiring the Actors panel depends on.
    // Open the file through the REAL workspace (`workspace.openBundle`, sets the active
    // tab) then PRODUCE it (`openBlocks.produceLoadedProgram`, the exact "open a scene"
    // gesture) — arms its blocks AND builds the persistent Kronos handle in STOPPED
    // state (Model C), exactly the state before any Play click. This wiring matters:
    // the OLD self-start (`openBlocks.replayArmed()`) only does anything when the
    // workspace has an active tab with armed blocks — a bare adapter `.evaluate()` call
    // (bypassing the workspace) would let the bug hide behind an unmet precondition.
    const fileId = workspace.openBundle([{ path: 'arm-a.bps', contents: SRC }], 'arm-a.bps');
    expect(fileId).not.toBeNull();
    await openBlocks.produceLoadedProgram(fileId!);
    expect(
      core.actors
        .list()
        .map((a) => a.name)
        .sort()
    ).toEqual(['bass', 'lead']);
    const handle = kronosCursor.active;
    expect(handle).not.toBeNull();
    expect(handle!.transport.state).toBe('stopped');

    // DISARM then RE-ARM 'lead' via the REAL host path: `core.actors.toggle` is exactly
    // what the Actors panel's toggle button calls (RealActors.toggle → handleActorToggle).
    core.actors.toggle('lead'); // disarm (was active:true after produce)
    expect(core.actors.list().find((x) => x.name === 'lead')?.active).toBe(false);
    expect(handle!.transport.state).toBe('stopped');

    core.actors.toggle('lead'); // ARM — the exact gesture that used to self-start Kronos
    expect(core.actors.list().find((x) => x.name === 'lead')?.active).toBe(true);
    // The old self-start routed through a dynamic `import()` + `.then()` (fire-and-forget,
    // never awaited by `handleActorToggle`) — give any such pending microtask/macrotask a
    // chance to complete before asserting, so this test actually catches it instead of
    // racing past it synchronously.
    await new Promise((r) => setTimeout(r, 20));

    // THE FIX: arming must NOT flip the transport. Both the handle's own state and the
    // reactive projection the UI reads (`kronosCursor.state`) must stay 'stopped'.
    expect(handle!.transport.state).toBe('stopped');
    expect(kronosCursor.state).toBe('stopped');
  });

  it('(b)+(c) Play sounds the armed actor and keeps a pre-Play-disarmed actor silent', async () => {
    // NOTE: no test-local `setActorsSink` override here either — see (a) above.
    const fileId = workspace.openBundle([{ path: 'arm-bc.bps', contents: SRC }], 'arm-bc.bps');
    expect(fileId).not.toBeNull();
    await openBlocks.produceLoadedProgram(fileId!);
    const handle = kronosCursor.active;
    expect(handle).not.toBeNull();
    expect(handle!.transport.state).toBe('stopped');

    // Disarm 'bass' BEFORE Play (transport still stopped) — the exact "un acteur désarmé
    // avant Play" scenario.
    core.actors.toggle('bass');
    expect(core.actors.list().find((x) => x.name === 'bass')?.active).toBe(false);

    // 'lead' stays armed (produce armed it by default) — re-affirm the arm gesture too.
    core.actors.toggle('lead'); // disarm
    core.actors.toggle('lead'); // re-arm
    expect(core.actors.list().find((x) => x.name === 'lead')?.active).toBe(true);

    // Transport must STILL be stopped — no arm/disarm gesture starts it (requirement a,
    // re-checked here in the exact sequence Play follows).
    expect(handle!.transport.state).toBe('stopped');

    // PLAY — the ONLY gesture allowed to start Kronos. A handle already exists (produce
    // built it), so this is the Model C warm resume (`playback.play()` → `t.state ===
    // 'stopped'` branch → `core.replayActiveScene()`), the SAME function the Play button
    // calls; not stubbed, not bypassed.
    playback.play();
    await new Promise((r) => setTimeout(r, 20));

    expect(handle!.transport.state).toBe('running');

    const finalMute = lastMuteByActor(demandeSpy);
    // (b) the armed actor is NOT muted after Play — it sounds.
    expect(finalMute.lead).toBe(false);
    // (c) the actor disarmed before Play stays muted after Play — it stays silent.
    expect(finalMute.bass).toBe(true);
  });
});
