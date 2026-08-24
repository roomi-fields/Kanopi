import { describe, it, expect } from 'vitest';
import { parseBP3, parseSeFile } from 'bp3-frontend';
import { createBPx } from 'bpx';
import { BUNDLED_SE } from './bp3-aux';
import bpAcceleration from '../../../../library/scenes/bp3/bp-acceleration.gr?raw';
import bpFlags from '../../../../library/scenes/bp3/bp-flags.gr?raw';

// The -se recipe (bp3-frontend a5da5b8): a grammar references its engine timing
// in a `-se.<name>` file (surfaced by parseBP3().fileRefs). acceleration → -se.Visser2 → 750 ms.
//
// ⛔ LA PORTE REFUSE DÉSORMAIS AU LIEU DE SERVIR UN ARBRE À TROUS (bp3-frontend, préavis du
// 2026-08-23, mesuré ici le 2026-08-24). Une grammaire qui DÉCLARE un `-se` et ne le reçoit pas
// rend `ast: null` et le diagnostic `E_SETTINGS_NON_FOURNIS` : le défaut de 60 BPM sortait
// silencieusement à la place du tempo écrit, et c'est ce silence qui a été fermé.
// ⇒ Le texte des réglages se passe par `seText`, et une lecture qui ne veut QUE `fileRefs` — elle
//   ne peut pas connaître le fichier avant de l'avoir lu — passe par `sonde: true`.
// ⇒ Le DÉFAUT lui-même n'a pas bougé : il reste observable sur une grammaire qui ne déclare
//   aucun `-se`, et c'est ce que le dernier cas mesure.

const ALPHABET = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si', 'C', 'D', 'E', 'F', 'G', 'A', 'B'];

function firstDurations(source: string, seText?: string) {
  const r = parseBP3(source, { alphabetNames: ALPHABET, seText });
  const engine = seText ? parseSeFile(seText).engine : undefined;
  const bpx = createBPx({ tempo: 120, settings: engine }) as {
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
  it('surfaces the -se reference in fileRefs, on the discovery pass', () => {
    const r = parseBP3(bpAcceleration, { alphabetNames: ALPHABET, sonde: true });
    expect(r.fileRefs.find((x) => x.prefix === 'se')?.name).toBe('Visser2');
    // A discovery pass is the one caller that CANNOT have supplied the file, so the refusal
    // stays disarmed there — and the tree still comes out.
    expect(r.ast).not.toBeNull();
    expect((r.errors ?? []).map((e) => e.code)).not.toContain('E_SETTINGS_NON_FOURNIS');
  });

  it('bundles the referenced -se settings', () => {
    expect(BUNDLED_SE.Visser2).toBeTruthy();
    const engine = parseSeFile(BUNDLED_SE.Visser2).engine;
    expect(engine.pclock).toBe(3);
    expect(engine.qclock).toBe(4);
  });

  it('REFUSES a grammar that declares a -se it did not receive', () => {
    const r = parseBP3(bpAcceleration, { alphabetNames: ALPHABET });
    expect(r.ast).toBeNull();
    expect((r.errors ?? []).map((e) => e.code)).toContain('E_SETTINGS_NON_FOURNIS');
  });

  it('derives the native beat once the -se text is supplied', () => {
    // The native sawtooth: first terminal 750 ms — Visser's tempo, not the 60 BPM default.
    expect(firstDurations(bpAcceleration, BUNDLED_SE.Visser2)[0]).toBe(750);
  });

  it('keeps bp3 NATIVE default clock for a grammar that declares no -se', () => {
    // Pclock=Qclock=1 → 1000 ms / 60 BPM (Inits.c:288, confirmé bp3-frontend [461]). The default
    // is graven by the front-end, so BPx's own 120 BPM does not change it.
    expect(firstDurations(bpFlags)[0]).toBe(1000);
  });
});
