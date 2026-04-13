# Scenes — Hierarchie, scoping et communication inter-scenes

> Voir aussi : [ARCHITECTURE.md](ARCHITECTURE.md) pour le pipeline dispatcher,
> [SOUNDS.md](SOUNDS.md) pour le modele acteur,
> [UI_WEB.md](../plan/UI_WEB.md) Phase 6 pour le bus OSC/Link.

## Vue d'ensemble

Une scene BPscript est un fichier `.bps` contenant des directives, declarations,
et regles. Une scene peut **referencer d'autres scenes** comme des terminaux dans
ses regles — creant une hierarchie ou les scenes parentes orchestrent les scenes
enfants dans le temps.

Chaque scene est une **boite noire** : processus concurrent avec son propre etat,
ses propres acteurs, ses propres derivations. La communication entre scenes passe
par des mecanismes explicites (triggers, flags exposes, mappings).

Ce modele est celui des **acteurs** (Erlang, 1986) : processus isoles qui
communiquent par messages. Eprouve depuis 40 ans dans les systemes concurrents.

---

## Directive @scene

```
@scene <nom> "<fichier.bps>"
```

Declare une scene enfant. Le nom devient un terminal utilisable dans les regles.

```bpscript
// concert.bps — scene maitre
@scene intro "intro.bps"
@scene verse "verse.bps"
@scene chorus "chorus.bps"
@scene bridge "bridge.bps"

// Les scenes sont des terminaux comme les autres
S -> intro verse chorus verse chorus bridge chorus
```

Le moteur BP3 derive la structure (quand chaque scene-terminal joue).
Le dispatcher lance/arrete les scenes-filles au bon moment.

### Concurrence — les features BPscript s'appliquent

Comme les scenes sont des terminaux, toutes les features du langage marchent :

```bpscript
// Polymetrie de scenes (concurrence)
S -> { melodie, rythme, lumieres }

// Conditions sur flags
[mood==dark] S -> { drone, lumieres_sombres }
[mood==bright] S -> { melodie_rapide, rythme, lumieres_vives }

// Recursion
S -> intro S'
S' -> verse chorus S'        // boucle verse-chorus

// Randomisation
@mode:random
S -> { verse chorus, bridge }

// Simultaneite
S -> verse!rythme!lumieres   // 3 scenes au meme instant
```

---

## Scoping des flags — modele acteur

### Regle fondamentale

Chaque scene est un processus isole. Les flags sont de l'etat interne, prive
par defaut. La communication se fait par des mecanismes explicites.

### Trois mecanismes

| Mecanisme | Direction | Nature | Analogie |
|-----------|-----------|--------|----------|
| Heritage flags | Parent -> enfants | Contexte initial, lecture seule pour l'enfant | Props React / variables d'environnement |
| Triggers `<!` | Tout -> tout | Evenements fire-and-forget, traversent la hierarchie | Messages entre acteurs Erlang |
| `@expose` + `@map` | Opt-in explicite | Cablage de ports entre scenes | Patch cables (synthetiseur modulaire) |

### Heritage top-down

Les flags du parent sont **visibles en lecture** par les enfants.
L'enfant ne peut pas les modifier — il les herite comme contexte.

```
Concert [mood=dark]
  |
  +-- verse             <-- voit [mood==dark] (herite)
  |     [intensity=5]   <-- prive, invisible au parent
  |
  +-- chorus            <-- voit [mood==dark] (herite)
        [energy=max]    <-- prive, invisible au parent et a verse
```

### Triggers (traversent dans les deux sens)

Les triggers sont des evenements, pas de l'etat. Ils traversent la hierarchie
librement — un enfant peut signaler au parent, le parent peut signaler aux enfants.

```bpscript
// verse.bps — enfant
[intensity==10] S -> climax <!verse_done   // fire un trigger vers le haut

// concert.bps — parent
S -> verse <!verse_done chorus             // attend le signal de verse
```

### @expose (sortie explicite de flags)

Un enfant peut rendre un flag visible a l'exterieur avec `@expose` :

```bpscript
// verse.bps
@expose [intensity]           // rend ce flag lisible par le parent
@expose [energy]              // idem

// concert.bps
@map verse.[intensity] -> rythme.[drive]   // route le flag expose vers un sibling
```

Sans `@expose`, le flag reste prive. L'encapsulation est le defaut.

### Isolation des siblings

Deux scenes soeurs ne se voient pas directement. Toute communication
passe par le parent (via flags herites ou mappings explicites) :

