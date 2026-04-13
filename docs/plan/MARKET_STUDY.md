# Etude de marche — Live Coding pour la musique, l'audio et le visuel

> Recherche exhaustive — Avril 2026
> Couvre les outils, points de douleur, lacunes de l'ecosysteme,
> recherche academique, tendances et positionnement concurrentiel.

---

## 1. Outils majeurs de live coding

### 1.1 SuperCollider

- **Description** : Plateforme de synthese audio et composition algorithmique, architecture client-serveur (sclang + scsynth). Langage inspire de Smalltalk.
- **Forces** : Flexibilite sonore illimitee, synthese a bas niveau, enorme base de UGens, reference academique depuis ~25 ans, communaute active (6 400+ stars GitHub), SuperCollider Symposium 2025 (Johns Hopkins). Classe `Tuning` native pour micro-tonalite.
- **Faiblesses** :
  - Courbe d'apprentissage tres raide, documentation inconsistante qui presuppose un haut niveau technique
  - Tres verbeux pour le live coding par rapport a TidalCycles
  - Windows : problemes IPC, Windows Defender retarde le boot scsynth de 60+ secondes, permissions reseau bloquantes (issue #6774, avril 2025)
  - Latence : le defaut de 0.2s pose probleme avec des Pbinds complexes, augmenter a 0.5s degrade les fadeTimes
  - Crashes : scsynth crash silencieux sans socket audio (issue #6288), memory issues avec patterns complexes
  - Migration Qt5 → Qt6 en cours (perte de support pour plateformes legacy)
  - Limite bus de controle 32-bit (issue #5311)

### 1.2 TidalCycles

- **Description** : Langage de patterns algorithmiques embarque dans Haskell, utilise SuperCollider/SuperDirt pour le son. Le grand-pere du live coding moderne.
- **Forces** : Elegance mathematique, polyrythmie/polyphonie flexibles, communaute tres active (Tidal Club, Discord), reference algorave. ~2 800 stars GitHub.
- **Faiblesses** :
  - Installation difficile meme pour des codeurs experimentes (Haskell + SuperCollider + SuperDirt = 3 installations separees)
  - Necessite la comprehension de la programmation fonctionnelle
  - Outil specialise avec des capacites limitees en dehors des patterns
  - Micro-tonalite : possible mais via workarounds (EDO notation, Scala files, ou CV output)

### 1.3 Strudel

- **Description** : Port JavaScript de TidalCycles pour le navigateur. Toute la puissance des patterns avec une barriere d'entree drastiquement reduite.
- **Forces** : Zero installation, navigateur uniquement, URL partageables, feedback visuel (pianoroll), ideal pour l'education.
- **Faiblesses** :
  - Repository GitHub archive le 19 juin 2025, migre vers Codeberg — statut de maintenance a suivre
  - Couplage fort au framework React, difficile a integrer standalone
  - Problemes de performance quand la reference est ouverte (rendering massif)
  - Web Audio API : latence ~10ms Windows, ~30-40ms Linux/PulseAudio, qualite de resampling variable selon navigateur
  - Pas d'UDP dans la version navigateur

### 1.4 Sonic Pi

- **Description** : Outil de creation musicale concu pour l'education, devenu un puissant instrument de performance. Ruby + SuperCollider.
- **Forces** : Syntaxe simple et lisible, tutoriels integres, multi-plateforme (Windows/macOS/Linux/Raspberry Pi), deploye dans 10 000+ classes UK, 50 000+ telechargements/an, performances au Glastonbury et Royal Albert Hall.
- **Faiblesses** :
  - Limite pour les compositions complexes par rapport aux outils avances
  - Qualite audio en deca des standards de production professionnelle
  - Documentation parfois superficielle pour les taches complexes
  - Impossibilite d'interaction instantanee comme avec un instrument acoustique

### 1.5 FoxDot / Renardo

- **Description** : FoxDot — environnement Python connecte a SuperCollider. N'est plus activement developpe. Renardo est le fork maintenu avec refactoring vers v1.0.
- **Forces** : Syntaxe Python accessible, systeme de Players intuitif.
- **Faiblesses** : FoxDot inactif, communaute plus petite que Sonic Pi ou TidalCycles. Renardo en alpha.
- **Nouveaute** : Renardo ajoute support REAPER DAW, sortie MIDI, interface web Svelte. Presente en workshop a ICLC 2025.

### 1.6 Orca

- **Description** : Langage esoterique et editeur live pour creer des sequenceurs proceduraux. Chaque lettre de l'alphabet est une operation.
- **Forces** : Efficace en ressources, multi-plateforme (navigateur, terminal C, assembleur), envoie MIDI/OSC/UDP a Ableton, Renoise, VCV Rack, SuperCollider. Interface minimale potentiellement plus accessible aux non-anglophones.
- **Faiblesses** : Esoterique = courbe d'apprentissage non standard, UDP non disponible dans la version navigateur.

### 1.7 Hydra

- **Description** : Synthe video live-codable dans le navigateur (WebGL). Cree par Olivia Jack.
- **Forces** : Zero installation, combine avec P5.js/Tone.js/THREE.js/Gibber, communaute active, ateliers reguliers.
- **Faiblesses** : Uniquement visuel (pas d'audio natif), necessite integration externe pour le son.

### 1.8 Gibber

- **Description** : Environnement audiovisuel dans le navigateur, combine synthese musicale + sequencing + graphiques 3D ray-marching.
- **Forces** : Solution integree audio+visuel en navigateur, aucune installation.
- **Faiblesses** : Communaute plus petite, documentation limitee.

### 1.9 Mercury

- **Description** : Langage minimal et lisible pour le live coding de musique electronique algorithmique. Versions Max8 et navigateur.
- **Forces** : Design centre sur l'accessibilite (code lisible pour le public), editeur limite a 30 lignes (code toujours visible), bibliotheque d'algorithmes pour modulation de parametres, visuels reactifs au son integres.
- **Faiblesses** : La version navigateur (Playground) n'a pas les memes fonctionnalites que la version Max8.

### 1.10 ChucK

- **Description** : Langage de programmation musicale en temps reel, modele concurrent "strongly-timed".
- **Forces** : Scheduling sample-accurate et deterministe, modification de code on-the-fly, support MIDI/OSC/HID, credibilite academique (PLOrk — Princeton Laptop Orchestra).
- **Faiblesses** : Approche bas-niveau necessite des connaissances techniques profondes, adoption mainstream limitee.

### 1.11 Csound (mode live coding)

- **Description** : Langage de synthese sonore historique (~1986), Csound 6 ajoute la recompilation on-the-fly.
- **Forces** : Live Event Sheet dans CsoundQt, Cabbage traite chaque instrument comme plugin natif, extremement puissant pour le DSP.
- **Faiblesses** : Buffer sizes par defaut trop eleves (latence), configuration necessaire pour performance temps reel.

### 1.12 Pure Data / Max/MSP

- **Description** : Environnements de programmation visuelle pour le media. Pure Data = open source, Max = commercial (Cycling '74/Ableton).
- **Forces** : Max est plus convivial que Pure Data, enorme ecosysteme Max for Live, visuels Jitter temps reel.
- **Faiblesses** : Pure Data a plus ou moins stagne, tres bas niveau, GUI taxe enormement le CPU, pas de gestion multi-coeur dans Max, Max est proprietaire et cher.

### 1.13 Extempore

- **Description** : Langage Scheme-like avec xtlang (type statique, compile JIT) pour le cyberphysical programming.
- **Forces** : Latence extremement basse, performance native pour DSP audio-rate, runtime leger.
- **Faiblesses** : Communaute plus petite, documentation limitee, principalement macOS.

### 1.14 Overtone (Clojure)

- **Description** : API Clojure pour le moteur SuperCollider.
- **Forces** : Expressif pour le live coding, integration Quil/Processing pour visuels, jamming collaboratif.
- **Faiblesses** : Necessite connaissance de Clojure, ecosysteme plus petit.

### 1.15 Sardine (Python)

- **Description** : Bibliotheque Python 3.10+ pour le live coding, focus sur modularite et extensibilite. Presentee a ICLC 2023.
- **Forces** : Deux implementations d'horloge, handlers multiples (MIDI, OSC, SuperDirt), scheduling temporel recursif asynchrone, design modulaire (clocks, parsers, handlers echangeables).
- **Faiblesses** : Encore en developpement actif/early, necessite Python avance.

### 1.16 Flok (collaboratif)

- **Description** : Editeur collaboratif P2P web pour live coding musique et graphiques.
- **Forces** : Multiple slots (max 8) pour differents langages, Hydra integre.
- **Faiblesses** : Maximum 8 slots, securite (serveur public = n'importe qui peut executer du code sur votre machine), sclang ne peut pas utiliser de GUI.

### 1.17 Estuary (collaboratif)

- **Description** : Plateforme collaborative multi-langage pour live coding dans le navigateur. McMaster University.
- **Forces** : Zero installation, collection heterogene de langages live coding ensemble, sandbox modulaire, finance par SSHRC Canada.
- **Faiblesses** : Moins connu que Flok, dependant de l'infrastructure universitaire.

### 1.18 Glicol

- **Description** : Langage live coding oriente graphe ecrit en Rust, compile en WebAssembly.
- **Forces** : Syntaxe optimisee pour la performance live, combine controle haut-niveau et synthese sample-accurate, safe et efficace grace a Rust, navigateur via WASM + AudioWorklet.
- **Faiblesses** : Communaute encore petite.

### 1.19 Autres outils notables

- **Megra.rs** : Langage LISP-y en Rust avec chaines de Markov
- **Topos** : Environnement web inspire du Monome Teletype
- **Kilobeat** : Instrument DSP collaboratif web inspire du bytebeat
- **Alda** : Langage de programmation musicale pour musiciens (plus composition que live)
- **ixi lang** : Langage pour SuperCollider, accent sur l'accessibilite, acclame a Ableton Loop 2015. Actuellement inactif.
- **TimeLines** : Synthe modulaire Haskell/Emacs pour live coder la musique comme fonctions du temps explicite
- **Nestup** : Langage experimental de balisage pour rythmes musicaux (tuplets imbriques)

---

## 2. Points de douleur des utilisateurs

### 2.1 Installation et setup

- TidalCycles : 3 installations separees = barriere majeure
- SuperCollider sur Windows : IPC issues, Windows Defender, permissions reseau
- Solutions browser-based (Strudel, Estuary, Hydra) eliminent ce probleme mais limitent les fonctionnalites
- **Opportunite** : notre architecture 3 niveaux (web pur / web enrichi / bridge local) resout exactement ce probleme

### 2.2 Courbe d'apprentissage

- SuperCollider : heures avant de se sentir a l'aise
- TidalCycles : necessite programmation fonctionnelle (Haskell)
- ChucK/Csound : approche bas-niveau exigeante
- **Gap intermediaire** : tutoriels passent de "debutant" a "expert" sans transition
- **Opportunite** : BPscript commence avec `S -> Sa Re Ga` et la complexite est additive

### 2.3 Synchronisation entre outils

- Ableton Link : meilleur standard mais pas universel
- MIDI clock : fiable mais bas debit
- OSC : flexible mais configuration manuelle
- **Aucun outil ne propose de synchronisation multi-runtime native out-of-the-box**
- **Opportunite** : notre dispatcher + clock commune + bus OSC + Link

### 2.4 Feedback visuel

- Strudel offre un pianoroll defilant — exception notable
- La plupart des outils = texte brut sans visualisation de la structure temporelle
- **Aucun outil ne propose d'editer la structure temporelle visuellement tout en gardant le code**
- **Opportunite** : notre timeline Canvas + constraint solver + structure polymetrique

### 2.5 Collaboration

- Flok et Estuary sont les seules solutions dediees
- Maximum 8 slots dans Flok
- Problemes de securite (execution de code distant)
- Latence reseau non resolue pour le temps reel
- Trouver des collaborateurs locaux est difficile ("scene distribuee et underground")

### 2.6 Qualite audio / Latence

- Web Audio API : ~10ms Windows, ~30-40ms Linux/PulseAudio
- Resampling variable selon navigateur (lineaire vs haute qualite)
- SuperCollider : recommande ASIO, configuration non triviale
- **Aucun outil browser n'atteint la latence d'un setup natif**
- **Opportunite** : notre bridge local (niveau 3) offre le meilleur des deux mondes

### 2.7 IDE / Experience editeur

- SuperCollider IDE vieillissant
- La plupart des outils dependent d'editeurs tiers (Atom/VS Code/Emacs)
- mutate4l integre le live coding dans Ableton Session View
- Strudel Flow (experimental, base sur React Flow) tente le node-based UI

### 2.8 Documentation

- SuperCollider : inconsistante, presuppose trop
- Sonic Pi : parfois superficielle pour les taches complexes
- Mercury : documentation GitHub extensive
- **Pattern general** : bonne documentation theorique, manque de guides pratiques

### 2.9 Stabilite en performance

- "The bug is part of the performance" — instabilite acceptee comme inherente
- Risques : crashes, RSI, dommages auditifs
- SuperCollider : crashes silencieux possibles
- Max/MSP : distortion audio ou crash quand le patch est trop complexe

### 2.10 Compatibilite plateforme

- Cross-plateforme : TidalCycles, SuperCollider, Sonic Pi, Sardine
- Web uniquement : Hydra, Strudel, Gibber, Glicol, Estuary, Flok
- macOS principalement : Extempore

---

## 3. Lacunes de l'ecosysteme

### 3.1 Synchronisation multi-runtime

**C'est le gap le plus significatif.** Aucun outil existant ne permet d'orchestrer
nativement plusieurs runtimes (SuperCollider, TidalCycles, Python, MIDI, DMX) dans un
seul fichier avec un seul systeme temporel.

Sardine identifie ce probleme explicitement : "la plupart des systemes ont du mal avec la
coordination temporelle precise entre composants distribues" et "les outils verrouillent
souvent les performeurs dans des workflows mono-environnement".

**C'est exactement le positionnement de BPscript.**

### 3.2 Edition visuelle de la structure

- Pas de timeline visuelle interactive dans les outils textuels
- Strudel a un pianoroll mais c'est une visualisation passive, pas un editeur
- **Aucun outil ne propose d'editer la structure temporelle visuellement tout en gardant le code**

### 3.3 Integration hardware controller

- Support MIDI basique dans la plupart des outils
- Aucune integration native de controleurs physiques avec mapping visuel
- Pas de support CV/gate natif dans les outils browser
- Le mapping reste manuel

### 3.4 Support musique cross-culturelle (non-occidentale)

- SuperCollider : classe Tuning avec pythagorean, just, partch, etc.
- TidalCycles : workarounds EDO, fichiers Scala, CV output
- Mitola (SuperCollider quark) : notation micro-tonale avec degres entiers
- **Mais aucun outil n'integre nativement des systemes comme gamelan (slendro/pelog), raga, maqam** avec leurs specificites de timbre et de timing
- BPscript avec ses alphabets JSON et architecture 5 couches de pitch est remarquablement bien positionne

### 3.5 Accessibilite

- ADC 2024 : workshop sur le design inclusif des produits audio (etude de cas Ableton Live 12)
- Eye-tracking pour musiciens handicapes mentionne comme tendance future
- **Aucun outil de live coding n'a de features d'accessibilite integrees** (lecteurs d'ecran, navigation clavier, modes haut-contraste)
- La projection de code suppose un public voyant

### 3.6 Enseignement / Onboarding

- Sonic Pi domine l'education (10 000+ classes UK)
- Strudel/Estuary reduisent la barriere d'entree
- **Gap** : pas de parcours d'apprentissage progressif entre debutant et expert

### 3.7 Enregistrement / Documentation de performances

- Principalement fait via screen recording (OBS, QuickTime)
- **Aucun outil n'integre nativement l'enregistrement, le replay, ou l'export de la performance**
- Pas d'export vers notation/partition standard
- Pas de "session save" reproductible

### 3.8 Grammaires formelles et structure temporelle

- Bol Processor : seul outil utilisant des grammaires formelles enrichies d'expressions polymetriques
- L-systemes mentionnes dans la composition algorithmique mais pas integres dans les outils de live coding
- **BPscript/BP3 est unique dans l'utilisation d'un moteur de grammaires generatives pour la composition temporelle en temps reel**

---

## 4. Recherche academique recente (2020-2026)

### 4.1 Conferences cles

- **ICLC** (International Conference on Live Coding) : annuel, 10e edition en 2026. ICLC 2024 Shanghai, ICLC 2025 Barcelona, ICLC 2026 appel a hotes.
- **NIME** (New Interfaces for Musical Expression) : NIME 2024 Utrecht (theme "tactility in a hybrid world"), NIME 2025 juin 2025.
- **SuperCollider Symposium 2025** : Johns Hopkins, mars 2025.

### 4.2 Papers et themes notables

- **"Human-machine agencies in live coding for music performance"** (Xambo & Roma, 2024, Journal of New Music Research) : Framework pour analyser les agences humain-machine en live coding. Legibilite, modifiabilite, impact des algorithmes black-box sur la transparence.
- **"Sardine: a Modular Python Live Coding Environment"** (Forment & Armitage, ICLC 2023) : Architecture modulaire, critique des limitations de synchronisation des outils existants.
- **"Pop Live Coding Encounters"** (Intelligent Instruments Lab, ICLC 2024)
- **"Cracking the Musical Code: A Scene Study of Algorave"** (2024) : reconnaissance academique de la scene algorave
- **"Agent-Based Music Live Coding: Sonic adventures in 2D"** (Organised Sound, Cambridge) : agents autonomes

### 4.3 Themes de recherche actifs

- **Sessions ICLC 2025** : "Audio-Visual Livecoding", "Specialized Tools and DSLs", "Collaborative Livecoding", "Live Coding Beyond Computers & Interfaces", "Speculative Futures"
- **NIME 2024-2025** : interfaces accessibles, instruments haptiques, design participatif
- **AI/ML dans le live coding** : integration de LLMs, human-machine agencies, agents autonomes, Google Magenta + TidalCycles

### 4.4 Grammaires et structure temporelle

- Bol Processor reste la reference academique pour les grammaires formelles en musique
- Pas de publication recente sur les grammaires generatives en live coding temps reel
- **Opportunite de publication pour BPscript** : unique combination grammaires formelles + meta-sequenceur + multi-runtime

---

## 5. Tendances du marche

### 5.1 Croissance communautaire

- Scene algorave : **croissance de 300% depuis 2020**
- Evenements mensuels dans **40+ villes** dans le monde
- TOPLAP : nodes actifs au Bresil, Pays-Bas, Italie, UK, etc.
- Sonic Pi : **50 000+ telechargements par an**
- SuperCollider : 6 400+ stars GitHub
- TidalCycles : 2 800+ stars GitHub

### 5.2 Open-source vs commercial

- Les outils de live coding sont quasi-exclusivement open-source
- Seuls Max/MSP (Cycling '74/Ableton) et Ableton Live sont commerciaux
- VCV Rack : gratuit + modules commerciaux
- Bitwig Grid : commercial ($399 Studio edition)
- **Pas de modele SaaS viable dans le live coding musical**

### 5.3 Adoption educative

- Sonic Pi deploye dans 10 000+ classes UK via Raspberry Pi Foundation
- Estuary utilise dans les cours universitaires (McMaster, finance SSHRC)
- ICLC et NIME integrent des workshops pedagogiques
- Tendance a l'utilisation des outils browser pour faciliter l'acces en classe

### 5.4 Ecosysteme festivals/evenements

- Algorave : evenements reguliers (London, Tokyo, Buenos Aires, Brooklyn, Sheffield)
- TOPLAP Solstice Stream : performances en ligne annuelles
- Alpaca Festival (Sheffield, septembre 2025) : algorithmic patterns
- equinoX (Pisa, mars 2026) : unconference TOPLAP Italia

### 5.5 Streaming et performances post-COVID

- Les performances en ligne sont devenues une composante permanente
- TOPLAP organise des streams reguliers (From Scratch, 15 ans en 2025)
- Integration Twitch mentionnee comme tendance (votes interactifs du public)
- **Le streaming a democratise l'acces aux algoraves** mais la latence reseau reste un defi

### 5.6 IA et live coding

- Tendance forte : integration de LLMs comme assistants de live coding
- Ableton Live MCP Server (2025) : integration IA dans le DAW
- Question ouverte d'authorship et de controle (paper Xambo & Roma 2024)
- La communaute Lines (llllllll.co) debat activement des politiques sur le contenu IA

---

## 6. Positionnement concurrentiel

### 6.1 "Le DAW pour live coders" — qui essaie ?

**Ableton + Max for Live**
- Le plus proche d'une solution integree : DAW + environnement modulaire + Link protocol
- Max for Live uniquement dans l'edition Suite (chere)
- mutate4l ajoute du live coding dans la Session View
- **Limitation** : pas de live coding textuel natif, workflow souris-heavy

**Bitwig + Grid**
- Grid = systeme modulaire comparable a Max for Live, a $399
- Controller integration plug-and-play
- Modulation tools avances
- **Limitation** : pas de live coding textuel, communaute plus petite

**VCV Rack**
- Emulation modulaire libre, enorme ecosysteme de modules
- VCV Prototype : modules JavaScript/Lua avec rechargement automatique (quasi-live coding)
- Passerelle vers le hardware (Proteus sequencer)
- **Limitation** : pas de timeline, pas d'integration DAW native

**Aucun startup identifie ne tente explicitement d'etre "le DAW pour live coders".**

### 6.2 Positionnement unique de BPscript

| Capacite | BPscript | Tidal/Strudel | Sonic Pi | SuperCollider | Max/MSP | Sardine |
|----------|----------|---------------|----------|---------------|---------|---------|
| Grammaire generative temps reel | **OUI** (BP3/BP4) | Non | Non | Non | Non | Non |
| Orchestration multi-runtime | **OUI** (backticks) | Non | Non | Non | Partiel (M4L) | Partiel |
| Support cross-culturel natif | **OUI** (5 couches pitch) | Workarounds | Non | Partiel | Non | Non |
| Timeline visuelle interactive | **OUI** (Canvas) | Pianoroll passif | Non | Non | Non | Non |
| 3 mots + 24 symboles | **OUI** | ~50+ fonctions | ~100+ fonctions | Langage complet | Visual | Python |
| Structure temporelle explicite | **OUI** (gate/trigger/cv) | Cycles implicites | Temps lineaire | Manuel | Flexible | Recursion |
| Multi-scene hierarchique | **OUI** (@scene) | Non | Non | Non | Non | Non |
| CC/OSC ↔ primitives langage | **OUI** (@map) | Non | Non | Manuel | Manuel | Partiel |

**Les gaps les plus larges de l'ecosysteme correspondent exactement aux forces de BPscript.**

---

## 7. Strategie produit Kanopi

### 7.1 Court terme (0-6 mois)

- Stabiliser l'UI web (Phase 1-2 du plan) pour avoir une demo credible
- Publier des demos video (YouTube, Twitch) avec BPscript orchestrant SC + MIDI + visuels
- Soumettre un paper a **ICLC 2026** (unique combination grammaires + multi-runtime)
- Se connecter a la communaute TOPLAP (node local, contributions au discourse)

### 7.2 Moyen terme (6-18 mois)

- Bridge local (niveau 3) pour debloquer la scene SC/Tidal
- Integration Strudel (niveau 2) pour capter les utilisateurs Tidal browser
- Parcours d'apprentissage progressif (combler le gap debutant→expert)
- Demo "moment Daft Punk" : une performance live orchestrant 3+ runtimes

### 7.3 Long terme (18+ mois)

- BPx engine (specs redigees, pret a implementer)
- Collaboration live (multi-performer, Flok-like mais avec notre architecture)
- Eurorack modules (sequenceur physique avec grammaires)
- Ateliers educatifs (partenariat type Sonic Pi + Raspberry Pi Foundation)

### 7.4 Fonctionnalites produit avancees (horizon 12-36 mois)

#### Assistant IA specialise (premium, facturable)

Un LLM fine-tune sur BPscript, les grammaires formelles et la composition algorithmique.
Pas juste un assistant code generique — un assistant qui comprend les grammaires,
la polymetrie, les modes de derivation, les traditions musicales.

Cas d'usage :
- "Cree une grammaire de tabla en tintal a 16 temps" → genere les regles
- "Ajoute une voix de basse qui suit la structure harmonique" → analyse + generation
- "Transforme ce pattern en polymetre 5 contre 3" → refactoring structurel
- Suggestion de regles pendant le live coding (comme Copilot mais pour la musique)
- Explication de grammaires complexes (pedagogie)

**Modele economique** : feature premium. Le framework est gratuit/open-source,
l'assistant IA est un service cloud facturable (SaaS). C'est le seul element
SaaS identifie comme viable dans le marche du live coding (cf. section 5.2).

Maturite : pas avant que le framework soit stable et la communaute etablie.
L'IA a besoin de donnees d'usage pour etre pertinente.

#### Analyse structurelle (BP2 ANAL + avance)

Bernard vient de porter les fonctions d'analyse de BP2 en BP3 (avril 2026).
L'analyse inverse : etant donne une sequence, retrouver la grammaire qui la genere.

Integrations dans Kanopi :
- **Import MIDI → grammaire** : charger un fichier MIDI, inferer la structure polymetrique,
  generer une scene BPscript editable. C'est la "structure inference" du roadmap recherche.
- **Analyse en temps reel** : pendant le playback, analyser la sortie et proposer des
  simplifications/refactorisations de la grammaire
- **Comparaison structurelle** : comparer deux derivations, visualiser les differences
  dans le DerivationTree
- **Validation formelle** : verifier qu'une grammaire est bien formee, detecter les
  regles inaccessibles, les derivations infinies, les ambiguites

Lien avec la recherche : these sur l'inference de structures polymetriques
(Phase 2-3 du roadmap recherche, cf. articles blog Romi).

#### Plugins tiers (ecosysteme VST/AU)

Kanopi comme host de plugins :
- Charger des VST/AU dans le graphe audio WebAudio (via bridge local niveau 3)
- Les plugins sont des "instruments" accessibles comme n'importe quel transport
- `@actor synth  alphabet:western  transport:vst(plugin:"Serum", preset:"Bass")`
- Un acteur BPscript peut cibler un plugin comme il cible Web Audio ou MIDI

Kanopi comme plugin :
- Kanopi en tant que plugin VST/AU dans Ableton/Bitwig/Reaper
- Le sequenceur BPscript genere des notes MIDI dans le DAW hote
- Strategie "cheval de Troie" deja identifiee dans la vision fondatrice

#### Integration modulaire : VCV Rack + Eurorack

roomi-fields a pour vocation originelle de produire des modules. Kanopi est
le logiciel, les modules sont le hardware. Les deux se nourrissent.

**VCV Rack — passerelle software** :
- Module Kanopi pour VCV Rack : un sequenceur BPscript dans le rack virtuel
  - Sorties CV/Gate/Trigger : chaque acteur BPscript → sorties physiques du module
  - Entrees CV : @map cv_in → [flag] (un potard VCV modifie un flag BPscript)
  - Les 3 types temporels de BPscript (gate, trigger, cv) correspondent exactement
    aux 3 types de signaux eurorack — ce n'est pas un hasard
  - Preview BPx : tester les grammaires dans VCV avant de passer en hardware
- Communication via OSC ou bridge direct (VCV Prototype supporte deja JS/Lua)
- `@actor seq  alphabet:western  transport:vcv(output:1)` → CV sur la sortie 1

**Eurorack — le hardware roomi-fields** :
- Module physique base sur un microcontroleur (Daisy, Teensy, ESP32 + ecran)
- BPx engine compile en C/Rust embarque (pas JS, pas WASM — natif)
- Interface minimale : ecran OLED + encodeur pour naviguer les scenes
- Sorties : 4-8 CV/Gate/Trigger configurables par acteur
- Entrees : 2-4 CV pour @map (flags, tempo, poids de regles)
- Communication : USB-MIDI pour charger les scenes depuis Kanopi web
- WiFi optionnel : sync Ableton Link, reception OSC

**Max/MSP + Max for Live** :
- External Kanopi pour Max : objet `[kanopi]` qui derive des grammaires dans un patcher
  - Sorties : bangs (triggers), listes (tokens + timings), floats (CV)
  - Entrees : messages (loadScene, setFlag, emitTrigger, addRule)
  - Communication : OSC via bridge local ou external C compile
- Max for Live device : Kanopi comme device MIDI dans Ableton
  - Le clip Ableton contient une scene BPscript au lieu de notes MIDI
  - La derivation produit des notes MIDI dans le clip en temps reel
  - Les macros Ableton sont des @map vers les flags BPscript
  - Strategie "cheval de Troie" : les utilisateurs Ableton decouvrent les grammaires
    sans quitter leur DAW
- `@actor synth  alphabet:western  transport:max(outlet:1)` → sortie Max outlet 1

**Le flux utilisateur** :
```
1. Composer dans Kanopi (web)        → ecouter en WebAudio/MIDI
2. Tester dans VCV Rack (software)   → simuler les sorties CV/Gate
   ou dans Max/Ableton (M4L device)  → integrer dans un set Ableton
3. Transferer sur le module (USB)    → jouer en eurorack physique
4. Performance live                  → le module derive en temps reel,
                                       les potards physiques = @map CC→flags
```

**Integration Ableton Live directe** :
- Au-dela de Max for Live : integration ALS (Ableton Live Set)
  - Import/export de scenes BPscript comme clips Ableton
  - Sync bidirectionnelle : modifier le clip dans Ableton → mise a jour de la scene BPscript
  - Kanopi comme "surface de controle" Ableton (remote script Python)
  - Ableton Push comme controleur natif pour Kanopi (@map des pads/encodeurs)
- Ableton Link deja prevu dans le bridge (Phase 5)
- Ableton Live MCP Server (2025) ouvre la porte a l'integration IA bidirectionnelle

**Partenariats controleurs physiques** :
- Identifier un controleur qui se prete naturellement au workflow grammaires + polymetrie
- Candidats a evaluer :
  - **Synthstrom Deluge** : sequenceur autonome, ecran, pads, deja une communaute DIY/hacker
  - **Squarp Hapax** : sequenceur polymetrique hardware, 2 projets × 8 tracks, effets MIDI — le plus proche de notre vision structurelle
  - **Tempera** : controleur expressif MPE, pertinent pour l'Osmose et le jeu expressif
  - **Electra One MK2** : controleur MIDI/OSC programmable, ecran LCD par encodeur, mapping visuel — ideal pour visualiser les flags et les @map
- Modele de partenariat :
  - Profil Kanopi pre-configure pour le controleur (mapping @map par defaut)
  - Co-branding : "works with Kanopi" / "powered by BPscript"
  - Templates de scenes optimisees pour le controleur
  - Documentation commune, tutoriels croises
- L'Electra One MK2 est le plus interessant en premier : son ecran par encodeur
  peut afficher les noms des flags BPscript et leur valeur en temps reel,
  et c'est un controleur OSC natif (pas juste MIDI)

**Pourquoi c'est strategique** :
- La communaute eurorack est habituee a payer pour des modules (200-500€)
- Un sequenceur a grammaires formelles n'existe pas en hardware — zero concurrent
- Le lien Kanopi→VCV→Eurorack cree un tunnel de conversion :
  gratuit (web) → engage (VCV) → paye (module physique)
- Les 3 types BPscript (gate/trigger/cv) parlent nativement eurorack

**Timeline** :
- Court terme : module VCV Rack (JS via VCV Prototype ou C++ module SDK)
- Moyen terme : prototype Daisy (BPx en C, 4 sorties CV/Gate)
- Long terme : module de production roomi-fields (hardware fini, boitier, distribution)

#### Bibliotheques partagees en ligne

Plateforme communautaire de scenes, grammaires, alphabets, tunings :
- **Depot git de scenes** : chaque scene est un repo, versionne, forkable
  - L'utilisateur fork une scene, la modifie, la publie → evolution collaborative
  - Merge requests pour proposer des variations
  - Historique complet des evolutions d'une piece
- **Votes / audiences** : classement par popularite, par tradition musicale, par complexite
- **Tags** : par tradition (raga, maqam, western, gamelan), par mode (ORD, RND), par runtime (SC, Tidal, MIDI)
- **Preview audio** : ecouter une scene avant de la telecharger (derivation + WebAudio cote serveur ou client)
- **Bibliotheques d'alphabets et tunings** : contribuees par la communaute
  (systemes microtonaux, gammes traditionnelles, instruments)

Modele : hub.kanopi.dev ou similaire. Gratuit pour le partage, premium pour
les collections curees ou le stockage de samples.

#### Communaute integree

Chat/forum/Discord integre dans Kanopi :
- **Canal par scene** : discussion sur une piece en cours de developpement
- **Live sessions partagees** : un performer partage son ecran, les spectateurs voient le code evoluer
- **Code review de grammaires** : comme GitHub PR mais pour des scenes musicales
- **Rooms de jam** : espaces collaboratifs temps reel (cf. Flok mais integre)
- **Integration Discord** : bot qui publie les nouvelles scenes, les performances, les updates

L'avantage d'integrer plutot que d'utiliser un Discord externe : l'historique
des discussions est lie aux scenes, pas disperse dans des canaux generiques.

---

## Sources principales

### Outils et communautes
- [Strudel REPL](https://strudel.cc/)
- [TidalCycles](https://tidalcycles.org/)
- [Sonic Pi](https://sonic-pi.net/)
- [TOPLAP](https://blog.toplap.org/)
- [Algorave](https://algorave.com/)
- [awesome-livecoding (TOPLAP GitHub)](https://github.com/toplap/awesome-livecoding)
- [awesome-live-coding-music](https://github.com/pjagielski/awesome-live-coding-music)
- [Opinionated Guides - Livecoding](https://opguides.info/music/software/livecoding/)

### Issues et forums
- [SuperCollider GitHub Issues](https://github.com/supercollider/supercollider/issues)
- [SuperCollider latency issue](https://scsynth.org/t/latency-issue-in-supercollider/10489)
- [Strudel on Codeberg](https://codeberg.org/uzu/strudel)
- [State of TidalCycles and Strudel](https://uzu.lurk.org/t/the-state-of-tidalcycles-and-strudel/5522)
- [TidalCycles microtonality](https://club.tidalcycles.org/t/custom-tuning-just-intonation-microtonality/3344)
- [Microtonality in Tidal (TOPLAP)](https://forum.toplap.org/t/microtonality-in-tidal/1015)
- [Live coding (Lines forum)](https://llllllll.co/t/live-coding/5032)
- [Mercury (Lines forum)](https://llllllll.co/t/mercury-live-coding-browser-or-maxmsp/53008)
- [Orca (Lines forum)](https://llllllll.co/t/orca-livecoding-tool/17689)

### Recherche academique
- [Human-machine agencies in live coding (Xambo & Roma, 2024)](https://www.tandfonline.com/doi/full/10.1080/09298215.2024.2442355)
- [Sardine paper (HAL)](https://hal.science/hal-04309136/document)
- [ICLC](https://iclc.toplap.org/)
- [ICLC 2025 Barcelona](https://iclc.toplap.org/2025/)
- [NIME](https://nime.org/)
- [SuperCollider Symposium 2025](https://supercollider-2025.github.io/)

### Comparatifs et analyses
- [Soniare - Live Coding Systems Comparison](https://www.soniare.net/blog/live-coding-systems-comparison)
- [The Holy War: Sonic Pi vs TidalCycles vs Strudel](https://creativecodingtech.com/music/live-coding/comparison/2024/10/22/sonic-pi-vs-tidalcycles-vs-strudel.html)
- [BrightCoding - Ultimate Guide to Music via Code](https://www.blog.brightcoding.dev/2025/12/01/the-ultimate-guide-to-music-performance-via-code/)
- [Bitwig Studio 6 vs Ableton Live 12](https://musictech.com/guides/buyers-guide/bitwig-studio-6-vs-ableton-live-12/)

### Outils complementaires
- [Flok GitHub](https://github.com/munshkr/flok)
- [Estuary GitHub](https://github.com/dktr0/estuary)
- [Sardine GitHub](https://github.com/Bubobubobubobubo/sardine)
- [Renardo GitHub](https://github.com/e-lie/renardo)
- [Mercury GitHub](https://github.com/tmhglnd/mercury)
- [Hydra GitHub](https://github.com/hydra-synth/hydra)
- [Gibber GitHub](https://github.com/gibber-cc/gibber)
- [Glicol GitHub](https://github.com/chaosprint/glicol)
- [Orca GitHub](https://github.com/hundredrabbits/Orca)
- [Mitola (SuperCollider quark)](https://github.com/shimpe/mitola)
- [VCV Rack](https://vcvrack.com/Rack)
- [TimeLines-hs GitHub](https://github.com/lnfiniteMonkeys/TimeLines-hs)
