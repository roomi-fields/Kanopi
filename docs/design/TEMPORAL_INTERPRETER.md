# Interprétateur temporel — architecture

> **Statut : proposition (à étudier avec l'architecte).** Document de cadrage
> structurel, antérieur à toute implémentation. Rien ici n'est figé tant que
> l'architecte et BPx ne l'ont pas relu.

## 1. Objet et pourquoi c'est critique

L'**interprétateur temporel** est la couche qui transforme l'arbre de dérivation
de BPx en **temps réel entendu et vu** : sons planifiés sur la sortie audio, et
curseur de lecture synchronisé. C'est une pièce **centrale** du design — toute
la crédibilité « DAW » repose sur un temps maîtrisé : pas de note muette, pas de
curseur en retard, comportement identique au 1ᵉʳ et au 100ᵉ tour de boucle, et
ce **quelle que soit** la structure (séquence simple, polymétrie, groupes).

Aujourd'hui cette couche n'existe pas comme telle : trois consommateurs (sortie
audio, curseur, panneaux) bricolent le temps chacun de leur côté. Ce document
propose de la rendre **structurelle** : une timeline canonique, une autorité
unique du temps, et une portée de modulation **connue** (pas devinée).

**Non-objectifs** (hors de ce document) : le moteur de synthèse lui-même, le
rendu graphique du piano-roll, la dérivation BPx (amont).

## 2. Diagnostic structurel

Les défauts observés (notes parfois muettes, curseur en retard d'environ une
note, saut arrière au lancement, incohérences en boucle sur les scènes
polymétriques) ne sont **pas des bugs indépendants**. Ils sont les symptômes de
**trois manques structurels** :

### 2.1 Trois systèmes de coordonnées temporelles, mélangés à la main
- **temps-scène** — position dans la scène dérivée, en secondes, telle que portée
  par les spans des feuilles de l'arbre (origine = début de scène, indépendant du
  tour de boucle) ;
- **temps-cycle / boucle** — temps-scène + le décalage accumulé des tours passés
  (`_loopOffset` du dispatcher) ;
- **temps-audio** — `AudioContext.currentTime`, avec le warp de tempo
  (`rate = derivedTempo / tempo`) et la latence de sortie.

La conversion entre ces espaces **existe déjà** côté clock (`musicalNow` /
`audioTimeFor`, ancrées et conscientes du `rate`). Mais elle **n'est pas
l'autorité unique** : la modulation audio et le curseur la contournent et
recalculent le temps à leur façon → ils peuvent diverger. Tout symptôme « X est
décalé de Y » naît de là.

### 2.2 La portée d'une modulation — était *devinée*, désormais *connue* (cf §7)
Le sujet d'une paire (`(cutoff: env)` = signal, `(*:cutoff: env)` = par note,
`(C2:cutoff: env)` = terminal) fixe **comment** une modulation s'applique. Son
**horloge** — la fenêtre temporelle sur laquelle un *signal* se déroule —
correspond à la **portée du `()`** : la note, l'occurrence de règle, le groupe,
ou la voix.

**Correction (2026-07-31)** : ce diagnostic décrivait l'état avant le contrat de
portée (Kanopi reconstruisant la fenêtre par une heuristique de contiguïté sur
`ruleRef`, absent des feuilles en polymétrie, dégradation silencieuse sur
« un signal sur la phrase »). Depuis le 2026-07-04 (§7, contrat ratifié), `controlScopes`
porte structurellement cette fenêtre depuis BPx/Kairos — plus de reconstruction
heuristique. Vérifié sur le dépôt : aucune trace de `ruleRef` ni de
`composeCvBindings`. La sémantique `signal` reste correcte en polymétrie.

