// [927] VERROU — le geste tempo est UN SEUL point d'entrée, et la façade de pilotage y délègue.
//
// Ce que ce test empêche de revenir : `window.kanopi.setTempo` appelait `clock.setBpm` nu, donc
// il warpait les runtimes SANS reporter la valeur dans la directive `@tempo` de la scène — la
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

const SCENE = `// @language: bpscript
@core
@tempo:80

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
    expect(workspace.fileById(id)?.contents).toContain('@tempo:120');
    expect(workspace.fileById(id)?.contents).not.toContain('@tempo:80');
  });

  it('PREUVE 1b — n’INJECTE jamais de directive dans une scène qui n’en déclare pas', () => {
    const sansDirective = '// @language: bpscript\n@core\n\nS -> C4 D4\n';
    const id = workspace.addFile('tempo-cmd-nu.bps', sansDirective);
    workspace.openFile(id);
    workspace.setActive(id);

    setTempo(120);

    expect(workspace.fileById(id)?.contents).toBe(sansDirective);
  });
});

describe('[927]/[929] façade de pilotage — DÉLÈGUE au même point d’entrée que le bouton', () => {
  it('PREUVE 2 — window.kanopi.setTempo passe par la commande partagée', async () => {
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
  });

  // Même verrou pour PRODUCE : ce qui avait cédé sur le tempo, c'est la DÉLÉGATION, pas l'effet.
  // Un `produce` qui appellerait `openBlocks.produceLoadedProgram` en direct sauterait la
  // bascule (couper la scène sortante / arrêter la vivante) et ferait mentir tout banc.
  it('PREUVE 3 — window.kanopi.produce passe par la commande partagée (bascule comprise)', async () => {
    vi.resetModules();
    const spy = vi.fn(async () => {});
    vi.doMock('../commands/produce', () => ({ produceActiveScene: spy }));

    const { installKanopiApi } = await import('../pilot/kanopi-api');
    installKanopiApi();

    await (window as unknown as { kanopi: { produce(): Promise<void> } }).kanopi.produce();

    expect(spy).toHaveBeenCalledOnce();
    vi.doUnmock('../commands/produce');
  });
});
