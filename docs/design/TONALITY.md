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

Catalogues JSON livrés par la dépendance `bpscript` (`bpscript/lib/*.json`), importés **tels
quels** et embarqués dans la constante read-only `PITCH_LIB`
(`packages/ui/src/lib/runtimes/bpx-adapter.ts`) :

| Fichier | Rôle |
|---|---|
| `alphabets.json` | noms de notes (+ altérations) — purement nominal |
| `octaves.json` | conventions de registre (préfixe/suffixe/défaut) |
| `temperaments.json` | grilles mathématiques (12/24/53-TET, pythagore, just_5limit…) |
| `scales.json` | collections : jins, maqams/makams (`compose`+`junction`), gammes/modes |
| `tunings.json` | bindings : alphabet + tempérament/gamme + `baseHz`/`baseNote`/`baseRegister` |

Ces catalogues sont remis à Kairos en **champ frère read-only `ctx.pitchLib`** sur le contexte
de projection au `charger()` (`bpx-adapter.ts`, à côté de `ctx.modulation.registry`) — **pas**
un import côté Kairos : l'hôte est le **gardien de fraîcheur unique**. Kairos compose alors son
résolveur **par acteur** (le builder partagé `@kronos/core/pitch`) et grave `content.pitch`.

> Dépendances `file:` = **copies** dans `node_modules`. Après une mise à jour amont : rsync des
> `lib/*.json` (et de **BPx**, qui écrit `metadata.scenePitch`) depuis les dépôts source, puis
> `npm run dev -- --force`. **LAN-14** : une copie périmée a déjà rendu une scène `arabic`
> **muette** (Kairos ne recevait pas l'alphabet → 0 Hz gravé) ; toujours rsync **toutes** les
> deps amont avant de juger un mutisme. Cf. mémoire « deps file: = copies périmées ».

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
