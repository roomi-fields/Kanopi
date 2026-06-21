# Kanopi — Backlog

Items différés (hors périmètre immédiat), tracés pour ne pas les perdre.

## Migration Kronos — features de l'ancien dispatcher NON portées au 1er flip

> Le 1er flip audio (Kronos drive le son) couvre : **planification des notes, CV
> (note + signal via webaudio), routage acteur basique, boucle, tempo de dérivation
> initial**. Tout le reste de la surface de l'ancien `@kanopi/core` dispatcher est
> listé ci-dessous — à porter/câbler avec Kronos. Tant qu'un item n'est pas porté :
> **repli legacy + warning**, jamais de drop silencieux. `[K]` = l'API Kronos existe
> déjà (à câbler côté hôte) ; `[N]` = à concevoir.

1. **Arm/désarm d'acteur live** `[N]` — gate jouer/sauter par token (`setSoundPredicate`/
   `soundsFn`). L'hôte capte le geste ; il faut un hook Kronos pour muter/sauter un token
   à la volée. (live coding)
2. **Backtick cross-runtime + voix de code** `[N]` — token `BT<interp><id>` → interpréteur
   (Strudel/Hydra) déclenché dans le temps (`setBacktickSink`/`registerBacktickSink`),
   slots `<fileId>::<actor>`, re-arm. Câblage hôte + hook de timing Kronos.
3. **Events de nature control** `[N]` — `transport-control` / `instant` / `engine-control`
   routés sur `nature` (pas des notes). À router côté adaptateur/Scheduler.
4. **Hot-swap / re-dérivation live** `[K]` — `reDerive`/`reRandom` entre cycles, `hotSwap`,
   `setLoop`/`setReRandom`. Kronos a `Scheduler.swap(newTimeline, 'quantized')` → l'hôte
   appelle au bord de cycle.
5. **Tempo warp live** `[K]` — `setDerivedTempo`/`retune` (le tempo entendu change sans
   re-dériver la grille). Kronos a `InternalClock.retune(bpm)` → câbler le contrôle de tempo.
6. **Reprise depuis un offset** `[N]` — `startOffsetSec` (STEP → Play reprend au beat
   stepé, saute les events avant l'offset au 1er cycle). Lié au curseur/transport.
7. **Pause / Step + curseur** `[K]` — phase 2 explicite de l'EX4 : `Cursor.position()`
   (inverse de l'horloge), l'hôte dessine. Le curseur reste sur l'ancien chemin jusque-là.
8. **Sorties multi-runtime** `[N]` — MIDI (`runtime-midi`), OSC : des `RuntimeAdapter`
   additionnels (`addTransport` → `addAdapter` par acteur/sortie, avec latence propre).
9. **CV expr / samples** `[N]` — courbes pilotées par backtick (`kind:'expr'`) + LFO
   périodique (worklet/oscillo) : descripteurs opaques, traitement à caler (non capturables
   headless).
10. **Migration de la composition CV** `[K/N]` — `resolveCvControls` + `modulatorsFromAst`
    (aujourd'hui dans `@kanopi/ui`, transitoires) → couche 1 Kronos, consommant le triplet
    BPx `controls` + `controlSubjects` + `controlScopes` ensemble. (acté par l'architecte)

Réf : `kronos/docs/EX4_BRANCHEMENT.md`, `kronos/docs/CHARTER.md`,
`docs/design/TEMPORAL_INTERPRETER.md`.

## UI / Workspace
- **Suppression de fichier** : Kanopi n'a aucune suppression de fichier (ni bouton/menu
  contextuel dans l'arbre, ni API store `removeFile`). Seule la commande
  `workspace.reset` (palette) nettoie — globalement. Ajouter une suppression par fichier
  (FileTree + `workspace.removeFile` + persistance). Trouvé en session 2026-06-20.

## Éditeur
- **Validation `.gr` (indicateur de compilation)** : `programCompileStatus` n'est applicable
  qu'au `.bps` (via `compileToBPxAST`). Le `.gr` natif se parse par `parseBP3` (validateur
  différent, nécessite la plomberie d'alphabet) ; lancer le transpileur `.bps` dessus
  donnait une fausse erreur → restreint au `.bps`. Pour donner au `.gr` un vrai indicateur,
  brancher `parseBP3` (deux passes alphabet) dans `programCompileStatus`. 2026-06-20.

## Production / projection (post-bêta)
- **Replier les parcours d'arbre sur `flattenTree` par calques** : BPx a livré l'API de
  projection par calques (PROJECTION.md). Replier `treeToDispatchEvents` (audio),
  `orderedTokensFromTree` (texte), `bpxTreeToTimelineStream` (piano-roll) et le sink MIDI
  en projections d'une seule linéarisation. Après validation/déploiement bêta Romain.

## Performance lecture (si besoin)
- **Calque dédié au curseur** : `timeline.setCursor` repeint tout le piano-roll ; coût ∝
  taille de la production. Si une grosse scène sature au profilage (onglet 1er plan),
  repeindre seulement la ligne du curseur sur un calque séparé. cf `docs/design/PLAYBACK_LOOP.md`.
