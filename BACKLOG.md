# Kanopi — Backlog

Items différés (hors périmètre immédiat), tracés pour ne pas les perdre.

## Migration Kronos — retirer l'ancien dispatcher (état fait / reste)

> Kronos drive le son sur le **chemin audio mono** (flag `audio-engine=kronos` défaut |
> `legacy` filet). **Tout ce qui n'est pas couvert retombe sur legacy** (repli + warning,
> jamais de drop silencieux). Pour **retirer legacy**, le chemin Kronos doit couvrir le
> RESTE ci-dessous. `[P]` = primitive Kronos prête → câblage HÔTE ; `[N]` = à concevoir.

### FAIT (passe par Kronos)

- **KAN-1** `fait` — Flip audio mono (notes), boucle.
- **KAN-2** `fait` — CV : signal / par-note (`*:`) / terminal (`<term>:`) / **voix sœur** (env1/2/3 suivies) + pan ; composition via `buildModulators`/`resolveVoice`/`composeLeafModulations`.
- **KAN-3** `fait` — **Re-random** (toggle LIVE → handle kronos).
- **KAN-4** `fait` — **Curseur** (depuis `Cursor.position`, calé sur le son, ~1 frame).
- **KAN-5** `fait` — **Seek / Pause / Step** : seek = `clock.start`+`scheduler.start` ; Step = un temps EN PLACE (timeline complète, seek, stop après un temps — ne modifie pas la production).

### RESTE pour retirer legacy (par priorité)

- **KAN-6** `ouvert` — 1. **Scènes orchestrées multi-acteurs** `[P]` — le flip est mono ; `@actor/@scene` → legacy. Kronos route par acteur (`addAdapter`) ; câbler l'orchestration (un adaptateur/acteur, mapping acteur→voix). **Gros morceau.**
- **KAN-7** `ouvert` — 2. **Backtick cross-runtime + voix de code** `[N]` — `BT<interp><id>` → Strudel/Hydra déclenché dans le temps (sinks `<fileId>::<actor>`, re-arm) via l'ordonnanceur Kronos.
- **KAN-8** `ouvert` — 3. **Sorties multi-runtime** `[P]` — MIDI (`runtime-midi`), OSC, DMX : un `RuntimeAdapter` Kronos par sortie (latence propre). Aujourd'hui MIDI passe encore par legacy (sink MIDI sauté sur step). **Gros morceau, recoupe #1 (routage par acteur/sortie).**
- **KAN-9** `ouvert` — 4. **Events de nature control** `[P]` — cœur prêt (S1 : un `TimelineEvent` `kind:'control'` + `nature` est émis horodaté). Action HÔTE : porter les nœuds `control` de l'arbre dans la timeline Kronos (`kind:'control'`+`nature`) et les APPLIQUER dans l'adaptateur. Latent (0 nœud control dans les démos actuelles ; le flux per-note est déjà sur `leaf.controls`). `transport-control` = output-facing (émis) ; `instant` aussi ; `engine-control` → cœur (différé).
- **KAN-10** `ouvert` — 5. **Tempo warp live** `[P]` — changer le BPM en lecture → `InternalClock.retune` (comme le re-random live). Câblage du contrôle de tempo vers le handle kronos.
- **KAN-11** `ouvert` — 6. **Arm/désarm acteur** `[P]` — `Scheduler.setActorMuted` livré par Kronos ; brancher le geste UI dessus.
- **KAN-12** `ouvert` — 7. **CV expr / samples** `[N]` — courbes backtick (`kind:'expr'`) + LFO périodique worklet.
- **KAN-13** `ouvert` — 8. **(propreté, pas bloquant)** migrer la composition CV (`composeCvBindings`, transitoire @kanopi/ui) → **couche 1 Kronos** (acté archi).

Ordre suggéré : **6 + 5** (petits, primitives prêtes) → **1 + 3** ensemble (orchestration +
MIDI, routage commun) → **2** (backtick) → **4 / 7**. Legacy retirable quand 1-7 passent par Kronos.

Réf : `kronos/docs/EX4_BRANCHEMENT.md`, `kronos/docs/CHARTER.md`,
`docs/design/TEMPORAL_INTERPRETER.md`.

## UI / Workspace

