import { describe, it, expect } from 'vitest';
import { parseBP3, parseSeFile } from 'bp3-frontend';
import { createBPx } from 'bpx';
import { BUNDLED_SE } from './bp3-aux';
import bpAcceleration from '../../../../library/bundled/bp-acceleration.gr?raw';

// The -se recipe (bp3-frontend a5da5b8): a grammar references its engine timing
// in a `-se.<name>` file (surfaced by parseBP3().fileRefs). Without it the beat
// is 1000 ms; with it, the native tempo. acceleration → -se.Visser2 → 750 ms.

const ALPHABET = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si', 'C', 'D', 'E', 'F', 'G', 'A', 'B'];

function firstDurations(settings?: ReturnType<typeof parseSeFile>['engine']) {
  const r = parseBP3(bpAcceleration, { alphabetNames: ALPHABET });
  const bpx = createBPx({ tempo: 120, settings }) as {
    loadGrammar(a: unknown): void;
    derive(): { tokens: { start: number; end: number }[] };
  };
  bpx.loadGrammar(r.ast);
  return bpx
    .derive()
    .tokens.slice(0, 3)
    .map((t) => t.end - t.start);
}

describe('bp3 -se settings recipe (native tempo)', () => {
  it('surfaces the -se reference in fileRefs', () => {
    const r = parseBP3(bpAcceleration, { alphabetNames: ALPHABET });
    expect(r.fileRefs.find((x) => x.prefix === 'se')?.name).toBe('Visser2');
  });

  it('bundles the referenced -se settings', () => {
    expect(BUNDLED_SE.Visser2).toBeTruthy();
    const engine = parseSeFile(BUNDLED_SE.Visser2).engine;
    expect(engine.pclock).toBe(3);
    expect(engine.qclock).toBe(4);
  });

  it('derives the native beat with settings, the 1000 ms default without', () => {
    const engine = parseSeFile(BUNDLED_SE.Visser2).engine;
    // Without settings: bp3's NATIVE default clock — Pclock=Qclock=1 → 1000 ms / 60 BPM
    // (Inits.c:288, confirmé bp3-frontend [461]). Le 500 ms n'apparaît qu'AVEC un settings 120 BPM.
    expect(firstDurations()[0]).toBe(1000);
    // With settings: the native sawtooth (first terminal 750 ms — Visser's tempo).
    expect(firstDurations(engine)[0]).toBe(750);
  });
});
