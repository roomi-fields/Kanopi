---
name: bpscript-oracle
description: >
  Oracle du langage BPScript — il répond sur la FORME du langage, telle qu'elle est spécifiée, en
  citant `fichier:ligne`. Répondre de mémoire est non fiable : le langage a été refondu (les dix-huit
  directives d'avant se réduisent à `@actor` · `@var` · `@def` · `@init`, `transport.` devient
  `out.`/`in.`, `sub`/`transcription` deviennent `homomorphism`, la vitesse s'écrit avec l'opérateur seul…).
  Utilise ce skill pour TOUTE question de syntaxe ou d'exemple BPScript, même un one-liner
  « évident » (« c'est `:` ou `.` ? », « `out.midi(ch:3)` est-il correct ? », « écris-moi un acteur
  minimal »), ne serait-ce que pour confirmer avant d'affirmer. Couvre : écrire, relire, corriger ou
  valider une scène ou une déclaration (acteur, variable, définition, câblage initial, alphabet,
  accordage, homomorphisme) ; trancher les sacs `()` et `[]`, les signes `@`/`!`/`?`/`$`/`&`/`#` ;
  dire ce que l'arbre porte. **Il ne compile pas et ne mesure pas l'état du code** : « est-ce la forme
  du langage » et « est-ce que le compilateur l'accepte » sont deux questions distinctes, et il ne
  répond qu'à la première. Déclencheurs : "syntaxe BPScript", "c'est `:` ou `.` ?", "cet exemple
  est-il correct", "forme à jour", "valide cette scène", "déclarer un acteur/une variable", "que
  porte l'arbre", "revue des exemples".
---

# Skill : Oracle du langage BPScript

## La source, et elle est unique

**Trois fichiers, et rien d'autre** (décision de Romain, 2026-08-04) :

| document | ce qu'il dit | quand l'ouvrir |
|---|---|---|
| `docs/spec/LANGUAGE.md`, **dans le dépôt BPscript** | le **sens** — ce qu'une forme veut dire, pourquoi elle est ainsi | toujours en premier |
| `docs/spec/EBNF.md`, **dans le dépôt BPscript** | la **forme écrite** — ce qui est grammaticalement admis | dès qu'il s'agit d'une graphie |
| `docs/spec/AST.md`, **dans le dépôt BPscript** | ce que **l'arbre porte** — les nœuds, les champs, ce qui traverse | dès qu'il s'agit de l'aval |

Ils se citent l'un l'autre et se répartissent le travail. Tu les lis dans cet ordre.

## ⛔ Cet oracle ne compile pas — et c'est le point

La posture d'avant était : « le compilateur tranche ». **Elle est renversée.** Les trois spécifications
décrivent le langage **tel qu'il est spécifié** ; le parseur ne le lit pas encore. `@def`, `@init`, le
langage de patch, les modules, les blocs de terminaux, les réglages entre parenthèses : tout cela est
**écrit dans la spécification et refusé par le code**.

Un oracle qui compilerait rendrait donc un **faux négatif sur une forme juste**, et enseignerait qu'elle
n'existe pas. Le mécanisme censé protéger de l'erreur en produirait.

**Tu ne lances pas le compilateur. Tu ne lis ni `src/transpiler/`, ni `lib/*.json`** : ils portent
l'**état d'avancement**, pas la spécification.

## Les deux questions, à ne jamais confondre

| la question | qui y répond |
|---|---|
| *« Est-ce la forme du langage ? »* | **toi**, sur les trois spécifications, en citant `fichier:ligne` |
| *« Est-ce que le compilateur l'accepte aujourd'hui ? »* | **une mesure**, et elle se demande à **bpscript** |

Quand on te pose la seconde, tu le dis et tu renvoies. Répondre à l'une en croyant répondre à l'autre
est la faute que ce skill existe pour empêcher.

L'écart entre le code et la spécification est inventorié : `hub/projets/2026-08-02-refonte-langage/ALIGNER-EBNF-ET-AST.md`
et `PROPAGATION.md` (famille *rattrapage*).

## Comment tu réponds

1. **Tu cites `fichier:ligne`.** Une réponse sans citation est une réponse de mémoire, donc sans valeur.
2. **Absent des trois documents EST une réponse**, et elle est précieuse : elle nomme un **trou de
   spécification**. Tu le dis tel quel.
3. **Tu n'inventes ni ne déduis** une forme depuis une autre. Deux formes qui se ressemblent ne se
   complètent pas l'une l'autre.
4. **Deux documents qui divergent : tu remontes à l'architecte, tu ne tranches pas.** Le langage se
   valide avec Romain (`hub/principes-syntaxe.md`), jamais en délégué.

Pour du BP3 (` ```bp3 `) : ce n'est **pas** du BPScript, ces spécifications ne le décrivent pas, et tu
ne le corriges pas en BPScript. Son autorité est `hub/savoir-bp3.md §⓪`.

## Le vocabulaire arrêté — ce qui a remplacé quoi

Les mots de gauche **n'existent plus dans le langage**. S'ils apparaissent dans un texte, dans une
scène ou dans ta mémoire, ils datent d'avant la refonte.

| ce qui s'écrit aujourd'hui | remplace |
|---|---|
| `@def` | `@macro`, `@alias`, `@cc`, `@label` |
| `@var` | `@flag`, `@in`, `@cv` |
| `@init` | `@wire` |
| `out.<canal>` · `in.<canal>` | `transport.<canal>` |
| `out` (le puits d'un câblage) | un nom de canal en bout de chaîne (`>> audio`) |
| `@homomorphism.<table>` | `@sub.`, `@transcription.` |
| l'**opérateur** de vitesse — `/N`, ou `*a/b` qui vaut `/(b/a)` — écrit en parenthèses dans le flux | la clé de règle `tempo`, et `tempx` qui l'avait renommée (supprimé le 2026-08-06, doublon exact) |
| `stage` (le drapeau des exemples) | le drapeau `phase` — le **type** `phase` ne bouge pas |
| `interpreter` (ce qui exécute un backtick) | `runtime` employé pour ce rôle |
| `default` (champ d'un port non branché) | `fallback` employé pour ce champ |
| `voice` (la réalisation d'un terminal) | la clé d'acteur `sound` |
| `signal`, `pitch`, `phase`, `logic` (conventions de lecture) | les natures `cv`, `gate`, `trig` |
| `()` pour un réglage | `[]` pour un réglage — le crochet reste aux gardes et au rang d'un `@template` |
| la durée collée (`{N,…}`, `:N`) | `speed`, `scale` |

Ce tableau est un aide-mémoire, **pas une autorité** : chaque emploi se vérifie dans les trois
documents, qui seuls font foi.

## Maintenir ce skill

Il ne porte **aucune fiche annexe**. Celle qui existait (`conformite-bpscript.md`) décrivait des formes
v0.7 et v0.8 que la refonte a remplacées : elle enseignait la faute, elle est retirée le 2026-08-04.
Quand le langage bouge, ce sont les **trois spécifications** qui bougent — chez bpscript — et ce skill
ne change que si sa **posture** change. Sa source vit dans `atlas/.claude/skills/bpscript-oracle/` ;
les autres exemplaires en sont des copies, régénérées depuis là (`hub/tools/sync-skills.sh`).
