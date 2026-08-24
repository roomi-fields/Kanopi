// LA PORTE DE L'HÔTE VERS UNE VOIX DE CODE — couture d'observation (arbitrage architecte 2026-08-22).
//
// Le paquet des voix rend son TABLEAU D'INSTANCES INTERNE (`runtime-codevoices/src/adapters.ts:48` :
// `return codeVoiceAdapters`), et c'est ce même objet que son runtime appelle sur une sourdine
// (`code-voices-runtime.ts:743`, arbitrage [76]/[77]). Tant que l'hôte tenait cette instance, un
// espion posé dessus voyait les DEUX appelants, sans rien pour les séparer : même forme d'argument,
// même asynchronie. Un banc qui énonçait « l'hôte n'appelle pas » attrapait donc l'exécution
// légitime du runtime au gré de la charge.
//
// `registry.getAdapter` rend désormais une PORTE distincte de l'instance. Ce fichier tient les deux
// moitiés de cette couture : que la porte SÉPARE, et que personne ne puisse la contourner.
import { describe, it, expect, beforeAll } from 'vitest';
import { createEventBus } from '../events/bus';
import { initAdapters, getAdapter, appelsDeLHote } from './registry';
import { createCodeVoiceAdapters } from 'runtime-codevoices';

const bus = createEventBus();
beforeAll(() => initAdapters(bus));

const instanceNue = (id: string) => createCodeVoiceAdapters(bus).find((a) => a.id === id)!;

