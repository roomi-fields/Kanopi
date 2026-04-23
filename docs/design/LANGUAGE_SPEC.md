# Kanopi — LanguageSpec

Contrat qu'un langage doit remplir pour être reconnu et colorisé dans
l'éditeur Kanopi. Couvre uniquement les aspects **parser + highlight + language
extension CodeMirror 6** — complémentaire de :

- `ADAPTER_SPEC.md` pour le runtime d'exécution et l'UX native riche
  (widgets, autocomplete, mini-notation, …)
- `KANOPI_LANGUAGE.md` (dans `docs/spec/`) pour la syntaxe du langage
  `.kanopi` lui-même (directives `@actor`, `@scene`, `@map`)

---

## 1 · Surface d'intégration

Pour qu'un langage X soit supporté par Kanopi il faut :

1. **Une extension de fichier** (`.hydra`, `.scd`, `.tidal`, …) associée à
   un identifiant `Runtime` dans `packages/ui/src/lib/core-mock/types.ts`.
2. **Une `languageFor(runtime)` entry** dans
   `packages/ui/src/components/editor/lang-resolver.ts` qui retourne une
   `Extension` CodeMirror 6.
3. **Un parser qui émet des tags Lezer standards** reconnus par le
   `kanopiHighlight` global (cf §3). Pas de thème spécifique à écrire.

Les étapes 1 et 2 sont triviales (une ligne chacune). Le vrai travail est
au point 3 : choisir / réutiliser un parser qui aligne ses tags sur les
standards `@lezer/highlight`.

---

## 2 · Parsers recommandés par langage

| Runtime | Parser                                          | Notes                                                 |
| ------- | ----------------------------------------------- | ----------------------------------------------------- |
| Strudel | `javascript()` de `@codemirror/lang-javascript` | Code JS avec transpile mini-notation                  |
| Tidal   | `javascript()` (port Tidal→JS)                  | Même que Strudel                                      |
| Hydra   | `javascript()`                                  | Chain calls purs                                      |
| JS      | `javascript()`                                  | Trivial                                               |
| Python  | `python()` de `@codemirror/lang-python`         | Trivial                                               |
| SC      | `javascript()` (fallback)                       | Pas de parser SuperCollider officiel CM6              |
| Kanopi  | `kanopiLanguage` (custom StreamLanguage)        | cf `packages/ui/src/components/editor/lang-kanopi.ts` |

Règle : **réutiliser un parser upstream** avant d'en écrire un. Un parser
CM6 custom coûte plusieurs semaines et rate toujours des edge cases.
Pour SC, `javascript()` produit un highlight approximatif mais acceptable
jusqu'à ce qu'un parser `@codemirror/lang-supercollider` existe.

Pour un vrai langage exotique sans parser CM6, un `StreamLanguage` (~30-60
lignes) peut dépanner — cf `lang-kanopi.ts` pour le modèle.

---

## 3 · Tags Lezer supportés par `kanopiHighlight`

Source : `packages/ui/src/components/editor/cm-theme.ts`.

| Tag                                             | CSS var        | Rôle                                     |
| ----------------------------------------------- | -------------- | ---------------------------------------- |
| `t.keyword`                                     | `--amber`      | Mots-clés (if, let, `@actor`)            |
| `t.comment`                                     | `--text-faint` | Commentaires (italique)                  |
| `t.string`                                      | `--green`      | Strings                                  |
| `t.number`                                      | `--cyan`       | Nombres                                  |
| `t.atom`                                        | `--tidal`      | Atomes (ex: `true`, `null`, symboles)    |
| `t.operator`                                    | `--text-muted` | Opérateurs (+, =, `=>`)                  |
| `t.propertyName` + `t.function(t.variableName)` | `--sc`         | Callables (fonctions, méthodes chainées) |
| `t.variableName`                                | `--text`       | Identifiants                             |
| `t.definition(t.variableName)`                  | `--amber-soft` | Définitions (declarations)               |
| `t.bool`                                        | `--cyan`       | Booleans                                 |
| `t.invalid`                                     | `--red`        | Tokens syntaxiquement invalides          |
| `t.bracket`, `t.punctuation`                    | `--text-dim`   | Parenthèses, virgules                    |

Un parser qui émet un de ces tags obtient automatiquement la bonne
couleur. **Aucun thème par langage à écrire.**

---

## 4 · Décision de design : un seul HighlightStyle global

Phase 2.2 a remplacé 6 HighlightStyle par-langage (kanopi/tidalStrudel/
hydra/js/py/sc, chacun avec une couleur de keyword différente) par un
unique `kanopiHighlight`. Motivation (cf `KANOPI_PRINCIPLES §5`) :

