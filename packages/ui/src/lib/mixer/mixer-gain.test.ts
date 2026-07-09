// KAN-UX3 — mixer-gain: the ONE application path of the volume intent onto the
// live AudioRuntime. Real intent module (the authority), FAKE runtime gain
// surface (the contract [651] API) — proves the values TRACE from the persisted
// intent to setMasterGain/setMasterMuted/setActorGain, and that a missing
// runtime (stopped/headless/test sink) is a safe no-op.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AudioGainControl } from '../runtimes/kronos-audio';

const setMasterGain = vi.fn((_v: number) => {});
const setMasterMuted = vi.fn((_m: boolean) => {});
const setActorGain = vi.fn((_a: string, _v: number) => {});
let fakeControl: AudioGainControl | null = {
  setMasterGain: (v) => setMasterGain(v),
  setMasterMuted: (m) => setMasterMuted(m),
  setActorGain: (a, v) => setActorGain(a, v)
};

// kronos-audio pulls the whole engine graph (@kronos/core, runtime-audio…) —
// mock the single accessor mixer-gain reads.
vi.mock('../runtimes/kronos-audio', () => ({
  audioGainControl: () => fakeControl
}));

const { applyMixerGains } = await import('./mixer-gain');
const { mixerIntent } = await import('./mixer-intent');

function resetIntent() {
  mixerIntent.setMasterMuted(false);
  mixerIntent.setMasterVolume(1);
  for (const name of ['groove', 'viz']) {
    mixerIntent.setActorMuted(name, false);
    mixerIntent.setActorVolume(name, 1);
  }
}

describe('applyMixerGains (KAN-UX3)', () => {
  beforeEach(() => {
    resetIntent();
    vi.clearAllMocks();
  });
  afterEach(() => {
    fakeControl = {
      setMasterGain: (v) => setMasterGain(v),
      setMasterMuted: (m) => setMasterMuted(m),
      setActorGain: (a, v) => setActorGain(a, v)
    };
  });

  it('projects the persisted intent onto the runtime gain API', () => {
    mixerIntent.setMasterVolume(0.5);
    mixerIntent.setMasterMuted(true);
    mixerIntent.setActorVolume('groove', 0.25);
    mixerIntent.setActorVolume('viz', 0.7);
    applyMixerGains();
    expect(setMasterGain).toHaveBeenLastCalledWith(0.5);
    expect(setMasterMuted).toHaveBeenLastCalledWith(true);
    expect(setActorGain).toHaveBeenCalledWith('groove', 0.25);
    expect(setActorGain).toHaveBeenCalledWith('viz', 0.7);
  });

  it('mutating the INTENT changes what a later re-application sends (traceability)', () => {
    mixerIntent.setActorVolume('groove', 0.8);
    applyMixerGains();
    expect(setActorGain).toHaveBeenCalledWith('groove', 0.8);
    vi.clearAllMocks();
    mixerIntent.setActorVolume('groove', 0.1);
    applyMixerGains();
    expect(setActorGain).toHaveBeenCalledWith('groove', 0.1);
    expect(setActorGain).not.toHaveBeenCalledWith('groove', 0.8);
  });

  it('is a no-op when no AudioRuntime is live', () => {
    fakeControl = null;
    expect(() => applyMixerGains()).not.toThrow();
    expect(setMasterGain).not.toHaveBeenCalled();
    expect(setMasterMuted).not.toHaveBeenCalled();
  });
});
