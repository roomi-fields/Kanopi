# Kanopi — Backlog

Items différés (hors périmètre immédiat), tracés pour ne pas les perdre.

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
