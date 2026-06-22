# Kanopi — Backlog

Items différés (hors périmètre immédiat), tracés pour ne pas les perdre.

## Migration Kronos — retirer l'ancien dispatcher (état fait / reste)

> Kronos drive le son sur le **chemin audio mono** (flag `audio-engine=kronos` défaut |
> `legacy` filet). **Tout ce qui n'est pas couvert retombe sur legacy** (repli + warning,
> jamais de drop silencieux). Pour **retirer legacy**, le chemin Kronos doit couvrir le
> RESTE ci-dessous. `[P]` = primitive Kronos prête → câblage HÔTE ; `[N]` = à concevoir.

### FAIT (passe par Kronos)
- Flip audio mono (notes), boucle.
- CV : signal / par-note (`*:`) / terminal (`<term>:`) / **voix sœur** (env1/2/3 suivies)
  + pan ; composition via `buildModulators`/`resolveVoice`/`composeLeafModulations`.
- **Re-random** (toggle LIVE → handle kronos).
- **Curseur** (depuis `Cursor.position`, calé sur le son, ~1 frame).
- **Seek / Pause / Step** : seek = `clock.start`+`scheduler.start` ; Step = un temps EN PLACE
  (timeline complète, seek, stop après un temps — ne modifie pas la production).

### RESTE pour retirer legacy (par priorité)
1. **Scènes orchestrées multi-acteurs** `[P]` — le flip est mono ; `@actor/@scene` → legacy.
   Kronos route par acteur (`addAdapter`) ; câbler l'orchestration (un adaptateur/acteur,
   mapping acteur→voix). **Gros morceau.**
2. **Backtick cross-runtime + voix de code** `[N]` — `BT<interp><id>` → Strudel/Hydra
   déclenché dans le temps (sinks `<fileId>::<actor>`, re-arm) via l'ordonnanceur Kronos.
3. **Sorties multi-runtime** `[P]` — MIDI (`runtime-midi`), OSC, DMX : un `RuntimeAdapter`
   Kronos par sortie (latence propre). Aujourd'hui MIDI passe encore par legacy (sink MIDI
   sauté sur step). **Gros morceau, recoupe #1 (routage par acteur/sortie).**
4. **Events de nature control** `[N]` — `transport-control` / `instant` / `engine-control`
   routés sur `nature`. À router côté adaptateur/Scheduler.
5. **Tempo warp live** `[P]` — changer le BPM en lecture → `InternalClock.retune` (comme le
   re-random live). Câblage du contrôle de tempo vers le handle kronos.
6. **Arm/désarm acteur** `[P]` — `Scheduler.setActorMuted` livré par Kronos ; brancher le
   geste UI dessus.
7. **CV expr / samples** `[N]` — courbes backtick (`kind:'expr'`) + LFO périodique worklet.
8. **(propreté, pas bloquant)** migrer la composition CV (`composeCvBindings`, transitoire
   @kanopi/ui) → **couche 1 Kronos** (acté archi).

Ordre suggéré : **6 + 5** (petits, primitives prêtes) → **1 + 3** ensemble (orchestration +
MIDI, routage commun) → **2** (backtick) → **4 / 7**. Legacy retirable quand 1-7 passent par Kronos.

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
