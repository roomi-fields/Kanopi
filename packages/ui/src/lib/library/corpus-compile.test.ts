// GARDE DE STATUT DU CORPUS — chaque scène BPScript de la bibliothèque a un statut de
// compilation ATTENDU, et le portillon échoue dès que le réel s'en écarte, DANS LES DEUX SENS.
//
// POURQUOI (chantier `script`, [932], 2026-07-26) : quatre scènes deviennent ROUGES par
// INTENTION. Elles emploient des intentions qui n'ont pas encore de nom dans le langage (attente
// d'un nommage par Romain) et elles DOIVENT échouer bruyamment plutôt que rendre une musique
// plausible bâtie sur un mot vide. Or mon portillon ne compilait AUCUNE scène du corpus : il ne
// les voyait donc ni rouges ni vertes — pas « un lecteur pressé voit quatre scènes cassées »,
// mais « personne ne voit rien ». Une régression de compilation sur n'importe quelle scène
// passait tout aussi inaperçue.
//
// CE QUE CE GARDE DONNE, et qu'un simple « tout doit compiler » ne donne pas :
//   • une scène rouge PAR INTENTION est un PASS — mais seulement si elle échoue POUR LA RAISON
//     déclarée (le motif est vérifié dans le message), pas pour une autre casse ;
//   • une scène rouge NON déclarée = ÉCHEC = régression, avec son message ;
//   • une scène déclarée rouge qui se met à COMPILER = ÉCHEC AUSSI : sa cause a été levée en
//     amont, ce fichier doit sortir de la liste. Un rouge déclaré ne peut pas se fossiliser.
//
// CE QUE LA POSE DU GARDE A DÉJÀ ATTRAPÉ : deux rouges que le chantier n'avait pas vus —
// `generative/alan-dice.bps` et `world/shapes-rhythm.bps`, copies divergentes figées au
// 2026-07-13 des scènes de `BPScript-tests/`, exposées toutes deux dans le rail (l'utilisateur
// voyait deux cartes de la même pièce, dont une périmée). Romain a tranché : SUPPRIMÉES ([933]).
// Leurs entrées ont donc quitté la liste ci-dessous — et c'est le garde lui-même qui l'a réclamé,
// en échouant sur « déclarée rouge mais absente du corpus ».
//
// Périmètre : les scènes `.bps` dont l'en-tête déclare `@language: bpscript`. Les voix de code
// (strudel/hydra/mercury/p5…) ne passent pas par cette analyse, les `.gr` ont la leur (parseBP3).

import { describe, it, expect } from 'vitest';
// MÊME spécificateur que l'adaptateur (`bpx-adapter.ts:20`) — c'est lui que `tsconfig.paths`
// résout vers la surface typée du dépôt amont. Pas de second chemin d'import, pas de `declare
// module` recopié : le garde analyse par la porte que l'application emprunte.
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';

const BPS = import.meta.glob('../../../../library/scenes/**/*.bps', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

/** Rouges DÉCLARÉS : chemin → motif attendu dans l'erreur + ce que la scène attend.
 *  DEUX causes, qui ne veulent pas dire la même chose et ne se confondent pas :
 *   • 'nommage-attendu' — rouge TRANSITOIRE. La scène emploie une intention dont la forme
 *     existe désormais mais qu'elle n'a pas encore reçue. L'entrée doit disparaître quand la
 *     migration arrive, et le test le réclame de lui-même.
 *   • 'rouge-definitif' — rouge PERMANENT et VOULU. La verdir exigerait de mentir : soit
 *     inventer un nom pour une commande qui ne fait rien, soit retirer du natif ce que la
 *     scène traduit. Un rouge qui dit la vérité vaut mieux qu'un vert qui ment.
 *  Toute AUTRE cause de rouge est une régression, donc un échec : cette liste n'est pas un
 *  dépotoir de scènes cassées, chaque entrée porte sa raison. */
const ROUGES_DECLAREES: Array<{
  fichier: string;
  motif: RegExp;
  cause: 'nommage-attendu' | 'rouge-definitif';
  attend: string;
}> = [
  {
    fichier: 'BPScript-tests/shapes-rhythm.bps',
    motif: /script/,
    cause: 'rouge-definitif',
    attend:
      'RIEN — état stable : Tick cycle ON/OFF et Reset tick cycle ont un CORPS VIDE dans le moteur natif (ScriptUtils.c:1840,1844,1914), les nommer promettrait un effet inexistant ; Beep est hors périmètre par décision (Romain 2026-07-26). Ne pas « réparer ».'
  },
  {
    fichier: 'BPScript-tests/beatrix-dice.bps',
    motif: /script/,
    cause: 'nommage-attendu',
    attend: 'migration de « Wait for <note> channel » vers le trigger entrant (la forme existe)'
  },
  {
    fichier: 'BPScript-tests/alan-dice.bps',
    motif: /script/,
    cause: 'nommage-attendu',
    attend: 'migration de « Wait for <note> channel » vers le trigger entrant (la forme existe)'
  }
];

const rougeDeclaree = (chemin: string) => ROUGES_DECLAREES.find((r) => chemin.endsWith(r.fichier));

/** Une scène est du BPScript symbolique si son en-tête le déclare. */
const estBPScript = (src: string) => /^\s*\/\/\s*@language:\s*bpscript\s*$/m.test(src);

const scenes = Object.entries(BPS)
  .filter(([, src]) => estBPScript(src))
  .map(([chemin, src]) => ({ chemin, src }));

describe('[932] statut de compilation du corpus BPScript', () => {
  it('a bien trouvé le corpus (le glob ne ment pas par un ensemble vide)', () => {
    expect(scenes.length).toBeGreaterThan(20);
  });

  it('les rouges DÉCLARÉES sont toutes présentes dans le corpus', () => {
    for (const r of ROUGES_DECLAREES) {
      const trouvee = scenes.some((s) => s.chemin.endsWith(r.fichier));
      expect(trouvee, `${r.fichier} déclarée rouge mais absente du corpus`).toBe(true);
    }
  });

  for (const { chemin, src } of scenes) {
    const attendu = rougeDeclaree(chemin);
    const nom = chemin.replace(/^.*\/scenes\//, '');

    if (attendu) {
      it(`${nom} — ROUGE DÉCLARÉ [${attendu.cause}] (attend : ${attendu.attend})`, () => {
        const { errors } = compileToBPxAST(src);
        // Elle DOIT échouer : si elle compile, sa cause est levée en amont et cette entrée doit
        // disparaître de ROUGES_DECLAREES (un rouge déclaré ne se fossilise pas).
        expect(
          errors.length,
          `${nom} COMPILE désormais — sa cause (${attendu.cause} : ${attendu.attend}) a dû être levée : retirer cette entrée de ROUGES_DECLAREES`
        ).toBeGreaterThan(0);
        // …et pour LA RAISON déclarée, pas pour une autre casse qui se cacherait derrière.
        const messages = errors.map((e) => e.message ?? String(e)).join(' | ');
        expect(messages, `${nom} échoue, mais pas sur « ${attendu.motif} » : ${messages}`).toMatch(
          attendu.motif
        );
      });
    } else {
      it(`${nom} — compile`, () => {
        const { errors } = compileToBPxAST(src);
        const messages = errors.map((e) => e.message ?? String(e)).join(' | ');
        expect(errors.length, `${nom} ne compile plus : ${messages}`).toBe(0);
      });
    }
  }
});
