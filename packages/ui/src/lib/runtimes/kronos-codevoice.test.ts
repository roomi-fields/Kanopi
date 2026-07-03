// VOIE B (S2 voix-code-transport) — le transport Kronos partagé des voix AUTONOMES.
// VRAI Kronos (createTransport) : on prouve l'état lisible (REV-F02 : éval ⇒ 'running' au
// tempo porté) et le cycle stop/replay (REV-F01 : 'stopped' ⇒ le relais coupe les voix).
// Registry MOCKÉ (adaptateurs espions) — le relais est testé finement dans son propre banc.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerCodeVoice,
  codeVoiceTransport,
  stopCodeVoiceTransportInPlace,
  replayCodeVoiceTransport,
  disposeCodeVoiceTransport,
  retuneCodeVoiceTransport
} from './kronos-codevoice';
import type { LogPush } from './adapter';

const adapters = new Map<string, Record<string, unknown>>();
vi.mock('./registry', () => ({
  getAdapter: (r: string) => adapters.get(r)
}));

const log: LogPush = () => {};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('kronos-codevoice (voie B)', () => {
  beforeEach(() => {
    adapters.clear();
  });
  afterEach(() => {
    disposeCodeVoiceTransport(); // le singleton ne fuit pas entre tests
  });

  it("registerCodeVoice : l'éval met la voix SOUS un transport 'running' au tempo porté (REV-F02)", () => {
    const h = registerCodeVoice({
      runtime: 'strudel',
      slotId: 'main.strudel',
      fileId: 'main.strudel',
      refire: () => {},
      bpm: 132,
      log
    });
    expect(h.transport.state).toBe('running');
    expect(h.transport.tempo).toBe(132);
    expect(codeVoiceTransport()).toBe(h);
  });

  it('re-register (re-éval / 2e voix) : MÊME transport partagé, pas de 2e tête', () => {
    const h1 = registerCodeVoice({
      runtime: 'strudel',
      slotId: 's1',
      fileId: 'a.strudel',
      refire: () => {},
      bpm: 120,
      log
    });
    const h2 = registerCodeVoice({
      runtime: 'hydra',
      slotId: 'h1',
      fileId: 'b.hydra',
      refire: () => {},
      bpm: 120,
      log
    });
    expect(h2).toBe(h1);
  });

  it("stopInPlace : transport 'stopped' + le relais coupe CHAQUE voix (REV-F01)", async () => {
    const stopStrudel = vi.fn().mockResolvedValue(undefined);
    const stopHydra = vi.fn().mockResolvedValue(undefined);
    adapters.set('strudel', { stop: stopStrudel });
    adapters.set('hydra', { stop: stopHydra });
    registerCodeVoice({
      runtime: 'strudel',
      slotId: 's',
      fileId: 'a.strudel',
      refire: () => {},
      bpm: 120,
      log
    });
    registerCodeVoice({
      runtime: 'hydra',
      slotId: 'h',
      fileId: 'b.hydra',
      refire: () => {},
      bpm: 120,
      log
    });
    stopCodeVoiceTransportInPlace();
    await flush();
    expect(codeVoiceTransport()?.transport.state).toBe('stopped');
    expect(stopStrudel).toHaveBeenCalledWith({ actorId: 's', fileId: 'a.strudel' }, log);
    expect(stopHydra).toHaveBeenCalledWith({ actorId: 'h', fileId: 'b.hydra' }, log);
  });

  it('replay après stop : les voix repartent dans leurs slots (re-tir)', async () => {
    const refire = vi.fn();
    adapters.set('strudel', { stop: vi.fn().mockResolvedValue(undefined) });
    registerCodeVoice({
      runtime: 'strudel',
      slotId: 's',
      fileId: 'a.strudel',
      refire,
      bpm: 120,
      log
    });
    stopCodeVoiceTransportInPlace();
    await flush();
    replayCodeVoiceTransport();
    await flush();
    expect(codeVoiceTransport()?.transport.state).toBe('running');
    expect(refire).toHaveBeenCalledTimes(1);
  });

  it("l'éval pendant 'stopped' RELANCE la lecture (évaluer = jouer)", async () => {
    adapters.set('strudel', { stop: vi.fn().mockResolvedValue(undefined) });
    registerCodeVoice({
      runtime: 'strudel',
      slotId: 's',
      fileId: 'a.strudel',
      refire: () => {},
      bpm: 120,
      log
    });
    stopCodeVoiceTransportInPlace();
    await flush();
    registerCodeVoice({
      runtime: 'strudel',
      slotId: 's',
      fileId: 'a.strudel',
      refire: () => {},
      bpm: 120,
      log
    });
    expect(codeVoiceTransport()?.transport.state).toBe('running');
  });

  it('retune : le tempo porté suit le BPM de session (affichage cohérent)', () => {
    registerCodeVoice({
      runtime: 'strudel',
      slotId: 's',
      fileId: 'a.strudel',
      refire: () => {},
      bpm: 120,
      log
    });
    retuneCodeVoiceTransport(90);
    expect(codeVoiceTransport()?.transport.tempo).toBe(90);
  });

  it('dispose (hush) : la tête est démontée, plus de transport vivant', () => {
    registerCodeVoice({
      runtime: 'strudel',
      slotId: 's',
      fileId: 'a.strudel',
      refire: () => {},
      bpm: 120,
      log
    });
    disposeCodeVoiceTransport();
    expect(codeVoiceTransport()).toBeNull();
  });
});
