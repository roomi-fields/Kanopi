# Kanopi — Backlog

Items différés (hors périmètre immédiat), tracés pour ne pas les perdre.

## Migration Kronos — retirer l'ancien dispatcher (état fait / reste)

> Kronos drive le son sur le **chemin audio mono** (flag `audio-engine=kronos` défaut |
> `legacy` filet). **Tout ce qui n'est pas couvert retombe sur legacy** (repli + warning,
> jamais de drop silencieux). Pour **retirer legacy**, le chemin Kronos doit couvrir le
> RESTE ci-dessous. `[P]` = primitive Kronos prête → câblage HÔTE ; `[N]` = à concevoir.

## Où je m'arrête — 2026-08-19, 11h35

Neuf commits enregistrés, arbre propre, **non publiés** : le crochet de poussée a refusé six fois
dans la matinée, chaque fois parce qu'un dépôt lu en source vive portait un fichier non enregistré
qui entre dans mon paquet (quatre voisins différents). La septième tentative tourne encore au moment
de l'arrêt général.

**Pour qui reprend** : la poussée est le premier geste, et elle demande que les onze voisins soient
propres au même instant — ma veille attend cette fenêtre avant de lancer. Les neuf commits vont de
la famille de tabla aux deux gardes réparés.

**Deux gardes ont été corrigés et prouvés par injection**, ils ne demandent rien de plus.

**Ouvert, inscrit** : KAN-59, treize documents décrivant la déclaration d'un acteur avec une graphie
que le compilateur refuse.

**Ouvert, non inscrit et qui n'est pas à moi** : six refus de poussée en une matinée, sur quatre
voisins. Je lis huit dépôts en source vive et ma campagne dure onze minutes ; la fenêtre où les huit
sont simultanément propres se referme quand seize agents écrivent. Remonté à l'architecte comme une
mesure, pas comme une demande.


### FAIT (passe par Kronos)

- **KAN-1** `fait` — Flip audio mono (notes), boucle.
- **KAN-2** `fait` — CV : signal / par-note (`*:`) / terminal (`<term>:`) / **voix sœur** (env1/2/3 suivies) + pan ; composition via `buildModulators`/`resolveVoice`/`composeLeafModulations`.
- **KAN-3** `fait` — **Re-random** (toggle LIVE → handle kronos).
- **KAN-4** `fait` — **Curseur** (depuis `Cursor.position`, calé sur le son, ~1 frame).
- **KAN-5** `fait` — **Seek / Pause / Step** : seek = `clock.start`+`scheduler.start` ; Step = un temps EN PLACE (timeline complète, seek, stop après un temps — ne modifie pas la production).

### RESTE pour retirer legacy (par priorité)

- **KAN-6** `fait` — 1. **Scènes orchestrées multi-acteurs** `[P]` — le flip est mono ; `@actor/@scene` → legacy. Kronos route par acteur (`addAdapter`) ; câbler l'orchestration (un adaptateur/acteur, mapping acteur→voix). **Gros morceau.**  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-7** `fait` — 2. **Backtick cross-runtime + voix de code** `[N]` — `BT<interp><id>` → Strudel/Hydra déclenché dans le temps (sinks `<fileId>::<actor>`, re-arm) via l'ordonnanceur Kronos.  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-8** `ouvert` — 3. **Sorties multi-runtime** `[P]` — MIDI (`runtime-midi`), OSC, DMX : un `RuntimeAdapter` Kronos par sortie (latence propre). Aujourd'hui MIDI passe encore par legacy (sink MIDI sauté sur step). **Gros morceau, recoupe #1 (routage par acteur/sortie).**
- **KAN-9** `ouvert` — 4. **Events de nature control** `[P]` — cœur prêt (S1 : un `TimelineEvent` `kind:'control'` + `nature` est émis horodaté). Action HÔTE : porter les nœuds `control` de l'arbre dans la timeline Kronos (`kind:'control'`+`nature`) et les APPLIQUER dans l'adaptateur. Latent (0 nœud control dans les démos actuelles ; le flux per-note est déjà sur `leaf.controls`). `transport-control` = output-facing (émis) ; `instant` aussi ; `engine-control` → cœur (différé).
- **KAN-10** `fait` — 5. **Tempo warp live** `[P]` — changer le BPM en lecture → `InternalClock.retune` (comme le re-random live). Câblage du contrôle de tempo vers le handle kronos.  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-11** `fait` — 6. **Arm/désarm acteur** `[P]` — `Scheduler.setActorMuted` livré par Kronos ; brancher le geste UI dessus.  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-12** `ouvert` — 7. **CV expr / samples** `[N]` — courbes backtick (`kind:'expr'`) + LFO périodique worklet.
- **KAN-13** `fait` — 8. **(propreté, pas bloquant)** migrer la composition CV (`composeCvBindings`, transitoire @kanopi/ui) → **couche 1 Kronos** (acté archi).  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_

Ordre suggéré : **6 + 5** (petits, primitives prêtes) → **1 + 3** ensemble (orchestration +
MIDI, routage commun) → **2** (backtick) → **4 / 7**. Legacy retirable quand 1-7 passent par Kronos.

Réf : `kronos/docs/EX4_BRANCHEMENT.md`, `kronos/docs/CHARTER.md`,
`docs/design/TEMPORAL_INTERPRETER.md`.

## UI / Workspace

- **KAN-33** `fait` (2026-07-27) — **Panneau d'ENTRÉES + prise du focus de jeu** : livré. Le
  préalable est levé — la déclaration existe côté langage (`@in <rôle> transport.<canal>`), donc le
  panneau liste ce que la SCÈNE ATTEND et plus seulement des appareils bruts. Livré :
  `HardwareView` ouvre sur « Entrées de la scène » (rôle + canal + table, lus sur l'AST amont via
  `declaredInputsForScene`), l'association rôle → appareil est mémorisée HORS de la scène
  (`stores/input-bindings`), et le badge de la barre d'état PREND le focus de jeu quand la scène
  déclare un clavier (grisé sinon). Prouvé à l'écran : la touche arrive sur le bus, Échap ferme le
  périphérique (`tests/e2e/self-test/entrees-panneau.spec.ts`).
  **Reste ouvert dans ce ticket** : remplacer la lucarne de développement `?events=1`
  (`App.svelte:26`) par une vue produit. La sonde `window.kanopi.inspect.inputs()` (v15) donne déjà
  la matière ; ce qui manque est un TÉMOIN par rôle — et il ne peut pas venir de l'hôte : relier un
  événement reçu au rôle qui l'attend est le mandat de `@map`, en aval.
