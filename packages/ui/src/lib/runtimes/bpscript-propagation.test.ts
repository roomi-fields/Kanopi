// Garde anti-régression d'infrastructure (BPS-propagation).
// Prouve que le paquet bpscript CONSOMMÉ (node_modules/bpscript, résolu par NOM)
// porte bien le param `environnement` de compileToBPxAST (M5, BPScript ac9a474+).
// Échoue si la copie consommée est périmée / inerte (env ignoré → défaut moteur).
// À poser dans packages/ui/src/lib/runtimes/ (à côté de osc-routing.test.ts).
import { describe, it, expect } from 'vitest';
import { sceneQuiPasse } from '../library/scene-de-banc';
import { mmFromAst } from './bpx-adapter';

// ⚠️ ON LIT LA VRAIE FONCTION, PLUS UNE RÉPLIQUE. Ce banc portait une copie locale du lecteur de
// tempo, restée sur l'ancien nom de directive : le renommage du 2026-08-10 (bpscript c72aedf, « le
// métronome porte un seul nom, tempo, de la surface à l'arbre ») l'a laissée rendre `undefined`
// pendant que le lecteur réel lisait juste. Une copie ne diverge pas bruyamment — elle continue de
// compiler et de mentir.
describe('bpscript propagation — env → AST à travers le paquet consommé', () => {
  it("inscrit le défaut de tempo d'environnement quand la scène ne déclare rien", () => {
    // `core` apporte l'alphabet par défaut : sans lui, `C4` est un terminal non déclaré et la scène est
    // refusée (décision du 2026-09-02, plus aucun socle implicite). La scène ne déclare toujours pas
    // de tempo — c'est le sujet.
    const ast = sceneQuiPasse('core\n-----\nA -> C4', { tempo: 88 });
    expect(mmFromAst(ast as Parameters<typeof mmFromAst>[0])).toBe(88); // ÉCHOUE si la copie ignore `environnement`
  });

  it("la scène qui déclare mm gagne (pas d'écrasement)", () => {
    const ast = sceneQuiPasse('core\ntempo:70\n-----\nA -> C4', { tempo: 88 });
    expect(mmFromAst(ast as Parameters<typeof mmFromAst>[0])).toBe(70);
  });
});
