// KAN-UX3 — mixer store: the intent is APPLIED through the existing live
// primitives (arm/disarm orchestrated voice), and the arming layer keeps
// priority on re-arm. The heavy adapter graph is mocked out.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const armOrchestratedActor = vi.fn((_n: string) => {});
const disarmOrchestratedActor = vi.fn((_n: string) => {});
const isOrchestratedActor = vi.fn((_n: string) => true);

vi.mock('../lib/runtimes/bpx-adapter', () => ({
  armOrchestratedActor: (n: string) => armOrchestratedActor(n),
  disarmOrchestratedActor: (n: string) => disarmOrchestratedActor(n),
  isOrchestratedActor: (n: string) => isOrchestratedActor(n)
}));

const actorList: Array<{ name: string; active: boolean; muted?: boolean; runtime: string }> = [];
vi.mock('./actors.svelte', () => ({
  actors: {
    get list() {
      return actorList;
    }
  }
}));

// The store and its intent singleton are module state: import once, reset between tests.
const { mixer } = await import('./mixer.svelte');

function resetMix() {
  // Clear any mute left by a previous test (the intent singleton persists).
  mixer.setMasterMuted(false);
  for (const name of ['groove', 'viz']) mixer.setActorMuted(name, false);
  vi.clearAllMocks();
}

describe('mixer store application (KAN-UX3)', () => {
  beforeEach(() => {
    actorList.length = 0;
    actorList.push(
      { name: 'groove', active: true, muted: false, runtime: 'bpscript' },
      { name: 'viz', active: true, muted: false, runtime: 'hydra' }
    );
    isOrchestratedActor.mockReturnValue(true);
    resetMix();
  });

  it('muting a strip disarms the live voice; un-muting re-arms it', () => {
    mixer.setActorMuted('groove', true);
    expect(disarmOrchestratedActor).toHaveBeenCalledWith('groove');
    mixer.setActorMuted('groove', false);
    expect(armOrchestratedActor).toHaveBeenCalledWith('groove');
  });

  it('un-muting the mixer never re-arms an actor the ARMING layer holds silent', () => {
    actorList[0].muted = true; // arming layer says muted
    mixer.setActorMuted('groove', true);
    mixer.setActorMuted('groove', false);
    expect(armOrchestratedActor).not.toHaveBeenCalled();
  });

  it('master mute fans out over every live actor; unmute respects each strip', () => {
    mixer.setActorMuted('viz', true);
    vi.clearAllMocks();
    mixer.setMasterMuted(true);
    expect(disarmOrchestratedActor).toHaveBeenCalledWith('groove');
    expect(disarmOrchestratedActor).toHaveBeenCalledWith('viz');
    vi.clearAllMocks();
    mixer.setMasterMuted(false);
    expect(armOrchestratedActor).toHaveBeenCalledWith('groove');
    expect(armOrchestratedActor).not.toHaveBeenCalledWith('viz'); // its strip stays muted
    expect(disarmOrchestratedActor).toHaveBeenCalledWith('viz');
  });

  it('non-orchestrated names are a no-op (no live voice to gate)', () => {
    isOrchestratedActor.mockReturnValue(false);
    mixer.setActorMuted('groove', true);
    expect(disarmOrchestratedActor).not.toHaveBeenCalled();
  });

  it('reflects the intent reactively (muted state readable by the UI)', () => {
    mixer.setActorMuted('groove', true);
    expect(mixer.isActorMuted('groove')).toBe(true);
    mixer.toggleActorMuted('groove');
    expect(mixer.isActorMuted('groove')).toBe(false);
    mixer.toggleMasterMuted();
    expect(mixer.master.muted).toBe(true);
  });
});
