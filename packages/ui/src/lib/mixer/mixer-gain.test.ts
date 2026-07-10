// KAN-UX3 / KAN-UX3-B — mixer-gain: the ONE application path of the volume intent onto
// every LIVE output runtime (audio/midi/osc). Real intent module (the authority), FAKE
// runtime gain surfaces (the contract hote-runtimes-sortie.md:51 API) — proves the values
// TRACE from the persisted intent to setMasterGain/setMasterMuted/setActorGain on EVERY
// live control, and that a missing runtime (stopped/headless/test sink) is a safe no-op.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AudioGainControl } from '../runtimes/kronos-audio';

function makeFakeControl() {
  const setMasterGain = vi.fn((_v: number) => {});
  const setMasterMuted = vi.fn((_m: boolean) => {});
  const setActorGain = vi.fn((_a: string, _v: number) => {});
  const control: AudioGainControl = {
    setMasterGain: (v) => setMasterGain(v),
    setMasterMuted: (m) => setMasterMuted(m),
    setActorGain: (a, v) => setActorGain(a, v)
  };
  return { control, setMasterGain, setMasterMuted, setActorGain };
}

let audio = makeFakeControl();
let midi = makeFakeControl();
let osc = makeFakeControl();
let audioLive: AudioGainControl | null = audio.control;
let midiLive: AudioGainControl | null = midi.control;
let oscLive: AudioGainControl | null = osc.control;

// kronos-audio pulls the whole engine graph (@kronos/core, runtime-audio…) —
// mock the three accessors mixer-gain reads.
vi.mock('../runtimes/kronos-audio', () => ({
  audioGainControl: () => audioLive,
  midiGainControl: () => midiLive,
  oscGainControl: () => oscLive
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

describe('applyMixerGains (KAN-UX3 / KAN-UX3-B)', () => {
  beforeEach(() => {
    resetIntent();
    vi.clearAllMocks();
  });
  afterEach(() => {
    audio = makeFakeControl();
    midi = makeFakeControl();
    osc = makeFakeControl();
    audioLive = audio.control;
    midiLive = midi.control;
    oscLive = osc.control;
  });

  it('projects the persisted intent onto the audio gain API', () => {
    mixerIntent.setMasterVolume(0.5);
    mixerIntent.setMasterMuted(true);
    mixerIntent.setActorVolume('groove', 0.25);
    mixerIntent.setActorVolume('viz', 0.7);
    applyMixerGains();
    expect(audio.setMasterGain).toHaveBeenLastCalledWith(0.5);
    expect(audio.setMasterMuted).toHaveBeenLastCalledWith(true);
    expect(audio.setActorGain).toHaveBeenCalledWith('groove', 0.25);
    expect(audio.setActorGain).toHaveBeenCalledWith('viz', 0.7);
  });

  it('projects the SAME intent onto midi AND osc when they are live (KAN-UX3-B)', () => {
    mixerIntent.setMasterVolume(0.5);
    mixerIntent.setActorVolume('melody', 0.3);
    applyMixerGains();
    expect(midi.setMasterGain).toHaveBeenLastCalledWith(0.5);
    expect(midi.setActorGain).toHaveBeenCalledWith('melody', 0.3);
    expect(osc.setMasterGain).toHaveBeenLastCalledWith(0.5);
    expect(osc.setActorGain).toHaveBeenCalledWith('melody', 0.3);
  });

  it('skips a runtime that is not live without touching the others', () => {
    midiLive = null;
    mixerIntent.setMasterVolume(0.4);
    applyMixerGains();
    expect(audio.setMasterGain).toHaveBeenCalledWith(0.4);
    expect(osc.setMasterGain).toHaveBeenCalledWith(0.4);
    expect(midi.setMasterGain).not.toHaveBeenCalled();
  });

  it('mutating the INTENT changes what a later re-application sends (traceability)', () => {
    mixerIntent.setActorVolume('groove', 0.8);
    applyMixerGains();
    expect(audio.setActorGain).toHaveBeenCalledWith('groove', 0.8);
    vi.clearAllMocks();
    mixerIntent.setActorVolume('groove', 0.1);
    applyMixerGains();
    expect(audio.setActorGain).toHaveBeenCalledWith('groove', 0.1);
    expect(audio.setActorGain).not.toHaveBeenCalledWith('groove', 0.8);
  });

  it('is a no-op when NO runtime is live', () => {
    audioLive = null;
    midiLive = null;
    oscLive = null;
    expect(() => applyMixerGains()).not.toThrow();
    expect(audio.setMasterGain).not.toHaveBeenCalled();
    expect(midi.setMasterGain).not.toHaveBeenCalled();
    expect(osc.setMasterGain).not.toHaveBeenCalled();
  });
});