describe('la porte de l’hôte vers une voix de code', () => {
  it('rend un objet DISTINCT de l’instance que le runtime appelle', () => {
    const porte = getAdapter('strudel')!;
    const nue = instanceNue('strudel');
    expect(porte).toBeDefined();
    expect(nue).toBeDefined();
    // Le point entier de la couture : deux objets, donc deux espions possibles, donc deux sujets
    // mesurables séparément.
    expect(porte).not.toBe(nue);
    // …et la porte reste LA MÊME d'un appel à l'autre : un espion posé dessus ne doit pas observer
    // un objet que plus personne n'appelle.
    expect(getAdapter('strudel')).toBe(porte);
  });

  it('laisse passer l’appel jusqu’à l’instance, sans rien décider', async () => {
    const porte = getAdapter('strudel')!;
    const nue = instanceNue('strudel') as unknown as Record<string, unknown>;
    const vues: unknown[] = [];
    const vrai = nue.stop;
    nue.stop = (...args: unknown[]) => {
      vues.push(args[0]);
      return Promise.resolve();
    };
    await porte.stop({ actorId: 'a.bps::x', fileId: 'a.bps' }, () => {});
    nue.stop = vrai;
    // L'argument arrive VERBATIM : la porte observe, elle ne réécrit pas.
    expect(vues).toEqual([{ actorId: 'a.bps::x', fileId: 'a.bps' }]);
  });

  it('porte la surface de l’amont sans la recopier — un champ ajouté là-haut traverse', () => {
    const porte = getAdapter('strudel')! as unknown as Record<string, unknown>;
    const nue = instanceNue('strudel') as unknown as Record<string, unknown>;
    // Chaque nom que l'amont publie existe sur la porte. Une liste tenue à la main ici périmerait
    // au premier ajout amont, en silence.
    const manquants = Object.keys(nue).filter((c) => !(c in porte));
    expect(manquants).toEqual([]);
    // Les champs se LISENT sur l'amont à chaque accès, ils ne sont pas figés à la construction.
    expect(porte.outputType).toBe(nue.outputType);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// LE GARDE DE STRUCTURE — sans lui, un septième site ajouté demain contournerait la porte
// ════════════════════════════════════════════════════════════════════════════════
//
// La porte ne vaut que si le registre reste le SEUL endroit de l'hôte qui obtient une instance de
// voix. Ce garde lit les sources de production et refuse toute autre obtention.
//
// Il se prouve sur la graphie que le CODE écrit, pas sur celle qu'on croit : les commentaires sont
// retirés avant l'examen, sinon une simple mention en prose (`bpx-adapter.ts` en cite une) le ferait
// rougir sur du texte.
//
// Les sources se lisent par le glob Vite — la forme que ce dépôt écrit déjà pour un garde de corpus
// (`host-time-purity.test.ts`) : native, sans types Node, donc `npm run check` la traverse.
const RAW = import.meta.glob('/src/**/*.{ts,svelte}', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const PORTIER = '/src/lib/runtimes/registry.ts';

function sourcesDeProduction(): string[] {
  return Object.keys(RAW).filter(
    (p) => !p.endsWith('.d.ts') && !p.includes('.test.') && !p.includes('.spec.')
  );
}

function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('garde de structure — le registre est le seul à obtenir une voix', () => {
  it('aucune source de production hors le registre n’atteint une instance de voix', () => {
    const fichiers = sourcesDeProduction();
    // UN GARDE COMPTE CE QU'IL A EXAMINÉ et refuse d'avoir examiné zéro : un chemin de racine
    // faux rendrait une liste vide, donc un vert qui ne prouve rien.
    expect(fichiers.length).toBeGreaterThan(100);

    const contrevenants = fichiers
      .map((p) => ({ nom: p, code: sansCommentaires(RAW[p]) }))
      .filter(({ nom }) => nom !== PORTIER)
      // LE NOM, PAS L'APPEL : un fichier qui importe la fabrique la tient déjà, même s'il l'appelle
      // derrière un alias (`const f = createCodeVoiceAdapters`). Mesuré le 2026-08-22 — un motif
      // ancré sur la parenthèse laissait passer l'import et le garde restait vert sous injection.
      .filter(
        ({ code }) => /\bcreateCodeVoiceAdapters\b/.test(code) || /\bcodeVoiceAdapters\b/.test(code)
      )
      .map(({ nom }) => nom);

    expect(
      contrevenants,
      'ces fichiers obtiennent une voix sans passer par le registre : l’hôte et le runtime ' +
        'redeviendraient indiscernables sur cette voix, et le banc de sourdine cesserait de dire ' +
        'ce qu’il énonce'
    ).toEqual([]);
  });
});

// ⛔ LE COMPTE DES APPELS DE L'HÔTE — ET IL NE VAUT QUE PARCE QUE LA PORTE SÉPARE.
//
// Posé le 2026-08-24 sur une question que runtime-codevoices m'a rendue. KAN-65 : la toile p5 est
// montée puis DÉTRUITE, et rien ne la remonte — deux fois, même signature. Sa déduplication
// d'évaluation n'explique QU'UNE des deux occurrences (17 ms sous son seuil de 50 ms, puis 60 ms
// au-dessus, où sa relance passerait et construirait — or aucun ajout n'apparaît).
//
// ⇒ « Le chiffre qui tranche a changé de nature : ce n'est plus l'instant d'entrée de chaque
//   évaluation, c'est *une évaluation a-t-elle seulement été TENTÉE*. » Et il se lit chez moi.
//
// ⛔ CE QUI REND CE COMPTE OPPOSABLE EST LA COUTURE CI-DESSUS, PAS LE COMPTEUR. Sur l'instance nue,
//   l'hôte et le runtime sont indiscernables ; le compte dirait « quelqu'un a appelé » et ne
//   trancherait rien. C'est pourquoi le second cas ci-dessous compte autant que le premier.
describe('ce que l’hôte a appelé, compté sur la porte', () => {
  it('la porte incrémente, et l’appel nomme la voix ET la méthode', async () => {
    const porte = getAdapter('strudel')!;
    const avant = appelsDeLHote()['strudel.stop'] ?? 0;
    await porte.stop({ actorId: '__epreuve__', fileId: '__epreuve__' }, () => {});
    expect(appelsDeLHote()['strudel.stop'] ?? 0).toBe(avant + 1);
  });

  it('⛔ l’instance NUE ne fait PAS monter le compte — sinon il ne trancherait rien', async () => {
    const nue = instanceNue('strudel');
    const avant = appelsDeLHote()['strudel.stop'] ?? 0;
    await nue.stop({ actorId: '__epreuve__', fileId: '__epreuve__' }, () => {});
    expect(
      appelsDeLHote()['strudel.stop'] ?? 0,
      'un appel du RUNTIME a été compté comme un appel de l’hôte : le compte cesse de dire qui a ' +
        'agi, et la question qu’il sert à trancher redevient indécidable'
    ).toBe(avant);
  });
});
