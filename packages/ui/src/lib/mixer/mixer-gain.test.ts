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
let codevoices = makeFakeControl();
let audioLive: AudioGainControl | null = audio.control;
let midiLive: AudioGainControl | null = midi.control;
let oscLive: AudioGainControl | null = osc.control;
let codevoicesLive: AudioGainControl | null = codevoices.control;

// kronos-audio pulls the whole engine graph (@kronos/core, runtime-audio…) —
// mock the four accessors mixer-gain reads.
vi.mock('../runtimes/kronos-audio', () => ({
  audioGainControl: () => audioLive,
  midiGainControl: () => midiLive,
  oscGainControl: () => oscLive,
  codeVoicesGainControl: () => codevoicesLive
}));

const { applyMixerGains, codeVoiceReachesGainBus, mixerSliderActiveTitle } =
  await import('./mixer-gain');
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
    codevoices = makeFakeControl();
    audioLive = audio.control;
    midiLive = midi.control;
    oscLive = osc.control;
    codevoicesLive = codevoices.control;
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

  it('projects the SAME intent onto midi, osc AND codevoices when they are live (KAN-UX3-B)', () => {
    mixerIntent.setMasterVolume(0.5);
    mixerIntent.setActorVolume('melody', 0.3);
    applyMixerGains();
    expect(midi.setMasterGain).toHaveBeenLastCalledWith(0.5);
    expect(midi.setActorGain).toHaveBeenCalledWith('melody', 0.3);
    expect(osc.setMasterGain).toHaveBeenLastCalledWith(0.5);
    expect(osc.setActorGain).toHaveBeenCalledWith('melody', 0.3);
    expect(codevoices.setMasterGain).toHaveBeenLastCalledWith(0.5);
    expect(codevoices.setActorGain).toHaveBeenCalledWith('melody', 0.3);
  });

  it('skips a runtime that is not live without touching the others', () => {
    midiLive = null;
    codevoicesLive = null;
    mixerIntent.setMasterVolume(0.4);
    applyMixerGains();
    expect(audio.setMasterGain).toHaveBeenCalledWith(0.4);
    expect(osc.setMasterGain).toHaveBeenCalledWith(0.4);
    expect(midi.setMasterGain).not.toHaveBeenCalled();
    expect(codevoices.setMasterGain).not.toHaveBeenCalled();
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

  // PREUVE que le canal CONSOLE suffit, sans essaimage par acteur (arbitrage architecte
  // 2026-07-24, [896]) : `setMasterMuted` est envoyé PAR SORTIE VIVANTE, hors de la boucle
  // sur les acteurs (mixer-gain.ts:45 vs :46-48). Une scène MONO — qui ne publie AUCUN
  // acteur, donc que l'ancien essaimage ne pouvait pas couper — est donc coupée par
  // construction, sur les quatre sorties.
  it('coupe le maître sur CHAQUE sortie vivante sans dépendre d’un seul acteur (scène mono)', () => {
    mixerIntent.setMasterMuted(true);
    applyMixerGains();
    expect(audio.setMasterMuted).toHaveBeenLastCalledWith(true);
    expect(midi.setMasterMuted).toHaveBeenLastCalledWith(true);
    expect(osc.setMasterMuted).toHaveBeenLastCalledWith(true);
    expect(codevoices.setMasterMuted).toHaveBeenLastCalledWith(true);
    // Et le rétablissement passe par le même canal.
    vi.clearAllMocks();
    mixerIntent.setMasterMuted(false);
    applyMixerGains();
    expect(audio.setMasterMuted).toHaveBeenLastCalledWith(false);
    expect(midi.setMasterMuted).toHaveBeenLastCalledWith(false);
    expect(osc.setMasterMuted).toHaveBeenLastCalledWith(false);
    expect(codevoices.setMasterMuted).toHaveBeenLastCalledWith(false);
  });

  it('is a no-op when NO runtime is live', () => {
    audioLive = null;
    midiLive = null;
    oscLive = null;
    codevoicesLive = null;
    expect(() => applyMixerGains()).not.toThrow();
    expect(audio.setMasterGain).not.toHaveBeenCalled();
    expect(midi.setMasterGain).not.toHaveBeenCalled();
    expect(osc.setMasterGain).not.toHaveBeenCalled();
    expect(codevoices.setMasterGain).not.toHaveBeenCalled();
  });
});

describe('codeVoiceReachesGainBus (KAN-UX3-B)', () => {
  it('is true for strudel and csound — the only adapters implementing the gain API', () => {
    expect(codeVoiceReachesGainBus('strudel')).toBe(true);
    expect(codeVoiceReachesGainBus('csound')).toBe(true);
  });

  it('is false for hydra, p5, mercury and js — no gain API on their adapter', () => {
    expect(codeVoiceReachesGainBus('hydra')).toBe(false);
    expect(codeVoiceReachesGainBus('p5')).toBe(false);
    expect(codeVoiceReachesGainBus('mercury')).toBe(false);
    expect(codeVoiceReachesGainBus('js')).toBe(false);
  });
});

describe('mixerSliderActiveTitle (KAN-UX3-B)', () => {
  it('warns csound the effect depends on the author reading the control channel', () => {
    const title = mixerSliderActiveTitle('drums', 'csound');
    expect(title).toContain('drums');
    expect(title).toMatch(/chnget|gain_drums/);
  });

  it('uses the generic label for every other runtime', () => {
    expect(mixerSliderActiveTitle('groove', 'strudel')).toBe('volume groove');
    expect(mixerSliderActiveTitle('groove', 'audio')).toBe('volume groove');
  });
});