### 2.3 Pas de représentation temporelle canonique
L'arbre est parcouru **plusieurs fois** par des consommateurs différents (sortie
audio, curseur, piano-roll, texte/MIDI — cf. le contrat de projection par
calques). Chaque parcours ré-interprète la structure et le temps. Rien ne
garantit qu'ils s'accordent. Le curseur suit un **compteur d'horloge** (bar/beat/
phase) pendant que le son est planifié depuis les **secondes-scène** des
événements : deux représentations de « où en est-on » qui peuvent se contredire.

## 3. Principes directeurs

1. **Une seule timeline canonique.** L'arbre est aplati **une fois** en une
   représentation temporelle (IR). Tous les consommateurs lisent l'IR, jamais
   l'arbre directement.
2. **Une seule autorité du temps.** Une fonction unique convertit temps-scène ↔
   temps-audio (celle du clock, généralisée). Planification **et** curseur en
   dépendent → ils ne peuvent pas diverger.
3. **La portée est structurelle, pas heuristique.** La fenêtre d'horloge d'une
   modulation vient de la **portée de contenance** exposée par l'arbre, pas d'une
   reconstruction par Kanopi. *« Kanopi consomme le routage, ne l'invente pas. »*
4. **La boucle est une transformation, pas un état.** Un tour de boucle = un
   décalage appliqué **une seule fois** au passage temps-scène → temps-audio. La
   phase d'une modulation est en temps-scène → **indépendante du tour par
   construction**.
5. **Réactif aux structures, pas aux cas d'usage.** On ne corrige pas une scène
   particulière ; on définit le modèle qui rend la classe entière de scènes
   correcte.

## 4. Les coordonnées temporelles (définitions)

| Espace | Définition | Origine | Usage |
|---|---|---|---|
| **t_scène** | seconde dans la scène dérivée | début de scène | IR, fenêtres d'horloge, phase de modulation |
| **t_cycle** | `t_scène + k · durée_boucle` (k = nº de tour) | 1ᵉʳ tour | planification multi-tours |
| **t_audio** | `audioTimeFor(t_cycle)` = `ancre_audio + (t_cycle − ancre_scène) · rate` | démarrage transport | `AudioContext`, automations |

**Invariant central** : la phase d'une modulation se calcule **toujours** en
t_scène (`(onset_scène − début_fenêtre) / durée_fenêtre`), jamais en t_audio. Le
passage en t_audio n'intervient **qu'à la planification** (`audioTimeFor`). C'est
ce qui rend une modulation rigoureusement identique d'un tour à l'autre.

## 5. Architecture en couches

```
BPx : arbre de dérivation (spans, controls, portée de contenance, réfs voix sœur)
        │
        ▼
┌─ Couche 1 — CONTRAT DE PORTÉE (BPx) ───────────────────────────────────────┐
│  Chaque contrôle expose la PORTÉE où le () est posé : { kind: note|rule|     │
│  group|voice, span_scène } — la frontière d'occurrence, structurelle.        │
└──────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Couche 2 — REPRÉSENTATION TEMPORELLE (IR, Kanopi pur) ─────────────────────┐
│  Aplatissement UNIQUE de l'arbre → timeline en t_scène :                     │
│    pistes ← voix ; notes { onset, durée, hauteur, params } ;                 │
│    liaisons de modulation { entrée, modulateur, fenêtre d'horloge (span),    │
│    mode: per-note | signal } ; durée_boucle.                                 │
│  SOURCE DE VÉRITÉ UNIQUE — audio, curseur, piano-roll, MIDI la projettent.   │
└──────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ Couche 3 — TRANSPORT / PLANIFICATEUR (Kanopi) ────────────────────────────┐
│  Convertit t_scène → t_audio (autorité unique). Rebasage de boucle ICI, une  │
│  fois. Planifie notes + automations de modulation (phase en t_scène).        │
└──────────────────────────────────────────────────────────────────────────────┘
        │                                              │
        ▼                                              ▼
   sortie audio                              ┌─ Couche 4 — CURSEUR ───────────┐
                                             │  Lu via l'INVERSE de la même    │
                                             │  conversion (t_audio → t_scène).│
                                             │  Jamais un compteur séparé.     │
                                             └─────────────────────────────────┘
```

