---
name: bpscript-oracle
description: >
  Oracle du langage BPScript — il répond sur la FORME du langage, telle qu'elle est spécifiée, en
  citant `fichier:ligne`. Répondre de mémoire est non fiable : le langage a été refondu, et il bouge
  encore (trois mots restent — `object`, `def`, `init` ; le **type vient en tête**, `flag
  section:1` · `symbol x` · `in.midi sync1` ; la **position** qualifie la ligne de part
  et d'autre du délimiteur `-----` ; `transport.` est devenu `out.`/`in.` ; `sub`/`transcription` sont
  devenus `homomorphism` ; la vitesse s'écrit avec l'opérateur seul). Utilise ce skill pour TOUTE
  question de syntaxe ou d'exemple BPScript, même un one-liner « évident » (« c'est `:` ou `.` ? »,
  « `out.midi(ch:3)` est-il correct ? », « écris-moi un acteur minimal »), ne serait-ce que pour
  confirmer avant d'affirmer. Couvre : écrire, relire, corriger ou valider une scène ou une
  déclaration (acteur, drapeau, entrée, définition, réglage initial, alphabet, accordage,
  homomorphisme) ; trancher les sacs `()` et `[]`, les signes `!`/`?`/`$`/`&`/`#` ; dire ce que
  l'arbre porte. **Il ne compile pas et ne mesure pas l'état du code** : « est-ce la forme du langage »
  et « est-ce que le compilateur l'accepte » sont deux questions distinctes, et il ne répond qu'à la
  première. Déclencheurs : "syntaxe BPScript", "c'est `:` ou `.` ?", "cet exemple est-il correct",
  "forme à jour", "valide cette scène", "déclarer un acteur/un drapeau", "que porte l'arbre",
  "revue des exemples".
---

# Skill : Oracle du langage BPScript

## La source, et elle est unique

**Trois fichiers disent ce que le langage EST** (décision de Romain, 2026-08-04) :

| document | ce qu'il dit | quand l'ouvrir |
|---|---|---|
| `docs/spec/LANGUAGE.md`, **dans le dépôt BPscript** | le **sens** — ce qu'une forme veut dire, pourquoi elle est ainsi | toujours en premier |
| `docs/spec/EBNF.md`, **dans le dépôt BPscript** | la **forme écrite** — ce qui est grammaticalement admis | dès qu'il s'agit d'une graphie |
| `docs/spec/AST.md`, **dans le dépôt BPscript** | ce que **l'arbre porte** — les nœuds, les champs, ce qui traverse | dès qu'il s'agit de l'aval |

Ils se citent l'un l'autre et se répartissent le travail. Tu les lis dans cet ordre.

**Un quatrième document dit ce qui est SORTI** : `hub/decisions/MOTS-SORTIS.md`, tenu par l'architecte
à chaque décision de retrait. Il porte, pour chaque mot retiré, sa décision datée, ce qui le remplace,
et si le retrait est **câblé** dans le parseur. Tu l'ouvres avant d'affirmer qu'un mot s'écrit : une
forme peut vivre dans les trois spécifications et être sortie depuis.

## ⛔ Cet oracle ne compile pas — et c'est le point

La posture d'avant était : « le compilateur tranche ». **Elle est renversée.** Les trois spécifications
décrivent le langage **tel qu'il est spécifié** ; le parseur ne le lit pas encore en entier. Le langage
de patch, les modules, les blocs de terminaux, les réglages entre parenthèses : tout cela est **écrit
dans la spécification et refusé par le code**.

Un oracle qui compilerait rendrait donc un **faux négatif sur une forme juste**, et enseignerait qu'elle
n'existe pas. Le mécanisme censé protéger de l'erreur en produirait.

**Tu ne lances pas le compilateur. Tu ne lis ni `src/transpiler/`, ni `lib/`** : ils portent l'**état
d'avancement**, pas la spécification.

**Le symétrique se mesure aussi** : un mot retiré dont le retrait n'est pas câblé **compile encore**,
et le compilateur ne distingue jamais ce qui n'existe plus de ce qui n'existe pas encore — il rend le
message d'une faute de frappe dans les deux cas. C'est pourquoi le registre daté passe avant lui.

## Les deux questions, à ne jamais confondre

| la question | qui y répond |
|---|---|
| *« Est-ce la forme du langage ? »* | **toi**, sur les trois spécifications et le registre, en citant `fichier:ligne` |
| *« Est-ce que le compilateur l'accepte aujourd'hui ? »* | **une mesure**, et elle se demande à **bpscript** |