- **KAN-14** `fait` (14e8ee8, 2026-07-27) — **Suppression de fichier** : livrée. `workspace.removeFile`
  est le SEUL point d'entrée (corbeille de l'arbre local + façade v14 `removeFile(chemin)`), avec
  confirmation EN LIGNE reprise de l'arbre du nuage, et un libellé qui dit la vérité des deux côtés
  (un document du nuage projeté ici se RETIRE, il ne se supprime pas). Ni renommage ni déplacement :
  l'écart avec l'arbre du nuage est mesuré et signalé, pas comblé de moi-même.
  Texte d'origine : Kanopi n'avait aucune suppression de fichier (ni bouton/menu contextuel dans l'arbre, ni API store `removeFile`). Seule la commande `workspace.reset` (palette) nettoie — globalement. Ajouter une suppression par fichier (FileTree + `workspace.removeFile` + persistance). Trouvé en session 2026-06-20.

## Bibliothèque (corpus)

- **KAN-37** `ouvert` **— BLOQUÉ EN AMONT, NE PAS TOUCHER LA SCÈNE AVANT** ([1063], 2026-07-29) —
  **`synthesis/patchbay.bps` n'a rien à jouer pendant qu'elle branche.** Romain : un câblage n'a
  pas de durée ; quand le câblage cessera d'occuper le temps (décidé, livraison bpscript), cette
  scène passera de huit secondes à ZÉRO et deviendra injouable. Ce n'est pas le modèle qu'on plie
  — c'est la scène qui est fausse.
  **Mesuré ici, pas rapporté de confiance** (dérivation BPx, graine 1) : `terminals` = les 8
  symboles `lead open lead close lead glide lead close`, tous des macros de câblage/action,
  **zéro note** ; `beatEdges` = `[0 … 8000]`, soit 8 temps de 1000 ms — la durée entière de la
  pièce vient donc du câblage, et de rien d'autre. La clame de l'architecte est exacte.
  **À faire quand bpscript aura livré la nature du câblage** : réécrire la scène pour qu'elle
  JOUE quelque chose pendant qu'elle branche. Écrire avant = écrire contre une forme qui bouge.

## Éditeur

- **KAN-15** `ouvert` — **Validation `.gr` (indicateur de compilation)** : `programCompileStatus` n'est applicable qu'au `.bps` (via `compileToBPxAST`). Le `.gr` natif se parse par `parseBP3` (validateur différent, nécessite la plomberie d'alphabet) ; lancer le transpileur `.bps` dessus donnait une fausse erreur → restreint au `.bps`. Pour donner au `.gr` un vrai indicateur, brancher `parseBP3` (deux passes alphabet) dans `programCompileStatus`. 2026-06-20.

## Production / projection (post-bêta)

- **KAN-16** `ouvert` — **Replier les parcours d'arbre sur `flattenTree` par calques** : BPx a livré l'API de projection par calques (PROJECTION.md). Replier `treeToDispatchEvents` (audio), `orderedTokensFromTree` (texte), `bpxTreeToTimelineStream` (piano-roll) et le sink MIDI en projections d'une seule linéarisation. Après validation/déploiement bêta Romain.

## Performance lecture (si besoin)

- **KAN-17** `fait` — **Calque dédié au curseur** : `timeline.setCursor` repeint tout le piano-roll ; coût ∝ taille de la production. Si une grosse scène sature au profilage (onglet 1er plan), repeindre seulement la ligne du curseur sur un calque séparé. cf `docs/design/PLAYBACK_LOOP.md`.  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-arabic** `fait` [P1] — NON-WESTERN : arabic.bps derive 0 note -> chemin audio muet (routage Kanopi de la resolution Kronos, pas BPx ni Kronos) _(fait: non reproductible — dérive 19 notes + sonne (RMS 0.19) deux chemins ; résolu 9fed744)_

## Audit conformité 2026-06-24 (65 findings, clusters A-G)

- **KAN-A01** `ouvert` — [haute/CONFIRMED] stores/scenes.svelte.ts:18 — `active` non projeté ; pilote le vrai mute audio (D5)
- **KAN-A02** `ouvert` — [moyenne/PLAUSIBLE] lib/core-real/real-core.ts:378 — `replayActiveScene` force active:true partout au Play (D5)
- **KAN-A03** `ouvert` — [moyenne/PLAUSIBLE] lib/core-real/real-core.ts:336 — `silenceRuntimes` force active:false partout (D5)
- **KAN-A04** `ouvert` — [basse/PLAUSIBLE] lib/core-real/real-core.ts:114 — publish force active:true (prétend un fait Kronos) (D5)
- **KAN-A05** `ouvert` — [moyenne/CONFIRMED] lib/persistence/snapshot.svelte.ts:46 — restaure activeScene/activeActors depuis localStorage (D5) _(precision 2026-07-31 : activeScene a disparu de PersistedWorkspace — snapshot.svelte.ts ne restaure plus que activeActors (aujourd'hui lignes 61-64, pas :46). Le fond du constat D5 (restaurer un etat "actif" depuis localStorage) reste vrai pour activeActors seul.)_
- **KAN-A06** `fait` — [moyenne/PLAUSIBLE] components/topbar/BpsScenesBar.svelte:18 — litScene optimiste avant l'await, sans rollback (D5)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-A07** `ouvert` — [moyenne/CONFIRMED] components/right-panel/InspectorPanel.svelte:38 — compte filter(a=>a.active) (D5)
- **KAN-A08** `ouvert` — [moyenne/CONFIRMED] components/editor/Tab.svelte:9 — live-dot vert depuis a.active (D5)
- **KAN-A09** `abandonné` — [moyenne/CONFIRMED] components/right-panel/ScenesPanel.svelte:32 — class:active={s.active} (D5) _(abandonné 2026-07-30 : ScenesPanel.svelte supprimé au commit be1d009 (2026-07-09, « bandeau droit en widgets empilés » — KAN-UX1), donc AVANT le retrait du sous-système scènes (1ef3e0b, 2026-07-30) qui ne touche pas ce fichier. Le fichier cité n'existe plus, le constat n'a plus d'objet.)_
- **KAN-A10** `bloqué` — [haute/CONFIRMED] lib/runtimes/bpx-adapter.ts:1461 — withDefaultScene injecte une scène par défaut non sourcée (D5) _(bloqué: modele corrige (Romain 2026-06-24) : le defaut n est PAS injecté par Kanopi -> retirer withDefaultScene ; le defaut entre dans l AST via BPScript (BPS-defaut-env). Kanopi fournit juste l environnement)_
- **KAN-A11** `fait` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:222 — règle "scène=plus petit int" inventée + dupliquée dans bpsScenes.svelte.ts:55 (D5)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-B01** `fait` — [haute/CONFIRMED] lib/runtimes/bpx-adapter.ts:1845 — soundsFn occidental → alphabet non-western SKIP = arabic.bps MUET (D1/D3) _(fait: non-western PROUVE ECRAN (arabic 0->15 notes, RMS 0.128) ; 3 portes western remplacees par resolver.sounds() alphabet-aware — d510fbf)_
- **KAN-B02** `fait` — [moyenne/PLAUSIBLE] lib/runtimes/bpx-adapter.ts:1651 — productionSounds 2e prédicat → afficheur ment sur sonne/muet (D1) _(fait: idem B01 (productionSounds + orchestratedFilter:1890, la 3e porte trouvee a l ecran) — d510fbf)_
- **KAN-B03** `fait` — [moyenne/CONFIRMED] lib/runtimes/kronos-audio.ts:598 — rq.transpose détecté jamais appliqué → mauvaise hauteur (D1/D9) _(bloqué: transpose detecte non applique — pas de primitive ; escalade Kronos (offset par note en resolution ; controls.json = transpose runtime/\_script fait autorite). Item KRO-transpose ouvert)_ _(fait: transpose = fonction de librairie digitale, appliquée par Kairos, hardcode retiré ; {Tr2}→D4 prouvé à l'écran (non-circulaire))_
- **KAN-B04** `fait` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:778 — alphabet:'western' forcé pour @actor sans alphabet (D7)
- **KAN-C01** `fait` — [haute/CONFIRMED] stores/kronos-cursor.svelte.ts:137 — compteurs #absBeat/#absBar ≠ position Kronos (repliée) (D2)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-C02** `fait` — [haute/CONFIRMED] lib/runtimes/kronos-audio.ts:313 — longueur de boucle = reduce(max) hôte vs totalDurationBeats BPx (D2/D7) _(fait: loop length projette totalDurationBeats BPx (fc4bba5) ; preuve NON circulaire (mutation du champ deplace la borne) — apres auto-correction honnete)_
- **KAN-C03** `fait` — [moyenne/PLAUSIBLE] core/dispatcher.js:145 — jumeau reduce(max) ; dispatcher.duration préféré à la durée BPx (D2) _(fait: idem C02 — fc4bba5)_
- **KAN-C04** `fait` — [moyenne/CONFIRMED] stores/playback.svelte.ts:112 — STEP recalcule prochain battement + 2e repli de boucle hôte (D2)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-C05** `fait` — [moyenne/CONFIRMED] `lib/runtimes/kronos-audio.ts` → `pauseAtBeatEnd` (mort) recalculait frontière+pliage (D2) _(fait: D/E #2, poussé (gate vert 198/198) ; le symbole a disparu du fichier)_
- **KAN-C06** `fait` — [moyenne/PLAUSIBLE] `stores/production.svelte.ts` → `beatCount` : quantification (epsilon/ceil) inventée (D2/D7)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
  ⚠️ **mesuré le 2026-07-31 : `beatCount` est RETIRÉ du fichier** (commentaire l.105 « est RETIRÉ »).
  Le défaut décrit n'a plus de site. À requalifier par Kanopi — je constate, je ne tranche pas.
- **KAN-C07** `ouvert` — [moyenne/CONFIRMED] lib/runtimes/kronos-audio.ts:222 — BEATS_PER_BAR=4 en dur (3e copie) (D7)
- **KAN-C08** `fait` — [moyenne/CONFIRMED] stores/kronos-cursor.svelte.ts:125 — events bar floor(beat/4), ignore beatsPerBar (D7)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-C09** `fait` — [moyenne/CONFIRMED] stores/clock.svelte.ts:73 — store #beatsPerBar = signature d'autorité hôte (D7) — DÉBLOQUÉ result.meter _(fait: mètre affiché RESSERRÉ (verdict b, kanopi a03f7fd) — vérifié : les LED dérivent de kronosCursor.active.beatsPerBar (autorité BPx DeriveResult.meter) ; #beatsPerBar + setTimeSignature (input mort) + chaîne setMeterSink RETIRÉS ; défaut si pas de scène. Preuve écran 4/4→4 LED. Plus de copie hôte qui dérive)_
- **KAN-C10** `fait` — [moyenne/CONFIRMED] stores/clock.svelte.ts:24 — currentBpm=128 : 2e copie tempo (grille STEP) (D7/D9) _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-C11** `fait` — [moyenne/CONFIRMED] stores/clock.svelte.ts:27 — clampBpm [20,300]+arrondi : politique tempo inventée (D7) _(fait: clampBpm LÉGITIME + documenté (kanopi) — borne de saisie D10 (état propre Kanopi), ne touche jamais le tempo de scène (tree.metadata.tempo BPx). Pas de sur-ingénierie (verdict architecte))_
- **KAN-C12** `fait` — [basse/CONFIRMED] components/topbar/TransportCluster.svelte:56 — n° barre (Kronos BPB=4) ≠ nb LEDs (D7)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-C13** `fait` — [basse/CONFIRMED] components/topbar/TransportCluster.svelte:62 — dots vs pos.beat, 2 signatures (D7)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-C14** `fait` — [moyenne/CONFIRMED] components/topbar/TransportCluster.svelte:61 — commentaire "@time 7/8→7 dots" faux (D7)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-C15** `fait` — [basse/CONFIRMED] components/topbar/TransportCluster.svelte:93 — clamp saisie [20,400] ≠ store [20,300] (D7)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-C16** `ouvert` — [basse/PLAUSIBLE] components/topbar/TransportCluster.svelte:79 — writeTempoToScene réécrit @mm au TAP (mute la source) (D1/D3) — ESCALADE archi
- **KAN-C17** `fait` — [basse/PLAUSIBLE] lib/persistence/snapshot.svelte.ts:39 — tempo restauré depuis localStorage (autorité tempo) (D7/D1)
- **KAN-C18** `fait` — [basse/PLAUSIBLE] components/statusbar/Statusbar.svelte:15 — commentaire évoque une signature non appliquée (D2)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-D01** `fait` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:412 — headSectionNames re-parse la source .gr (pilote STEP) (D3)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-D02** `fait` — [moyenne/CONFIRMED] lib/runtimes/head-sections-ast.ts:137 — sectionLeafCounts = mini-évaluateur de grammaire (D9)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-D03** `fait` — [moyenne/PLAUSIBLE] lib/runtimes/head-sections-ast.ts:117 — headSectionsFromAst re-marche le RHS (D3)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-D04** `fait` — [moyenne/PLAUSIBLE] lib/timeline/timeline.js:334 — analyseur de grammaire maison (regex), branche morte mais prête (D3/D9) _(fait: D/E #2, poussé (gate vert 198/198))_
- **KAN-D05** `ouvert` — [moyenne/CONFIRMED] lib/library/referenced.ts:172 — .gr passé au mauvais parseur (compileBps) (D3)
- **KAN-D06** `ouvert` — [basse/CONFIRMED] lib/library/referenced.ts:80 — directivesFromText regex = parseur @ dupliqué (D9)
- **KAN-D07** `ouvert` — [basse/PLAUSIBLE] components/editor/lang-bpscript.ts:219 — hoverHitAt re-parse 5 regex (D9) — partiel ESCALADE amont
- **KAN-D08** `fait` — [basse/CONFIRMED] lib/runtimes/mm-directive.ts:12 — parseMmDirective regex (mort ; AST l'expose) (D9/D3) _(fait: D/E #2, poussé (gate vert 198/198))_
- **KAN-D09** `fait` — [basse/PLAUSIBLE] lib/text-order/bpx-tree-canonical.ts:59 — re-sérialise l'arbre→texte (grammaire d'ordre dupliquée) (D3/D9)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-D10** `fait` — [basse/PLAUSIBLE] lib/text-order/bpx-tree-canonical.ts:49 — idem (D9) — ESCALADE BPx : sérialiseur amont tree→ordre  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-D11** `fait` — [basse/CONFIRMED] components/topbar/StrudelStatusPill.svelte:31 — scan regex strudel: au lieu de la table de backticks (D9)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-D12** `fait` — [basse/PLAUSIBLE] lib/runtimes/bpx-adapter.ts:955 — bornes de sections .gr par division égale (structure inventée) (D3) — ESCALADE BPx/archi  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-E01** `fait` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:670 — modulatorsFromAst duplique buildModulators (D9) _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-E02** `fait` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:1771 — registre modulateurs forwardé à zéro consommateur (D9) _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-E03** `fait` — [basse/CONFIRMED] lib/runtimes/bpx-adapter.ts:641 — CVLib/CV*LIBS redéclarent le schéma mod.json (D9) *(fait: D/E #1, poussé (gate vert 203/203))\_
- **KAN-E04** `fait` — [moyenne/CONFIRMED] lib/runtimes/tree-dispatch.ts:328 — resolveCvControls morte, gardée par son test (D9) _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-E05** `fait` — [moyenne/CONFIRMED] lib/runtimes/cv-table.test.ts:3 — test cimente modulatorsFromAst mort (D9) _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-E06** `fait` — [moyenne/CONFIRMED] lib/runtimes/section-bounds.test.ts:4 — test cimente sectionLeafCounts hôte (D9/D3)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-E07** `fait` — [basse/PLAUSIBLE] core/dispatcher.js:106 — _modulators + setModulators inertes (double forward mort) (D9) _(fait: D/E #1, poussé (gate vert 203/203))\_
- **KAN-E08** `fait` — [basse/PLAUSIBLE] core/dispatcher.js:83 — champ def de _actors jamais lu (commentaire trompeur) (D9) _(fait: D/E #2, poussé (gate vert 198/198))\_
- **KAN-E09** `fait` — [basse/CONFIRMED] core/dispatcher.js:80 — champ transport de _actors toujours null (branche pickTransport morte) (D9) _(fait: D/E #2, poussé (gate vert 198/198))\_
- **KAN-E10** `ouvert` — [moyenne/PLAUSIBLE] stores/production.svelte.ts:59 — types ProductionTree\* = miroir manuel de l'arbre BPx (as unknown as) (D9)
- **KAN-E11** `fait` — [basse/PLAUSIBLE] lib/text-order/bpx-tree-canonical.ts:110 — makeNameResolver dupliqué (canonical vs stream) (D9)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-E12** `fait` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:1183 — runtimeForInterp = 2e table interp→runtime (D9)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-E13** `fait` — [basse/CONFIRMED] lib/runtimes/bpx-adapter.ts:1642 — treeToDispatchEvents appelé 2× par eval (perf/D1)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-E14** `fait` — [basse/PLAUSIBLE] lib/runtimes/kronos-audio.ts:407 — pickTransport repli sur 1er transport énuméré (routage fabriqué) (D9/D1)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-F01** `ouvert` — [moyenne/CONFIRMED] stores/workspace.svelte.ts:18 — starterFiles() auto-amorce main.bps/second.bps (faux disque) (D6)
- **KAN-F02** `ouvert` — [moyenne/CONFIRMED] lib/workspace/types.ts:33 — extension absente/inconnue → runtime 'bpscript' deviné (D7/D5)
- **KAN-F03** `abandonné` — [basse/CONFIRMED] components/right-panel/ScenesPanel.svelte:7 — runtimeOf ?? 'bpscript' (couleur non prouvée) (D7/D1) _(abandonné 2026-07-30 : ScenesPanel.svelte supprimé au commit be1d009 (2026-07-09, « bandeau droit en widgets empilés » — KAN-UX1), donc AVANT le retrait du sous-système scènes (1ef3e0b, 2026-07-30) qui ne touche pas ce fichier. Le fichier cité n'existe plus, le constat n'a plus d'objet.)_
- **KAN-F04** `ouvert` — [basse/CONFIRMED] components/statusbar/Statusbar.svelte:57 — compteur devices codé à 0 (vraie source listPorts()) (D7)
- **KAN-F05** `fait` — [basse/CONFIRMED] components/sidebar/DocsView.svelte:171 — doc "CC→60-180 BPM" : plage inventée + mapping non implémenté (D7)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-G01** `fait` — [basse/CONFIRMED] components/right-panel/InspectorPanel.svelte:27 — Pause replié en "stopped" (3e état Kronos non projeté) (D2)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-kairos** `fait` — Migration Kairos : (1) ne plus JAMAIS muter l arbre de production -> adresser des demandes a Kairos (tempo/mute/arm via demande()) ; (2) ne JAMAIS toucher l AST -> fournir l environnement (defauts) en entree de transpilation BPScript. Cf hub/projets/2026-06-24-spec-ecriture-structure/README.md _(fait: GARDE §Garde 7 anti-mutation arbre/AST posé + prouvé mordant (kanopi a03f7fd, scripts/arch-hote-runtimes.mjs) — vérifié sur pièces : guard vert (§6+§7), host à 0 (arm/mute=setNoteMuted+evalCode, AST via options createSession). Morsure : inject 'derived.tree.metadata={}' → §7 exit 1 → retrait → re-vert. Zéro faux positif)_
- **KAN-C20** `fait` — DEFAULT*BPM=128 + clampBpm[20,300] = constantes hote NON sourcees (repli affichage, hors chemin d autorite) — A SOURCER via l environnement ; lien direct point-1 defauts (BPS-defaut-env) *(fait: constante hote 128 retiree (clock #tempo=null) ; M5 tempo via env->AST prouve ecran 3/3 (a5f681c))\_
- **KAN-Abis** `ouvert` — Predicat audio utilise le resolveur de SCENE (pas per-acteur) ; passer per-feuille via resolverFor(actor.alphabet) quand A\* composera activeActors x sounds (escalade)
- **KAN-purete** `ouvert` — PURETE (Romain, radical, MAINTENANT) : devenir HOTE PUR — extraire le rendu de production vers runtime-ui (vue Texte = text-order+TextStreamPanel ; vue Timeline = timeline+TimelinePanel ; UN runtime, 2 vues) + aplatissement tree-dispatch -> Kairos, SUPPRIMER ces rendus de Kanopi, ROUTER la donnee, rendre ZERO production. Kanopi = surface + gestes + cablage des runtimes. Perte d affichage temporaire acceptee
- **KAN-kro24** `fait` — Migration KRO-24 : retirer l appel HOTE a composeTreeModulations (composition CV) -> il MIGRE chez Kairos (qui detient l arbre, appelle la Couche-1 Kronos a l aplatissement). GO quand Kairos l a integre _(fait: composition CV migrée hors hôte (kanopi 24d4e01, cv-sur-arbre) — vérifié sur pièces : buildModulators a QUITTÉ l'hôte (que des commentaires), les 3 charger() passent modulation:{modLib,exprSource} seul, Kairos lit tree.metadata.cvInstances + compose. Garde 'cv' cliquet ajouté prouvé mordant. Preuve écran superp-cutoff.bps : RMS 0.269, centroïde spectral varie (cutoff balaie), 0 erreur)_
- **KAN-18** `fait` [P2] — M2/M3 — bugs d'AFFICHAGE des vues Texte/Timeline repérés au test Romain ; liste à fournir ; passe de correction (rendu→runtime-ui / données→feed Kanopi+Kairos / transport→Kronos). Architecture OK, c'est de la qualité d'affichage. _(fait: constat Romain post-refactos+fix timeline : affichage OK ; fix molette 422c2f7 + lot étape 4 livrés)_
- **REV-F01** `fait` [P1] — Stop/Pause inertes sur voix de code autonomes (.strudel/.hydra/.tidal/.p5) — playback.svelte.ts:97 ; regression **hush** vers **stop_in_place** non honoré (b61531e) ; le son continue sur Stop _(fait: chantier voix-code-transport S2 : relais lifecycle transport→moteurs (gel réel/reprise resync/tais-toi) + voie B (transport Kronos partagé des voix autonomes) + sentinelles Model C réservées bpx (le re-flush fantôme relançait la voix, vu écran). PROUVÉ timeline RMS : stop → ~400ms de queue puis 0 strict ; résidu ≤1 note ordonnancée routé runtime-codevoices)_
- **REV-F02** `fait` [P1] — Eval voix-code = transport affiché STOPPED — real-core.ts:313 ; invariant 'eval qui sonne donc playing' non rétabli ; UI contredit l'audio (784fa44) _(fait: voie B : éval .strudel autonome ⇒ transport Kronos RUNNING à l'écran (capture), BPM honnête (— sans tempo de session, 120.0 après réglage, warp suivi) ; position/bar.beat avancent)_
- **REV-F03** `fait` [P1] — STEP saute un temps sur deux — playback.svelte.ts:112 ; lit beatPosition brut (K+1) au lieu du compensé, moitié de la prod inaudible au pas-à-pas _(fait: non reproductible à l'écran (step ×8 arabic = beats [1..8] consécutifs, beatPosition compense))_
- **REV-F04** `fait` [P1] — Espace traite pause comme stop — bindings.ts:73 ; pause + Espace donne stop + playhead remis à 0, position de pause perdue _(fait: a07789b — ternaire playing?stop:play, paused+stopped reprennent)_
- **REV-F05** `fait` [P1] — Unmute-all (Ctrl+0) laisse une voix orchestrée muette — mock-runtime.ts:48 ; court-circuite setMuted/onMute, voix reste silencieuse _(fait: d1997d1 — unmuteAll route via setMuted, onMute réarme la voix)_
- **REV-F06** `fait` [P1] — Fuite de tempo inter-scène — bpx-adapter.ts:1537 ; garde réentrance défait par microtâche, scène sans @mm dérive au tempo de la scène précédente _(fait: b2dd251 — canal setSceneTempo, userTempo intouché (leak tué), test tempo-scene-channel)_
- **REV-F07** `fait` [P1] — Tempo de scène projeté écrêté [20,300] — clock.svelte.ts:69 ; @tempo 16 ou 400 forcé à 20/300, grille STEP désaccordée du tempo dérivé _(fait: b2dd251 — setSceneTempo sans clamp (400/16 non écrêtés))_
- **REV-F08** `fait` [P1] — Socket OSC ouverte en phase produce, contrat buildOnly violé — kronos-audio.ts:289 ; WebSocket ouverte sans Play sur scène OSC _(fait: b8ec113 — montage OSC gardé !buildOnly (kronos-audio.ts:303))_
- **REV-F09** `fait` [P1] — Notation scientifique non bornée vers Infinity vers RangeError AudioParam — dispatcher.js:35 ; (cutoff:1e400) coercé Infinity, note muette au lieu de dégradation propre _(fait: 6a1663f — Number.isFinite garde, non-fini reste string, plus d'Infinity)_
- **REV-F10** `fait` [P1] — AUTORITE INVENTEE: BEATS*PER_BAR=4 codé en dur au lieu de result.meter — kronos-cursor.svelte.ts:38/127/130, clock.svelte.ts, kronos-audio.ts:205/646 ; casse mesures additives/maqâm. Principe dur. [GO host en cours] *(fait: 8634ec1 — lit result.meter, défaut 4/4, meter.test.ts vert)\_
- **REV-F11** `fait` [P2] — .gr re-parsé depuis le TEXTE (anti-pattern) — bpx-adapter.ts:392/382 ; deux lecteurs de section divergents .gr (texte) vs .bps (AST) _(fait: b9ce746 — lecteur AST unifié .gr/.bps, scan-texte buggé supprimé, test verrou gr-head-sections (6 verts))_
- **REV-F12** `bloqué` [P2] — mmFromAst ne reconnaît que mm, pas @tempo — bpx-adapter.ts:494 ; cause racine partiellement AMONT (BPx ne route pas @tempo). A coordonner BPx _(bloqué: DEP: bloqué par langage LAN-3 (BPScript route encore @mm->\_mm, pas @tempo, libs.js:172). Une fois LAN-3 fait: lire @tempo seul. Cluster elimination @mm.)_
- **REV-F13** `bloqué` [P2] — writeMmDirective ne réécrit que @mm, pas @tempo — mm-directive.ts:16 ; 100 pourcent hôte, changement BPM non réécrit sur scène v0.8 _(fait: b66f0c7 — MM_RE reconnaît @mm ET @tempo, mot-clé préservé, test vert)_ _(bloqué: DEP: bloqué par LAN-3. But OK (reecriture directive sur changement tempo UI, TransportCluster:84) mais doit etre @tempo-SEUL (retirer @mm). Forme canon @tempo:N (decision 2026-06-26).)_
- **REV-F14** `fait` [P2] — Code mort post-KAI-10: scaleSystemFromAst + champs alphabet/tuning scène + commentaires invitant à recâbler une résolution hauteur hôte — bpx-adapter.ts:474 (risque anti-pattern) _(fait: f939d8f — scaleSystemFromAst + champs morts + commentaires corrigés)_
- **REV-F17** `bloqué` [P2] — Démo dual-actors-audio.bps en forme v0.7 (alphabet:western au lieu de alphabet.western) — :8/:9 ; migrer deux-points vers point _(bloqué: DEP: cluster @mm/LAN-3. Migrer alphabet:western transport:webaudio -> alphabet.western transport.webaudio (canon point). Apres LAN-3.)_
- **REV-F18** `bloqué` [P2] — Démo cv-adsr.bps en @mm:138 périmé — :4 ; migrer @mm vers @tempo ; couplage pervers avec REV-F12 _(bloqué: DEP: cluster @mm/LAN-3. Migrer @mm:138 -> @tempo:138 (canon, decision 2026-06-26). Apres routage @tempo (LAN-3).)_ ⚠️ STATUT PERIME, MESURE LE 2026-08-13 (signale par atlas, remesure chez moi) : `packages/library/scenes/cv/cv-adsr.bps:22` porte `@tempo:138`. La scene EST migree ; l item decrit un etat qui n existe plus et porte pourtant encore `bloque`. JE NE LE CLOS PAS — je reporte, l architecte clot. ⚠️ CE QUI RESTE PEUT-ETRE VRAI DANS L ITEM, et qui n est pas la scene : le COUPLAGE avec REV-F12, c est-a-dire mon lecteur `mmFromAst` qui ne lit toujours que `mm`. La carte du reel le dit desormais sur place (`docs/arch/carte-reel.md:270`) : `@mm` est une compatibilite d ENTREE BP3, le compilateur le REFUSE en BPScript et renvoie a `@tempo` (`BPscript/src/transpiler/parser.js:1819`, verifie ce jour). Un STATUT est une affirmation d etat : il vieillit comme les autres et se remesure au lieu de se recopier.
- **REV-F15** `fait` [P3] — Carte acteur vers transport du Dispatcher morte + commentaires trompeurs — dispatcher.js:69 (post-KAI-9) ; ~30 lignes mortes _(fait: 4e499da — carte acteur->transport morte supprimée + en-têtes)_
- **REV-F16** `fait` [P3] — Relais play/stop/toggle morts du store clock — clock.svelte.ts:53 ; zéro appelant, piège de double-indirection _(fait: 0809935 — relais play/stop/toggle morts supprimés)_
- **REV-F19** `ouvert` [P3] — Boucle rAF du curseur jamais annulée (~60fps à vide à vie) — kronos-cursor.svelte.ts:75 ; CPU/batterie sur éditeur au repos
- **REV-F20** `ouvert` [P3] — rAF réassigne beat à chaque frame même à l'arrêt — kronos-cursor.svelte.ts:166 ; nouvel objet à chaque appel, churn réactif ~60x/s scène arrêtée
- **REV-F21** `fait` [P3] — $effect re-projette toute la production à chaque geste transport — ProductionViewHost.svelte:13 ; à-coup visible sur grande scène _(fait: corrigé 73d75f5 — ne relit la projection que sur generation)_
- **REV-F22** `ouvert` [P3] — publishProduction mappe la liste de tokens 2x par éval — bpx-adapter.ts:874 ; deux passes O(n) et deux allocations
- **REV-F23** `fait` [P4] — Trois méthodes broadcast quasi identiques — real-core.ts:320 ; silenceRuntimes/stopInPlace/replayActiveScene à fusionner. [GO host en cours] _(fait: 04cfdea — broadcast() refactor PUR, sentinelles+LED inchangées)_
- **REV-F24** `fait` [P4] — Double bornage du BPM (400 puis 300) — TransportCluster.svelte:101 ; 350 paraît accepté puis ramené à 300. [GO host en cours] _(fait: 1a8ee9d — double bornage retiré, setBpm seul propriétaire)_
- **REV-F25** `fait` [P4] — fmt2/fmt3 triplicés — Statusbar.svelte:8, TransportCluster.svelte:41, InspectorPanel.svelte:7. [GO host en cours] _(fait: ee0fa0c — fmt2/fmt3 extraits, sortie octet-identique)_
- **REV-F26** `fait` [P4] — Octet NUL dans compile-cache.ts:23, git classe le fichier binaire, invisible en diff/grep. [GO host en cours] _(fait: 29f17ac — octet NUL remplacé, fichier redevenu texte)_
- **REV-F27** `fait` [P4] — PLAUSIBLE tap-tempo division par zéro vers saut à 300 BPM — clock.svelte.ts:93 ; à confirmer _(fait: tap-tempo : garde deltas>0, plus de saut a 300 (b249e08 local, push des 5173 libere))_
- **REV-F28** `fait` [P4] — PLAUSIBLE isControlTerminal copié octet-pour-octet — bpx-adapter.ts:382 ; à confirmer _(fait: b9ce746 — copie isControlTerminal supprimée avec le scan-texte (bundlé F11))_
- **REV-F29** `fait` [P4] — PLAUSIBLE state.playing/paused = 2e projection de kronosCursor.state — clock.svelte.ts:49 ; à confirmer _(fait: clock state derive de kronosCursor (une seule source), b249e08 local)_
- **REV-F30** `ouvert` [P4] — PLAUSIBLE teardown des voix de code sortantes séquentiel — bpx-adapter.ts:1711 ; await en série au lieu de Promise.all
- **REV-F31** `fait` [P4] — PLAUSIBLE scrub défensif CV peut masquer une fuite amont — kronos-audio.ts:355 ; confirmer contrat avec Kairos avant suppression  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **REV-F03b** `ouvert` [P4] — LED en pas-à-pas PAUSÉ lit K+1 — activeBeat()/kronos-audio.ts:647-654 ; cas-bord d'affichage LED distinct de REV-F03 (lecture continue OK), signalé honnêtement par Kanopi
- **KAN-19** `fait` [P2] — C1 PRINCIPAL (décision Romain) : l'hôte ASSEMBLE le contexte de résolution — bpx-adapter.ts importe bpscript/lib/{alphabets,tunings,temperaments,octaves,scales}.json+mod.json, assemble PITCH_LIB + buildModulators, injecte ctx.pitchLib+modulation.registry dans kairos.charger(). Mécaniquement ne résout/compose RIEN (Kairos le fait) mais porte la DATA du domaine + dépend de la forme bpscript/lib. Décision : câblage hôte légitime, ou faire voyager catalogues+registre dans la donnée (modèle KAI-9) ?  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-20** `fait` [P3] — C2 : extract-blocks.ts re-parse le TEXTE des onglets (store blocks + CMEditor) — confirmer en phase 2 : affordance d'éval éditeur (légitime) vs lecture de structure (interdit, = lire l'arbre) _(fait: tick post-pause déjà correct (playback.svelte.ts:83-89, driver.stop seulement sur stop) ; setStepGrain retiré (kronos-audio.ts:548, commit local, ride prochain push))_
- **KAN-21** `fait` [P3] — C3 : coerceControlValues (core/dispatcher:23) coerce string→number côté HÔTE ; le contrat runtime-midi place la coercition AU RUNTIME — à trancher où elle vit _(fait: Onglets bas = Structure·Texte·Console, défaut Structure (816df95 local). Bonus : id 'timeline'→'structure' canonisé (rétrocompat). svelte-check 0 err, persistance 2/2.)_
- **KAN-22** `ouvert` [P4] — C4 (mineur) : commentaires/stubs périmés — flattener treeToDispatchEvents disparu (bpx-adapter:52-54), stub order-tokens supersédé par vues-à-calques
- **KAN-23** `ouvert` [P4] — C6 : 8 cycles internes préexistants (no-circular=warn dans le garde pendant l'assainissement) — à résorber
- **KAN-24** `fait` [P2] — E4 (cross-repo, architecte) : le contrat hub kanopi-runtime-midi.md INTERFACE PINNÉE (2026-06-13) fige MidiSink, mais le dispatch VIVANT utilise MidiTransport (runtime-midi.d.ts:35 'canonical Kronos TransportLike for MIDI' ; bpx-adapter.ts:1747 new MidiTransport ; kronos-audio.ts:290). MidiSink déclaré mais NON utilisé → l'étalon fige la mauvaise surface. À réconcilier avec runtime-midi avant ratification du contrat MIDI _(fait: PÉRIMÉ-RÉSOLU : le contrat kanopi-runtime-midi a été RE-RATIFIÉ v2 post-KAI-10 (hub f758234, 2026-07-04) — l'INTERFACE PINNÉE MidiSink y est explicitement RETIRÉE (§Ce qui est retiré du contrat périmé v1), la surface vivante (adaptateur uniforme createMidiRuntime) est l'étalon. Puis amendé sélection-device (7ab2bf3, 2026-07-09). L'écart signalé n'existe plus.)_
- **KAN-25** `ouvert` [P4] — E5 (architecte) : pas de contrat hub kanopi-runtime-osc.md (il existe pour midi et codevoices) — créer le contrat de frontière OSC manquant
- **KAN-mvp** `fait` [P0] — Preuve d'acceptation MVP : une vraie scène jouée de BOUT EN BOUT à l'écran dans l'app (éditeur→BPx→Kairos→Kronos→runtime→webaudio), son ET UI propres et fluides. Viser une scène simple (notes) en cœur + une scène à modulation CV SI la syntaxe BPScript-CV existe (sinon noter le manque langage). _(fait: capstone prouvé à l'écran (build frais) : scène notes RMS 0.116 + scène CV-adsr RMS 0.189, UI propre, 0 erreur console)_
- **REV-env-route** `ouvert` [P2] — Voix de CONTRÔLE (sélecteurs d'enveloppe env1/2/3) routée vers le puits AUDIO comme events note muets (warning content.pitch absent) — la scène sonne, mais ces tokens-sélecteurs ne devraient pas atteindre le runtime audio. Propreté routage/projection.
- **KAN-19** `fait` [P1] — Exposer une scène indienne (raga/sargam) TESTABLE+audible dans la bibliothèque — fixtures BPscript/scenes/\*.bps jamais branchées  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-20** `fait` [P2] — Hôte/transport : le driver doit CONTINUER à tiquer après pause() (sinon le gel différé CVA-1 ne se finalise pas) + retirer l'appel setStepGrain déprécié (kronos-audio.ts:548) _(fait: tick post-pause déjà correct (playback.svelte.ts:83-89, driver.stop seulement sur stop) ; setStepGrain retiré (kronos-audio.ts:548, commit local, ride prochain push))_
- **KAN-21** `fait` [P2] — Onglets du bas : ré-ordonner en 1=Structure (défaut sélectionné) / 2=Texte / 3=Console _(fait: Onglets bas = Structure·Texte·Console, défaut Structure (816df95 local). Bonus : id 'timeline'→'structure' canonisé (rétrocompat). svelte-check 0 err, persistance 2/2.)_
- **KAN-MUTE** `fait` — Bouton mute live du performeur : couche persistante d'etat utilisateur (semantique Mute de piste Ableton) survivant au stop->play, par-dessus l'armement compose, jamais effacee par reset() _(fait: livré par le mixer KAN-UX3 (d803443+b00faff) — boutons M master/par-acteur, intention persistée kanopi.mixer.v1, gardes real-core aux points d'armement/replay (un arm/unmute d'armement ne ré-arme jamais un acteur mixer-muet), prouvé écran ; ride le prochain push)_
- **CVA-CURSOR** `ouvert` — BUG curseur : apres arret puis lecture, la barre de lecture ne reprend pas (localiser position-transport vs rendu rAF ; suspect rework replay reset()+play)
- **CVA-BLOCK1** `ouvert` — BUG 1er bloc : le bloc avant le 1er silence n'a pas cutoff:env1 correctement applique (localiser armement Kairos vs realisation runtime-audio)
- **STEP-A-SILENT** `fait` — BUG STEP-A : le bouton step avance la barre mais ne produit AUCUN son (emission d'evenements manquante au step ?) _(fait: CLOS sur pièces (contre-preuve écran kanopi 2026-07-10 00:40, build frais dist kronos 714c021) : 3 steps depuis stopped → RMS 0.1159/0.1157/0.1159 (>0, ça SONNE, vs 0/0/0 avant) + curseur GLISSE continûment (11/11 échantillons croissants par fenêtre, 0→0.666→1.333→2.000, arrêt pilé sur la frontière, état paused). Fix kronos = step() phase running (replay/resume au départ), gel à la borne via #freezeAt (1ef4355+714c021), modèle 'tête voyage' ratifié Romain 2026-07-09. Loi gravée TRANSPORT_API §9-(b) + runtime-adapter.ts.)_
- **STEP-B-DESYNC** `fait` — BUG STEP-B : play apres un step = pas de barre + le son saute plusieurs pas avant de reprendre (position/curseur desync post-step ; interaction replay() reset ?) _(fait: NE REPRODUIT PLUS sur build frais 2462661 (banc écran kanopi [1749]) : play après 3 steps = reprise exacte 2.000s, progression continue 13 échantillons sans saut, RMS 0.2397, curseur+topbar OK (capture step-b-play-after-step.png). Résorbé par la refonte transport Kronos 05-06. Clos sur pièces.)_
- **KAN-BUILD-CM6** `fait` — Build PROD casse (preexistant) : Rollup ne resout pas @codemirror/language depuis BPscript/public/editor/bpscript-lang.js — bloque la preuve prod du bug 2. kanopi lead (packaging)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-UX1** `fait` — UX Romain 2026-07-03 : bandeau droit — supprimer l'onglet Scenes (inutile) ; UN panneau Actors+Inspector en widgets empilés (pas des onglets), vu la densité d'infos _(fait: ScenesPanel supprimé, RightPanel = widgets empilés Actors/Inspector ; activation scènes reste via Alt+1..9/palette ; e2e session-scenes adapté (vert) ; prouvé écran dark+light — PÉRIMÉ 2026-07-30 : sous-système scènes supprimé d'un bloc (commit 1ef3e0b), Alt+chiffres cible désormais les ACTEURS (bindings.ts:111-124), banc scenes-absentes.spec.ts verrouille l'absence — cf. hub/decisions/2026-07-30-les-scenes-sortent-de-l-ui-alt-chiffres-vise-les-acteurs.md)_
- **KAN-UX2** `fait` [P2] — BUG Romain 2026-07-03 : 1re ouverture d'une scène → le premier random n'est PAS random (toujours le même tirage). Discriminer : graine hôte vs graine moteur (bpx/bpscript), puis router par définition  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-UX3** `fait` — UX Romain 2026-07-03 : volume GÉNÉRAL avec mute + vol/mute PAR ACTEUR (comme les voies d'un DAW) — UI kanopi, gain = runtime-audio (coordonner) _(fait: mixer complet — mute par acteur (primitives existantes, survit stop→play/re-éval) ; VOLUME câblé sur l'API gain ratifiée (contrat hote-runtimes-sortie.md:51, setMasterGain/setActorGain/setMasterMuted, gains linéaires multiplicatifs, zéro état hôte) sur LES QUATRE bus de sortie vivants : audio (runtime-audio, rampe anti-clic runtime-side), midi + osc (livrés par leurs équipes le 2026-07-10, vélocité mise à l'échelle, gain 0 ≠ mute, pas de rampe — protocole discret par-note), voix de code strudel/tidal/csound (runtime-codevoices 282c98e ; csound conditionné au chnget du patch auteur, tooltip explicite). Mercury/Hydra/p5/JS + DMX restent désactivés, pas d'API confirmée. Commits 7ba9d17+2178593+87c188e, gate vert poussé 17dc85f. Preuve acoustique écran antérieure (master/acteur webaudio) : master 0.5 → RMS ×0.498, acteur 0.5×master 0.5 → ×0.2496.)_
- **KAN-UX4** `fait` — UX Romain 2026-07-03 : retirer l'icône git (ne sert à rien, usage futur non défini) _(fait: entrée git + IconGit supprimés (aucune GitView n'existait), union ActivityView nettoyée)_
- **KAN-UX5** `fait` — FEATURE Romain 2026-07-03 : files/libraries/ressources — organiser DEUX espaces standard/perso ; gestion de comptes MINIMALE (je tape mon nom = ça crée mon compte, SANS authentification) pour sauver/activer son espace perso _(fait: workspace namespacé par compte (kanopi:workspace:v1:<nom>), migration de l'ancienne clé globale → compte default (idempotent), switcher « personal space » en tête du FilesView (taper un nom = créer), 12 tests unitaires ; prouvé écran : default↔bernard aller-retour sans perte)_
- **KAN-STOP-SERRAGE** `ouvert` [P3] — Serrage stop autonome ~400 ms (mesure codevoices [1384]) : le relais lifecycle appelle pause() (coupe maître 15 ms) AVANT les stops par slot — Stop encore plus « immédiat ». Autorisé architecte, pas urgent
- **KAN-PAUSE-ENSEMBLE** `ouvert` — Multi-scènes : Pause ne gouverne que le handle de la dernière éval (2 onglets évalués) ; Stop/hush couvrent tout. Cadrage Romain requis : veut-on une pause d'ensemble ? (observation kanopi [1385], préexistant)
- **KAN-TEMPO-TEXTE** `ouvert` [P4] — Résiduel inv 4 temps-horloge : garde HÔTE que le texte @tempo est tenu ÉGAL à l'effectif (réécriture Modèle 1) — le warp-ne-re-dérive-pas est gardé côté Kronos (inv 4), reste la part hôte. Petit, non bloquant (la frontière est mûre)
- **KAN-26** `ouvert` [P2] — PWA avec auto-détection des mises à jour : réintroduire un service worker (offline + démarrage instantané) MAIS avec détection fiable d'un nouveau build → prompt utilisateur 'nouvelle version, recharger' → jamais resservir un shell périmé. Contexte : worker retiré via selfDestroying le 2026-07-04 (commit 960f46a) car le précache resservait de vieilles versions après rebuild (symptômes fantômes, rupture dev/prod ISO). Retrait = stop-gap ; objectif final = PWA installable+offline SANS staleness. Piste : registerType prompt de vite-plugin-pwa + UI de mise à jour + versionnage du precache.
- **KAN-SCROLL-LIBRARY** `ouvert` — Barre de défilement 'foireuse' sur la catégorie library 'tidal & others' (panneau UI library) — HÔTE, kanopi prend. Romain teste 4173
- **KAN-27** `ouvert` [P2] — BUG curseur voix de code : la barre de position ENROULE dans [0,1) au lieu de coller au cycle audible, sur scenes .bps orchestrees a voix de code (01-strudel-solo, etc.). CAUSE CORRIGEE (trace 2026-07-04, kronosCursor.active.transport reel : loopDurationScene=1, loopDurationBeats=1, beatsPerBar=4, running, loop ON) : ce N'EST PAS durationSec:0 du transport AUTONOME (kronos-codevoice.ts) — un .bps orchestre ne l'emprunte jamais. C'est le transport de SCENE dont la duree DERIVEE = 1 beat parce que 'S -> drums' (drums = backtick strudel SANS notes) derive a 1 symbole = 1 beat -> totalDurationBeats=1 -> durationSec=1s -> loop:true+dur:1s -> enroule chaque beat. Le curseur est CORRECT vis-a-vis de la scene ; il ne colle simplement pas au cycle propre de Strudel (~2s). Ni cablage hote ni Kronos : ROOT = duree derivee 1-beat d'une scene a voix-de-code (contenu opaque a BPx) = QUESTION DESIGN reservee Romain + point derivation BPx/Kairos. Ne pas trancher. Rapporte [msg archi 2026-07-04].
- **KAN-28** `fait` [P2] — MIGRATION library : le bpscript du jour (decision CV-curve 2026-07-04) EXIGE un TAG de langage explicite sur les backticks ('drums -> `strudel: note(...)`') — le backtick NU s'appuyant sur eval.strudel est REJETE (ParseError 'TAG obligatoire', bpx-adapter eval). Les scenes library .bps a backtick nu (01-strudel-solo.bps, mercury-intro.bps, ...) sont donc CASSEES en dev/source mais passent sur le build 4173 (anterieur au changement) = divergence dev/prod. Migrer chaque scene library vers la forme taguee une fois la syntaxe figee cote bpscript. Rapporte [msg archi 2026-07-04]. _(fait: PUSH ABOUTI (bff2e07, gate vert 41 e2e) : 7 démos voix-code sur origin (transport.audio + strudel synthé, audibles). Version inférieure b1775e3 stoppée à temps)_
- **KAN-E2E-AUDIO-FLAKY** `abandonné` [P2] — e2e audio flaky sous charge parallèle (mesure audio headless non fiable) — bloque les push par faux rouges ; fiabiliser (isoler/sérialiser les specs audio, ou serveur+port dédié par run). Discriminé 2026-07-05 : delta test-only entre 2 runs + sous-ensemble d'échec variable = flakiness, pas régression. _(abandonné: diagnostic flakiness RETIRÉ par kanopi : c'était 3 bugs déterministes (fixture webaudio + 2 sélecteurs e2e périmés), corrigés dans 21eedc9. Aucune flakiness réelle → point sans objet.)_
- **KAN-VOLET-A** `ouvert` [P2] — Volet A — intégrer les 13 scènes @alphabet.X:midi du corpus (copie + commentaires FR→EN + 13 entrées manifest + re-baseline capture Library All 95→108 + rouler le gate AVANT commit). Débloqué (fix source MIDI ed5a637 + décision acteur-unique). Push en HOLD (go Romain). À faire en SESSION FRAÎCHE (cost-aware, chantier neuf).
- **KAN-RECABLE-NO-REPROD** `ouvert` [P3] — UX Romain 2026-07-06 : changer le câblage/config d'un runtime de sortie DÉJÀ armé (ex. re-sélectionner un device MIDI, changer de sortie audio) déclenche AUJOURD'HUI un re-PROD complet (re-dérivation de la scène) — fix immédiat posé (midi-output.svelte.ts:select(), commit 12db3d4) car le gate MIDI publie la table des acteurs APRÈS lui-même (bpx-adapter.ts:1817-1838 throw AVANT `onActorsFromGrammar`), donc sans re-produce la table restait vide. Généraliser : la sélection de device/sortie devrait RECÂBLER LE HANDLE VIVANT (si un handle Kronos existe déjà) sans repasser par derive() — un simple changement de sortie n'a aucune raison de re-dériver la grammaire. Nécessite un point d'entrée handle-level (Kronos/runtimes) pour re-router un sink déjà enregistré, hors périmètre du fix ponctuel posé aujourd'hui.
- **KAN-MUTEDACTORS-MORT** `ouvert` [P4] — Retirer orchestration.mutedActors du type runtime-codevoices.d.ts (champ mort côté hôte depuis mute unifié [673]) — coordination kanopi↔runtime-codevoices, amendement de forme
- **KAN-SUPERDOUGH-MUTE-RACE** `ouvert` [P3] — Race préchauffage superdough : muter un acteur Strudel pendant la compil des AudioWorklets (démarrage froid) semble sans effet ; discriminer artefact banc CPU vs race réelle (report d'état au 1er tir post-préchauffage) — owner probable runtime-codevoices/Kronos
- **SEEK-STATUSBAR-ACTIVE** `ouvert` [P3] — Compteur statusbar 'active' incohérent sur seek-depuis-arrêt : dérive de actors.filter(active) (Statusbar.svelte:24), pas de la vie du graphe audio → reste 0 alors que l'audio SONNE (RMS 0.116). Anti-pattern 'active fabriqué hôte' qui ne se pose pas sur la voie playFrom. Cohérence d'AFFICHAGE, séparé du fix cycle-de-vie audio (75a065a). Flaggé Kanopi 2026-07-13.
- **SEEK-MUTE-RESET** `ouvert` [P3] — reset() sur cold-seek efface \_muted (armement) → un mute posé avant un seek-depuis-arrêt saute en orchestré. Résidu edge (sans effet en mono). À tester écran + corriger si on veut la cohérence du mute au seek. Flaggé Kanopi 2026-07-13 (fix 75a065a).
- **KAN-29** `fait` [P3] — Snapshots visuels timeline non stabilisés avant capture (visual.spec.ts:196 starter01, :326 starter03) = flaky récurrent : le rouge est dans le panneau STRUCTURE (plage scroll/zoom + position playhead non-déterministes), pas dans l'éditeur/AST. Dette test-infra pré-existante, signalée par kanopi 2026-07-14 (discriminée sur pièces = non-régression). Stabiliser/masquer le viewport timeline avant capture. _(FINI SUR PIÈCES, à clore par l'architecte : la stabilisation demandée EST faite — `maskWithTimeline` masque `.bp-body` (la région STRUCTURE) pour les sessions starter, visual.spec.ts:64-72 nomme la racine KAN-29 et sa cause (l'auto-suivi du curseur, runtime-ui 417a166). Aucune re-baseline de complaisance. Les deux captures citées passent au portillon du 2026-08-14 (visual.spec.ts:218 starter01, :354 starter03 — les numéros de ligne de l'énoncé, :196 et :326, ont bougé depuis). Le seul banc instable du jour est ailleurs : shortcuts.spec.ts:63, le silence à froid.)_  _(fait: FINI sur pieces : maskWithTimeline masque .bp-body pour les sessions starter, visual.spec.ts:64-72 nomme la racine et sa cause (auto-suivi du curseur, runtime-ui 417a166). Les deux captures passent au portillon. Aucune re-baseline de complaisance.)_
- **CAT-UNIQUE** `fait` — Catalogue unique de bibliotheques : consommer guestLibraries[].source, supprimer le doublon catalog.json (gm/xen muets car chargeur lisait doublon perime) _(fait: catalogue consolide commit 79f02f0 tests 150/150 preuve sonore=Romain)_
- **VOYANT-N3** `fait` — Voyant scene = feu de sante niveau 3 (compile+ressources+execution), fail-loud ; decision 2026-07-15-voyant-sante-niveau3 _(fait: clos 100% : chip rouge async #27 + sync #28 dans le gate, commit 1074749)_
- **AUDIO-PROOF** `fait` [P1] — Garde-fou : test navigateur DANS LE GATE qui mesure du son reel (RMS>0) pour chaque voix de code + rouge sur vraie erreur d exec ; fin des preuves statiques _(fait: RMS>0 gm mesure VERT dans le gate (8dcb63e, audio-proof.spec test #26, seuil 0.001) + chip rouge sync #29)_
- **XEN-SCENE-FIX** `fait` [P1] — xen muet : scene 07-xen utilise identifiant invalide i(...) ; corps corrige fourni par runtime-codevoices (mini-notation reifiee) ; appliquer + prouver RMS>0 _(fait: xen SONNE, RMS>0 vert gate (a325f50, audio-proof #27) ; corpus rc aligne 6a2542e)_
- **TEMPO-START** `ouvert` [P1] — Bug tempo (regression) : scene demarre a 120 puis 60 apres un tour ; tempo derive non applique au play, seulement a la couture ; barre rebascule sur tempo effectif
  _(NON REPRODUIT sur l'AFFICHAGE, mesure du 2026-08-21 — note prise a l'arret d'un item ouvert sur
  une consigne annulee ; l'architecte clot, pas moi.)_
  - **Mesure** : scene `core / alphabet.western:audio / tempo:60`, produite puis jouee a l'ecran.
    Le BPM affiche est ECHANTILLONNE pendant tout le premier tour — 2,5 s, plus de 20 prises. Ensemble
    des valeurs distinctes vues : `["60.0"]`. Une seule valeur, des le play. Le « 120 puis 60 » du
    titre ne se produit pas.
  - **Cause probable, deja reparee** : `tempo-declare.test.ts` porte la mesure du 2026-08-10 —
    `mmFromAst` rendait TOUJOURS `undefined` du 2026-07-09 au 2026-08-10, et son appelant lisait cette
    absence comme « la scene ne declare rien, applique le tempo de session ».
  - **⛔ CE QUE LA MESURE NE COUVRE PAS** : elle porte sur l'AFFICHAGE, pas sur le SON — un affichage
    juste sur un son au mauvais tempo resterait invisible. Et la troisieme moitie du titre, « barre
    rebascule sur tempo effectif », n'est pas couverte du tout.
  - **Ce qui a surpris, et qui valait le detour** : le banc qui aurait verrouille ce sujet DORMAIT,
    `fixme`, sur une raison PERIMEE — « no onclick handler, no input, no contenteditable affordance ».
    Le widget est editable depuis longtemps (`TransportCluster.svelte:202` porte un `<input>`, :216-220
    un bouton `onclick={startEdit}`). Un banc endormi sur une premisse qui a cesse d'etre vraie a
    exactement la forme d'un banc qui n'a rien a dire. Reveille en 2121047, morsure prouvee.
  - **Piege d'instrument, a ne pas refaire** : ecrit d'abord avec `toHaveText(/^60/, {timeout:3000})`
    sous un commentaire disant « la mesure est prise tot ». Un `toHaveText` avec delai ATTEND que le
    texte devienne 60 — vert sur un affichage qui passe par 120 avant de se corriger, donc vert
    exactement sur le defaut vise. L'anti-vacuite porte sur le NOMBRE DE PRISES, pas sur les valeurs
    distinctes : un ensemble non vide est satisfait par UN echantillon, et un echantillon ne peut pas
    voir une valeur transitoire.
  - **Graphie** : `tempo:<n>` dans le bloc `core`. Un motif cherchant `@mm`/`@tempo` rend ZERO sur les
    329 scenes — ce zero mesure le motif, pas le corpus.
  - **Ou je m'arrete** : le verrou d'affichage est pose et vert. Manque, pour trancher : une mesure
    SONORE du tempo au premier tour, et le sujet de la barre.
- **PILL-VOIX** `fait` [P2] — Bandeau 'strudel ready' s affiche pour toutes les voix (StrudelStatusPill cable en dur) — rendre conscient de la voix active  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-GRAMMAIRES-SCENES** `ouvert` — Exposer les grammaires Bernard actives manquantes comme scènes bp3 : 15/42 couvertes (.gr), ~27 non exposées (trygraphics, dhati2/3, look-and-say, tryshruti, vina/vina2, koto3, visser.waves…). Mécanique de portage connue (~1j + validation son par lots) ; certaines exigent des features (csound objects, graphics) à vérifier une à une. EN ATTENTE GO ROMAIN (décision produit) _(POINT DE REPRISE, mesuré le 2026-08-14 : l'énoncé « 15/42 couvertes, ~27 non exposées » est PÉRIMÉ. Le corpus est couvert — 113 grammaires exposées dans scenes/BP3-tests/, 93 marquées produites dans la table de correspondance. Ce qui reste est la VITRINE : scenes/bp3/ en porte 14, retenues en phase B sur le critère iso-prouvée ET qui joue. PROCHAINE ACTION : décider quelles grammaires au-delà des 14 entrent en vitrine — décision PRODUIT de Romain, pas une mécanique de portage. ELLE ATTEND : ce GO. Aucune dépendance avec le chantier des entrées.)_
- **KAN-AUD-F1** `ouvert` [P1] — AUDIT-K F1 [P1] : docs cloud — double persistance locale/cloud SANS réconciliation (snapshot embarque workspace.files entier ; openInEditor ouvre la copie locale sans comparer updatedAt ; file d'écriture mémoire-seule → perte au reload ; chip 'enregistré' mensongère). Violation kanopi-storage.md:115-119. RISQUE PERTE DONNÉES UTILISATEUR
- **KAN-AUD-F2** `ouvert` [P2] — AUDIT-K F2 [P2] : panneau Actors + Play-from-stopped alimentés par re-parse TEXTE (extract-blocks regex, blocks.svelte.ts:41/386-418) au lieu de la scène compilée — contourne 'Play ne re-dérive jamais' (Romain 2026-06-23) + kanopi-architecture.md:71. Fix : lire l'AST compilé existant ; armed = état scène, pas registre hôte parallèle
- **KAN-AUD-VIDEO** `fait` [P2] — AUDIT-K VIDEO [P2] : transport 'video' survit à la suppression ratifiée 2026-07-14 — type hôte + devices.json + registry + UN TEST LE VERROUILLE. Purge sèche (zéro rétrocompat)  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_
- **KAN-AUD-STRUCT** `ouvert` [P3] — AUDIT-K STRUCTUREL [P3] : (a) packages/core = coquille morte, suppression totale ; (b) frontière hôte↔runtimes désarmée par 43 double-casts, 3 sorties/4 sans garde tsc — adopter la forme kronos-codevoice ; (c) canal 'production' + Dispatcher morts (F7/F8) ; (d) FilesView ~280 l dupliquées ; (e) découpage bpx-adapter 2511 l proposé au rapport ; (f) 9 cycles d'import warn→error. Rapports hub/projets/audit-kanopi-2026-07-16/
- **KAN-AUD-DOC** `ouvert` [P4] — AUDIT-K DOC [P4] : resync registre démolition + contrat-DRAFT (3 RESTE soldés non pointés, LIBRARY_SPEC re-sème catalog.json supprimé, question Romain caduque) — le code est meilleur que ses documents
- **KAN-SEC-CSP** `abandonné` [P2] — SECU Q1 [P2] : AUCUNE CSP côté hôte — poser Content-Security-Policy stricte (connect-src = VPS assets + PocketBase seuls ; default-src 'self'). Coupe l'exfiltration du jeton PocketBase depuis les 3 surfaces d'exécution SANS attendre l'isolation forte. Le durcissement le plus rentable. Audit hub/projets/audit-securite-2026-07-16/ _(abandonné: énergie minimale — si jamais, une CSP est ~5 lignes de conf ; sinon rien. Non prioritaire. Romain 2026-07-16)_
- **KAN-SEC-SSRF** `abandonné` [P3] — SECU Q3 [P3] : liste blanche dans loadSampleBank (runtime-codevoices strudel.ts:1027) — rejeter tout source absent de guestLibraries avant m.samples() : ferme la SSRF client à l'ouverture d'une scène partagée. + Q4 window.kanopi en dev-seul/flag prod (kanopi-api.ts:41) _(abandonné: enjeu nul, énergie minimale — Romain 2026-07-16)_
- **KAN-TRIAGE-FIDELITE** `ouvert` [P3] — TRIAGE-FIDELITE-ACTIVES [P3, carte de causes] : sur les 26 grammaires actives manquantes, triage via voie adaptateur réelle = 8 FIDÈLES / 15 INFIDÈLES / 3 CRASH. Causes amont nommées : -ho/-tb/-to/-in sans point d'entrée parseBP3, protocole AllItems non itéré, templates 3 vs 36634 tokens, trySrand exige TimeProvider, visser-shapes/waves tempo fractionnaire \*0.7 rejeté (T43 entier). Rapport JSON chez kanopi. = la carte de ce qui bloque la publication au-delà de l'iso .gr
- **KAN-30** `ouvert` [PP3] — Directive @items dans l'API de pilotage (window.kanopi / mode test) : pouvoir demander N productions (equivalent MaxItemsProduce natif / [@seed,@items] BPScript). Demande Romain 2026-07-25.
- **KAN-31** `bloqué` [P3] — Supprimer le shim de types bp3-deps.d.ts (code MORT) : BPx publie bien tous les exports depuis fbad218, prouve par un consommateur externe strict a 0 erreur. Re-mesurer sur dist >= 1885761 AVANT de retirer, puis supprimer d'un bloc (pas de voie parallele gardee). _(bloqué: PREMISSE FAUSSE, mesuree 2026-07-26 : le shim n'est PAS du code mort. Retrait du mapping puis verification de types = 20 ERREURS dans 12 fichiers. Le seuil de l'item (dist >= 1885761) n'est pas atteignable : le dist reel fait 752004 octets, identique en amont. L'item generalisait a tous les exports une correction qui n'en couvrait qu'un (createBPx est bien publie, les autres non). CE QUI MANQUE VRAIMENT EN AMONT, a router a BPx : le type SceneAST sur la surface de createSession, et le champ tempo sur BPxConfig. Rouvrir quand ces deux-la sont publies — le mapping tombera alors tout seul, verifiable en 30 secondes par le meme test.)_
- **KAN-34** `fait` [P2] — CORRESPONDANCE nom d alphabet BPScript -> convention de notes BP3 : Une scene BPScript declare son alphabet par son propre nom ; le lien avec une convention BP3 n existe pas. Les sites BPScript passent donc la valeur non renseignee (= anglais, defaut BP3), ce qui reproduit le comportement d avant — trou ECRIT EN CLAIR aux 3 sites (247f00c). Consequence possible non mesuree : une scene BPScript en sargam ou en francais peut garder pour SECTION un mot qui est une note dans sa convention. Meme famille que BPS-29 (convention perdue a la conversion). _(clos : décision 2026-07-29-notre-mecanique-n-utilise-que-des-alphabets — bp3-frontend seul traduit la convention en alphabet au chargement, Kanopi ne calcule/complète rien, la question 'qui possède la correspondance' disparaît)_
- **KAN-35** `fait` [P3] — CHAMP CALCULE A CHAQUE PRODUCTION ET LU PAR PERSONNE : les SECTIONS avec bornes sont publiees dans le magasin de production (production.svelte.ts:110) mais AUCUN composant vivant ne les lit (seul lecteur = production.test.ts:20). L amont sait les dessiner (runtime-ui timeline.js:1368 setSections()) mais rien ne l appelle. Ce n est pas du code mort au sens strict — c est un calcul dont plus rien ne verifie la justesse, et il est FAUX des qu une scene n est pas anglaise (33 grammaires sur 113, chiffrees par bp3-frontend). Le jour ou quelqu un cable la bande de sections, le defaut devient visible d un coup. DEUX SORTIES : cabler, ou retirer. Mesure faite le 2026-07-28 (aucun effet a l ecran AUJOURD HUI). _(clos : retiré par le même commit qui ferme KAN-34 (e151883, 2026-07-29, décision 2026-07-29-notre-mecanique-n-utilise-que-des-alphabets) — sectionBoundsFromTree, l'assemblage des bandes dans publishProduction et le champ `sections` du magasin de production sont SUPPRIMÉS, pas déplacés ; production.svelte.ts ne porte plus aucun champ sections (vérifié sur pièces). Sortie retenue : retirer.)_
- **KAN-36** `ouvert` [P3] — Deux verrous e2e fragiles : tests/e2e/p5.spec.ts:12 (voix de code p5 doit peindre des pixels non-fond, echoue puis passe a la reprise) et orchestrator-actors.test.ts:212 — cause presumee commune : mesure prise sans garantir que le travail asynchrone observe est draine. Instruire (reproduire sous charge, isoler, proposer), ne PAS assouplir sans accord. TROISIEME cas ajoute le 2026-07-30 : tests/e2e/shortcuts.spec.ts:63 (le hush) — Kanopi a discrimine sa propre edition avant de le signaler (4 passages isoles, 8/8 verts, et le banc n analyse jamais la ligne retiree, il evalue le fichier .strudel), donc meme famille et non une regression du lot scenes. QUATRIEME cas ajoute le 2026-08-04 : tests/e2e/self-test/seek-daw.spec.ts:154 (seek Hydra, l horloge propre de la voix se recale sur le point du drag au frame pres). Kanopi a DISCRIMINE avant de signaler : le banc construit sa PROPRE scene inline, sans drapeau, donc il emprunte un chemin identique a celui d avant le lot qui l a precede, et il rejoue 3/3 en isolation. La cause n est donc PAS le drainage asynchrone commun aux trois autres : c est une TOLERANCE de 0,3 s sur une horloge rAF en mode sans affichage, ou le taux d images est etrangle. Ne pas l instruire ; ne pas assouplir la tolerance sans accord. MESURE DU 2026-08-09 QUI CORRIGE UNE CROYANCE : je tenais orchestrator-actors.test.ts:212 pour un effet de la CHARGE machine, parce que je l avais vu tomber un jour ou je faisais tourner un sous-agent pendant mon portillon. C EST FAUX — mesure au repos, machine libre, aucun autre travail en cours : 4 verts sur 5 essais, un echec. L instabilite est donc INTRINSEQUE, autour de 20 pour cent, et la charge ne fait au mieux que l aggraver. Consequence pratique : un rouge sur ce banc ne se discrimine PAS en disant  la machine etait chargee  ; il faut rejouer. Et consequence sur la mesure : mes 5 essais donnent un intervalle beaucoup trop large pour un taux, ils prouvent la reproductibilite au repos, pas sa frequence. CINQUIEME CAS AJOUTE LE 2026-08-10, ET IL FAUT LIRE CE QU IL A DE DIFFERENT : src/lib/runtimes/orchestrator-actors.test.ts:196 (« mute/unmute NEVER call the code-voice adapter directly »), tombe UNE fois au portillon avec « expected stop to not be called at all, but actually been called 1 times ». C est le MEME FICHIER que le deuxieme cas mais PAS le meme `it` — la fiche nommait la ligne 212, celui-ci est a la 196. Je ne les confonds donc pas : un marqueur compte une forme, pas un fichier. NON REPRODUIT EN SIX REJEUX, machine au repos : 5 sur 5 en isolement, plus 1 sur 1 sur la suite unitaire ENTIERE (75 fichiers), qui est la condition ou il est tombe. CE QUE ÇA VEUT DIRE, ET SURTOUT PAS PLUS : je ne peux pas etablir sa frequence, et je ne peux pas l attribuer au drainage asynchrone commun aux trois premiers sans l avoir reproduit. Un cas qui tombe une fois et refuse de retomber six fois n est pas explique ; il est SIGNALE. Ne PAS assouplir l assertion, ne pas la ranger sous une cause qu on n a pas mesuree. ⚠️ MESURE DU 2026-08-13 QUI SORT LE TROISIEME CAS DE CETTE FAMILLE, ET QUI NOMME SON SUJET. Le hush (`tests/e2e/self-test/shortcuts.spec.ts:63`) a REFUSE mon push : rejeu au repos, machine libre, 3 echecs sur 3, puis 2 verts sur 6 et 1 sur 3 — il est passe de 8 sur 8 en isolement (2026-07-30) a environ un tiers. Ce n est donc plus un instable de drainage, c est une degradation. CE N EST PAS MON EDIT : mesure de controle avec le `vite.config.ts` du dernier vert (a191033) et cache de pre-bundling purge, MEME taux (2 sur 6) — mon greffon de refus de production est hors de cause. CE QUE LA SONDE A ETABLI, avec DEUX instruments independants qui concordent (le tap du banc, et `__kanopi.audioTap` de la surface pilote) : apres evaluation du fichier `.strudel`, le niveau sonore occupe UNE SEULE tranche de 250 ms (0,088) puis reste a zero pendant NEUF secondes — serie complete relevee. Le contexte audio est `running`, son horloge avance, superdough joue (son avertissement de depreciation est dans la trace) et `[cyclist] start` est journalise : la voix DEMARRE et ne CYCLE PAS. Le banc, qui affirme du son sur une fenetre de 2,5 s, ne reussit donc que quand son echantillonnage tombe sur cette unique bouffee. DISCRIMINANT SUPPLEMENTAIRE, ET IL VA DANS L AUTRE SENS QUE L INTUITION : transport en MARCHE avant l evaluation, AUCUN son du tout, 2 fois sur 2 — le cycle ne depend donc pas du transport, ce qui est cohérent avec BP-6 (le cyclist Strudel n est pas gate par l horloge Kanopi) mais aggrave le tableau. CE QUE JE N AI PAS ETABLI : depuis quand, et chez qui. Les voisins sont lus VIVANTS et ont bouge plusieurs fois dans la journee ; une bisection contre leur historique ne prouverait rien tant que leurs arbres de travail entrent dans ma mesure. Le cycle de vie d une voix de code appartient a runtime-codevoices : route, pas corrige ici. ⛔ NE PAS elargir la fenetre du banc ni baisser son seuil — ce serait ajuster l assertion a ce qui sort, et le sujet du banc (une voix qui sonne dans la duree) disparaitrait avec. ✅ CAUSE TROUVEE ET CORRIGEE EN AMONT LE MEME JOUR (runtime-codevoices 3f9e957), ET ELLE EXPLIQUE L INEXPLICABLE : le reveil COMPLET du moteur de son de Strudel — reprise du contexte PUIS chargement des worklets — n etait declenche que par un CLIC de souris ; au CLAVIER il ne partait jamais. Sans worklets, tout parait sain : contexte running, horloge a 1 pour 1, un nœud sonore cree puis termine, aucune erreur, et RIEN NE SORT. Mes cinq mesures qui semblaient se contredire disaient toutes cela. CE QUI A DESIGNE LA CAUSE, c est l ORDRE lu dans MON panneau de console : les deux evaluations tombent AVANT que superdough annonce ready, et ready est ABSENT de toute la fenetre au clavier seul. ET C EST CE QUI RENDAIT L INTERMITTENCE NON BISECTABLE : elle ne dependait d aucun commit, mais d un CLIC FORTUIT avant la frappe — 8 sur 8 le 30 juillet, un tiers le 2026-08-13. MESURE APRES CORRECTIF, banc TEL QUEL, seuil et fenetre intacts : 12 verts sur 14 (5/6 puis 7/8) contre 2 sur 6 avant. ⚠️ IL RESTE UN RESIDU DE 2 SUR 14, meme mode (RMS 0, rien du tout, pas une bouffee) : NON INSTRUISI, et deux observations ne suffisent pas a nommer une cause — a re-mesurer sur une campagne complete avant d affirmer quoi que ce soit. ⚠️ ET UN SUJET SEPARE RESTE OUVERT, a ne pas melanger : un seul Ctrl+Entree provoque DEUX appels a l evaluation amont, meme composite (124b), constant AVEC ET SANS transition de transport — la porte du re-tir a ete fermee par isolation de la variable. Sans effet sur le motif, donc du gaspillage et non une cause. ⚠️ ET DEUX LEÇONS DE METHODE, les deux du meme jour et symetriques : j ai affirme que leur ligne de succes n apparaissait JAMAIS alors que je lisais la console du NAVIGATEUR — leur canal tague passe par le puits LogPush que JE leur fournis et alimente MON panneau (kanopi-runtime-codevoices.md:57-65) ; et eux ont fait reposer deux candidats sur l ABSENCE d un signal dont personne n avait eprouve qu il arrive. Mesurer le mauvais puits et croire une absence sont la meme faute.
- **KAN-38** `ouvert` [P2] — PORTILLON DEV vs PRODUCTION : le portillon e2e sert un serveur de DEV (playwright.config.ts:62-67, choix delibere — les e2e ont besoin de window.kanopi), donc il resout la SOURCE de kairos, kronos et bpx (condition development de leur champ exports) alors que la construction de PRODUCTION resout leur dist. Consequence : un portillon VERT ne dit RIEN de la fraicheur des paquets construits des voisins, et ce qui part a l utilisateur peut etre bati sur un paquet en retard. Meme famille que le defaut des voix de code muettes en production (960f46a) : dev et prod ne resolvaient pas la meme chose, seul un build frais l avait montre. La legende du vert (deps-fraicheur §4) ne le couvre PAS — elle declare l etat git des voisins, pas le retard de leur dist sur leur src.
- **KAN-39** `ouvert` [P1] — PORTILLON — LE BANC ECRAN LAISSE SON PROPRE SERVEUR DERRIERE LUI EN ECHOUANT, ce qui garantit l echec du suivant. Mesure du 2026-07-31 : playwright.config.ts lance vite --port 4321 --strictPort ; si le port est deja pris le portillon ECHOUE, mais il n arrete PAS le serveur qu il vient de lancer ni les navigateurs sans tete. Chaque tentative ratee en ajoute donc un jeu, et la suivante est garantie d echouer. Constate TROIS fois de suite : nettoyage du port, relance, re-echec, nouveaux orphelins (pids 3733877/3742088 puis 3757716/3757791, plus 8 processus ms-playwright accumules). LE GARDE ANTI-ORPHELINS NE VOIT PAS CE CAS alors qu il passe avant ET apres chaque execution : il ne regarde pas le serveur du portillon lui-meme. A FAIRE : nettoyer en sortie d echec (piege sur sortie non nulle), et/ou reuseExistingServer, et/ou port dynamique. TANT QUE CE N EST PAS FAIT, aucun push de Kanopi n est fiable au deuxieme essai.
- **KAN-40** `ouvert` [P3] — Cinq scenes a CV et macro attendent la forme -instance de module avec ses reglages de depart- : cv-adsr, cv-lfo, group-cutoff, superp-cutoff, patchbay. Refusees a la derivation par BPx depuis le retrait de cv et macro du langage. Six ecritures candidates mesurees, toutes refusees au parse ; la forme sans reglages passe mais changerait la musique (enveloppes aux valeurs par defaut). Romain 2026-08-08 : la forme sera completement revue avec l arrivee de FaustX, ces scenes vont au backlog. A reprendre quand FaustX sera integre. ⚠️ AJOUT 2026-08-09 -- UN SECOND MUR ATTEND CES CINQ SCENES DERRIERE LE PREMIER, et il ne se verra pas tant que le premier tient : mesure faite, elles ANALYSENT proprement et produisent un AST porteur (cv-adsr/cv-lfo/group-cutoff cvInstances=1, superp-cutoff cvInstances=2, patchbay macros=4). Or le controle de forme de BPx REFUSE desormais ces deux sections (leur 9d4a6e4). Aujourd hui ça ne mord pas -- les cinq echouent avant, pour leur raison propre -- mais le jour ou cet item se debloque, elles buteront sur le controle de forme AVANT de jouer. BPx avait predit  si vous ne produisez ni cvInstances ni macros, rien ne bouge  : la conclusion est vraie, la premisse est fausse, et je le leur ai dit. A relire AVANT de reprendre ces scenes, sinon on debuggera le second mur en croyant que le premier n a pas ete franchi.
- **KAN-41** `ouvert` [P3] — Garde anti-code-en-dur : aucune liste du langage codee en dur dans le depot. Le garde existe chez BPscript (test/aucune_liste_du_langage_n_est_codee_en_dur.mjs) et chez BPx ; kanopi n en a aucun. Poser l equivalent.
- **KAN-42** `ouvert` [P2] — 203 scenes de la bibliotheque ecrivent encore @controls, forme retiree de la reference du langage le 2026-08-03. Mesure architecte 2026-08-10 sur packages/library/scenes/. Elles COMPILENT (oracle : zero echec structurel, une forme PERIMEE) donc rien n est casse : c est une forme morte qui survit et qui s enseigne. Repartition : 144 BPScript-tests, puis 59 scenes EDITORIALES dont 10 dans learn (le tutoriel ouvert en premier), 10 world, 8 synthesis, 7 midi, 7 basics, 4 tuning, 4 polymetric, 3 generative, 3 cv, 2 code-voices, 1 orchestrator. Les 34 scenes de samples sont PROPRES, ce qui prouve que la forme du jour est connue et applicable. Signale a l origine par BPx, qui n avait vu qu une scene. ⚠️ CORRECTION DU 2026-08-10 APRES-MIDI : le « elles COMPILENT, rien n est casse » N EST PLUS VRAI, et pas pour la raison qu on surveillait. DEUX scenes ne DERIVENT plus — BPScript-tests/simpletemplates.bps et samples/catalogue-de-gabarits-les-rangs.bps — avec « TypeError: elements is not iterable ». Ce n est PAS @controls : mon corpus ne rougit pas dessus. C est la fenetre rouge du CHANTIER DES GABARITS, annoncee AVANT d etre ouverte par BPx : bpscript a frappe le premier et emet la ligne verbatim, BPx n a pas encore porte sa moitie. Les deux sont inscrites comme rouges connus dans corpus-compile avec leur cause, pour ne pas etre recherchees au prochain tour. Elles se levent quand BPx frappe.
- **KAN-43** `ouvert` [P2] — LE BANC DE SON SAIT DIRE « LA SCENE SONNE », JAMAIS « CHAQUE VOIX SONNE », et toutes les scenes multi-voix du corpus ont ce trou. Mesure du 2026-08-10 sur strudel/05-filter-envelope-effects.bps, dont la couche batterie est MUETTE pendant que la scene sonne par ses notes : le niveau global ne la voit pas. PIRE QUE L AVEUGLEMENT, IL AFFIRME : au premier passage l ecart allait dans le BON sens (0.1784 avec la batterie contre 0.1113 sans) et disait donc « elle sonne » ; repete, il s effondre — SANS la batterie donne parfois PLUS que AVEC (0.1850 contre 0.1279), parce que la scene est aleatoire par construction (perlin, sine, sometimes, choix entre deux notes) et que son niveau varie de 0.11 a 0.19 sans rapport avec la couche. Un instrument qui se trompe au hasard est pire qu un instrument muet : le muet ne dit rien, celui-la affirme, avec un chiffre. CE QUI A COUPE : la REPETITION, et le CRI du moteur (« sound X not found », 14 a 23 fois avec la couche, 0 sans) — ce que la couche a de mesurable est son cri, pas son niveau. A FAIRE : une ecoute par VOIX (tap par acteur ou par nœud de sortie), et l appliquer aux scenes multi-voix ; a defaut, ne jamais lire un RMS global comme la preuve qu une couche donnee sonne. Un item, pas un chantier (cadrage architecte [1220]).
- **KAN-44** `ouvert` [P2] — UNE SUSPENSION SANS POINT DE REPRISE EST UN OUBLI QUI A L AIR D UNE PRUDENCE. Mesure du 2026-08-10 : j ai ecrit « je ne cable pas cette sortie tant que la question de contrat n est pas tranchee » — decision juste. Elle a ete tranchee, et je ne suis jamais revenu poser la ligne. Le paquet a retire son chemin d appel dans le meme mouvement : la sortie a cesse de sonner EN SILENCE, aucun banc unitaire ne bougeant, et il a fallu vingt-neuf rouges de portillon pour la retrouver. A FAIRE : toute suspension motivee s inscrit ICI en une phrase au moment ou on la prononce, avec sa condition de reprise. Le cout d ecrire la ligne est nul ; le cout de l oublier est un silence que rien ne mesure.
- **KAN-45** `ouvert` [P2] — ENUMERER LA FORME, JAMAIS LES EMPLACEMENTS. packages/ui/src/lib/library/resources.ts nomme HUIT fichiers de librairie de bpscript en dur (alphabets, core, digital, mod, octaves, scales, temperaments, tunings). Les huit existent au 2026-08-10, donc rien n est casse — mais `controls.json` a disparu le meme jour et a casse ma compilation, et bp3-frontend s est casse DEUX fois sur exactement cette forme (corrige a 13h en nommant deux fichiers, retombe a 19h quand il y en a eu davantage). Sa conclusion : UN NOM DE FICHIER EST AUSSI MOUVANT QU UN NOM DE CLE. A FAIRE : enumerer le dossier de librairies et collecter partout ou la section cherchee est ecrite, quel que soit le fichier qui la porte — reprendre sa forme (bp3-frontend e24039e) plutot qu en inventer une. ⚠️ CHIFFRE CORRIGE LE 2026-08-13, ET MA PREMIERE MESURE ETAIT BASSE DE QUATRE : ce ne sont pas HUIT fichiers mais NEUF, pour DIX-HUIT imports statiques — alphabets, core, digital, mod, octaves, scales, temperaments, tunings, voices. J avais lu douze lignes d UN fichier au lieu de balayer ma source ; bpscript a remesure et m a corrige. Sonde tronquee, conclusion fausse — et une exposition sous-estimee est exactement ce qui fait qu on se croit couvert. ⚠️ CE QUI RETIRE L URGENCE SANS RETIRER L ITEM : bpscript a converti CINQ librairies de VOCABULAIRE en .bps le meme jour (audio, transpo, expression, variation, midi) — aucune des neuf n en etait, et aucune n est prevue a la conversion : ce sont des CATALOGUES DE DONNEES, que le partage laisse en JSON. Le vocabulaire va en BPScript, la donnee reste donnee. ⚠️ ET LE FILET N EST PLUS UNE PROMESSE : leur garde de surface partagee extrait desormais les fichiers que chaque voisin LIT reellement et exige qu ils existent chez eux — leur portillon rougit en me nommant AVANT leur push, morsure eprouvee par injection. Ma forme reste a corriger (enumerer le dossier, pas nommer les fichiers), mais je ne le decouvrirai plus par un rouge.

- **KAN-46** `ouvert` [P2] — SEPT GRAMMAIRES DERIVENT CHEZ MOI AVEC UN AUTRE REGLAGE MOTEUR QUE LA REFERENCE SCELLEE. Mesure du 2026-08-12, mes 113 grammaires de `scenes/BP3-tests` croisees une a une avec la baseline native GELEE (bp3-engine da269b0, v14, `baseline-native/baseline.json`, figee par Romain le 2026-08-11) : 113/113 ont une entree, ZERO orpheline, 87 concordent. Mon hote resout par le nom que la GRAMMAIRE DECLARE sur sa ligne `-se.` ; la reference porte le couple effectivement utilise a la capture. Les sept ou le natif PRODUIT et ou les deux divergent : `check&` (reference `-se.765432`, moi `-se.check&`), `koto1` et `koto2` (reference `-se.koto3`, moi `-se.koto1`), `transposition1` (reference `-se.transposition3`, moi `-se.transposition`), `tryMIDIfile` (reference `-se.asymmetric1`, moi `-se.tryMIDIfile`), `PP` et `checkBT` (reference `-se.koto3`, moi AUCUN — leur grammaire n en declare pas). Deux autres divergent aussi mais le natif ne les produit pas (`checkcontext`, `keys`). LES HUIT FICHIERS EXISTENT DES DEUX COTES : ce n est pas une absence, c est un CHOIX de resolution. LES DEUX LECTURES SE VALENT ET JE N EN TRANCHE AUCUNE : ou bien ma resolution est infidele et l hote doit lire la table ; ou bien c est la reference qui retarde, puisque l arbitrage v14 de Romain dit qu « une grammaire se lance avec le fichier de reglages qui porte son nom des qu il fonctionne » — c est exactement ce que je fais, et c est ce qui a fait basculer MyMelody et tryRotate. Faire de la baseline d un voisin une entree de ma resolution est un choix d architecture, pas un raccourci : pose a l architecte, en attente. ⚠️ CE QUI EST DEJA MESURE ET N EST PLUS UNE QUESTION : les 24 collisions vitrine/corpus du lot derive rendent un timing moteur IDENTIQUE apres analyse (les 24 noms compares un a un) — la regle « la vitrine gagne » ne deplace rien. ⚠️ MON 113 EST EN REALITE 112 : voir KAN-47, mon corpus porte une grammaire sous DEUX noms, et elle compte donc deux fois dans les chiffres ci-dessus.
- **KAN-47** `ouvert` [P2] — MON CORPUS PORTE UNE GRAMMAIRE SOUS DEUX NOMS, ET ELLE COMPTE DEUX FOIS DANS MES PROPRES CHIFFRES. Signale par bpscript [1318], REMESURE chez moi le 2026-08-12 : `scenes/BP3-tests/checkSUB.gr` et `checkSUB.new.gr` ont la MEME empreinte, `456f828757f80b76a5600089bb8bf30a`, et `diff` les declare identiques ; leurs deux captures natives ont aussi la meme empreinte cote bp3-engine. `checkSUB1.gr` est bien une grammaire distincte (`f908ca82...`). CONSEQUENCE DIRECTE SUR CE QUE J AI PUBLIE : mes « 113 grammaires, 113/113 ont une entree, 87 concordent » (KAN-46) comptent la meme œuvre deux fois — le corpus distinct est de 112. Les deux fichiers etant identiques, ils concordent ou divergent ENSEMBLE : la correction porte sur le denominateur, pas sur le verdict d une entree. A FAIRE : retirer le doublon, mais PAS avant l instruction de bp3-engine — [1317] m interdit de toucher a une grammaire du corpus tant qu elle court. ⚠️ J AI D ABORD ECRIT ICI UNE SECONDE RAISON QUI EST FAUSSE, et je la corrige plutot que de la laisser : « le nombre 113 est cable dans mes bancs ». Verifie le 2026-08-12 — AUCUNE assertion ne porte 113. Mes bancs ENUMERENT le dossier (`se-bundle-coverage.test.ts:34`, glob sur `BP3-tests/*.gr` ; `entete-carte.test.ts` de meme) et comptent ce qu ils trouvent ; le nombre n apparait que dans des COMMENTAIRES et dans les tableaux croises que j ai publies. Le retrait ne casserait donc aucun banc : il perimerait des commentaires et mes chiffres publies. Le seul verrou reel est l instruction en cours.
- **KAN-48** `fait` [P2] — L APPLICATION VA CHERCHER SES POLICES SUR UN SERVICE EXTERNE, ET CHAQUE HOQUET DE CE SERVICE REND SIX BANCS AUDIO ROUGES D UN COUP. Mesure du 2026-08-12 sur la campagne de `7c1fc77` : 6 instables, TOUS audio (`audio-proof.spec.ts:91` RMS, quatre scenes de `samples-sonnent.spec.ts:99`, `shortcuts.spec.ts:63` le hush). Cause COMMUNE, lue dans la trace playwright et non deduite : une seule reponse >= 400 sur toute la trace, `404` sur `fonts.gstatic.com/.../jetbrainsmono/...woff2`. Mes bancs sont fail-loud sur `console.error` — la police manquante suffit donc a les rougir tous, sans rapport avec le son. `packages/ui/index.html:10-13` declare trois familles chez Google Fonts (IBM Plex Mono, IBM Plex Sans, JetBrains Mono). DEUX DEFAUTS DISTINCTS, PAS UN : (1) mes bancs dependent d un service tiers, donc mon portillon a un bruit de fond qui masque de vrais signaux ; (2) une application EMPAQUETEE (VitePWA) qui va chercher ses polices sur le reseau ne s affiche pas correctement hors-ligne — c est un defaut produit, pas de banc. LA SORTIE EST LA MEME POUR LES DEUX : heberger les polices, elles cessent d etre une dependance reseau. Le geste demande un arbitrage que je ne prends pas seul (choix du sous-ensemble de glyphes, licences, poids ajoute au depot), d ou cet item plutot qu une correction dans la foulee. ⚠️ CE QUE CETTE MESURE A DEJA ECARTE, pour qu on ne le recherche pas : ce n est ni mon retrait d alias Vite du meme jour (le 404 ne porte sur aucun module), ni la bascule d instance de runtime-audio (ses e2e ont demarre six minutes apres la fermeture de son trou de 14 s, et sa production etait alors une copie octet pour octet de sa source).  _(fait: Confirme par Kanopi sur sa propre mesure, par symbole (contre-mesure du 2026-08-14))_

- **KAN-49** `ouvert` [P2] — DEUX RUNTIMES AUDIO VIVANTS QUAND LE JEU ET L EVALUATION PASSENT TOUS LES DEUX, et c est MON point de creation qui est appele deux fois. Mesure du 2026-08-14 par instrumentation du CONSTRUCTEUR de contexte audio (pile capturee a la creation — un comptage ne dit pas la provenance). Sur une scene a sons echantillonnes, transport lance : TROIS contextes. Provenance lue une par une : [1] initStrudel chez runtime-codevoices (le leur, legitime, cree au prechargement AVANT toute evaluation) ; [2] et [3] createAudioRuntime → `startKronosAudio` (kronos-audio.ts, symbole `createAudioRuntime`) → `bpx-adapter` evaluate, atteint par DEUX chemins differents — `produceLoadedProgram` et `evalOne` de `blocks.svelte.ts`. ⛔ ANCRE SUR LES SYMBOLES, ET C EST UNE CORRECTION : ma premiere redaction citait des NUMEROS DE LIGNE lus dans les piles d appel, et AUCUN n etait juste. Les piles viennent des fichiers SERVIS PAR LE SERVEUR DE DEV, transformes, dont la numerotation ne correspond pas a la source sur disque : j attribuais `initStrudel` a strudel.ts:173 (c est l emission d erreur ; le symbole vit vers 423), `createAudioRuntime` a kronos-audio.ts:67 (il est a 387) et `evalOne` a blocks.svelte.ts:153 (il est a 138). L ATTRIBUTION ETAIT JUSTE, LA CITATION NE L ETAIT PAS — signale par runtime-codevoices, verifie chez eux ET chez moi. Un lecteur serait alle a la ligne citee, aurait trouve autre chose, et aurait doute de toute la mesure. Un numero vieillit a chaque commit et ment des qu il vient d un fichier transforme ; un nom, non. ⚠️ CE N EST PAS UNE FUITE, ET J AI FAILLI LE RAPPORTER COMME TELLE : quatre evaluations successives laissent le compte a DEUX, stable. Le handle precedent est `stop()` mais son runtime audio n est pas ferme ; il n en est pas recree pour autant. Doublon fixe, pas croissance. ⚠️ ET LE CONTEXTE D AVANT-EVALUATION N EST PAS LE MIEN : mesure de provenance, c est celui de Strudel. Ma premiere lecture l attribuait a mon prechauffage audio — faux. CE QUI RESTE A TRANCHER, ET JE NE L AI PAS ETABLI : si le second exemplaire est un defaut ou une consequence assumee des deux chemins. A instruire avant de corriger — deux sorties audio vivantes ne se retirent pas au jugé. ⚠️ ORIGINE : runtime-codevoices cherchait depuis le 15 juillet un cas minimal pour leur item de duplication de moteur audio, qu ils attribuaient aux soundfonts. La multiplicite est reelle, mais elle est majoritairement CHEZ MOI, pas chez eux.
- **KAN-50** `ouvert` — Les deux ancres du reglage natif (protocol.c4key / protocol.a4freq, minuscules) arrivent par parseSeFile et ne sont consommees nulle part : bpx-adapter.ts:505 ne passe que .engine, et BPxConfig.settings=SeEngineSettings ne declare que six champs de timing, aucune ancre. Sept scenes compensent A LA MAIN par @transpose:1/2 ce qu une surface de deux champs porterait pour les 113. ⛔ LE CONSOMMATEUR AVAL EXISTE ET EST PROUVE (kairos, injection verifiee atterrie) : @diapason:230/220/440 rend A4 a 230/220/440 Hz, et son banc c4key-octave-e2e honore l ancre de touche quand elle arrive par la route du frontal BP3. Les deux ancres ont donc un lecteur amont ET un resolveur aval ; il manque le PORTEUR au milieu. La question n est pas qui doit transcrire, c est qui doit porter. Attend l arbitrage nom-ecrit contre nom-natif de Romain, qui le precede.
- **KAN-51** `ouvert` [P2] — Ma copie des reglages BP3 diverge de bp3-engine sur 22 des 143 fichiers -se (ancien format positionnel chez moi, zero chez lui depuis sa conversion du 2026-08-14). Exactement ces 22, aucun autre. Consommes VIVANTS par l application (glob eager, bp3-aux.ts). Sans effet sur le tempo (parseSeFile lit l ancien format) mais aucun chemin de resynchronisation derive n existe. Annexe non elucide : ma chaine compte 28 reglages non-JSON la ou le disque en porte 22. REPRENDRE LA CONVERSION APRES 7aafd19, jamais f936475 : la premiere perdait la graine aleatoire et le decoupage des variables (mesure bp3-frontend). ⛔ LA CAUSE, ET ELLE COMMANDE LE GESTE : scripts/garde-correspondance-bp3.mjs verifie que chaque chemin de la table EXISTE, jamais qu il soit A JOUR. Une copie perimee y passe au vert, et elle y est passee des heures, consommee vivante par l application. C est ce qui rendra le PROCHAIN ecart visible ; la synchronisation d aujourd hui ne le fera pas. Volet miroir chez bp3-engine : BPE-30.
- **KAN-52** `abandonné` [P2] — COPIE PERIMEE de bp3-engine/test-data : test-assets/bp3/commun/ porte 143 fichiers -se dont 22 en ANCIEN FORMAT — exactement les 22 convertis par bp3-engine le 2026-08-14 (prendre apres 7aafd19, pas la premiere conversion qui perdait deux cles). La bibliotheque les consomme VIVANTS par un glob eager. Une copie diverge en silence.  _(abandonné: DOUBLON de KAN-51, qui garde le numero — inscrit par l architecte dans la meme minute, sans voir le sien. Son contenu passe dans KAN-51 : priorite P2, et prendre la conversion APRES 7aafd19 (la premiere perdait deux cles).)_
- **KAN-53** `ouvert` — Bancs ecran tardifs qui echouent a TOUTES leurs tentatives, cause NON ETABLIE. Portillon du 2026-08-14 : seek-daw.spec.ts:210, shortcuts.spec.ts:38 et :63 echouent tous a 12,3 s exactement sur leurs trois tentatives, numerotes 102 a 106 sur 108. MESURE : 105 bancs PASSENT, donc ce n est PAS un ecran qui ne monte pas -- le denominateur refute cette lecture. ELIMINE : le serveur de developpement detache depuis 35 h n est pas en cause, playwright.config.ts possede son propre serveur sur port dedie avec reuseExistingServer false, collision fermee explicitement. FORME OBSERVEE sur trois campagnes consecutives du meme arbre : a chaque fois un ou plusieurs bancs TARDIFS differents tombent (campagne 1 shortcuts:63, campagne 2 p5:12, campagne 3 les trois ci-dessus), coherent avec un epuisement de fin de campagne. Ce n est PAS une cause etablie et il ne faut pas la fermer dessus. PROCHAINE ACTION : instrumenter la fin de campagne (memoire, contextes audio non liberes) ou scinder la campagne, pour discriminer epuisement contre defaut propre a ces bancs. ⛔ PISTE DATEE, AJOUTEE APRES COUP ET NON ETABLIE : la campagne rouge tournait 20:12-20:24:22, et bpscript a enregistre src/transpiler/libs-{bundle,data}.js a 20:24:21 -- une seconde avant sa fin, au milieu d'une bascule de librairie d'une trentaine de minutes pendant laquelle, DE SON PROPRE AVEU, ces fichiers changeaient a chaque regeneration. Je le consomme par LIEN SYMBOLIQUE : ma source etait donc reecrite SOUS la campagne. La campagne suivante, lancee apres son commit 54e0f67 sur un arbre propre, est VERTE (108 bancs). Correlation sur deux campagnes, pas une cause : le HMR du serveur de portillon est coupe, donc un rechargement est exclu, mais un import tardif lirait le fichier au moment de sa demande. POUR TRANCHER : rejouer une campagne pendant qu'un voisin lie reecrit sa source, et voir si des bancs TARDIFS tombent. ⛔⛔ CONTRE-MESURE, PRISE APRES ET QUI AFFAIBLIT LA PISTE CI-DESSUS : la campagne suivante, sur un arbre de voisin PROPRE, a quand meme vu shortcuts.spec.ts:63 echouer DEUX fois sur trois tentatives (2 instables au total). L'instabilite existe donc SANS reecriture de source. DISTINGUER DEUX CHOSES QUE J'AVAIS CONFONDUES : (a) le banc du silence INSTABLE — present dans presque toutes les campagnes, arbre propre ou non, INDEPENDANT de la piste ; (b) trois bancs tardifs MORTS a toutes leurs tentatives — arrive UNE SEULE FOIS, pendant la reecriture. La piste ne porte que sur (b), et (a) est un sujet distinct qui ne se refermera pas avec elle. ⛔ OBSERVATION DU 2026-08-20, QUI RELEVE DE (a) ET NON DE (b) : `tests/e2e/bp3-midi.spec.ts:40` tombe sur DEUX campagnes de trois, et son echec n a RIEN de MIDI — il expire a `toBeVisible` sur `getByText('KANOPI')` apres 10 s, c est-a-dire que la coquille de l application ne s affiche jamais. Il PASSE a la reprise les deux fois, donc instable et non mort. Il est tardif dans la campagne, ce qui est coherent avec l epuisement de fin de campagne decrit ci-dessus, SANS l etablir. ⚠️ CE QUE JE N ETABLIS PAS : ni sa frequence (deux observations ne font pas un taux), ni sa cause, ni qu il partage la cause de `p5.spec.ts:12` (KAN-36), qui a lui aussi flanche sur deux campagnes de trois le meme jour — la RESSEMBLANCE de position ne vaut pas identite de cause. Ne pas allonger le delai de 10 s : ce serait ajuster l assertion a ce qui sort, et le sujet du banc — une application qui monte — disparaitrait avec.

## Mesures du 2026-08-18 — gardes, portillon, canal

Chiffres pris ce jour, sur demande de Romain. Ils ne vivaient nulle part ailleurs.

### Ce que pèsent les gardes

- **120 fichiers de garde** — 79 unitaires, 41 écran, plus 15 scripts. **508 cas** écrits
  (910 à l'exécution : le corpus engendre ses cas en boucle), **1260 assertions**.
- **KAN-54** `ouvert` — **la morsure de 112 gardes sur 120 n'est pas établie.** Seuls
  **3 fichiers** portent une injection prouvée — la seule marque qui atteste. 5 racontent
  un défaut attrapé. Les 59 qui portent une date et les 36 qui écrivent « mesuré » ne
  prouvent rien : ils prouvent qu'on a écrit une date. **L'historique ne tranche pas non
  plus** — un filtre sur les messages de commit rend 118 faux positifs sur 776. Pour
  savoir, il faudrait que chaque garde porte son injection prouvée, comme les 3.

### Où part le temps du portillon (~727 s)

| maillon | temps | part |
| --- | --- | --- |
| e2e (playwright, 121 cas) | 636 s | 96 % |
| test unitaire (910 cas) | 52 s | 7 % |
| build | 17 s | |
| lint | 11 s | |
| check (svelte-check) | 7 s | |
| depcruise | 2,6 s | |
| les 9 gardes maison | 1,0 s | **0,14 %** |

- **Les gardes ne coûtent rien** : les supprimer tous ferait gagner une seconde sur douze
  minutes.
- **Et le temps écran n'est pas du gaspillage** : 579 s de durée de cas cumulée sur 636 s
  de campagne — 9 % d'écart, pas de lancement à vide ni de double compilation. La cause est
  `playwright.config.ts` : `workers: 1`, parce que les bancs **jouent du son** et que deux
  en parallèle se marcheraient dessus.
- Variabilité mesurée le même jour, même crochet : 10,6 · 10,8 · 10,9 · 11,0 · 11,2 ·
  12,1 min. Un total au chiffre près n'a pas de sens ; l'ordre relatif, oui.

### Le rayon du canal MIDI

- `chan:N` **259** occurrences (11 fichiers) — dans un **marqueur de contrôle** au fil du flux.
- `ch:N` **14** occurrences (9 fichiers) — dans le **sac de sortie** d'un acteur, ou sur une
  occurrence.
- `channel:N` **0** — cette graphie n'existe pas ici.
- **KAN-55** `ouvert` — **une quatrième forme, en PROSE** : `channel N` sans deux-points,
  dans une commande de script — 2 occurrences en `.bps`, 8 en `.gr`. Aucun motif cherchant
  `channel:` ne la trouve. Ce n'est pas du langage : c'est du texte de commande hérité du
  natif. `alan-dice` et `beatrix-dice` la portent et sont déjà des rouges déclarés, sous un
  autre sujet.
- ⛔ `ch:` et `chan:` **ne vivent pas au même endroit**. Avant toute unification, établir si
  ce sont deux noms d'une chose ou deux choses.

### Défauts d'instrument payés ce jour — cinq, et ce qu'ils enseignent

- **KAN-56** `ouvert` — **inscrire l'injection prouvée dans les gardes qui n'en ont pas.**
  Cinq de mes propres instruments ont menti dans la même journée : un motif qui espaçait le
  tiret de la flèche `->` ; un filtre visant un champ inexistant (`deriveMs` au lieu de
  `derivationTimeMs`), donc mordant sur rien ; une flèche cherchée dans un **commentaire de
  fin de ligne** ; une empreinte comparant les **numéros de ligne** que le geste déplace ;
  un total « hors commentaire » **étiqueté** « blocs de code » sans que les 20 lignes soient
  regardées.
- **Ce qui les distingue** : deux se sont trahies par un résultat absurde (306 scènes
  cassées, 0 identique sur 312). **Trois ont rendu un chiffre plausible** — et celles-là ne
  déclenchent aucune vérification. Une empreinte doit exclure ce que le geste **déplace
  légitimement**, pas seulement ce qui varie tout seul.

### Six scènes de provenance retirées avec le mot qui les portait

- **KAN-60** `ouvert` — le **2026-08-19**, six scènes sortent avec le mot de provenance
  (`hub/decisions/2026-08-17-factory-et-mine-sortent-du-langage.md`, arbitrage Romain du même jour :
  « il n'existe pas encore, on verra plus tard — si, il sort, maintenant »). Elles éprouvaient la
  résolution d'un **fichier personnel** : le répertoire, le fichier et son balayage n'existent nulle
  part, et le remplacement viendra plus tard.

  **Mesuré avant de retirer**, quatre graphies sur la même scène : avec la provenance elle compile
  et le cri vient de la résolution ; sans elle, refus à l'analyse ; par l'axe standard, elle compile
  mais change de sujet ; l'entrée nue est refusée. **Le cas ne meurt pas, il change d'étage** — et
  un banc qui mesurait un cri de résolution passerait au vert en ne mesurant plus rien.

  Leur sujet revient avec le répertoire personnel ; l'historique les rappellera. Leurs empreintes
  d'avant sont chez Kairos, mesurées par le chemin de production.

- **KAN-61** `ouvert` — **le garde des copies miroir lit deux voisins par un état non
  reproductible.** `scripts/garde-copies-miroir.mjs:35-45` compare mes copies de contrat aux
  originaux : le hub par son **arbre de travail**, deux paquets par leur **artefact construit**
  (`dist-types/`, `dist/`), régénéré à chaque poussée du voisin. Un verdict peut donc changer sans
  qu'aucun commit ne bouge.

  Pour le hub, la lecture au commit publié s'applique directement. **Pour les deux artefacts, non** :
  ce qui est comparé n'existe dans aucun dépôt publié — le lire autrement demanderait que ces
  voisins publient leurs types déclarés, ou que la comparaison porte sur leur source. Deux
  changements de frontière, hors de mon arbitrage.

- **KAN-62** `ouvert` — **une campagne de portillon a analysé 43 fichiers de moins qu'à
  l'ordinaire, une seule fois, et cette fois-là a rougi.** Mesure du **2026-08-19**, prise sur les
  sept campagnes de la journée : six annoncent `644 FILES 0 ERRORS`, la septième `601 FILES
  4 ERRORS`. Les quatre erreurs sont de même nature — un paramètre au type implicite — et trois
  d'entre elles portent sur le même appel, dont le type générique n'était pas honoré
  (`bpx-adapter.ts`, `interpsForScene`). La campagne suivante, code inchangé, est revenue à 644
  fichiers et zéro erreur.

  **La cause est établie**, par deux mesures indépendantes : 43 fichiers perdus par ma campagne, et
  43 déclarations atteignables depuis l'entrée de types de BPx. Les 43 accès tracés par Kairos ne
  font pas une troisième jambe — ce qu'un consommateur atteint et ce que BPx expose sont la même
  mesure vue des deux bouts. Mon vérificateur a **énuméré ce paquet à l'instant
  où il n'existait pas**, entre les deux renommages de sa bascule — l'ancien parti, le neuf pas
  encore arrivé. Il en a résolu **zéro**, le générique de la signature d'émission n'a pas été
  honoré, et trois de mes fichiers ont été accusés pour une signature qui n'arrivait pas.

  Une bascule par renommage est atomique pour qui **ouvre** un fichier, et pas pour qui **parcourt**
  l'arbre. La fenêtre vaut la durée d'un renommage, mesurée chez BPx à une disparition sur 881 414
  lectures. La supprimer demande de basculer un lien symbolique au lieu d'un répertoire : seize
  dépôts, décision de Romain.

  **Le refus à zéro par porte** (`scripts/lib/voisins-lies.mjs`, `portesDuVoisin`) tient ce cas
  depuis : une entrée déclarée qui ne répond pas arrête la campagne en nommant le voisin et la
  porte. **Aucune relance** : un rouge se garde et l'accusation se retire, sinon un défaut
  intermittent disparaît du rapport sans disparaître du produit.

- **KAN-64** `ouvert` — **deux clés de la surface de pilotage n'ont aucun lecteur de banc mesuré.**
  Mesure du **2026-08-19**, périmètre établi sur les 57 bancs d'écran suivis, avec témoin positif
  prouvant que la recherche les atteint : `personalPitchLib` et `audioTap` (`packages/ui/src/main.ts`)
  ne sont nommées par aucun. Le commentaire qui affirmait le contraire pour la première est retiré.

  **`personalPitchLib` est sortie le 2026-08-20**, avec toute la chaîne qui l'alimentait : « il ne
  doit y avoir strictement aucune particularité relative aux librairies personnelles, et c'est le
  compilateur qui résout les fichiers de librairie » (décision Romain du 2026-08-19). La question
  n'était pas « ce canal porte-t-il quelque chose » — un canal qui distingue une librairie
  personnelle **est** la particularité.

  **`audioTap` reste** et demande sa propre mesure avant d'être jugée : une clé sans lecteur de banc
  n'est pas une clé sans usage.

- **KAN-63** `clos par l'architecte le 2026-08-19` — **l'état d'un voisin lu vivant dit s'il a enregistré, jamais s'il est en
  train d'écrire.** `scripts/lib/voisins-lies.mjs` mesure par `git status` : un dépôt dont la
  source est à moitié écrite présente un arbre propre à chaque instant. Mon refus de construction
  et la légende de mes campagnes portent donc une propreté qui vaut pour l'enregistrement seul.

  **Tombé : la question ne se pose pour aucun de mes voisins.** Ce qui arrive par le champ `exports`
  d'un paquet **est** un paquet, quel que soit son contenu — ouvrir et importer ne sont pas le même
  geste, et c'est le geste qui classe. Mes onze voisins et les librairies de BPScript passent tous
  par cette porte. **Un seuil est refusé, et la question ne se posait que pour la source vive.** Une autorité se lit
  au commit publié, qui ne s'écrit pas pendant qu'on le lit : `scripts/garde-copies-miroir.mjs`
  lit désormais ainsi le contrat de l'événement d'entrée, sur la branche que le dépôt **déclare**
  dans `hub/contrats/branches-de-reference.tsv`. Restent onze voisins consommés en source vive,
  que le contrat `ce-qu-un-banc-lit-chez-son-voisin.md` exclut explicitement — leur régime de
  lecture relève de l'architecture. Portés à Romain comme question, avec les deux artefacts
  construits de KAN-61 et le cas des librairies lues par le produit.


### Ma documentation écrit des formes que le langage a retirées

Mesure du 2026-08-19, prise par recherche bornée sur `docs/`, périmé et légitime séparés.

- **KAN-59** `ouvert` — **treize documents décrivent la déclaration d'un acteur et sa sortie avec
  une graphie que le compilateur refuse.** Ils portent l'arobase en tête de directive (retirée le
  2026-08-16) et le mot du canal de sortie, remplacé par la direction
  (`hub/decisions/2026-08-04-la-direction-s-ecrit-in-et-out-remplacent-transport.md:8`, registre
  `hub/decisions/MOTS-SORTIS.md:18`). Répartition : `docs/spec/KANOPI_LANGUAGE.md` (7),
  `docs/design/DEVICES_SPEC.md` (7), `docs/mockups/kanopi-v1-mockup.html` (5),
  `docs/design/ARCHITECTURE.md` (4), `docs/reference/HARDWARE_COLLECTION.md` (2),
  `docs/design/LANGUAGE_SPEC.md` (2), et sept documents à une occurrence.

  **Mon code n'en porte aucune** — vérifié sur `packages/ui/src`, zéro occurrence, instrument
  contrôlé sur un mot certainement présent. Les scènes `.bps` n'en portent aucune non plus : leurs
  quatorze mentions sont le mot courant, en commentaire de prose.

  ⚠️ **Ce qui se ressemble et ne se touche pas** : l'API de transport de Kronos — arrêt, lecture,
  réglage du tempo, neuf occurrences — et le nom du contrat de frontière, cinq. Un balayage sur le
  mot nu les emporte. La graphie qui porte la décision est le mot **suivi d'un point et d'un canal**,
  ou **suivi de deux-points**.

  Signalé par runtime-OSC, qui cite la clé à six endroits chez lui, tous en commentaire et aucun
  exécuté. Le nom est à moi, la réparation aussi, et il suit le nom retenu.


### L'index du dépôt — ce qu'il servait et ce qu'il ignorait

Mesure du 2026-08-18, prise sur la base d'index et sur l'arbre de travail.

> ⚠️ **CES CHIFFRES DÉCRIVENT L’ÉTAT DU 2026-08-18 AU SOIR.** Ils ne se citent plus sans cette
> date. **Relevé du 2026-08-19 à 10h37 : 423 fichiers indexés, 0 absent du disque**, contrôlé
> chemin par chemin sur les 423.
>
> Ce que le relevé ne prouve pas : l’index se reconstruisait ce matin-là. Il atteste qu’aucun
> fichier indexé ne manque du disque, **pas** que le retrait fonctionne durablement — un index qui
> vient de tout réingérer n’a mécaniquement rien d’obsolète. Se redate hors reconstruction.

- **KAN-57** `ouvert` — **la source déclarée de l'index pointait hors du dépôt.** Elle
  désignait `/home/romi/dev/music/kanopi` ; le dépôt vit à `/home/romi/dev/bp/kanopi`. La
  synchronisation ne faisait donc rien depuis le déménagement, et le disait en une ligne
  (`path missing — skipped`, `nothing to do (no valid source)`) que seule une passe à blanc
  révèle. Racine corrigée, source morte retirée, synchronisation lancée.

| | avant | après |
| --- | --- | --- |
| documents indexés | 787 | 1056 |
| vivants servis | 150 | 425 |
| **vivants absents de l'index** | **183 / 321** | **0 / 321** |
| morts servis | 637 | 631 |

- **Le chiffre brut ment sur le risque — discriminer par nature.** Des 637 morts, **579
  n'ont jamais été versionnés** : captures d'écran, résultats de test, fichiers temporaires,
  qui ne trompent personne. **58 sont du document rédigé et du code supprimé** — noms
  crédibles, sortis en tête de recherche. Le pourcentage à citer est celui-là.
- **Le défaut coûteux est l'absence, pas le fantôme.** Un mort qui sort est bruyant : on
  ouvre le fichier et on voit qu'il n'existe plus. Un vivant absent est silencieux — la
  recherche rend le meilleur résultat qu'elle a, sans dire qu'elle n'a pas le bon, et l'on
  conclut que la chose n'existe pas. Sur une requête ordinaire, deux modules supprimés
  sortaient en 2e et 4e position pendant que leurs remplaçants vivants, dans le même
  dossier, sortaient après eux.
- **KAN-58** `ouvert` — **631 morts restent servis.** Le retrait s'inscrit dans une file
  tenue par un service partagé entre vingt projets ; il n'est pas atteint. L'outil porte en
  outre un coupe-circuit qui refuse d'effacer une grande fraction d'un corpus en une passe.
  La réparation attend un arbitrage sur la priorité de la tour dans ce service.
- **La forme du chemin dit l'existence, et seulement sur un index dont la source résout.**
  Une recherche rend les fichiers vivants en chemin absolu et les morts en relatif — la
  résolution est refaite à chaque requête. Sur une source morte la résolution échoue
  toujours : tout sort en relatif, et le signe déclare tout le monde mort.
- **KAN-65** `ouvert` [P3] — (2026-08-21) DEUX BANCS D'ECRAN INSTABLES, mesures sur trois campagnes — p5 (2 sur 3) rend litPixels=-1, le canvas n'existe pas encore : une ABSENCE, pas un pixel faux ; bp3-midi (2 sur 3) ne trouve pas le titre, la page n'avait pas fini de charger. Les deux sentent l'attente trop courte sous charge (7,9 a 12,9 sur 12 coeurs). ⛔ NE PAS ELARGIR L'ATTENTE : ce serait ajuster l'assertion a ce qui sort. La cause se mesure — attendre un ETAT, pas une duree.
- **KAN-C60** `ouvert` [P2] — **Une conversion de type sur ma frontière avec Kairos rend le vérificateur MUET dans les deux sens.** Mesuré par kanopi le 2026-08-23 : `bpx-adapter.ts:335` sort le contexte de projection par un `as unknown as`. Retirée le temps de la mesure et remplacée par `satisfies`, elle découvre **TROIS écarts de frontière** — `modLib` vu comme obligatoire (`:334`), `HomomorphismLib` avec `type: string` contre `type: "homomorphism"` (`:326`), et `PortType` en `Record<string,string>` contre `Record<string,PortType>`. Deux sont sans rapport avec le sujet du jour et probablement anciens. ⇒ **Le troisième — `PortType` — SE PÉRIME le 2026-08-30** : l'`ACTION_LIB` est retiré (`bf724e3`), il n'y a plus de conversion à ce point. **Les deux autres restent entières.** *Relevé par runtime-codevoices en mesurant chez kanopi, inscrit par l'architecte à sa demande.* **Conversion restaurée, rien commité** : ouvrir ces trois élargirait la commande. ⚠️ Ce que la mesure établit au-delà des trois : tant que la conversion est là, **aucun changement de contrat chez Kairos ne peut la faire rougir, ni en bien ni en mal** — sa prédiction « ton typage ne rougira pas » était vraie pour la mauvaise raison.

- **KAN-66** `ouvert` — (2026-08-24) **LE GARDE QUI MESURE MA PRODUCTION SUR LES PAQUETS PUBLIÉS DE
  MES VOISINS — IL BARRE, IL N'AVERTIT PAS.** Arbitrage de l'architecte du 2026-08-24, rendu en son
  nom et daté : ce qu'il mesure n'est pas « mon voisin est-il à jour », c'est « ma production
  fonctionne-t-elle sur le paquet publié de mon voisin ». Quand il échoue, ma production est
  vraiment cassée à cet instant. Ce qui évite le blocage est un **rouge inscrit avec sa cause** —
  nommé, daté, avec son amont et sa condition de sortie : `rouges-de-production.ts`, en place.
  **Ce que le trou a laissé passer** : 306 scènes sur 306 refusées à la projection par le paquet
  publié de Kairos, zéro projetée, pendant que les 111 essais du portillon restaient verts. Trouvé
  par une sonde écrite à la main.
  ⛔ **ET L'OBSTACLE EST MESURÉ, PAS SUPPOSÉ : CE GARDE NE PEUT PAS VIVRE DANS VITEST.** La campagne
  fourche node avec `--conditions development --conditions node` (mesuré le 2026-08-24). Tout import
  natif y résout donc les voisins par leur **source**, y compris ceux qu'un paquet construit tire
  derrière lui : un banc qui charge le paquet de BPx obtient la **source** de Kronos, et mesure un
  hybride qui n'est ni ma source ni ma production. Une première version a été écrite puis **retirée
  pour cette raison** — un instrument qui ment ne se garde pas au motif qu'il est vert.
  **Ce qui reste à trancher** : hors de vitest, le garde n'atteint plus le câblage du contexte de
  projection, qui vit dans mon adaptateur TypeScript et dont le catalogue d'actions se construit à
  partir de pièces de l'hôte. Le recopier serait la faute que ce dépôt interdit. Les deux voies —
  extraire ce câblage vers un module que les deux importent, ou construire le garde avec les
  conditions de production — sont portées à l'architecte.
  **Témoin minimal du garde, quand la voie sera choisie** : `scenes/bp3/bp-acceleration.gr`,
  `BPScript-tests/kairos-hauteur-ancre-alphabet-sargam.bps`, `code-voices/01-strudel-solo.bps`.

- **KAN-67** `ouvert` — (2026-08-24) **DEUX GRAMMAIRES DÉCLARENT UN FICHIER DE RÉGLAGES QUE PERSONNE
  NE PORTE.** `BP3-tests/checkVolChan.gr` et `BP3-tests/tryConsoleMaxTime.gr` référencent
  `-se.checkVolChan` et `-se.tryConsoleMaxTime` ; mes 143 fichiers de réglages ne les contiennent
  pas, et bp3-frontend les a cherchés à trois emplacements chez lui sans les trouver. Les deux
  grammaires refusent aujourd'hui pour cette raison, parmi d'autres pour `checkVolChan`.
  **Et ces 113 grammaires n'ont aucun banc** : mon banc de statut de corpus a un périmètre
  explicitement `.bps`, mes essais d'écran BP3 portent sur la vitrine de `scenes/bp3/`. Ni au vert
  ni au rouge — le trou est à moi.
  **Mesuré aussi au passage, et c'est chez bp3-frontend** : mes 22 fichiers de réglages au format
  positionnel sont le seul endroit où son lecteur positionnel est exercé — son corpus n'en porte
  aucun. Onze d'entre eux lui rendent un `c4key` impossible. Reporté, à lui.

- **KAN-68** `ouvert` — (2026-08-25) **UN DOUZIÈME DÉPÔT ENTRE DANS MON PAQUET ET N'EXISTE DANS AUCUN
  DE MES DISPOSITIFS.** `scripts/publish/build-and-deploy.sh:74` construit la documentation
  utilisateur depuis `../atlas/doc-utilisateur`, **par chemin de disque**. Atlas n'est donc dans aucun
  manifeste, dans aucun lien symbolique, et par conséquent : absent de mon relevé de voisins (onze),
  absent de ma pièce consommateur (`etat-pris`), absent de mes gels de campagne, absent de la mesure
  « neuf vers un arbre de travail, deux vers un paquet » que j'ai confirmée à l'architecte le
  2026-08-25 — elle porte sur les manifestes, et lui n'y est pas.
  **Sa doc entre pourtant dans mon paquet** (`public/docs` → `dist/docs`), donc dans ce qui part à
  l'utilisateur, et mkdocs lit son ARBRE DE TRAVAIL, pas un commit.
  Le seul filet existant est un refus de publication en production sur arbre sale
  (`build-and-deploy.sh:89-102`) : il ne couvre ni la fraîcheur, ni l'état pris, ni le gel.
  ⛔ **Et ce trou se croyait déjà inscrit** : le commentaire de `build-and-deploy.sh:84` dit « le reste
  est au backlog » depuis le 2026-08-21, et il n'y était pas — une affirmation du code qui se relisait
  comme une preuve. Item ouvert le jour où j'ai mesuré le renvoi.
  **Ce qui le referme sans effort de mon côté** : la décision de Romain du 2026-08-25, qui ouvre la
  publication de la doc publique d'atlas au régime `bp/.paquets/<nom>-<commit>` — je consommerais
  alors un état figé et déclarable, comme les onze autres.
- **KAN-69** `ouvert` [P2] — Mon filtre d entrees de catalogue et le banc qui le garde tiennent sur la NATURE seule — un objet est une entree. Un PROTOTYPE DE TETE est un objet : il franchit les deux, et le banc reste VERT. Mesure du 2026-08-25 sur la forme predite par BPscript — 16 entrees sur son paquet actuel, 17 sur la forme predite, prototype compris, contre 16 annoncees. Le banc porte deja la phrase depuis le 2026-08-24 : « la nature seule ne suffit pas, elle est vraie par accident » — la frappe de BPscript retire l accident. Reparation : un critere de STRUCTURE, la trace de derivation publiee dans le paquet, dont le nom de champ n est pas encore connu.