## 6. La représentation temporelle (IR)

Forme proposée (à affiner) — une structure plate, en t_scène, calculée une fois
par dérivation :

```
TimelineIR {
  loopDurationSec        // longueur d'un tour (fin du dernier événement)
  tracks: Track[]        // une par voix réalisée
}
Track {
  voiceId
  notes: Note[]
}
Note {
  onsetSec, durSec       // t_scène
  pitch, params          // wave, vel, filterQ, …
  mods: ModBinding[]     // les modulations qui gouvernent CETTE note
}
ModBinding {
  input                  // cutoff | amplitude | resonance | pitch | pan
  modulator              // courbe résolue (adsr/lfo/…) + params
  mode                   // 'per-note' | 'signal'
  clock: { startSec, durSec }   // fenêtre d'horloge en t_scène (= portée)
}
```

Points structurels :
- **`clock` vient de la portée** (couche 1), pas d'une heuristique. Pour `per-note`
  la fenêtre = la note ; pour `signal` la fenêtre = l'occurrence de règle / le
  groupe / la voix selon où le `()` est posé ; pour une voix sœur, la fenêtre = le
  segment de la voix sœur couvrant la note.
- L'IR **ne connaît pas l'audio ni la boucle** : tout est en t_scène. La boucle et
  le `rate` n'apparaissent qu'en couche 3.
- L'IR **remplace** les multiples parcours d'arbre ; les panneaux (piano-roll,
  texte, MIDI) en deviennent des **projections** (cf. contrat de projection par
  calques).

## 7. Le contrat de portée (frontière avec BPx) — ratifié

**Correction (2026-07-31)** : cette section posait le span de portée comme une demande ouverte
("à formuler à BPx", "dette structurelle à solder"). Le contrat est ratifié depuis le 2026-07-04
(commit 719f396, `hub/contrats/bpx-kairos-arbre.md:143-146`) et déjà consommé de bout en bout.

`controlScopes` porte, pour chaque contrôle sujet-à-horloge, le **span de sa portée de
contenance** — `{ kind: 'rule'|'group'|'voice', startMs, endMs }`, posé sur la feuille. Le principe
**la portée descend de l'arbre, Kanopi ne la recalcule pas** est celui du contrat livré. Lecteurs :
`kairos/src/modulation/tree-bindings.ts` (34-36, 127, 155-157) → `projeter.ts` →
`runtime-audio/src/adapter.js`.

## 8. Sémantique de modulation, exprimée dans l'IR

| Écriture | Mode | Fenêtre d'horloge (portée) |
|---|---|---|
| `(*:cutoff: env)` | `per-note` | la note |
| `(cutoff: env)` | `signal` | l'occurrence de règle (le `()` est sur la règle) |
| `({…}(cutoff: env)` | `signal` | le groupe |
| `(cutoff: VoixSœur)` | `signal` | le segment de la voix sœur couvrant la note |
| `(C2:cutoff: env)` | filtre + `signal` | n'estampe que les feuilles `C2` (déjà filtré amont) |

La résolution `per-note` vs `signal` est **déjà** portée par le sujet (BPx). Ce
qui manque est uniquement la **fenêtre** du `signal` (couche 1). Le rendu audio
devient alors trivial et uniforme : échantillonner la courbe du modulateur à la
phase `(onset_scène − clock.startSec) / clock.durSec`, sur la fenêtre de la note,
planifiée en t_audio.

## 9. Sémantique de boucle

- **Replay** (re-random off) : l'IR est calculée une fois ; chaque tour rejoue la
  **même** IR, décalée de `k · loopDurationSec` au passage en t_audio. Phase de
  modulation inchangée (t_scène) → rendu identique tour après tour.
- **Re-derive** (re-random on) : une **nouvelle** IR est calculée en fin de tour ;
  le rebasage reste le même mécanisme. Aucune logique de phase dans l'IR à
  recalculer.

