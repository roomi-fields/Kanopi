# Analyse de gap — pipeline « AST direct » (archi cible) vs en place

**Auteur** : kanopi. **Date** : 2026-06-17. **Réf. cible** : atlas `architecture/04-composants.md`
(§4.2, §4.3, §4.4, §4.5, §4.9). **Statut** : constat de gap (pas d'impossibilité technique).
**Destinataires** : architecte (priorisation), BPx (action n°1), bpscript (coordination), atlas
(failles doc).

## 1. Pipeline cible

`frontal → arbre de scène (AST) → BPx (dérive, charge opaque par nœud) → dispatcher (résout +
route PAR ACTEUR) → runtimes / vues`

Points structurants :
- **§4.2/§4.3** : les deux frontaux émettent le MÊME arbre de scène, **directement**. Le texte
  BP3 intermédiaire est « un échafaudage de **validation** » pour la **seule preuve de parité**.
- **§4.4** : BPx prend l'arbre de scène **directement** en entrée (force de conception : « texte
  intermédiaire → arbre de scène direct »).
- **§4.5/§4.9** : le dispatcher **route par acteur** ; l'acteur voyage dans la charge par-nœud.
  Aucune table symbole→acteur dans la cible.
- **§4.7** : les voix de code (backticks) « voyagent comme du **contenu, opaques pour le moteur**,
  évaluées à l'interprétation » — modèle de charge opaque, comme les autres terminaux.

## 2. En place (vérifié sur pièces, 2026-06-17)

| Composant | Cible | En place | Écart |
|---|---|---|---|
| Frontal BP3 `.gr` | AST direct | `parseBP3 → AST → BPx` | ✅ conforme |
| Frontal BPScript `.bps` | AST direct ; texte BP3 = parité only | **texte BP3 = chemin de PRODUCTION** : `compileBPS().grammar → parseBP3 → AST` | ❌ déviation racine |
| BPx entrée | ingère l'AST complet | **rejette** l'AST `.bps` : `loadGrammar` lève `Unsupported RHS element type 'BacktickInline'` (TOUS les `.bps` à voix de code) | ❌ **gap fondateur** |
| `payload.actor` | jusqu'aux tokens | sur l'AST, **effacé par l'aller-retour texte** (`Mel --> C4 E4`, plus de `melody.`) → absent en prod | ❌ symptôme |
| Routage dispatcher | par acteur | **table à plat `terminalActorMap`** (collapse `sitar.Sa`/`tabla.Sa`) | ❌ symptôme (béquille) |
| Texte / lecture symbolique | vue de l'arbre de dérivation (§4.9) | routé via `TextTransport` (décision « texte=vue » postérieure au doc) | ⚠️ doc à mettre à jour |
| Événements universels / resolver partagé | visé | résolution dans le dispatcher JS | 🕓 post-bêta (assumé §4.9) |

## 3. Le gap fondateur

`compileBPS().ast` porte déjà le nœud backtick (`BacktickInline`) **+** `payload.actor` par
occurrence (vérifié : `sitar.Sa→sitar`, `tabla.Sa→tabla`, distincts, y compris via sous-règle).
**Mais `bpx.loadGrammar(compileBPS().ast)` lève `Unsupported RHS element type 'BacktickInline'`**
sur **les 9 `.bps` à voix de code du corpus** (strudel/hydra/mercury/p5/csound/tidal/js + scènes).

L'aller-retour texte est le SEUL moyen actuel de contourner ça : `compileBPS().grammar` matérialise
le backtick en terminal ordinaire (`|drums| --> BTauto0`) que BPx accepte — et au passage **efface
l'acteur** (d'où la table à plat comme unique source de routage à l'exécution).

## 4. Tout le reste est un symptôme

La table à plat, l'acteur perdu, l'impossibilité de retirer la map : **symptômes d'une seule
déviation** — le chemin de production `.bps` passe par l'échafaudage de parité (le texte BP3), que
le doc réserve à la validation. Cause unique : **BPx ne sait pas ingérer l'arbre de scène complet**.

Conséquence : toute tentative de router-par-acteur / retirer la table à plat est **prématurée par
construction** tant que (1) n'est pas fait — elle s'attaque à un symptôme dont la cause est amont.

## 5. Ordre de résolution (rien d'impossible)

1. **BPx** — `loadGrammar` accepte `BacktickInline` (et nœuds de scènes) et les dérive en **tokens
   datés porteurs de charge opaque** (le backtick = terminal au contenu opaque, §4.7). Le nom/id du
   token émis doit **correspondre aux clés de `compileBPS().backticks`** (`BTauto0`…) pour que le
   sink backtick de Kanopi le retrouve. *Gap fondateur, côté BPx.*
2. **Kanopi** — le `.bps` feed `compileBPS().ast` directement (abandon de l'aller-retour texte) →
   les tokens portent `payload.actor`. *Direct une fois (1) fait.*
3. **Kanopi** — routage par acteur ; **retrait de `terminalActorMap`** (champ + set + lectures,
   grep=0). *Cascade automatique de (2).*
4. **Kanopi** — texte = vue (déjà décidé, parké confirmation Romain) ; puis sceneActors, événements
   universels (post-bêta).

## 6. Action par partie

- **BPx (n°1, bloquant)** : supporter `BacktickInline` + nœuds de scènes dans `loadGrammar` ;
  token backtick au nom alignné sur `compileBPS().backticks`. Repro : `bpx.loadGrammar(compileBPS(
  '<.bps à backtick>').ast)` lève aujourd'hui.
- **bpscript** : `compileBPS().ast` porte DÉJÀ les nœuds backtick/acteur/scène (vérifié) → **pas de
  changement attendu pour l'ingestion**. Deux points de coordination : (a) le backtick doit porter
  l'id/clé qui matche la table `backticks` (BT…) ; (b) **standby** pour compléter l'AST si, une fois
  (1) livré, un test révèle une dérivation non équivalente (scènes/polymétrie) au texte. *Confirmé
  par le test, pas avant.*
- **Kanopi** : étapes 2-3-4 (changements simples, déjà cadrés).
- **atlas (failles doc)** : (a) la **table à plat n'existe pas dans la cible** — la nommer comme
  dette transitoire pour lever l'ambiguïté ; (b) **texte = vue** (suppression du `TextTransport`,
  muet→skip+vue) = décision postérieure au doc, à refléter (cohérent avec §4.9 « les vues lisent
  l'arbre de dérivation »).

## 7. Verdict

**Gaps, pas impossibilité.** La cible est cohérente et le gap n°1 va dans le sens d'une force de
conception déjà énoncée. La dette n'est pas une « régression Kanopi » : c'est que **le runtime de
production s'appuie sur l'échafaudage de parité**. Fermer le gap BPx (extension modeste : accepter
un nœud terminal au contenu opaque) débloque mécaniquement 2-3-4 côté Kanopi.
