# Kanopi — Principes fondateurs

Source de vérité pour toutes les autres specs. Canonique au 2026-04-20 (vision)
et 2026-04-23 (rédaction). Toute décision d'architecture ou de produit doit
s'aligner sur ces 10 principes, ou justifier explicitement l'écart.

---

## Vision

Kanopi se veut être un **hub universel du live coding musical** — comme VSCode est un
hub universel du code général. Chaque runtime/langage est un plugin qui
reproduit son UX native dans ce hub. Kanopi fournit les primitives, les
plugins les consomment.

**Cible de validation du concept** : faire tourner **Strudel + Tidal + Hydra
+ SuperCollider** dans Kanopi, avec pour chacun l'UX de son IDE natif. Quand
les 4 marchent sans régression, le concept est prouvé.

---

## 1 · Portabilité bidirectionnelle stricte

Un fichier `.strudel` / `.tidal` / `.hydra` / `.scd` ouvert dans Kanopi
s'édite à l'identique dans son IDE natif (strudel.cc, atom-tidal,
hydra-editor, scide…). **Aucune syntaxe Kanopi-spécifique dans ces fichiers.**

Le partage de code avec la communauté du langage doit être sans friction.
Un pattern Strudel écrit dans Kanopi doit pouvoir être copié-collé dans
strudel.cc sans modification, et réciproquement.

## 2 · Zéro régression + features en plus

Un utilisateur qui migre depuis l'IDE natif de son langage doit retrouver
**tout ce qu'il aimait** (syntax highlight, autocomplete, widgets inline,
tooltips, squiggles, mini-notation, Ctrl+Enter, Ctrl+., …) plus un **bonus
Kanopi** (multi-runtime, scènes, actors, library paramétrique).

Corollaire opérationnel : avant de livrer un adapter, auditer l'UX native
fonction par fonction (Phase 0 audit, cf `docs/integrations/<LANG>.md`).

## 3 · Langage Kanopi pour l'orchestration cross-runtime uniquement

Le langage `.kanopi` (directives `@actor`, `@scene`, `@map`, `@time`,
`@library`, `@expose`) existe uniquement pour orchestrer des fichiers écrits
dans d'autres langages. Il ne remplace pas Strudel ni Tidal ni Hydra.

À terme on le remplacera par **BPscript** (repo séparé) pour la notation musicale
native. On commence simple avec `.kanopi`.

## 4 · IDE moderne à la VSCode

Pour **tous les langages supportés** (pas juste Strudel) :

- Syntax highlight contextuel (via les parsers upstream de chaque langage)
- Autocomplete avec tooltips (signatures, docs, exemples)
- Squiggles erreurs inline pendant la frappe
- Format on save (quand le langage a un formatter officiel)
- Folding / outline
- Navigation Ctrl+Click vers les définitions (quand applicable)

Ce principe impose d'intégrer **le module éditeur officiel** du langage
(ex: `@strudel/codemirror`, `@tidalcycles/vscode-*`, `scide`) autant que
possible, pas de le réécrire.

## 5 · Colorimétrie uniformisée

**Un mot-clé est de la même couleur partout. Une string est verte partout.
Un callable est bleu partout.** Peu importe le langage.

Implémentation : un `HighlightStyle` unique (`kanopiHighlight` dans
`cm-theme.ts`) appliqué à tous les buffers, en s'appuyant sur les tags Lezer
standards (`t.keyword`, `t.string`, `t.propertyName`, `t.function(t.variableName)`,
…) partagés par tous les parsers CodeMirror 6.

Un mode « couleurs natives par langage » pourra être
ajouté comme fallback. Par défaut, cohérence globale.

## 6 · Play multi-langage

Transport central unique (BPM, bar.beat, play/stop/tap, time signature).
Plusieurs runtimes s'exécutent simultanément (Strudel + Hydra + Tidal…) et
partagent le même clock. Les scènes (`@scene`) arment des groupes d'actors
atomiquement.

