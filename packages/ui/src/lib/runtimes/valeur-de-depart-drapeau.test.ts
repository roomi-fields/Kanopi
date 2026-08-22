// VERROU — LECTURE DE LA VALEUR DE DÉPART D'UN DRAPEAU DEPUIS L'ARBRE, ET C'EST LA ZONE AVEUGLE
// DOCUMENTÉE DE CE DÉPÔT : aucun autre banc unitaire n'exerce ce chemin, seuls les bancs d'écran
// le font.
//
// POURQUOI CE BANC EXISTE (mesuré 2026-08-08) : le nœud que la lecture parcourait a changé de
// place en amont, la lecture ne trouvait plus jamais son type, et rendait silencieusement une
// table VIDE. AUCUN test ne rougissait : le portillon restait vert. À l'écran, la conséquence
// était concrète — une scène dont toutes les règles sont gardées par un drapeau (comme
// `starter-main.bps`, la scène d'accueil) ne dérivait plus rien. Le défaut n'a été trouvé que
// parce qu'un voisin l'a signalé, trois jours après le changement en amont.
//
// ⛔ LE VERROU EST RETOURNÉ, PAS SUPPRIMÉ (2026-08-22). Le drapeau ne porte plus d'états nommés :
// il porte sa valeur initiale, `flag section:1` (décision de Romain, relayée par bpscript). Le
// premier volet lit désormais cette valeur ; le second interdit à la forme sortie de revenir.
import { describe, it, expect } from 'vitest';
import { sceneQuiPasse, sceneQuiEchoue } from '../library/scene-de-banc';
import { initialFlagsFromAst } from './bpx-adapter';

// Même route que le garde de corpus (`library/corpus-compile.test.ts:60`) : le bundler lit le
// fichier, pas `node:fs` (rejeté par le tsconfig de `src/`).
const SCENES = import.meta.glob('../../../../library/scenes/code-voices/starter-main.bps', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;
const STARTER_MAIN = Object.values(SCENES)[0];

describe('lecture de la valeur de départ d’un drapeau (ast.vars)', () => {
  it('la scène d’accueil se compile (le fichier attendu existe et est lisible)', () => {
    expect(STARTER_MAIN, 'starter-main.bps introuvable — ce banc ne mesurerait rien').toBeTruthy();
  });

  it('le drapeau `section` de starter-main.bps expose la valeur qu’il déclare', () => {
    // La porte porte les deux contrôles qui vivaient ici : `errors` vide ET arbre présent.
    const ast = sceneQuiPasse(STARTER_MAIN);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flags = initialFlagsFromAst(ast as any);

    // Pas juste un compte : la table doit être non-vide ET porter le bon drapeau.
    expect(Object.keys(flags).length, 'table de drapeaux vide — la lecture rend le rien').toBe(1);
    // ⛔ LA VALEUR, PAS SA PRÉSENCE. Une lecture qui rendrait zéro partout passerait un
    // `toBeDefined()` sans rien mesurer, et la scène s'ouvrirait muette : à zéro, aucune de ses
    // trois règles gardées ne s'ouvre.
    expect(flags.section, 'le drapeau `section` ne part pas de sa valeur déclarée').toBe(1);
  });

  it('un `VarDirective` d’un AUTRE type (`signal`) n’apparaît PAS dans la table — le filtre filtre', () => {
    // `signal lfo` : même famille de nœud (`VarDirective`) que le drapeau, type différent.
    // Si le filtre `varType.kind === 'flag'` ne filtrait rien, ce nom polluerait la table.
    const source = `actor drums eval.strudel\nsignal lfo\nflag section:2\n-----\n[section==2] S -> drums_r\ndrums_r -> drums.\`s("bd")\`\n`;
    const ast = sceneQuiPasse(source);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flags = initialFlagsFromAst(ast as any);
    expect(flags.section, 'le drapeau `section` ne part pas de sa valeur déclarée').toBe(2);
    expect(flags.lfo, 'le `signal` `lfo` a fui dans la table des drapeaux').toBeUndefined();
  });

  it('la forme à états nommés est REFUSÉE — elle ne peut plus revenir en douce', () => {
    // Le verrou retourné : tant que cette source est refusée, aucune scène du corpus ne peut
    // reprendre la graphie sortie du langage sans que ce banc le dise.
    const source = `actor drums eval.strudel\nflag section(intro:1, drop:2)\n-----\n[section==intro] S -> drums_r\ndrums_r -> drums.\`s("bd")\`\n`;
    const { erreurs } = sceneQuiEchoue(source);
    expect(
      erreurs.map((e) => e.message ?? '').join(' | '),
      'le refus ne parle pas de la forme du drapeau — il échoue pour une autre raison'
    ).toMatch(/drapeau/i);
  });
});
