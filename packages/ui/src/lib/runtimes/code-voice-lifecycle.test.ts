// Relais lifecycle voix de code (S2 voix-code-transport) — les transitions d'état du
// transport atteignent les moteurs : gel réel / reprise resynchronisée / re-tir / tais-toi.
// Transport FACTICE (on pilote les transitions à la main — la quantification de la pause est
// le domaine de Kronos, testée chez lui) + registry MOCKÉ (adaptateurs espions).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { attachCodeVoiceLifecycle, type CodeVoiceSlot } from './code-voice-lifecycle';
import type { LogPush } from './adapter';

// Adaptateurs espions injectés dans le registry mocké, re-remplis par test.
const adapters = new Map<string, Record<string, unknown>>();
vi.mock('./registry', () => ({
  getAdapter: (r: string) => adapters.get(r)
}));

type State = 'stopped' | 'running' | 'paused';

function fakeTransport(initial: State = 'running') {
  const subs = new Set<(s: State) => void>();
  let state = initial;
  return {
    get state() {
      return state;
    },
    onStateChange(cb: (s: State) => void) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    position: () => 12.34,
    /** Pilote une transition (le vrai Transport émet l'état d'arrivée). */
    goto(s: State) {
      state = s;
      for (const cb of subs) cb(s);
    }
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0)); // laisse passer les imports dynamiques

describe('attachCodeVoiceLifecycle', () => {
  const logs: { level: string; msg: string }[] = [];
  const log: LogPush = (e) => logs.push({ level: e.level, msg: e.msg });
  let slots: CodeVoiceSlot[];

  beforeEach(() => {
    adapters.clear();
    logs.length = 0;
    slots = [];
  });

  it('running→paused : gel réel GLOBAL, un appel par MOTEUR (pas par slot)', async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    adapters.set('strudel', { pause, stop: vi.fn().mockResolvedValue(undefined) });
    slots.push(
      { runtime: 'strudel', actorId: 'a1', fileId: 'f' },
      { runtime: 'strudel', actorId: 'a2', fileId: 'f' }
    );
    const t = fakeTransport('running');
    attachCodeVoiceLifecycle(t, () => slots, log);
    t.goto('paused');
    await flush();
    expect(pause).toHaveBeenCalledTimes(1); // portée globale [524]
  });

  it('running→paused sans pause() : dégradation BRUYANTE — stop par slot + warn', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    adapters.set('hydra', { stop });
    slots.push({ runtime: 'hydra', actorId: 'h1', fileId: 'f' });
    const t = fakeTransport('running');
    attachCodeVoiceLifecycle(t, () => slots, log);
    t.goto('paused');
    await flush();
    expect(stop).toHaveBeenCalledWith({ actorId: 'h1', fileId: 'f' }, log);
    expect(logs.some((l) => l.level === 'warn' && /gel non supporté/.test(l.msg))).toBe(true);
  });

  it('paused→running : reprise resynchronisée à la POSITION TRANSPORT', async () => {
    const resume = vi.fn().mockResolvedValue(undefined);
    adapters.set('strudel', { resume, stop: vi.fn() });
    slots.push({ runtime: 'strudel', actorId: 'a', fileId: 'f' });
    const t = fakeTransport('paused');
    attachCodeVoiceLifecycle(t, () => slots, log);
    t.goto('running');
    await flush();
    expect(resume).toHaveBeenCalledWith(12.34); // la position lue de Kronos, pas recalculée
  });

  it('paused→running sans resume() : re-tir par slot + warn (transitoire)', async () => {
    adapters.set('p5', { stop: vi.fn() });
    const refire = vi.fn();
    slots.push({ runtime: 'p5', actorId: 'p', fileId: 'f', refire });
    const t = fakeTransport('paused');
    attachCodeVoiceLifecycle(t, () => slots, log);
    t.goto('running');
    await flush();
    expect(refire).toHaveBeenCalledTimes(1);
    expect(logs.some((l) => l.level === 'warn' && /re-tir/.test(l.msg))).toBe(true);
  });

  it('stopped→running : replay = re-tir des voix dans leurs slots', async () => {
    const refire = vi.fn();
    slots.push({ runtime: 'strudel', actorId: 'a', fileId: 'f', refire });
    const t = fakeTransport('stopped');
    attachCodeVoiceLifecycle(t, () => slots, log);
    t.goto('running');
    await flush();
    expect(refire).toHaveBeenCalledTimes(1);
  });

  it('→stopped : tais-toi immédiat par slot (REV-F01), moteurs exclus du gel COMPRIS', async () => {
    const stopStrudel = vi.fn().mockResolvedValue(undefined);
    const stopMercury = vi.fn().mockResolvedValue(undefined);
    adapters.set('strudel', { stop: stopStrudel });
    adapters.set('mercury', { stop: stopMercury });
    slots.push(
      { runtime: 'strudel', actorId: 's', fileId: 'f' },
      { runtime: 'mercury', actorId: 'm', fileId: 'f' }
    );
    const t = fakeTransport('running');
    attachCodeVoiceLifecycle(t, () => slots, log);
    t.goto('stopped');
    await flush();
    expect(stopStrudel).toHaveBeenCalledWith({ actorId: 's', fileId: 'f' }, log);
    expect(stopMercury).toHaveBeenCalledWith({ actorId: 'm', fileId: 'f' }, log);
  });

  it('mercury est EXCLU du gel/reprise (hors périmètre, décision 2026-07-03)', async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    const resume = vi.fn().mockResolvedValue(undefined);
    adapters.set('mercury', { pause, resume, stop: vi.fn() });
    slots.push({ runtime: 'mercury', actorId: 'm', fileId: 'f' });
    const t = fakeTransport('running');
    attachCodeVoiceLifecycle(t, () => slots, log);
    t.goto('paused');
    t.goto('running');
    await flush();
    expect(pause).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it('detach() : plus AUCUN relais après détachement (teardown re-éval : la voix survit)', async () => {
    const stop = vi.fn().mockResolvedValue(undefined);
    adapters.set('strudel', { stop });
    slots.push({ runtime: 'strudel', actorId: 'a', fileId: 'f' });
    const t = fakeTransport('running');
    const detach = attachCodeVoiceLifecycle(t, () => slots, log);
    detach();
    t.goto('stopped');
    await flush();
    expect(stop).not.toHaveBeenCalled();
  });
});