```bpscript
// concert.bps — le parent orchestre la communication
@map verse.<!climax -> [tension+1]    // trigger de verse -> flag du parent
                                       // rythme voit [tension] via heritage
```

---

## sys — acteur systeme auto-expose

Chaque scene a un acteur implicite `sys` qui represente son transport.
`sys` est **automatiquement expose** au parent — c'est la seule exception
a l'encapsulation, car le parent doit pouvoir contrôler ses enfants.

### Commandes sys

```
sys.play          // lance le playback
sys.stop          // arrete
sys.pause         // pause/resume toggle
sys.loop          // toggle loop on/off
sys.tempo         // valeur continue (BPM)
sys.produce       // relance la derivation
sys.recompile     // recompile la scene courante (hot-swap)
sys.panic         // all notes off, reset
sys.scene(name)   // charge une scene par nom
sys.next_scene    // scene suivante dans la liste
sys.prev_scene    // scene precedente
```

### Adressage

```bpscript
// Depuis concert.bps (parent)
verse.play            // OK — sys auto-expose
verse.stop            // OK
verse.[intensity]     // OK seulement si @expose dans verse.bps
verse.sitar.Sa        // INTERDIT — objet interne, encapsule

// Depuis la scene courante
sys.play              // la scene elle-meme (ou session globale)
```

### Mapping CC/OSC vers sys

```bpscript
@map cc:60 -> verse.play       // CC60 lance la scene verse
@map cc:61 -> verse.stop       // CC61 arrete verse
@map cc:63 -> sys.play         // CC63 lance toutes les scenes (master)
```

### sys en sortie

Le systeme emet aussi des evenements observables :

```bpscript
@map sys.beat -> osc:/vis/beat           // chaque beat -> OSC
@map sys.bar -> cc:20                    // chaque mesure -> CC20
@map verse.sys.playing -> cc:118         // etat play/stop -> LED controleur
```

---

## Visibilite — resume

```
Scene = boite noire
  +-- sys (auto-expose au parent)
  |     play, stop, pause, loop, tempo, beat, bar
  +-- triggers (traversent dans les deux sens)
  |     <!climax, <!ready, <!done
  +-- @expose flags (opt-in)
  |     [energy], [mood] — seulement si declares
  +-- tout le reste est PRIVE
        acteurs, terminaux, flags internes, regles
```

| Depuis le parent | Visible ? | Comment |
|------------------|-----------|---------|
| `enfant.play` | Oui | sys auto-expose |
| `enfant.<!done` | Oui | triggers traversent |
| `enfant.[energy]` | Si @expose | opt-in explicite |
| `enfant.sitar.Sa` | Non | encapsule |
| `enfant.[flag_interne]` | Non | prive |

| Depuis l'enfant | Visible ? | Comment |
|-----------------|-----------|---------|
| `parent.[mood]` | Oui (lecture) | heritage top-down |
| `parent.sys.stop` | Non | l'enfant ne controle pas le parent |
| `sibling.[flag]` | Non | isoles, passe par le parent |

---

## Fan-out des CC/OSC

Un meme CC peut etre mappe dans plusieurs scenes. Le bus est partage —
chaque scene ecoute ce qu'elle veut :

```bpscript
// concert.bps
@map cc:1 -> verse.[intensity]
@map cc:1 -> rythme.[drive]
@map cc:1 -> lumieres.[brightness]
// CC1 produit 3 evenements simultanement
```

C'est le modele bus MIDI : un seul cable, N recepteurs.

---

## Duree et scoping temporel

### @duration au niveau racine uniquement

`@duration` ne s'applique qu'au conteneur le plus haut. A l'interieur,
tout est en durees relatives (proportions polymetriques, speed, nombre de tokens).

```bpscript
// concert.bps — scene racine
@mm:120
@duration:32b

@scene verse "verse.bps"     // verse a son propre @duration:8b et @mm:120
@scene chorus "chorus.bps"   // chorus a @duration:16b

S -> verse chorus            // 2 terminaux-scenes
                              // proportions : 50/50 = 16b chacun
                              // le @duration:8b de verse est IGNORE
                              // le @duration:16b de chorus est IGNORE
                              // le parent impose 32b total
```

### @duration et @mm de l'enfant : proprietes par defaut

Quand `verse.bps` est jouee seule (dev, test, performance autonome),
son `@duration:8b` et son `@mm:120` sont effectifs — elle dure 4 secondes.

Quand elle est imbiquee dans un parent via `@scene`, le parent decide
de son enveloppe. Le `@duration` et le `@mm` de l'enfant sont ignores.
Ses proportions internes sont preservees — seule l'echelle change.

