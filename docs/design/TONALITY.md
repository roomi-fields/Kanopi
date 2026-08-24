# Tonalité — la hauteur côté Kanopi (post KAI-10)

Kanopi **ne résout plus aucune hauteur**. Depuis la bascule **KAI-10** (commit `9fed744`),
la résolution de hauteur appartient à **Kairos**, qui **grave** la fréquence sur chaque note
(facette `content.pitch.hz`) à l'aplatissement. Kanopi tient deux rôles d'**hôte** seulement :
il **fournit la donnée** (les catalogues) et **transporte** la facette gravée jusqu'aux sorties.
C'est conforme à la loi d'architecture (`hub/contrats/kanopi-architecture.md`) : Kanopi ne détient
**aucun état d'autorité** ; la hauteur est une autorité du moteur, pas de l'hôte.

La référence de **données** reste `BPscript/docs/design/PITCH.md` (modèle 6 couches :
alphabet / octaves / tempérament / gamme / binding / résolveur). Ce document décrit ce que
fait **Kanopi** — c.-à-d. de moins en moins : fournir + transporter, rien calculer.

## Rôle 1 — fournir les catalogues (donnée, lecture seule)

Les catalogues de hauteur viennent du paquet `bpscript` et s'atteignent par leur **porte** —
`LIBS.<clé>` — jamais par un chemin de fichier : le format d'un catalogue à la source est un détail
de l'amont, et il varie. Le sac entier est embarqué dans la constante en lecture seule `PITCH_LIB`
(`packages/ui/src/lib/runtimes/bpx-adapter.ts`).

| Porte | Rôle |
|---|---|
| `LIBS.alphabets` | noms de notes (+ altérations) — purement nominal |
| `LIBS.octaves` | conventions de registre (préfixe/suffixe/défaut) |
| `LIBS.temperaments` | grilles mathématiques (12/24/53-TET, pythagore, just_5limit…) |
| `LIBS.scales` | collections : jins, maqams/makams (`compose`+`junction`), gammes/modes |
| `LIBS.tunings` | bindings : alphabet + tempérament/gamme + `baseHz`/`baseNote`/`baseRegister` |

Le sac est remis à Kairos en champ frère en lecture seule `ctx.pitchLib`, sur le contexte de
projection, au `charger()`. Kairos compose son résolveur **par acteur** et grave `content.pitch`.

> **Ce que l'hôte consomme, et par quelle porte.** Un voisin s'atteint soit par son **paquet
> publié** — artefact immuable sous `~/dev/bp/.paquets/`, qui porte son empreinte et ne change qu'à
> la poussée de son producteur — soit par un **lien vers son arbre de travail**, auquel cas sa
> sauvegarde atteint l'hôte à l'instant où il enregistre. Le relevé de campagne nomme le régime de
> chaque voisin, ligne par ligne.

## Rôle 2 — transporter la facette gravée jusqu'aux sorties

Kairos grave `content.pitch = { hz, noteName?, alteration?, register?, degree? }` (épine `hz`
obligatoire, pleine précision) sur chaque note. Les adaptateurs de sortie
(`packages/ui/src/lib/runtimes/kronos-audio.ts`) **forwardent** cette facette telle quelle ;
chaque runtime LIT `content.pitch.hz` et encode à sa façon :

- **audio** : l'`AudioRuntime` lit `content.pitch.hz` (construit inconditionnellement) ;
- **MIDI** : le sink lit `event.pitch.hz` → note + pitch-bend (microtonalité exacte) ;
- **OSC** : le profil lit `content.pitch.hz` → adresse note/Hz.

L'identité déclarée (alphabet/tuning) voyage dans l'**arbre** (`metadata.actors[a].alphabet/tuning`
+ repli scène-global `metadata.scenePitch`, écrits par **BPx**) ; la **cascade** Kairos
`default → scenePitch.alphabet` couvre les scènes mono (l'acteur `default` sans alphabet par-acteur
retombe sur l'alphabet de scène — c'est ce qui fait sonner `arabic`/maqâm).

## Ce que l'hôte a RETIRÉ (KAI-10) — et ce qu'il a GARDÉ

**Retiré** (l'hôte ne calcule plus la hauteur) :

- l'instance résolveur de scène (`sceneResolverFor`/`makeResolver`) qui alimentait l'audio
  (`pitch:`) et le `MidiTransport` (résolveur par acteur) — désormais `new MidiTransport({})` ;
- le `transposeToken` hôte des contextes `charger()` — la transposition du **son** vit dans
  Kairos (`resolvePitch` = résolution ∘ transpose par acteur) ; l'ancien chemin hôte était un
  no-op en production (FLAG3, jamais alimenté).

**Gardé** : `productionResolver.sounds(token)` (`bpx-adapter.ts`) — le prédicat d'**affichage**
« sonne-ou-pas » (alphabet-aware : vrai pour `rast4` sous un maqâm, faux sous western). C'est de
la classification de symbole, **pas** de la résolution Hz. À ce titre l'import `@kronos/core/pitch`
subsiste côté hôte uniquement pour `.sounds()` ; son retrait est un **nettoyage final séparé**
(avec les replis runtime + le harnais `toHz` MIDI).

## Vérité ontologique (inchangée, mais portée par Kairos/les catalogues)

Les fréquences sont calculées **exactement** depuis les fractions pures, **sans quantification**
sur une grille (le 24/53-TET est une grille de référence, pas la source). Ex. Rast → tierce neutre
`27/22` (~355 c), jamais `5/4`. Ce calcul vit maintenant dans le résolveur partagé que **Kairos**
compose à partir des catalogues que l'hôte lui fournit — Kanopi n'en détient pas la logique.

## Limites / dépendances amont

- **Re-random par tour** : Kanopi re-dérive la scène à chaque tour de boucle (toggle 🎲) ; la
  variation aléatoire dépend de la graine RNG de **BPx**.
- **`@tuning:<gamme>`** vs binding, et la cascade par-acteur (alphabet/tuning) : autorité **BPx**
  (écriture `metadata.actors`/`scenePitch`) + **Kairos** (lecture/gravure). Kanopi ne tranche rien.

## Pointeurs

- Contrat de données amont : `BPscript/docs/design/PITCH.md`.
- Facette + gravure : `@kairos/core` (`projection/hauteur.ts` `PitchFacet`, `projection/resoudre-hauteur.ts` la cascade).
- Hôte : `packages/ui/src/lib/runtimes/bpx-adapter.ts` (`PITCH_LIB` → `ctx.pitchLib`, `.sounds()`),
  `…/kronos-audio.ts` (forward `content.pitch` aux 3 adaptateurs).
