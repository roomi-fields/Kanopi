# Tonalité — résolution des hauteurs (côté Kanopi)

Kanopi **consomme** le modèle tonalité défini par BPScript. La référence qui fait
autorité pour les **données** est `BPscript/docs/design/PITCH.md` (modèle 6 couches :
alphabet / octaves / tempérament / gamme / binding / résolveur). Ce document décrit ce
que **Kanopi** fait de ces données — pas le langage.

## D'où viennent les données

Catalogues JSON livrés par la dépendance `bpscript` (`bpscript/lib/*.json`), importés
**tels quels** :

| Fichier | Rôle |
|---|---|
| `alphabets.json` | noms de notes (+ altérations) — purement nominal |
| `octaves.json` | conventions de registre (préfixe/suffixe/défaut) |
| `temperaments.json` | grilles mathématiques (12/24/53-TET, pythagore, just_5limit…) |
| `scales.json` | collections : jins (fragments), maqams/makams (`compose`+`junction`), gammes/modes |
| `tunings.json` | bindings : alphabet + tempérament/gamme + `baseHz`/`baseNote`/`baseRegister` |

> Dépendance `file:` = **copie** dans `node_modules`. Après une mise à jour amont :
> rsync des `lib/*.json` depuis le dépôt BPScript, puis `npm run dev -- --force`
> (cache de pré-bundle Vite). Cf. mémoire « deps file: = copies périmées ».

## Le calculateur de hauteurs (propriété Kanopi)

`packages/core/src/dispatcher/resolver.js` (classe `Resolver`, partagée d'origine avec
BPScript) + `packages/core/src/dispatcher/scale.js` (**nouveau**, propre à Kanopi).

`scale.js` → `resolveScaleRatios(name, scalesCatalog)` renvoie le tableau de ratios
concrets (float normalisés) d'une gamme :

- gamme à **`ratios`** → utilisés tels quels (intonation intrinsèque : jins, maqâm non
  décomposable, râga) ;
- maqâm à **`compose:[jins…]` + `junction`** → le moteur **calcule** : on concatène les
  jins, le départ du jins `i` = `[1, …junction][i]` (`junction` peut être un **tableau**
  pour 3+ jins, ex. `maqam_saba`), avec **dédoublonnage par coïncidence** (on retire la
  1ʳᵉ note d'un jins si elle coïncide avec la dernière note déjà posée). **Aucun ratio
  n'est stocké** sur un maqâm décomposable ;
- gamme à **`degrees`** (mode occidental) → `null` : on garde le chemin classique
  degrés + tempérament du `Resolver`.

**Vérité ontologique** : les fréquences sont calculées **exactement** depuis les fractions
pures, **sans quantification** sur une grille. Le 24/53-TET est une grille de référence,
pas la source. Ex. Rast → tierce neutre `27/22` (~355 c), jamais `5/4`.

## Le branchement (glue)

`packages/ui/src/lib/runtimes/bp3.ts` : à l'évaluation d'une scène `.bps`, on lit les
directives `@alphabet.X` / `@tuning:Y`, on résout `Y` comme **binding** (`tunings.json`)
**puis** comme **gamme** (`scales.json`) — défaut `baseHz 440` / première note de
l'alphabet —, on calcule les ratios via `scale.js`, on construit le `Resolver` en **mode
table** sur ces ratios, et on marque les symboles de l'alphabet comme **sonnants**.
Repli (aucun alphabet déclaré) : résolveur western/solfège avec octave explicite,
inchangé (ex. `cv-adsr.bps`).

## Limites / dépendances amont

- **Re-random par tour** : Kanopi re-dérive bien la scène à chaque tour de boucle (toggle
  🎲) ; la **variation** aléatoire dépend de la graine RNG de **BPx** (routé à BPx).
- **Sélection `@tuning:<gamme>`** (référencer une gamme vs un binding) : décision de design
  routée à l'architecte ; défaut actuel = résoudre binding **puis** gamme.

## Pointeurs

- Contrat de données : `BPscript/docs/design/PITCH.md`.
- Calcul : `packages/core/src/dispatcher/scale.js`, `…/resolver.js`.
- Glue : `packages/ui/src/lib/runtimes/bp3.ts`.