### L'enfant est une boite noire temporelle

Le parent ne sait pas combien de tokens contient l'enfant. Il sait :
- Quelle proportion de la duree totale ce terminal occupe (via la grammaire)
- Le `@duration` racine qui fixe l'enveloppe globale

L'enfant ne sait pas combien de temps il dure en absolu. Il sait :
- Ses proportions internes (polymetrie, speed, nombre de tokens)
- Le dispatcher lui donnera son echelle au moment du scheduling

---

## Cycles de feedback

Risque : scene A mappe un flag vers B, B emet un trigger vers A qui
modifie le flag, boucle infinie.

Solution : meme approche que Max/MSP et Pure Data — **execution par tick**.
Un flag ne peut changer qu'une fois par pas de temps du dispatcher.
Si un cycle est detecte, le dispatcher emet un warning et coupe le cycle.

---

## Implementation

### Qui fait quoi

| Composant | Role |
|-----------|------|
| Transpileur | Parse `@scene`, `@expose`, `@map` -> AST + sceneTable + mapTable |
| BP3 WASM | Derive chaque scene independamment (N instances) |
| Dispatcher | Orchestre tout : lance les instances, route les flags/triggers, gere la clock, execute les mappings |

### Le dispatcher est le meta-ordonnanceur

BP3 ne connait pas les scenes externes. Le dispatcher :

1. Recoit la derivation du maitre (terminaux = noms de scenes)
2. Pour chaque terminal-scene, compile + produce une instance BP3
3. Schedule les resultats dans la timeline globale
4. Route les flags/triggers entre parent et enfants
5. Gere le bus CC/OSC partage
6. Applique le scoping (heritage top-down, @expose, isolation siblings)

```
+-------------------------------------------+
|  Dispatcher (meta-ordonnanceur)           |
|                                           |
|  Clock commune (Link-aware)               |
|  Bus flags/triggers                       |
|  Bus CC/OSC                               |
|  Scoping engine                           |
|                                           |
|  +----------+  +----------+  +----------+|
|  | BP3 inst | | BP3 inst  | | BP3 inst  ||
|  | concert  | | verse     | | rythme    ||
|  +----------+  +----------+  +----------+|
|       |              |             |      |
|       v              v             v      |
|  Transports (WebAudio, MIDI, OSC, ...)   |
+-------------------------------------------+
```

### AST nodes

```js
// @scene verse "verse.bps"
{
  type: 'SceneDirective',
  name: 'verse',
  file: 'verse.bps',
  line: 3
}

// @expose [intensity]
{
  type: 'ExposeDirective',
  flags: ['intensity'],
  line: 5
}
```

### Compilation multi-scene

1. Le transpileur parse le maitre -> trouve les @scene
2. Pour chaque @scene, compile recursivement le fichier reference
3. Produit un arbre de scenes avec les mapTables et exposeTables
4. Le dispatcher recoit l'arbre et instancie les BP3

La recursion est bornee : un fichier ne peut pas se referencer lui-meme
(detection de cycle dans le transpileur).

---

## Exemple complet

```bpscript
// === concert.bps (maitre) ===

@scene verse "verse.bps"
@scene chorus "chorus.bps"
@scene lumieres "lumieres.bps"

// Contexte herite par tous les enfants
[mood=dark]

// Mapping CC
@map cc:60 -> verse.play
@map cc:61 -> chorus.play
@map cc:62 -> lumieres.play
@map cc:63 -> sys.play              // master play

// Routing inter-scenes
@map verse.<!climax -> [tension+1]  // trigger enfant -> flag parent
@map verse.@[energy] -> chorus.[drive]  // flag expose -> sibling (via parent)

// Structure temporelle
S -> { verse, lumieres }
[tension>=3] S -> { verse, chorus, lumieres }


// === verse.bps (enfant) ===

@expose [energy]                     // flag visible au parent
@actor sitar  alphabet:sargam  transport:webaudio

// Heritage : voit [mood] du parent
[mood==dark] S -> Sa Re Ga Pa [energy+1]
[mood==bright] S -> Sa Ga Pa Sa_^ [energy+2]

// Trigger vers le parent quand l'energie est haute
[energy>=8] S -> climax_phrase <!climax


// === lumieres.bps (enfant) ===

@actor spots  alphabet:dmx_cues  transport:dmx

// Heritage : voit [mood] et [tension] du parent
[mood==dark] [tension<3] S -> dim_blue slow_pulse
[mood==dark] [tension>=3] S -> deep_red fast_strobe
[mood==bright] S -> white_flash rainbow
```
