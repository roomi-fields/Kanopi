# Contrat hôte ↔ runtimes de sortie — DRAFT

**Statut** : BROUILLON, à ratifier par l'architecte. Émis par kanopi sur directive Romain
(2026-07-03) : « l'hôte invoque des méthodes **exactement les mêmes** pour toutes les runtimes de
sortie ; l'hôte ne possède ni ne gère **aucune** logique métier / code spécifique d'une runtime ;
la frontière a été mal définie au chantier de migration des runtimes → dette technique **GRAVE**,
à formaliser et migrer pour TOUTES les runtimes ».

**Drivers confrontés** : `hub/contrats/kanopi-architecture.md` (l'hôte ne détient aucun état
d'autorité) · `hub/contrats/kronos-transport.md` (le temps appartient à Kronos) ·
`hub/contrats/kanopi-runtime-codevoices.md` (déjà une forme partagée — à **généraliser** à toutes
les sorties) · KAI-10 (la hauteur sort de l'hôte, gravée en amont). Le **code fait foi** : chaque
écart §5 est cité en `fichier:ligne`.

---

## 1. Fonctionnel — la raison d'être

Une **runtime de sortie** transforme un flux d'événements ordonnancés (note / contrôle) en une
sortie réelle : son (WebAudio), MIDI matériel, OSC (pont WS→UDP), voix de code (Strudel/Hydra/…).

**Principe dur** (ce qui doit être vrai) : l'hôte est une **boîte de branchement**. Il instancie
les runtimes, leur route le flux d'événements **tel quel**, leur transmet le temps de Kronos et les
gestes de l'utilisateur — **rien d'autre**. Toute la logique métier d'une sortie (mise en forme de
l'événement, synthèse, adressage, mapping vélocité/canal, résolution d'interprète, possession du
contexte audio) vit **entièrement et exclusivement dans la runtime**. L'hôte ne connaît AUCUNE
spécificité d'une runtime.

**Corollaire mesurable** : le fichier de branchement de l'hôte ne doit contenir **aucun** symbole
propre à une sortie — pas de `/127`, pas de lecture de `content.pitch`, pas de nom d'interprète, pas
de `new AudioContext`, pas de dérivation de liaison OSC.

---

## 2. Contextuel — place dans le flux

```
BPScript/BP3 ──parse──▶ BPx ──dérive──▶ Kronos ──ordonnance──▶ [runtimes de sortie] ──▶ réel
   (langage)            (arbre/scène)     (temps + route)         (audio/midi/osc/code)
```

- **Kronos** possède le temps, la position, le transport, et **route** chaque événement sur sa clé
  `output.runtime` (gravée par Kairos). L'hôte ne choisit aucun sink, ne tient aucune table
  acteur→transport.
- **Les runtimes** possèdent leur sortie de bout en bout.
- **L'hôte (Kanopi)** : instancie les runtimes, les **enregistre** sur Kronos par leur clé, leur
  fournit (a) le flux d'événements uniforme, (b) la vue horloge **lecture seule** de Kronos, (c) les
  points d'ancrage DOM là où il en faut (canvas), (d) le relais des **gestes** (évaluer / lecture /
  pause / stop). L'hôte ne fabrique rien, n'interprète rien.