Dans les deux cas, le rebasage est **un seul ajout de décalage en couche 3**.
Aucune accumulation d'état dans la modulation ni dans le curseur.

## 10. Synchronisation du curseur

Le curseur n'a **pas** de compteur propre. Il lit la position courante par
l'**inverse** de la conversion du transport : `t_scène = musicalNow(t_audio) mod
loopDurationSec`, converti en pixels par l'IR (la même timeline que le son). Comme
son et curseur partagent la conversion **et** la timeline, ils ne peuvent pas
diverger. Au lancement, le curseur démarre à `t_scène = startOffset` (déjà connu
du transport) — pas de saut arrière possible, puisqu'il n'y a pas de second
compteur qui se réinitialise à contretemps.

## 11. Ce que l'architecture règle, par construction

| Symptôme | Cause structurelle | Résolu par |
|---|---|---|
| Notes muettes / horloge fausse en polymétrie | fenêtre `signal` heuristique (`ruleRef` absent) | portée structurelle (couches 1+2) |
| Incohérences entre tours de boucle | phase mêlée au temps-audio | phase en t_scène, rebasage unique (couche 3) |
| Curseur en retard | curseur sur compteur séparé du son | inverse de l'autorité unique (couche 4) |
| Saut arrière au lancement | second compteur qui se réinitialise | curseur dérivé du transport, sans compteur |

Ce ne sont pas des correctifs ciblés : ce sont des **classes** de défauts qui
disparaissent parce que la source du temps et de la portée devient unique.

## 12. Migration (ce que ça remplace)

- La passe `resolveCvControls` (heuristique de phrase par `ruleRef`) → **remplacée**
  par la construction d'IR consommant la portée structurelle (couche 2).
- Le parcours `treeToDispatchEvents` → devient une **projection** de l'IR.
- Le rendu signal de webaudio (`_applyModSignal`) → conservé dans l'esprit, mais
  alimenté par `clock` (fenêtre) + phase t_scène, plus par des offsets calculés
  au point d'appel.
- Le curseur de `TimelinePanel` → dérivé de l'autorité de transport, plus de
  `clock.state` recomposé.

Migration **incrémentale** possible : introduire l'IR derrière l'interface
existante, basculer un consommateur à la fois (audio d'abord, curseur ensuite).

## 13. Questions ouvertes (pour l'architecte et BPx)

1. **Contrat de portée (BPx)** — forme exacte d'exposition du span de contenance
   par contrôle (champ sur la feuille vs nœud d'occurrence préservé) ? §7.
2. **Propriété de l'IR** — la `TimelineIR` est-elle purement Kanopi, ou une partie
   relève-t-elle d'une projection BPx partagée (cf. calques) ?
3. **Sémantique de portée en groupe imbriqué** — le `()` d'un groupe parent vs
   enfant : quelle fenêtre gagne ? (précédence de contenance, à aligner avec BPx).
4. **Voix sœur à cheval sur deux segments** — une note qui chevauche deux segments
   de la voix sœur : segment de l'attaque (simple) ou re-fenêtrage ? §8.
5. **Latence de sortie** — intègre-t-on `outputLatency` dans la conversion curseur
   pour un alignement œil/oreille parfait, ou est-ce négligeable ?

## 14. Références

- `docs/design/PLAYBACK_LOOP.md` — boucle de lecture actuelle (état des lieux).
- `docs/design/MODULATION_INPUTS.md` — les 5 entrées de modulation et leurs plages.
- `docs/design/ADAPTER_SPEC.md` — interface runtime/adaptateur.
- BPx `src/passes/resolveControls.ts` — sujet de paire + réf voix sœur (amont).
- `packages/core/src/dispatcher/clock.js` — `musicalNow` / `audioTimeFor` (germe de
  l'autorité unique).
- Contrat de projection par calques (mémoire projet) — l'IR comme source des
  projections audio/texte/piano-roll/MIDI.