- Les tags Lezer sont universels entre parsers, donc 6 variantes de
  mapping sont 6 fois le même dictionnaire.
- La vision Kanopi assume la cohérence visuelle cross-langage (un
  keyword est d'une même couleur partout, un callable bleu partout).
- Un utilisateur qui ouvre `.tidal` après avoir passé 1h dans `.strudel`
  ne veut pas recalibrer sa lecture.

Tradeoff accepté : les « signatures » par langage (file-tree dot,
onglet) utilisent toujours les couleurs langue-spécifiques (`--tidal`
violet, `--hydra` amber, `--sc` bleu, `--python` vert), mais le **code
lui-même** partage la palette.

---

## 5 · Cas non couverts par les tags standards (option B, différée)

Certains langages ont des constructions sémantiques qui ne correspondent
à aucun tag Lezer standard :

- Mini-notation Strudel/Tidal : `"bd sn bd sn"` — chaque cellule est
  `t.string` côté parser JS mais représente sémantiquement un pattern
  rythmique dans le DSL.
- Chains Hydra : `.modulate()`, `.rotate()` — `t.propertyName` côté
  parser JS, mais sémantiquement un opérateur visuel.
- Symbols SuperCollider : `\foo` — identifier spécial, pas un tag standard.

Aujourd'hui, Kanopi colore ces tokens avec le tag générique (green pour
mini-notation, bleu pour chains). Si un langage avait besoin de tags
**customs** (`tidal.mininotation`, `hydra.chain`, `sc.symbol`, …), on
introduira l'**option B** :

- `packages/ui/src/lib/theme/syntax-classes.ts` — catalogue de classes
  logiques Kanopi avec couleurs.
- `packages/ui/src/lib/runtimes/<lang>.syntax.json` — mapping
  `tag-lezer → syntax-class` par langage.
- Refactor de `cm-theme.ts:kanopiHighlight` pour lire les specs et
  générer le HighlightStyle.

Tant qu'aucun cas réel ne justifie cette indirection, elle reste
parquée dans le backlog (`PROGRESS.md §5.3`). Premier vrai usage
candidat : mini-notation Strudel avec tag custom pour des patterns vs
strings normales.

---

## 6 · Enregistrer un nouveau langage

Checklist minimale :

1. Ajouter le runtime dans `Runtime` union (`core-mock/types.ts`).
2. Mapper l'extension dans `lang-resolver.ts` → retourne une `Extension`
   (le résultat d'un parser CM6 upstream).
3. Vérifier visuellement que les tokens reçoivent les couleurs attendues
   via `DOM inspection` sur un fichier d'exemple (cf méthode
   `live-coding-verify`).

Pas de spec JSON à fournir, pas de thème à installer.

Si un tag Lezer émis par le parser n'a pas d'entrée dans `kanopiHighlight`,
le fallback est `var(--text)` (blanc) grâce à l'option `{ fallback: true }`
de `syntaxHighlighting(kanopiHighlight, { fallback: true })`. Un tag
courant manquant → ajouter une ligne dans `cm-theme.ts:kanopiHighlight` et
documenter dans §3.

---

## 7 · Primitives exportées

Index pour la découverte. Signatures précises dans les types TypeScript.
API reference auto-générée prévue post-2.4 (cf `PROGRESS.md §2.7`).

| Primitive             | Kind          | Source                                         | Rôle                                            |
| --------------------- | ------------- | ---------------------------------------------- | ----------------------------------------------- |
| `languageFor(runtime)` | fn            | `components/editor/lang-resolver.ts:7`         | Résout `Runtime → Extension` CM6                |
| `kanopiLanguage`      | Extension     | `components/editor/lang-kanopi.ts:10`          | StreamLanguage custom pour `.kanopi`             |
| `kanopiHighlight`     | HighlightStyle | `components/editor/cm-theme.ts:13`            | Palette Kanopi unique (12 tags → CSS vars)       |
| `kanopiTheme`         | Extension     | `components/editor/cm-theme.ts:29`             | Theme CM6 (couleurs panel/gutter/selection)      |
| `kanopiGlobalStyles`  | Extension     | `components/editor/cm-theme.ts:79`             | Styles unscoped (tooltips autocomplete, lint)    |

---

## Historique de révision

- **2026-04-23** : rédaction initiale (phase 2.3 task 3). Rédigé après la
  décision phase 2.2 de partir sur un `HighlightStyle` unique (option A),
  ce qui rend ce document volontairement court — la complexité option B
  est parquée tant qu'elle n'est pas justifiée par un cas d'usage.
