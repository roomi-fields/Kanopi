// KAN-UX3 — mixer intent: composition of the mute layers + persistence.
import { describe, it, expect, beforeEach } from 'vitest';
import { createMixerIntent } from './mixer-intent';

const KEY = 'kanopi.mixer.test';

describe('mixer intent (KAN-UX3)', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it('defaults: nothing muted, volume 1', () => {
    const m = createMixerIntent(KEY);
    expect(m.masterMuted()).toBe(false);
    expect(m.mutedFor('groove')).toBe(false);
    expect(m.actorEntry('groove')).toEqual({ volume: 1, muted: false });
  });

  it('per-actor mute composes into mutedFor', () => {
    const m = createMixerIntent(KEY);
    m.setActorMuted('groove', true);
    expect(m.mutedFor('groove')).toBe(true);
    expect(m.mutedFor('viz')).toBe(false);
    m.setActorMuted('groove', false);
    expect(m.mutedFor('groove')).toBe(false);
  });

  it('master mute mutes EVERY actor (layer on top of the strips)', () => {
    const m = createMixerIntent(KEY);
    m.setMasterMuted(true);
    expect(m.mutedFor('groove')).toBe(true);
    expect(m.mutedFor('viz')).toBe(true);
    // Un-muting master uncovers the per-strip state, not a blanket unmute.
    m.setActorMuted('groove', true);
    m.setMasterMuted(false);
    expect(m.mutedFor('groove')).toBe(true);
    expect(m.mutedFor('viz')).toBe(false);
  });

  it('persists to localStorage and reloads (survives a page reload)', () => {
    const m = createMixerIntent(KEY);
    m.setActorMuted('groove', true);
    m.setMasterVolume(0.5);
    m.setActorVolume('groove', 0.25);

    const reloaded = createMixerIntent(KEY);
    expect(reloaded.mutedFor('groove')).toBe(true);
    expect(reloaded.snapshot().master.volume).toBe(0.5);
    expect(reloaded.actorEntry('groove')).toEqual({ volume: 0.25, muted: true });
  });

  it('clamps volume to 0..1 and ignores corrupt storage', () => {
    const m = createMixerIntent(KEY);
    m.setMasterVolume(3);
    expect(m.snapshot().master.volume).toBe(1);
    m.setActorVolume('groove', -2);
    expect(m.actorEntry('groove').volume).toBe(0);

    localStorage.setItem(KEY, '{not json');
    const corrupt = createMixerIntent(KEY);
    expect(corrupt.masterMuted()).toBe(false);
    expect(corrupt.snapshot().actors).toEqual({});
  });

  it('notifies subscribers with a snapshot (immediately, then on change)', () => {
    const m = createMixerIntent(KEY);
    const seen: boolean[] = [];
    const un = m.subscribe((s) => seen.push(s.master.muted));
    m.setMasterMuted(true);
    expect(seen).toEqual([false, true]);
    un();
    m.setMasterMuted(false);
    expect(seen).toEqual([false, true]);
  });
});
