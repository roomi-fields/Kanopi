// VERROU — LECTURE DES ÉTATS NOMMÉS D'UN DRAPEAU DEPUIS L'ARBRE, ET C'EST LA ZONE AVEUGLE
// DOCUMENTÉE DE CE DÉPÔT : aucun banc unitaire n'exerçait ce chemin, seuls les bancs d'écran
// le font.
//
// POURQUOI CE BANC EXISTE (mesuré 2026-08-08) : le nœud `FlagStatesDirective` sous
// `ast.directives`, que `flagStatesFromAst` lisait, a disparu de l'amont le 2026-08-05 —
// l'information vit désormais dans `ast.vars`, sous des nœuds `VarDirective { names: string[],
// varType: { kind: 'flag', states: [...] } }`. La lecture continuait de parcourir
// `ast.directives`, ne trouvait plus jamais son type, et rendait silencieusement une table VIDE.
// AUCUN test ne rougissait : le portillon restait vert. À l'écran, la conséquence était
// concrète — plus aucun bouton de sélection de section, et une scène dont toutes les règles
// sont gardées par un drapeau (comme `starter-main.bps`, la scène d'accueil) ne dérivait plus
// rien. Le défaut n'a été trouvé que parce qu'un voisin l'a signalé, trois jours après le
// changement en amont. Un banc qui exerce ce chemin l'aurait dit le jour même — c'est ce banc.
import { describe, it, expect } from 'vitest';
import { compileToBPxAST } from 'bpscript/src/transpiler/index.js';
import { flagStatesFromAst } from './bpx-adapter';

// Même route que le garde de corpus (`library/corpus-compile.test.ts:60`) : le bundler lit le
// fichier, pas `node:fs` (rejeté par le tsconfig de `src/`).
const SCENES = import.meta.glob('../../../../library/scenes/code-voices/starter-main.bps', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;
const STARTER_MAIN = Object.values(SCENES)[0];

describe('lecture des états nommés d’un drapeau (ast.vars, pas ast.directives)', () => {
  it('la scène d’accueil se compile (le fichier attendu existe et est lisible)', () => {
    expect(STARTER_MAIN, 'starter-main.bps introuvable — ce banc ne mesurerait rien').toBeTruthy();
  });

  it('le drapeau `section` de starter-main.bps expose ses trois états nommés', () => {
    const { ast, errors } = compileToBPxAST(STARTER_MAIN) as {
      ast: unknown;
      errors: { message: string }[];
    };
    expect(errors, `compile en erreur : ${errors.map((e) => e.message).join('; ')}`).toEqual([]);
    expect(ast, 'AST nul après compilation sans erreur').toBeTruthy();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flagStates = flagStatesFromAst(ast as any);

    // Pas juste un compte : la table doit être non-vide ET porter le bon drapeau.
    expect(
      Object.keys(flagStates).length,
      'table de drapeaux vide — la lecture rend le rien'
    ).toBeGreaterThan(0);
    expect(flagStates.section, 'drapeau `section` absent de la table lue').toBeDefined();

    // Assertions nommées sur les trois états déclarés en tête de fichier
    // (`flag section(intro:1, drop:2), break:3`), pas un simple décompte.
    expect(flagStates.section.intro, 'état `intro` absent ou mal résolu').toBe(1);
    expect(flagStates.section.drop, 'état `drop` absent ou mal résolu').toBe(2);
    expect(flagStates.section.break, 'état `break` absent ou mal résolu').toBe(3);
  });

  it('un `VarDirective` d’un AUTRE type (`signal`) n’apparaît PAS dans la table — le filtre filtre', () => {
    // `signal lfo` : même famille de nœud (`VarDirective`) que le drapeau, type différent.
    // Si le filtre `varType.kind === 'flag'` ne filtrait rien, ce nom polluerait la table.
    const source = `actor drums eval.strudel\nsignal lfo\nflag section(intro:1, drop:2)\n-----\n[section==intro] S -> drums_r\ndrums_r -> drums.\`s("bd")\`\n`;
    const { ast, errors } = compileToBPxAST(source) as {
      ast: unknown;
      errors: { message: string }[];
    };
    expect(errors, `compile en erreur : ${errors.map((e) => e.message).join('; ')}`).toEqual([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flagStates = flagStatesFromAst(ast as any);
    expect(flagStates.section, 'drapeau `section` absent de la table lue').toBeDefined();
    expect(flagStates.lfo, 'le `signal` `lfo` a fui dans la table des drapeaux').toBeUndefined();
  });
});