- **KAN-14** `ouvert` — **Suppression de fichier** : Kanopi n'a aucune suppression de fichier (ni bouton/menu contextuel dans l'arbre, ni API store `removeFile`). Seule la commande `workspace.reset` (palette) nettoie — globalement. Ajouter une suppression par fichier (FileTree + `workspace.removeFile` + persistance). Trouvé en session 2026-06-20.

## Éditeur

- **KAN-15** `ouvert` — **Validation `.gr` (indicateur de compilation)** : `programCompileStatus` n'est applicable qu'au `.bps` (via `compileToBPxAST`). Le `.gr` natif se parse par `parseBP3` (validateur différent, nécessite la plomberie d'alphabet) ; lancer le transpileur `.bps` dessus donnait une fausse erreur → restreint au `.bps`. Pour donner au `.gr` un vrai indicateur, brancher `parseBP3` (deux passes alphabet) dans `programCompileStatus`. 2026-06-20.

## Production / projection (post-bêta)

- **KAN-16** `ouvert` — **Replier les parcours d'arbre sur `flattenTree` par calques** : BPx a livré l'API de projection par calques (PROJECTION.md). Replier `treeToDispatchEvents` (audio), `orderedTokensFromTree` (texte), `bpxTreeToTimelineStream` (piano-roll) et le sink MIDI en projections d'une seule linéarisation. Après validation/déploiement bêta Romain.

## Performance lecture (si besoin)

- **KAN-17** `ouvert` — **Calque dédié au curseur** : `timeline.setCursor` repeint tout le piano-roll ; coût ∝ taille de la production. Si une grosse scène sature au profilage (onglet 1er plan), repeindre seulement la ligne du curseur sur un calque séparé. cf `docs/design/PLAYBACK_LOOP.md`.
- **KAN-arabic** `ouvert` [P1] — NON-WESTERN : arabic.bps derive 0 note -> chemin audio muet (routage Kanopi de la resolution Kronos, pas BPx ni Kronos)

## Audit conformité 2026-06-24 (65 findings, clusters A-G)
- **KAN-A01** `ouvert` — [haute/CONFIRMED] stores/scenes.svelte.ts:18 — `active` non projeté ; pilote le vrai mute audio (D5)
- **KAN-A02** `ouvert` — [moyenne/PLAUSIBLE] lib/core-real/real-core.ts:378 — `replayActiveScene` force active:true partout au Play (D5)
- **KAN-A03** `ouvert` — [moyenne/PLAUSIBLE] lib/core-real/real-core.ts:336 — `silenceRuntimes` force active:false partout (D5)
- **KAN-A04** `ouvert` — [basse/PLAUSIBLE] lib/core-real/real-core.ts:114 — publish force active:true (prétend un fait Kronos) (D5)
- **KAN-A05** `ouvert` — [moyenne/CONFIRMED] lib/persistence/snapshot.svelte.ts:46 — restaure activeScene/activeActors depuis localStorage (D5)
- **KAN-A06** `ouvert` — [moyenne/PLAUSIBLE] components/topbar/BpsScenesBar.svelte:18 — litScene optimiste avant l'await, sans rollback (D5)
- **KAN-A07** `ouvert` — [moyenne/CONFIRMED] components/right-panel/InspectorPanel.svelte:38 — compte filter(a=>a.active) (D5)
- **KAN-A08** `ouvert` — [moyenne/CONFIRMED] components/editor/Tab.svelte:9 — live-dot vert depuis a.active (D5)
- **KAN-A09** `ouvert` — [moyenne/CONFIRMED] components/right-panel/ScenesPanel.svelte:32 — class:active={s.active} (D5)
- **KAN-A10** `bloqué` — [haute/CONFIRMED] lib/runtimes/bpx-adapter.ts:1461 — withDefaultScene injecte une scène par défaut non sourcée (D5)  _(bloqué: modele corrige (Romain 2026-06-24) : le defaut n est PAS injecté par Kanopi -> retirer withDefaultScene ; le defaut entre dans l AST via BPScript (BPS-defaut-env). Kanopi fournit juste l environnement)_
- **KAN-A11** `ouvert` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:222 — règle "scène=plus petit int" inventée + dupliquée dans bpsScenes.svelte.ts:55 (D5)
- **KAN-B01** `fait` — [haute/CONFIRMED] lib/runtimes/bpx-adapter.ts:1845 — soundsFn occidental → alphabet non-western SKIP = arabic.bps MUET (D1/D3)  _(fait: non-western PROUVE ECRAN (arabic 0->15 notes, RMS 0.128) ; 3 portes western remplacees par resolver.sounds() alphabet-aware — d510fbf)_
- **KAN-B02** `fait` — [moyenne/PLAUSIBLE] lib/runtimes/bpx-adapter.ts:1651 — productionSounds 2e prédicat → afficheur ment sur sonne/muet (D1)  _(fait: idem B01 (productionSounds + orchestratedFilter:1890, la 3e porte trouvee a l ecran) — d510fbf)_
- **KAN-B03** `bloqué` — [moyenne/CONFIRMED] lib/runtimes/kronos-audio.ts:598 — rq.transpose détecté jamais appliqué → mauvaise hauteur (D1/D9)  _(bloqué: transpose detecte non applique — pas de primitive ; escalade Kronos (offset par note en resolution ; controls.json = transpose runtime/_script fait autorite). Item KRO-transpose ouvert)_
- **KAN-B04** `fait` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:778 — alphabet:'western' forcé pour @actor sans alphabet (D7)
- **KAN-C01** `ouvert` — [haute/CONFIRMED] stores/kronos-cursor.svelte.ts:137 — compteurs #absBeat/#absBar ≠ position Kronos (repliée) (D2)
- **KAN-C02** `fait` — [haute/CONFIRMED] lib/runtimes/kronos-audio.ts:313 — longueur de boucle = reduce(max) hôte vs totalDurationBeats BPx (D2/D7)  _(fait: loop length projette totalDurationBeats BPx (fc4bba5) ; preuve NON circulaire (mutation du champ deplace la borne) — apres auto-correction honnete)_
- **KAN-C03** `fait` — [moyenne/PLAUSIBLE] core/dispatcher.js:145 — jumeau reduce(max) ; dispatcher.duration préféré à la durée BPx (D2)  _(fait: idem C02 — fc4bba5)_
- **KAN-C04** `ouvert` — [moyenne/CONFIRMED] stores/playback.svelte.ts:112 — STEP recalcule prochain battement + 2e repli de boucle hôte (D2)
- **KAN-C05** `fait` — [moyenne/CONFIRMED] lib/runtimes/kronos-audio.ts:719 — pauseAtBeatEnd (mort) recalcule frontière+pliage (D2)  _(fait: D/E #2, poussé (gate vert 198/198))_
- **KAN-C06** `ouvert` — [moyenne/PLAUSIBLE] stores/production.svelte.ts:133 — beatCount : quantif (epsilon/ceil) inventée (D2/D7)
- **KAN-C07** `ouvert` — [moyenne/CONFIRMED] lib/runtimes/kronos-audio.ts:222 — BEATS_PER_BAR=4 en dur (3e copie) (D7)
- **KAN-C08** `ouvert` — [moyenne/CONFIRMED] stores/kronos-cursor.svelte.ts:125 — events bar floor(beat/4), ignore beatsPerBar (D7)
- **KAN-C09** `ouvert` — [moyenne/CONFIRMED] stores/clock.svelte.ts:73 — store #beatsPerBar = signature d'autorité hôte (D7) — DÉBLOQUÉ result.meter
- **KAN-C10** `fait` — [moyenne/CONFIRMED] stores/clock.svelte.ts:24 — currentBpm=128 : 2e copie tempo (grille STEP) (D7/D9)  _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-C11** `ouvert` — [moyenne/CONFIRMED] stores/clock.svelte.ts:27 — clampBpm [20,300]+arrondi : politique tempo inventée (D7)
- **KAN-C12** `ouvert` — [basse/CONFIRMED] components/topbar/TransportCluster.svelte:56 — n° barre (Kronos BPB=4) ≠ nb LEDs (D7)
- **KAN-C13** `ouvert` — [basse/CONFIRMED] components/topbar/TransportCluster.svelte:62 — dots vs pos.beat, 2 signatures (D7)
- **KAN-C14** `ouvert` — [moyenne/CONFIRMED] components/topbar/TransportCluster.svelte:61 — commentaire "@time 7/8→7 dots" faux (D7)
- **KAN-C15** `ouvert` — [basse/CONFIRMED] components/topbar/TransportCluster.svelte:93 — clamp saisie [20,400] ≠ store [20,300] (D7)
- **KAN-C16** `ouvert` — [basse/PLAUSIBLE] components/topbar/TransportCluster.svelte:79 — writeTempoToScene réécrit @mm au TAP (mute la source) (D1/D3) — ESCALADE archi
- **KAN-C17** `fait` — [basse/PLAUSIBLE] lib/persistence/snapshot.svelte.ts:39 — tempo restauré depuis localStorage (autorité tempo) (D7/D1)
- **KAN-C18** `ouvert` — [basse/PLAUSIBLE] components/statusbar/Statusbar.svelte:15 — commentaire évoque une signature non appliquée (D2)
- **KAN-D01** `ouvert` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:412 — headSectionNames re-parse la source .gr (pilote STEP) (D3)
- **KAN-D02** `ouvert` — [moyenne/CONFIRMED] lib/runtimes/head-sections-ast.ts:137 — sectionLeafCounts = mini-évaluateur de grammaire (D9)
- **KAN-D03** `ouvert` — [moyenne/PLAUSIBLE] lib/runtimes/head-sections-ast.ts:117 — headSectionsFromAst re-marche le RHS (D3)
- **KAN-D04** `fait` — [moyenne/PLAUSIBLE] lib/timeline/timeline.js:334 — analyseur de grammaire maison (regex), branche morte mais prête (D3/D9)  _(fait: D/E #2, poussé (gate vert 198/198))_
- **KAN-D05** `ouvert` — [moyenne/CONFIRMED] lib/library/referenced.ts:172 — .gr passé au mauvais parseur (compileBps) (D3)
- **KAN-D06** `ouvert` — [basse/CONFIRMED] lib/library/referenced.ts:80 — directivesFromText regex = parseur @ dupliqué (D9)
- **KAN-D07** `ouvert` — [basse/PLAUSIBLE] components/editor/lang-bpscript.ts:219 — hoverHitAt re-parse 5 regex (D9) — partiel ESCALADE amont
- **KAN-D08** `fait` — [basse/CONFIRMED] lib/runtimes/mm-directive.ts:12 — parseMmDirective regex (mort ; AST l'expose) (D9/D3)  _(fait: D/E #2, poussé (gate vert 198/198))_
- **KAN-D09** `ouvert` — [basse/PLAUSIBLE] lib/text-order/bpx-tree-canonical.ts:59 — re-sérialise l'arbre→texte (grammaire d'ordre dupliquée) (D3/D9)
- **KAN-D10** `ouvert` — [basse/PLAUSIBLE] lib/text-order/bpx-tree-canonical.ts:49 — idem (D9) — ESCALADE BPx : sérialiseur amont tree→ordre
- **KAN-D11** `ouvert` — [basse/CONFIRMED] components/topbar/StrudelStatusPill.svelte:31 — scan regex strudel: au lieu de la table de backticks (D9)
- **KAN-D12** `ouvert` — [basse/PLAUSIBLE] lib/runtimes/bpx-adapter.ts:955 — bornes de sections .gr par division égale (structure inventée) (D3) — ESCALADE BPx/archi
- **KAN-E01** `fait` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:670 — modulatorsFromAst duplique buildModulators (D9)  _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-E02** `fait` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:1771 — registre modulateurs forwardé à zéro consommateur (D9)  _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-E03** `fait` — [basse/CONFIRMED] lib/runtimes/bpx-adapter.ts:641 — CVLib/CV_LIBS redéclarent le schéma mod.json (D9)  _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-E04** `fait` — [moyenne/CONFIRMED] lib/runtimes/tree-dispatch.ts:328 — resolveCvControls morte, gardée par son test (D9)  _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-E05** `fait` — [moyenne/CONFIRMED] lib/runtimes/cv-table.test.ts:3 — test cimente modulatorsFromAst mort (D9)  _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-E06** `ouvert` — [moyenne/CONFIRMED] lib/runtimes/section-bounds.test.ts:4 — test cimente sectionLeafCounts hôte (D9/D3)
- **KAN-E07** `fait` — [basse/PLAUSIBLE] core/dispatcher.js:106 — _modulators + setModulators inertes (double forward mort) (D9)  _(fait: D/E #1, poussé (gate vert 203/203))_
- **KAN-E08** `fait` — [basse/PLAUSIBLE] core/dispatcher.js:83 — champ def de _actors jamais lu (commentaire trompeur) (D9)  _(fait: D/E #2, poussé (gate vert 198/198))_
- **KAN-E09** `fait` — [basse/CONFIRMED] core/dispatcher.js:80 — champ transport de _actors toujours null (branche pickTransport morte) (D9)  _(fait: D/E #2, poussé (gate vert 198/198))_
- **KAN-E10** `ouvert` — [moyenne/PLAUSIBLE] stores/production.svelte.ts:59 — types ProductionTree* = miroir manuel de l'arbre BPx (as unknown as) (D9)
- **KAN-E11** `ouvert` — [basse/PLAUSIBLE] lib/text-order/bpx-tree-canonical.ts:110 — makeNameResolver dupliqué (canonical vs stream) (D9)
- **KAN-E12** `ouvert` — [moyenne/CONFIRMED] lib/runtimes/bpx-adapter.ts:1183 — runtimeForInterp = 2e table interp→runtime (D9)
- **KAN-E13** `ouvert` — [basse/CONFIRMED] lib/runtimes/bpx-adapter.ts:1642 — treeToDispatchEvents appelé 2× par eval (perf/D1)
- **KAN-E14** `ouvert` — [basse/PLAUSIBLE] lib/runtimes/kronos-audio.ts:407 — pickTransport repli sur 1er transport énuméré (routage fabriqué) (D9/D1)
- **KAN-F01** `ouvert` — [moyenne/CONFIRMED] stores/workspace.svelte.ts:18 — starterFiles() auto-amorce main.bps/second.bps (faux disque) (D6)
- **KAN-F02** `ouvert` — [moyenne/CONFIRMED] lib/workspace/types.ts:33 — extension absente/inconnue → runtime 'bpscript' deviné (D7/D5)
- **KAN-F03** `ouvert` — [basse/CONFIRMED] components/right-panel/ScenesPanel.svelte:7 — runtimeOf ?? 'bpscript' (couleur non prouvée) (D7/D1)
- **KAN-F04** `ouvert` — [basse/CONFIRMED] components/statusbar/Statusbar.svelte:57 — compteur devices codé à 0 (vraie source listPorts()) (D7)
- **KAN-F05** `ouvert` — [basse/CONFIRMED] components/sidebar/DocsView.svelte:171 — doc "CC→60-180 BPM" : plage inventée + mapping non implémenté (D7)
- **KAN-G01** `ouvert` — [basse/CONFIRMED] components/right-panel/InspectorPanel.svelte:27 — Pause replié en "stopped" (3e état Kronos non projeté) (D2)
- **KAN-kairos** `ouvert` — Migration Kairos : (1) ne plus JAMAIS muter l arbre de production -> adresser des demandes a Kairos (tempo/mute/arm via demande()) ; (2) ne JAMAIS toucher l AST -> fournir l environnement (defauts) en entree de transpilation BPScript. Cf hub/projets/spec-ecriture-structure.md
- **KAN-C20** `fait` — DEFAULT_BPM=128 + clampBpm[20,300] = constantes hote NON sourcees (repli affichage, hors chemin d autorite) — A SOURCER via l environnement ; lien direct point-1 defauts (BPS-defaut-env)  _(fait: constante hote 128 retiree (clock #tempo=null) ; M5 tempo via env->AST prouve ecran 3/3 (a5f681c))_
- **KAN-Abis** `ouvert` — Predicat audio utilise le resolveur de SCENE (pas per-acteur) ; passer per-feuille via resolverFor(actor.alphabet) quand A* composera activeActors x sounds (escalade)
- **KAN-purete** `ouvert` — PURETE (Romain, radical, MAINTENANT) : devenir HOTE PUR — extraire le rendu de production vers runtime-ui (vue Texte = text-order+TextStreamPanel ; vue Timeline = timeline+TimelinePanel ; UN runtime, 2 vues) + aplatissement tree-dispatch -> Kairos, SUPPRIMER ces rendus de Kanopi, ROUTER la donnee, rendre ZERO production. Kanopi = surface + gestes + cablage des runtimes. Perte d affichage temporaire acceptee
- **KAN-kro24** `ouvert` — Migration KRO-24 : retirer l appel HOTE a composeTreeModulations (composition CV) -> il MIGRE chez Kairos (qui detient l arbre, appelle la Couche-1 Kronos a l aplatissement). GO quand Kairos l a integre