Un `Ctrl+.` (hush) coupe **tout** instantanément quel que soit le runtime
actif. Pas de cas particulier langage-par-langage.

## 7 · Intégration max, pas de réécriture

**Règle non-négociable** : utiliser le code upstream AS-IS. Pas de port, pas
de copie, pas de « j'ai exprimé la même idée différemment ». Glue uniquement,
justifiée ligne par ligne.

Quand upstream évolue, Kanopi évolue gratuitement. Quand upstream a un bug,
on le remonte upstream — on ne le masque pas en downstream. Un adapter
Kanopi n'est qu'une couche de bridging entre :

- le runtime du langage (moteur d'exécution audio)
- le module éditeur du langage (extensions CM6 ou équivalent)
- le bus `KanopiEvent` central
- le transport central

Corollaire : une PR « j'ai réimplémenté X » est refusée par défaut.

## 8 · Efficace musicalement

Timing serré avant tout. Pas d'abstraction qui ajoute de la latence audio.
Pas d'indirection qui coûte une frame par event. Les adapters ont un budget
latence mesuré et publié (cf `ADAPTER_SPEC.md`).

Pas d'usine à gaz. Une feature qui fait gagner 5% d'UX mais coûte 10ms de
latence audio est rejetée.

## 9 · Maintenable — séparation hub / adapters / plugins langage

```
packages/core/     → hub (dispatcher, clock, bus, session parser, bridge)
packages/ui/       → hub (éditeur, panels, palette, theme)
lib/runtimes/<L>   → adapter (glue entre L et le hub)
bpscript/          → plugin langage (repo séparé, consommé comme npm)
osc-bridge/        → sidecar hardware (repo séparé, consommé via WebSocket)
```

Un adapter n'importe que depuis le hub et le module upstream de son
langage. Jamais d'import inter-adapters. Jamais d'import UI spécifique à un
langage dans le hub.

## 10 · Ouvert et spécifié

Toutes les APIs d'extension sont publiées :

| Spec                  | Contient                                              |
| --------------------- | ----------------------------------------------------- |
| `KANOPI_PRINCIPLES.md` | ce document                                           |
| `ADAPTER_SPEC.md`     | interface `RuntimeAdapter` : moteur + UX + events     |
| `LANGUAGE_SPEC.md`    | tags Lezer supportés, `<lang>.syntax.json` si besoin  |
| `LIBRARY_SPEC.md`     | format `catalog.json` des libraries bundlées          |
| `EVENTS.md`           | `KanopiEvent` — bus runtime unifié                    |
| `ARCHITECTURE.md`     | topologie repos, dépendances, diagramme hub+plugins   |

Toute fonctionnalité nouvelle qui élargit la surface d'extension doit
mettre à jour la spec correspondante **avant** le merge.

---

## Arbitrages courants

Quand deux principes semblent en tension :

- **1 ↔ 5** (portabilité vs colorimétrie uniformisée) → 5 l'emporte : la
  colorimétrie est une préférence visuelle Kanopi, pas une modification du
  fichier source. Le fichier reste portable.
- **2 ↔ 7** (zéro régression vs pas de réécriture) → 7 l'emporte : si un
  bug upstream cause une régression, on le remonte upstream + on workaround
  minimal en glue, on ne fork pas.
- **4 ↔ 8** (IDE moderne vs efficacité musicale) → 8 l'emporte : jamais
  de feature IDE qui ajoute de la latence audio perceptible.
- **6 ↔ 9** (play multi-langage vs séparation stricte) → 9 l'emporte : le
  transport central passe par le hub, les adapters s'y branchent, pas
  l'inverse.

---

## Historique de révision

- **2026-04-20** : vision initiale rédigée dans `docs/plan/PROGRESS.md §0`.
- **2026-04-23** : extraction en doc autonome (phase 2.3 task 1).
  Précisions ajoutées à partir du retour d'expérience phase 2.1 (intégration
  @strudel/codemirror, pas juste @strudel/web) et phase 2.2 (colorimétrie :
  « callable = bleu partout » inclut `propertyName` pour méthodes chainées).
