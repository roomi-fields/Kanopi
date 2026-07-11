// KAN-UX3 — mixer store: the MUTE intent is APPLIED through the unified Kronos
// mute channel (`setOrchestratedActorMuted`, notes AND code voices alike, [673]);
// VOLUMES + the MASTER mute also route through runtime-audio's gain API
// (`applyMixerGains`, contract [651]). The heavy adapter graph is mocked.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setOrchestratedActorMuted = vi.fn((_n: string, _muted: boolean) => {});
const isOrchestratedActor = vi.fn((_n: string) => true);
const applyMixerGains = vi.fn(() => {});

vi.mock('../lib/runtimes/bpx-adapter', () => ({
  setOrchestratedActorMuted: (n: string, muted: boolean) => setOrchestratedActorMuted(n, muted),
  isOrchestratedActor: (n: string) => isOrchestratedActor(n)
}));
vi.mock('../lib/mixer/mixer-gain', () => ({
  applyMixerGains: () => applyMixerGains()
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
  // Clear any mute/volume left by a previous test (the intent singleton persists).
  mixer.setMasterMuted(false);
  mixer.setMasterVolume(1);
  for (const name of ['groove', 'viz']) {
    mixer.setActorMuted(name, false);
    mixer.setActorVolume(name, 1);
  }
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

  it('muting a strip mutes the live voice through Kronos; un-muting clears it', () => {
    mixer.setActorMuted('groove', true);
    expect(setOrchestratedActorMuted).toHaveBeenCalledWith('groove', true);
    mixer.setActorMuted('groove', false);
    expect(setOrchestratedActorMuted).toHaveBeenCalledWith('groove', false);
  });

  it('un-muting the mixer never re-arms an actor the ARMING layer holds silent', () => {
    actorList[0].muted = true; // arming layer says muted
    mixer.setActorMuted('groove', true);
    mixer.setActorMuted('groove', false);
    expect(setOrchestratedActorMuted).not.toHaveBeenCalledWith('groove', false);
  });

  it('master mute rides the runtime gain API (setMasterMuted, mono scenes covered)', () => {
    mixer.setMasterMuted(true);
    // The primitive is runtime-audio's setMasterMuted (applied via applyMixerGains,
    // which projects the whole snapshot — master.muted included).
    expect(applyMixerGains).toHaveBeenCalled();
    vi.clearAllMocks();
    mixer.setMasterMuted(false);
    expect(applyMixerGains).toHaveBeenCalled();
  });

  it('master mute ALSO fans out over live actors (code/MIDI/OSC voices bypass the audio master bus)', () => {
    mixer.setActorMuted('viz', true);
    vi.clearAllMocks();
    mixer.setMasterMuted(true);
    expect(setOrchestratedActorMuted).toHaveBeenCalledWith('groove', true);
    expect(setOrchestratedActorMuted).toHaveBeenCalledWith('viz', true);
    vi.clearAllMocks();
    mixer.setMasterMuted(false);
    expect(setOrchestratedActorMuted).toHaveBeenCalledWith('groove', false);
    expect(setOrchestratedActorMuted).not.toHaveBeenCalledWith('viz', false); // its strip stays muted
    expect(setOrchestratedActorMuted).toHaveBeenCalledWith('viz', true);
  });

  it('volume changes update the intent and route through the gain API — never arm/disarm', () => {
    mixer.setMasterVolume(0.5);
    expect(mixer.master.volume).toBe(0.5);
    expect(applyMixerGains).toHaveBeenCalledTimes(1);
    mixer.setActorVolume('groove', 0.25);
    expect(mixer.actorEntry('groove').volume).toBe(0.25);
    expect(applyMixerGains).toHaveBeenCalledTimes(2);
    // Volume is INDEPENDENT of mute (gain 0 = armed but inaudible ≠ disarmed).
    expect(setOrchestratedActorMuted).not.toHaveBeenCalled();
    expect(mixer.isActorMuted('groove')).toBe(false);
  });

  it('non-orchestrated names are a no-op (no live voice to gate)', () => {
    isOrchestratedActor.mockReturnValue(false);
    mixer.setActorMuted('groove', true);
    expect(setOrchestratedActorMuted).not.toHaveBeenCalled();
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