Loi cross-repo liante : `kronos-transport.md` (le temps n'est jamais reconstruit par l'hôte) +
`kanopi-architecture.md` (aucun état d'autorité hôte).

---

## 3. Interface — le contrat uniforme (la partie la plus scrutée)

### 3.1 L'adaptateur de sortie uniforme — MÊME forme pour TOUTE runtime

Toute runtime de sortie expose **le même** adaptateur. L'hôte n'appelle QUE ces méthodes,
identiquement, quelle que soit la sortie.

| Méthode                     | Sens        | Appelé par | Charge (forme exacte)                         | Invariant                                   |
|-----------------------------|-------------|------------|-----------------------------------------------|---------------------------------------------|
| `send(ev: ScheduledEvent)`  | Kronos→rt   | Kronos     | l'événement ordonnancé **verbatim** (§3.2)    | la runtime met en forme ; l'hôte ne touche pas |
| `bindClock(clock)`          | Kronos→rt   | Kronos     | vue horloge **lecture seule** (now/musicalNow)| la runtime LIT le temps ; ne le reconstruit pas |
| `stop(src?)`                | hôte→rt     | hôte       | `{actorId?, fileId?}` (geste)                 | tais-toi ; portée acteur ou globale          |
| `pause() / resume(atSec)`   | hôte→rt     | hôte       | position transport (s de scène) à la reprise  | gel réel / reprise resynchronisée            |
| `setBpm(bpm) / onBeat / onBar` | hôte→rt  | hôte       | tempo / battements de l'horloge centrale      | la runtime cale son horloge interne          |
| `evaluate(code, src)`       | hôte→rt     | hôte       | code + source (voix de **capture** seulement) | point de capture tiré à l'onset par Kronos   |
| `attach(el)` (optionnel)    | hôte→rt     | hôte       | point d'ancrage DOM (canvas/conteneur)        | la runtime rend DANS l'élément ; l'hôte ne rend pas |
| `dispose()`                 | hôte→rt     | hôte       | —                                             | libère tout (contexte, nœuds, écouteurs)     |

**Il n'existe AUCUN adaptateur « spécial » écrit par l'hôte.** L'hôte enregistre l'adaptateur
**fourni par le paquet** de la runtime, sur la clé `output.runtime`.

### 3.2 L'événement ordonnancé — passé VERBATIM, jamais remodelé

`ScheduledEvent` (forme unique produite par Kronos, opaque à l'hôte) :
`{ onset, duration, actor, kind, nature, occurrence, output, content }`, où
`content = { token, controls, pitch, modulations, startSec }`.

L'hôte forwarde cet objet **entier et inchangé**. Il n'extrait rien, ne convertit rien, ne lit
aucune facette. Toute lecture de `content.pitch.hz`, de `controls.vel`, de `output.channel`, etc.,
se fait **dans la runtime**.

### 3.3 Accord des deux bords

- L'hôte fournit : l'événement (§3.2), l'horloge de Kronos (via `bindClock`), les ancrages DOM, le
  relais des gestes. **Point.**
- L'hôte ne fait JAMAIS : `vel/127`, résolution de canal, `token→note/Hz`, résolution d'interprète,
  dérivation de liaison OSC, création/réveil d'`AudioContext`, possession d'un sink (backtick).
- Chaque runtime conforme à CETTE forme (identité structurelle, à la façon de
  `kanopi-runtime-codevoices.md` — ce contrat le **généralise** aux quatre familles).

---

## 4. Topologie voulue

- Un **registre unique** : l'hôte lit `codeVoiceAdapters`/`audioAdapter`/`midiAdapter`/`oscAdapter`
  **depuis les paquets**, les enregistre sur Kronos par clé, sans en écrire un seul.
- Zéro wrapper hôte par runtime. Zéro `prep()` hôte. Zéro sink hôte (`backtickSink`). Zéro
  `deriveOscBindings` hôte. Zéro `new AudioContext` hôte.
- Le **temps partagé** (audio + OSC ordonnancent sur la même échelle) vient de **Kronos** via
  `bindClock`, pas d'un `audioCtx.currentTime` fabriqué par l'hôte.
- Le **contexte audio** de chaque runtime sonnante est possédé et réveillé **par elle** (règle déjà
  tranchée pour les voix de code : chaque runtime réveille le sien).

### Invariants vérifiables MACHINE (le garde `npm run arch`)

Règles `dependency-cruiser` + lint à brancher au gate (prouver qu'elles mordent) :
1. Le fichier de branchement (`kronos-audio.ts`) **n'importe** aucun symbole de mise en forme d'une
   runtime ; il n'y a plus de définition d'adaptateur `send()` côté hôte.
2. Aucun `new AudioContext` hors d'un paquet runtime.
3. Aucune constante/expression de mapping sortie dans l'hôte (`/127`, `.channel`, noms d'interprète).
4. L'hôte n'importe des paquets runtime QUE leur adaptateur (pas leurs internes).

---

## 5. Écarts code ↔ contrat (confrontation, sur pièces)

État **actuel** : l'hôte porte une logique métier par runtime — la frontière est mal posée.

| # | Écart (l'hôte fait ce que la runtime devrait faire)                            | Preuve (`fichier:ligne`)                        |
|---|-------------------------------------------------------------------------------|-------------------------------------------------|
| 1 | L'hôte **écrit 4 adaptateurs sur mesure** avec mise en forme par runtime       | `kronos-audio.ts:432-558`                       |
| 2 | `prep()` : l'hôte coerce/filtre `content` (drop CV, extrait `vel`)             | `kronos-audio.ts:403-428`                       |
| 3 | `vel → velocity /127` calculé dans l'hôte (audio ET midi)                      | `kronos-audio.ts:445, 497`                      |
| 4 | Résolution du **canal MIDI** dans l'hôte (`output.channel → chan`)             | `kronos-audio.ts:501-502`                       |
| 5 | L'hôte **dérive les liaisons OSC** (device/channel depuis params acteur)       | `kronos-audio.ts:228-243`                       |
| 6 | L'hôte **construit** le `MidiTransport` (logique runtime-midi côté hôte)       | `bpx-adapter.ts:51`                             |
| 7 | L'hôte **crée, possède et réveille** l'`AudioContext`, le prête à runtime-audio | `bpx-adapter.ts:1110-1111` · `kronos-audio.ts:324` |
| 8 | Le **temps partagé** vient d'un `audioCtx.currentTime` hôte, pas de Kronos      | `kronos-audio.ts:306`                           |
| 9 | L'hôte possède le **sink backtick** + le relais lifecycle des voix de code      | `kronos-audio.ts:540-558` · `code-voice-lifecycle.ts` |
|10 | **Symptôme** de la mauvaise frontière : contexte superdough jamais réveillé → voix de code MUETTES en vrai Chrome (cv-adsr sonne, lui, car l'hôte réveille SON contexte) | banc RMS 2026-07-03, [529] |

**Lecture** : l'interface d'appel est *presque* uniforme (Kronos appelle `.send(ev)` par clé), mais
le **corps** de chaque sortie est écrit dans l'hôte, et la possession (contexte, sink, transport,
liaisons) reste hôte. C'est la dette à solder.

---

## Plan de migration — grosse maille

**Ordre imposé par Romain** : formaliser la frontière AVANT de migrer ; migrer **TOUTES** les
runtimes ; validé par l'architecte ; puis exécution en mode `/plan`.

- **Phase 0 — Ratification** (architecte) : figer §3 (l'adaptateur uniforme + l'événement verbatim)
  comme forme partagée, généralisée depuis `kanopi-runtime-codevoices.md`. En **décliner une
  directive de contrat par runtime** (audio, midi, osc, codevoices) pour chaque agent propriétaire.

- **Phase 1 — Interface uniforme** : poser l'adaptateur uniforme (§3.1) + la forme `ScheduledEvent`
  verbatim (§3.2) dans les 4 paquets et la copie hôte, par identité structurelle (aucun import
  mutuel). Brancher le **garde** machine (§4) — d'abord permissif (compte les écarts), pour mesurer.

- **Phase 2 — Migration par runtime** (une à la fois, sans casse, **prouvée à l'écran**). Ordre
  proposé, du plus isolé au plus intriqué (valider le motif sur les simples avant les 2 sonnantes) :
  1. **MIDI** : déplacer `vel/127`, canal, aplatissement, et la **construction du transport** dans
     `runtime-midi`. L'hôte enregistre l'adaptateur du paquet, lui passe l'événement brut. Preuve :
     scène MIDI (Dual actors / MIDI channel override) sonne, canaux corrects.
  2. **OSC** : déplacer `deriveOscBindings` + le mapping adresse dans `runtime-osc`. L'hôte ne dérive
     plus rien. Preuve : scène OSC route sur les bons devices (banc pont).
  3. **AUDIO** : déplacer la **possession + le réveil de l'`AudioContext`** et la mise en forme
     (pitch/modulations/occurrence/vélocité) dans `runtime-audio` ; l'hôte ne fournit plus que
     l'horloge **de Kronos** (`bindClock`) et l'événement brut. Coordination : audio ET OSC
     partagent l'échelle de temps → cette échelle doit venir de Kronos, pas d'`audioCtx`. Preuve :
     cv-adsr + toutes scènes BP3/BPScript sonnent, position calée.
  4. **VOIX DE CODE** : déplacer le sink backtick + la résolution d'interprète dans
     `runtime-codevoices` ; trancher avec l'architecte si le **relais lifecycle** reste un
     branchement hôte légitime (transmission de gestes) ou descend dans le paquet. Le réveil du
     contexte superdough (fix [529], déjà routé) referme le symptôme #10. Preuve : Strudel/Tidal/
     Hydra sonnent en vrai Chrome (banc **clavier-seul** + contexte suspendu, pour ne plus masquer).

- **Phase 3 — Le garde mord** : passer les règles machine (§4) en bloquantes au gate ; prouver
  vert → violation injectée → capturée exit≠0 → retirée → re-vert. Aucune nouvelle fuite ne rentre.

**Livrables par phase** : la directive de contrat par runtime (Phase 0), le garde (Phase 1/3), et à
chaque runtime migrée une **preuve écran** (RMS/capture) + gate vert. « Fait » = prouvé sur les
vraies scènes, jamais « le test passe ».

---

## Questions à l'architecte (récap)

1. **Ratifies-tu §3** (adaptateur uniforme + événement verbatim) comme forme partagée généralisée ?
2. Le **temps partagé** audio/OSC : confirmes-tu qu'il doit venir de Kronos (`bindClock`) et que
   l'`audioCtx` cesse d'être la source d'horloge de l'hôte ?
3. Le **relais lifecycle** des voix de code (`code-voice-lifecycle.ts`, mon chantier S2) : reste-t-il
   un branchement hôte (transmission de gestes) ou descend-il dans `runtime-codevoices` ?
4. **Ordre** de migration (MIDI → OSC → audio → code) : le valides-tu ?
5. Qui **pilote** chaque migration de paquet (l'agent propriétaire de la runtime, coordonné par la
   tour) vs mon volet hôte (retrait des wrappers + branchement) ?
