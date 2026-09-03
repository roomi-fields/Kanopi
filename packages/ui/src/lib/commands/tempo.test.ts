// [927] VERROU — le geste tempo est UN SEUL point d'entrée, et la façade de pilotage y délègue.
//
// Ce que ce test empêche de revenir : `window.kanopi.setTempo` appelait `clock.setBpm` nu, donc
// il warpait les runtimes SANS reporter la valeur dans la directive `tempo` de la scène — la
// moitié du geste vivait dans le composant Svelte. Conséquence vicieuse : un banc mené par l'API
// mesurait une divergence (tempo qui retombe au re-eval) que le vrai champ BPM ne produit pas.
// L'instrument mentait, et une mesure faite avec lui ne pouvait plus distinguer un défaut produit
// d'un défaut de banc.
//
// PREUVE 1 — la commande fait le geste COMPLET : la directive de la scène active est réécrite.
// PREUVE 2 — la façade DÉLÈGUE : `window.kanopi.setTempo` passe par la commande, pas par un
//            chemin plus court. (Le verrou porte sur la délégation elle-même : c'est elle qui a
//            cédé, pas le contenu de la commande.)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { workspace } from '../../stores/workspace.svelte';

vi.mock('runtime-ui', () => ({ traceEnabled: () => false, setTraceEnabled: () => {} }));

import { setTempo } from './tempo';
import { createEventBus } from '../events/bus';
import { initAdapters } from '../runtimes/registry';

// LE REGISTRE SE CONSTRUIT AVEC LE BUS, ET `vi.mock` RÉINSTANCIE LE GRAPHE DE MODULES DE CE
// FICHIER — l'initialisation globale de l'environnement de banc ne le suit donc pas jusqu'ici.
// Ce fichier construit comme le cœur construit. Faire taire le cri à la place aurait rendu au
// produit un « aucune voix reconnue » silencieux.
initAdapters(createEventBus());

const SCENE = `// @language: bpscript
core
tempo:80

-----
S -> C4 D4 E4
`;

describe('[927] commande tempo — point d’entrée unique', () => {
  beforeEach(() => {
    for (const f of [...workspace.files]) workspace.closeTab(f.id);
  });

  it('PREUVE 1 — reporte le BPM appliqué dans la directive de la scène active', () => {
    const id = workspace.addFile('tempo-cmd.bps', SCENE);
    workspace.openFile(id);
    workspace.setActive(id);

    const applied = setTempo(120);

    expect(applied).toBe(120);
    expect(workspace.fileById(id)?.contents).toContain('tempo:120');
    expect(workspace.fileById(id)?.contents).not.toContain('tempo:80');
  });

  it('PREUVE 1b — n’INJECTE jamais de directive dans une scène qui n’en déclare pas', () => {
    const sansDirective = '// @language: bpscript\ncore\n\n-----\nS -> C4 D4\n';
    const id = workspace.addFile('tempo-cmd-nu.bps', sansDirective);
    workspace.openFile(id);
    workspace.setActive(id);

    setTempo(120);

    expect(workspace.fileById(id)?.contents).toBe(sansDirective);
  });
});

// ⛔ LES DEUX PREUVES DE DÉLÉGATION RECHARGENT LE GRAPHE À FROID, ET LEUR DÉLAI EST DIMENSIONNÉ,
// PLUS HÉRITÉ. `vi.resetModules()` suivi de `await import('../pilot/kanopi-api')` réinstancie tout
// ce que la surface pilote tire — l'adaptateur BPx, le compilateur de BPscript, Kairos, Kronos, les
// runtimes. C'est la seule façon qu'un simulacre remplace le vrai module, donc la lenteur est
// VOULUE, pas un défaut à corriger.
//
// ⛔ CE QUI L'A FAIT ÉCRIRE : le 2026-09-03 à 18:22, ma campagne de portillon a rendu ROUGE sur
// « Test timed out in 5000ms » — le défaut de vitest, jamais choisi pour ce cas. Mesuré tout de
// suite après, machine à 17 de charge, HORS campagne : 1126 ms, 2561 ms, 2876 ms sur trois tirs.
// Sous une campagne (construction + typage + 85 fichiers de bancs en parallèle) la marge de 5 s ne
// tient pas. Ce n'est PAS une assertion ajustée à ce qui sort : l'assertion est intacte, c'est
// l'ATTENTE qui se dimensionne sur une mesure, avec ses chiffres.
//
// ⚠️ ET J'AI CHERCHÉ SES FRÈRES AVANT DE CORRIGER LE SEUL QUI A ROUGI : un balayage de mes 85
// fichiers de bancs pour `resetModules` ET un import dynamique rend CE fichier, et lui seul. La
// population est fermée ; il n'y a pas d'autre cas à la limite qui rougira demain.
const DELAI_GRAPHE_A_FROID = 20_000;

describe('[927]/[929] façade de pilotage — DÉLÈGUE au même point d’entrée que le bouton', () => {
  it(
    'PREUVE 2 — window.kanopi.setTempo passe par la commande partagée',
    { timeout: DELAI_GRAPHE_A_FROID },
    async () => {
      vi.resetModules();
      const spy = vi.fn((bpm: number) => bpm);
      vi.doMock('../commands/tempo', () => ({ setTempo: spy, tapTempo: () => null }));

      const { installKanopiApi } = await import('../pilot/kanopi-api');
      installKanopiApi();

      const applique = (
        window as unknown as { kanopi: { setTempo(n: number): number } }
      ).kanopi.setTempo(137);

      expect(spy).toHaveBeenCalledWith(137);
      expect(applique).toBe(137);
      vi.doUnmock('../commands/tempo');
    }
  );

  // Même verrou pour PRODUCE : ce qui avait cédé sur le tempo, c'est la DÉLÉGATION, pas l'effet.
  // Un `produce` qui appellerait `openBlocks.produceLoadedProgram` en direct sauterait la
  // bascule (couper la scène sortante / arrêter la vivante) et ferait mentir tout banc.
  it(
    'PREUVE 3 — window.kanopi.produce passe par la commande partagée (bascule comprise)',
    { timeout: DELAI_GRAPHE_A_FROID },
    async () => {
      vi.resetModules();
      const spy = vi.fn(async () => {});
      vi.doMock('../commands/produce', () => ({ produceActiveScene: spy }));

      const { installKanopiApi } = await import('../pilot/kanopi-api');
      installKanopiApi();

      await (window as unknown as { kanopi: { produce(): Promise<void> } }).kanopi.produce();

      expect(spy).toHaveBeenCalledOnce();
      vi.doUnmock('../commands/produce');
    }
  );
});