Quand on te pose la seconde, tu le dis et tu renvoies. Répondre à l'une en croyant répondre à l'autre
est la faute que ce skill existe pour empêcher.

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

## L'état du langage — mesuré le 2026-08-19

**Trois mots restent** : `object`, `def`, `init`. Tout le reste est un **type déclaré** — `actor`,
`terminal`, et les catalogues qui fonctionnent déjà ainsi : `alphabet`, `tuning`, `octaves`,
`homomorphism`.

**Le type vient en tête**, et la **position** qualifie la ligne, de part et d'autre du délimiteur
`-----`. L'arobase de tête est sortie le 2026-08-16.

```bpscript
flag section:1
symbol x
in.midi sync1
actor lead alphabet.western out.midi(ch:1)
-----
[section==1] S -> C4 D4
```

**Un drapeau porte un nom et un entier**, et sa déclaration est obligatoire (Romain, 2026-08-22) :
le nom nu est refusé, l'emploi sans déclaration aussi, et les états nommés entre parenthèses sont
sortis.

`object` est **décidé et non câblé** : `def fort (vel:100)` et `init tempo:120` passent, `object kit`
rend un message générique.

## Le vocabulaire arrêté — ce qui a remplacé quoi

Les mots de droite **ne s'écrivent plus**. S'ils apparaissent dans un texte, dans une scène ou dans ta
mémoire, ils datent d'avant leur retrait.

| ce qui s'écrit aujourd'hui | remplace |
|---|---|
| le **type en tête** — `flag section:1`, `symbol x`, `in.midi sync1` | `var`, et les directives `flag`, `in`, `cv` |
| `flag <nom>:<entier>`, déclaration obligatoire | les états nommés, `flag section(calm:1, full:2)`, sortis le 2026-08-22 |
| la **position**, de part et d'autre de `-----` | l'arobase de tête |
| `def` | `macro`, `alias`, `cc`, `label` |
| `init` | `wire` |
| `out.<canal>` · `in.<canal>` | `transport.<canal>` |
| `homomorphism.<table>` | `sub.`, `transcription.` |
| l'**opérateur** de vitesse — `(/N)`, `(*a/b)` qui vaut `/(b/a)` | `speed`, et `tempx` qui l'avait renommé |
| la durée par cadre — `{N,…}` | le contrôle `[scale:N]` |
| `tempo`, qui porte le métronome **absolu** | `mm` |
| un alphabet est une collection de terminaux | `sound`, `voice` |
| l'invocation nue ; le répertoire personnel est balayé | `mine`, `factory` |
| le nom de règle | la graphie `\|x\|`, qui reste une graphie d'entrée BP3 |
| le type se déclare en librairie | `wire`, `gate`, `trigger`, `cc`, `expose` |
| la banque est un paramètre du moteur | `library` |
| la durée d'une scène suit son contenu | `duration` |
| une seule portée déclarative, la scène entière | `scene` |
| FaustX, chantier à venir | la modulation, et le câblage `>>` |

**Cinq mots sortent sans emporter leur notion**, et les confondre casse la page qui décrit la notion :

| le mot sort | la notion reste |
|---|---|
| `trigger` | ce que le point d'attente attend s'appelle un trigger |
| `in` · `out` | le **type** — `in.midi sync1`, et `out` reste l'une des cinq clés d'acteur |
| `cc` | le **contrôle de flux** — `cc.98:45` s'écrit |
| `scale` | l'**axe de catalogue** — `scale.raga_bhairav` — et le contrôle dans le sac de flux, `!(scale:2)` |
| `flag` | les drapeaux, leurs gardes `[section==intro]` et leurs mutations `[section=drop]` |

Ce tableau est un aide-mémoire, **pas une autorité** : chaque emploi se vérifie dans les trois
documents et dans le registre, qui seuls font foi.

## Maintenir ce skill

Il ne porte **aucune fiche annexe**. Celle qui existait (`conformite-bpscript.md`) décrivait des formes
v0.7 et v0.8 que la refonte a remplacées : elle enseignait la faute, elle est retirée le 2026-08-04.

Quand le langage bouge, ce sont les **trois spécifications** qui bougent — chez bpscript — et le
**registre des mots sortis** — chez le hub. Ce skill suit ces deux mouvements, et sa **posture** ne
change que sur décision.

Sa source vit dans `atlas/.claude/skills/bpscript-oracle/` ; les autres exemplaires en sont des copies,
régénérées depuis là (`hub/tools/sync-skills.sh`).
