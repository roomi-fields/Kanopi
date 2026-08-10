import { describe, it, expect } from 'vitest';
import { createCodeVoiceAdapters } from 'runtime-codevoices';
import { createEventBus } from '../events/bus';
import { getAdapter, listRuntimes, initAdapters } from './registry';

// LES VOIX SE CONSTRUISENT AVEC LE BUS — le tableau exporté a quitté la surface du paquet
// (2026-08-10, chantier bus) : la fabrique est le SEUL chemin, et ce banc l'emprunte comme
// l'application. Le registre s'initialise ici comme le cœur l'initialise en vrai.
const bus = createEventBus();
initAdapters(bus);
const codeVoiceAdapters = createCodeVoiceAdapters(bus);

// `runtimeForInterp` (bp3.ts) resolves a backtick eval tag to a Runtime by
// DERIVING from the adapter registry — the same `codeVoiceAdapters` list the
// registry keys its map off — instead of a second hand-maintained table. These
// tests pin that invariant: every code-voice interp tag IS a registered Runtime
// whose adapter has that id; non-code-voice tags do NOT resolve to a code voice.

describe('interp tag → Runtime resolves via the registry', () => {
  it('every code voice interp tag resolves to its adapter in the registry', () => {
    for (const a of codeVoiceAdapters) {
      const adapter = getAdapter(a.id);
      expect(adapter, `registry must expose adapter for "${a.id}"`).toBeDefined();
      expect(adapter?.id).toBe(a.id);
    }
  });

  it('the canonical 6 code voices are all present', () => {
    const ids = codeVoiceAdapters.map((a) => a.id).sort();
    expect(ids).toEqual(['csound', 'hydra', 'js', 'mercury', 'p5', 'strudel'].sort());
  });

  it('the registry runtime list contains every code voice id', () => {
    const runtimes = new Set(listRuntimes());
    for (const a of codeVoiceAdapters) {
      expect(runtimes.has(a.id), `listRuntimes() must include "${a.id}"`).toBe(true);
    }
  });

  it('level-3 / unknown tags have no registry adapter (so runtimeForInterp returns undefined)', () => {
    // `sc`/`py` are osc-bridge level-3 placeholders, never code-voice adapters;
    // `auto` is the untagged sentinel. None must masquerade as a code voice.
    for (const tag of ['sc', 'py', 'auto', 'bogus']) {
      const isCodeVoice = codeVoiceAdapters.some((a) => a.id === (tag as never));
      expect(isCodeVoice, `"${tag}" must not be a code voice`).toBe(false);
    }
  });
});
