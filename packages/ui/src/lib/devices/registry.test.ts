import { describe, it, expect } from 'vitest';
import { resolveDevice, acceptedOutputTypes, isCompatible } from './registry';
import type { DeviceType } from './registry';
import type { VoiceOutputType } from '../runtimes/adapter';

// DEVICES_SPEC §4 — resolution rules.
describe('resolveDevice', () => {
  it('resolves the bundled default midi device', () => {
    const d = resolveDevice('midi');
    expect(d?.type).toBe('midi');
  });

  it('guarantees the default midi exists (§4: always present)', () => {
    // Even if nothing else loaded, `midi` must resolve.
    expect(resolveDevice('midi')).toBeDefined();
  });

  it('resolves the bundled audio device', () => {
    expect(resolveDevice('audio')?.type).toBe('audio');
  });

  it("resolves 'audio' directly — no webaudio alias exists (§5 purge)", () => {
    const d = resolveDevice('audio');
    expect(d?.type).toBe('audio');
    expect(resolveDevice('webaudio')).toBeUndefined();
  });

  it('resolves osc / text / dmx bundled devices', () => {
    expect(resolveDevice('osc')?.type).toBe('osc');
    expect(resolveDevice('text')?.type).toBe('text');
    expect(resolveDevice('dmx')?.type).toBe('dmx');
  });

  // `video` a ete RETIRE (decision 2026-07-14) : plus de device, donc plus de resolution.
  it('ne resout PLUS « video » — le transport visuel n existe pas', () => {
    expect(resolveDevice('video')).toBeUndefined();
  });

  it('returns undefined for an unknown name (caller throws — never silent)', () => {
    expect(resolveDevice('lumieres')).toBeUndefined();
    expect(resolveDevice('does-not-exist')).toBeUndefined();
  });
});

// DEVICES_SPEC §3 — full accept/reject compatibility matrix.
describe('acceptedOutputTypes (§3 table)', () => {
  const cases: Record<DeviceType, VoiceOutputType[]> = {
    midi: ['notes'],
    audio: ['notes', 'signal'],
    osc: ['control', 'notes'],
    dmx: ['light'],
    text: ['text', 'notes', 'signal', 'visual', 'control', 'light']
  };

  for (const [type, accepted] of Object.entries(cases) as [DeviceType, VoiceOutputType[]][]) {
    it(`${type} accepts exactly {${accepted.join(', ')}}`, () => {
      const set = acceptedOutputTypes(type);
      expect([...set].sort()).toEqual([...accepted].sort());
    });
  }
});

describe('isCompatible accept/reject', () => {
  it('accepts notes → midi', () => expect(isCompatible('notes', 'midi')).toBe(true));
  it('accepts notes → audio', () => expect(isCompatible('notes', 'audio')).toBe(true));
  it('accepts signal → audio', () => expect(isCompatible('signal', 'audio')).toBe(true));
  it('accepts light → dmx', () => expect(isCompatible('light', 'dmx')).toBe(true));

  it('rejects notes → dmx (notes → lumieres example, §3)', () =>
    expect(isCompatible('notes', 'dmx')).toBe(false));
  it('rejects visual → audio', () => expect(isCompatible('visual', 'audio')).toBe(false));
  it('rejects signal → midi', () => expect(isCompatible('signal', 'midi')).toBe(false));

  it('text is the readable-fallback sink: accepts every output type', () => {
    const all: VoiceOutputType[] = ['notes', 'signal', 'visual', 'control', 'light', 'text'];
    for (const t of all) expect(isCompatible(t, 'text')).toBe(true);
  });
});
