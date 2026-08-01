# Fiche de conformité BPScript — canon vs périmé (index sourcé)

> **Index, pas copie.** Chaque ligne pointe sa source `fichier:ligne` dans les dépôts.
> Le **code fait foi** (`BPscript/src/transpiler/`), l'EBNF/AST fait foi pour la grammaire,
> Romain seul tranche le langage. Cette fiche se **vérifie**, elle ne remplace pas l'autorité.
> Quand un point est marqué **À VALIDER ROMAIN**, ne le documente pas comme canon : surface-le.
>
> Dernière synthèse : 2026-06-26, **réconciliée avec** `hub/decisions/2026-06-26-*` (arbitrages
> conformité dont §5 **révisé** : acteur par défaut ; trois concepts du temps : tempo/durée/cadre ;
> kai9). **Fiche vivante** : tout trou révélé par l'oracle ou toute divergence avec une décision se
> corrige ici **immédiatement**. Si le langage a bougé depuis, l'oracle mécanique
> (`atlas/tools/oracle-bpscript.mjs` = le compilateur réel) tranche avant cette fiche.
>
> **Consolidation 2026-08-01** : cette fiche est l'original, diffusée sans divergence dans cinq
> dépôts (`hub`, `BPscript`, `kanopi`, `kairos`, `BPx`). Chaque fait présent dans une copie mais
> absent d'ici a été **rejugé à l'oracle avant remontée** (jamais recopié tel quel) : `@diapason`
> remplace `@tuning:<freq>` comme fréquence de référence (C-9, cutover 2026-07-14) ; le routage
> `@tempo`→`@mm` est livré (C-8) ; l'exemple `(scale:…)` sans espace après `:` est vérifié (C-5).

---

## A. La loi inviolable — un signe, un sens (jamais surchargé)

Source : `hub/principes-syntaxe.md:13-24` (table de la loi), `BPscript/docs/spec/LANGUAGE.md:319-333`.

| Signe | Sens premier | Exemple correct | Faute typique |
|---|---|---|---|
| `@` | DÉCLARER (hors-temps, niveau monde) | `@actor sitar`, `@tempo:120` | `@seed:1` nu en flux (→ `[@seed:1]`) |
| `[]` | s'adresser au MOTEUR (structure, production) | `[mode:random]`, `[weight:50]`, `A[/2]` | `[vel:80]` (`vel`=runtime→`()`) |
| `()` | s'adresser au RUNTIME (charge opaque) | `Sa(vel:120)` | `(mode:random)` (moteur→`[]`) |
| `!` | DANS LE FLUX, événement au point d'apparition | `![/2]`, `!(vel:64)`, `B3!C7` (simultané) | — |
| backticks | code délégué à un runtime externe | `` `sc: ...` `` | — |

### `:` = AFFECTATION DE VALEUR, `.` = APPEL DE COMPOSANT — LE piège central
**Règle de Romain (arbitrage 2026-06-26), fait autorité.** Source : `LANGUAGE.md:1099-1104`, `principes-syntaxe.md:15-19`.
- **`.` appelle un composant** (une entité nommée) : `alphabet.sargam`, `transport.midi`, `sitar.Sa`, `@transcription.dhati`, `sound.bell`, `@tuning.just`.
- **`:` affecte une valeur** à une clé/cible : `Sa:sound.kick`, `ch:3`, le `:midi` de `@alphabet.western:midi`, et `@diapason:442` (affecter la fréquence de référence).
- Conséquence pour `@tuning` : `@tuning.<nom>` = **appeler** un tuning (composant), **seule graphie licite** pour `@tuning`. `@tuning:<valeur>` est **REJETÉ à la compilation** (ParseError, tout axe de catalogue) depuis le CUTOVER graphie universelle (Romain 2026-07-14, tour [412]) — la fréquence de référence se règle désormais par `@diapason:<N>`, pas par `@tuning:`. Mesuré à l'oracle 2026-08-01 : `@diapason:442` compile, `@tuning:442` est refusé avec le message « ':' n'affecte pas de valeur à un composant […] fréquence de référence → '@diapason:<N>' » (`BPscript/src/transpiler/parser.js:1899-1913`). Cf. C-9.
- Règle d'évolution **constante v0.7→v0.8** : les *références de composant* sont passées de `:` à `.`. Donc un `:` là où on appelle un composant (ex. `alphabet:sargam`, `transport:midi`) = **forme v0.7 périmée** (compile encore par rétrocompat — `parser.js:949-989`). Le CUTOVER 2026-07-14 va plus loin pour les axes de catalogue (`alphabet`/`tuning`/`octaves`/`scale`/`sound`) : `:` sur ces axes n'est plus toléré du tout, il est **REFUSÉ** (`CATALOG_AXIS_KEYS`, `parser.js:50,1904`).

## B. Les 3 formes de contrôle (arbitrage Romain 2026-06-16 — distinctes, PAS une incohérence)
Source : `hub/courrier/bpscript.md:668-706`, `BPx/docs/AST_SPEC.md:415-437` (§4).

| Forme | Sens | Nœud AST |
|---|---|---|
| `!(xxx:N)` / `![xxx:N]` | événement **sans durée** (instant) | `instant` |
| `xxx(N)` | **transporté** par BPx sans interprétation (forme BPScript) | `transport-control` |
| `_xxx(N)` | **forme BP3** héritée ; le frontend la normalise en `xxx(N)` avant l'AST | (normalisée) |

`_xxx(N)` nu ≠ `_` (silence) + Control : un seul nœud (`parser.js:2292-2298`). `![retro]` (engine/flag) ≠ `!(vel:80)` (instant transport).

---

## C. Zones de déclaration — canon vs périmé

### C-0. ⛔ La forme d'appel `nom(valeur)` N'EXISTE PAS — et n'a jamais existé

Romain, 2026-07-26, mot pour mot : « **fonction() n'existe pas et n'a jamais existé en BPScript,
ça ne fait pas partie du langage tel qu'on l'a défini, c'est une dérive/erreur à supprimer** ».
Ce n'est pas une règle neuve : la forme d'appel a été **pesée et écartée par arbitrage le
2026-07-02** (`BPscript/docs/design/DIGITAL_FUNCTIONS.md` §7, « **Pourquoi A** (vs forme appel
`keyxpand(...)`) […] `:` = affectation partout » — Romain : « préserve la logique du langage »).

**Le compilateur la REFUSE depuis le 2026-07-26** (bpscript `a496a72`, « un rôle par signe ») avec
un message explicite : « la forme d'appel 'vel(…)' n'existe pas en BPScript ». Elle a vécu du
2026-03-16 à ce jour ; une scène ancienne qui la porte ne compile plus. Mesuré à l'oracle.

**Un rôle par signe, le même dans les deux sacs** (décision `hub/decisions/2026-07-26-ecriture-des-controles-virgule-espace-deux-points-point.md`) :
`,` sépare les **éléments du sac** · **espace** sépare les **parties d'UNE valeur** · `:` **affecte**
· `.` **appelle** un composant.

| Cas | ⛔ Dérive | ✅ Canon | Mesuré |
|---|---|---|---|
| Contrôle moteur, une valeur | `repeat(2)` | `[repeat:2]` | dérive **REFUSÉE** (message explicite) |
| Contrôle moteur, plusieurs parties | `goto(3,0)` · `[goto:3,0]` | `[goto:3 0]` | dérives **REFUSÉES** ; canon compile, espace **préservé** |
| Contrôle runtime, une valeur | `vel(80)` | `(vel:80)` | dérive **REFUSÉE** |
| Composant nommé d'un contrôle | `cc(98,45)` · `(cc:98,45)` | `(cc.98:45)` — `.` appelle le composant 98, `:` lui affecte 45 | compile |
| Contrôle runtime, plusieurs parties | `keymap(C3,C3,C5,C5)` · `(keymap:C3,C3,C5,C5)` · **valeur-groupe** `(keyxpand:(B3, -1))` | `(keymap:C3 C3 C5 C5)` | les trois dérives **REFUSÉES** ; canon compile et les parties arrivent **distinctes** (`"C3 C3 C5 C5"`) — lecture réparée par bpscript `a496a72`, **re-mesurée** le 2026-07-26 |
| Contrôle autonome dans le flux | `vel(80)` nu | `!(vel:80)` · `![goto:3 0]` | dérive **REFUSÉE** ; canon compile |

**La faute de fond est la même dans les trois dérives** : un signe qui prend un second métier.
`:` affecte **une** valeur ; la virgule sépare les éléments du sac et rien d'autre ; une parenthèse
d'appel n'est pas un sac runtime ; et la **valeur-groupe** donnait à `(` un rôle de groupement en
plus de « s'adresser au runtime » — c'est pourquoi le mécanisme de `DIGITAL_FUNCTIONS.md §7` est
**superseded** (son motif, désambiguïser la virgule, est conservé ; la solution change).

⚠️ Ma propre doc a enseigné cette dérive **huit fois** (sept entrées du catalogue BPScript + une
ligne d'architecture) jusqu'au 2026-07-26. Corrigées, et **gardées** : portillon étape 4bis,
mordant prouvé par injection.

Mesuré 2026-07-26 (niveau de preuve 0.A) : **aucune ratification en faveur de `nom(param)` nulle
part** — balayage exhaustif de `hub/decisions/` (91 décisions datées, 0 ratifiante),
`hub/principes-syntaxe.md`, `hub/contrats/`, `hub/savoir-bp3.md`, `atlas/architecture/
00-constitution.md`, `atlas/carte-autorites/` (zéro occurrence en sa faveur, partout). **Acte de
naissance** : la forme vit dans le code depuis `BPscript` commit `6431dcd` (2026-03-16,
« Transpiler complet »), `src/transpiler/parser.js:576-578` — `if(at(T.LPAREN) &&
isControlName(name)) return parseControl(name, tok);` — trois mois avant la première décision
datée du registre (2026-06-10) et l'arbitrage de la loi du langage (2026-06-11) : une dérive de
code, jamais une forme établie.

La règle d'or `.`/`:` (§A) est **acquise et n'a pas à être gravée** (Romain, 2026-07-26) : elle est
survalidée par `atlas/doc-utilisateur/docs/reference/writing-controls.md`, qu'il a relu et validé.
J'avais signalé l'absence de décision datée comme une lacune — c'en était une de forme, pas de
fond. Ne pas rouvrir le point.

### C-0bis. Les trois manques du temps — tranchés le 2026-07-26

Décision `hub/decisions/2026-07-26-trois-manques-du-temps-metre-additif-objets-sonores-couple.md`.
Synthèse rédigée : `atlas/doc-utilisateur/docs/reference/le-temps.md`.

| Manque | Tranché | État mesuré |
|---|---|---|
| Mètre additif BP3 `3+4+2/4` | **`@meter:3+4+2/4`** — la graphie de BP3 reprise telle quelle (Romain : « plus clair à comprendre » ; le `+` a deux rôles, assumé) | ⚠️ **REFUSÉ** par le compilateur ; `@meter` déclaré non câblé |
| Propriétés temporelles des objets sonores | **aucune syntaxe de scène** — un **type de librairie à créer** (L35/L26), invoqué `@sound.<nom>` | à câbler |
| Couple (échelle, vitesse) | **backlog langage** — besoin non prouvé | `[scale:N]`/`[speed:N]` FERMÉS (supprimés 07-26 et 06-26) |

⚠️ **RÈGLE DE ROUTAGE des propriétés d'objet sonore** (Romain, 2026-07-26) : *ce qui affecte le
**TEMPS** se règle dans le sac **moteur** `[…]` ; tout le reste dans le sac **runtime** `(…)`* —
application directe de la loi §2. Pivot, étirement, troncature, mobilité → moteur. Rendu → runtime.

### C-0ter. Les formes déclaratives — état mesuré au 2026-07-29

Référence rédigée : `atlas/architecture/FORMES-DECLARATIVES.md`. Arbitrages :
`hub/decisions/2026-07-29-les-formes-declaratives-de-bpscript.md`, `2026-07-28-unicite-des-noms.md`.
Le compilateur a **rattrapé** les décisions des 27 et 28 : ce qui était « décidé non câblé » est
maintenant **refusé avec un message qui nomme la faute**.

| Forme | État mesuré (oracle, 2026-07-29) |
|---|---|
| `@macro kick = (vel:120)`, `@alias x = y` | ⛔ **REFUSÉ** — le `=` a disparu de tout le langage |
| `cv env1 : mod.adsr(…)`, `gate Sa:midi` (sans arobase) | ⛔ **REFUSÉ** — l'arobase n'est pas optionnelle |
| `@cv env1 mod.adsr(…)` (déclare) · `@cv ramp:sc` (terminal + destination) | ✅ canon ; **le deux-points tranche**, et la forme à deux-points **fait exister** le nom |
| déclaration écrite **après** les règles | ⛔ **REFUSÉ** (était acceptée puis jetée en silence) ; seul `@mode` s'y place |
| `@map …` | ⛔ **REFUSÉ** — abandonné le 2026-07-27 |
| `@label groove`, suffixe `C4@accent` | ⛔ **REFUSÉS** (2026-07-28) — remplacés par `C4!accent` |
| `!>>` (coupure) | ⛔ **REFUSÉ** — s'écrit `\>>`, l'antislash barre le fil (2026-07-28) |
| `S -> saw >> lpf` | ⛔ **REFUSÉ**, et Romain tranche que le refus est **juste** — les chevrons vivent dans un **corps de macro**, dont le nom paraît dans le flux |
| `@wire saw >> lpf >> audio` | ⚠️ **DÉCIDÉ / NON CÂBLÉ** — *Expected arrow, got WIRE* ; écrire une macro invoquée en tête de scène |
| `@scene`, forme globale de `@cc` (`@cc x:2`) | ⚠️ **DÉCIDÉES SUPPRIMÉES, non câblées** — compilent encore ; ne pas enseigner |
| `@var A8` sous `@alphabet.western` | ⛔ **REFUSÉ** à la déclaration — le nom entre en collision avec un terminal de l'alphabet actif |
| `sitar.Sa` avec `alphabet.sargam` | ⛔ **REFUSÉ** — les noms du sargam sont en **minuscules** (`sitar.sa`) |
| `@in p transport.midi mapping.<table absente>` | ⛔ **REFUSÉ** — sans table, adresse nue (`<!p.60`) |

| `@macro lead C4 D4 E4` | ⚠️ **accepté aujourd'hui**, mais le mot `macro` est **DÉCIDÉ SORTANT** (2026-07-30) — une macro est un terminal dont le corps est un patch, déclaré par `@gate` / `@trigger` / `@cv` / `@var` |
| `@gate strike drum.on` (corps sans deux-points) | ⛔ **REFUSÉ** aujourd'hui — *« `@gate strike` sans valeur ne déclare rien »* ; c'est la forme cible du point ci-dessus, non câblée |
| `scene.cc12: 64` (acteur implicite nommé) | ⚠️ **DÉCIDÉ / NON CÂBLÉ** (2026-07-30) — *Expected arrow, got PERIOD* ; l'acteur implicite s'appelle `scene` et se désigne en **notation pointée**, pas par une forme nue en `@` |

**Natures** : `sounding`, `var`, `code` — **pas de « percussion »**. `@alphabet.tabla` puis
`S -> dha ka na` sort trois feuilles `sounding`, comme des notes ; ce qui distingue une frappe tient
à son **alphabet**. ⚠️ Le critère « sans accordage, donc pas de hauteur » est **REMPLACÉ** depuis le
2026-07-30 par un champ déclaré de l'alphabet, `resolvesPitch` (booléen, obligatoire ; posé dans la
donnée, pas encore exigé) — l'ancien critère manquait le shakuhachi, dont *meri* et *kari* valent un
demi-ton sans qu'aucun accordage soit déclaré. À côté vivent des rôles non-terminaux (silence,
prolongation, point d'attente, instantané, contrôles de transport).

**Les quatre mots qui déclarent un terminal** (2026-07-30) : `@gate` sonne et tient · `@trigger`
sonne et est ponctuel · `@cv` sonne en continu · `@var` ne sonne pas et ne dure pas. `@var` couvre le
réglage ponctuel dont l'**effet** persiste (la persistance appartient au module, pas à l'événement).

### C-1. Acteurs (`@actor`)
- **L'acteur reste l'unité unique** (liaison / adresse / mute), mais `@actor` n'est **pas obligatoire**
  pour le cas trivial (**révision Romain**, `decisions/2026-06-26-arbitrages-langage-conformite.md` §5) :
  si **rien n'est exprimé**, BPScript **matérialise un acteur par défaut** (alphabet + transport par
  défaut) **dans l'AST** (backlog LAN-5). Les valeurs par défaut ne sont **pas en dur** : elles vivent
  dans un fichier de **conf éditable par Kanopi** (même autorité que `controls.json`/`alphabets.json`),
  lu par BPScript — Kanopi édite la conf, jamais l'AST. Même dispositif que le repli transport par
  défaut de KAI-9. Conséquence : `@alphabet`-seul (sans `@actor`) **n'est plus « à déprécier »** ; voir C-2.
- **Canon v0.8** : bloc multi-ligne, références d'entité en `.` :
  `@actor sitar` / `  alphabet.sargam` / `  tuning.sargam_22shruti` / `  transport.midi(ch:3)`.
  Source `ACTOR.md:23-30`, `LANGUAGE.md:104-116`, `EBNF.md:112-137`, code `parser.js:931-947`.
- **Six clés d'entité** (décision `2026-06-16-cles-acteur-six.md`) : `alphabet`(requis), `tuning`(ex-`scale`),
  `octaves`, `sound`, `transport`(requis), `eval`. Énumérées `EBNF.md:114`, `parser.js:936-938`.
- **Affectations** dans le bloc via `:` : `*:sound.X` (défaut), `Sa:sound.kick` (note). Binding OSC : `device:<pont>`, `ch:<n>` (`EBNF.md:105-110`).
- **Périmé v0.7** : références en `:` — `alphabet:sargam`, `transport:midi(ch:3)`, `scale:X`, `sounds:` pluriel. Compile encore. Reconnaissance : `:` au lieu de `.` entre clé et valeur.
- **Périmé** : niveau « voix » distinct de l'acteur (acteur = voix, `ACTOR.md:11`) ; `terminal:acteur` (`Sa:sitar`) → `sitar.Sa`.
- ⚠️ **Corpus en retard** : la seule scène acteur (`public/demos/midi-actors.bps:7-8`) est en v0.7 `:`. Ne pas s'en servir comme modèle.

### C-2. Alphabets (`@alphabet`) — nominal pur
- **Canon** : `@alphabet.western:midi` — `.western` = quel alphabet (lib `alphabets.json`), `:midi` = runtime. Source `EBNF.md:225-236`, `LANGUAGE.md:374-377`.
- **`@alphabet` SEUL (sans `@actor`) = licite** (**révision Romain 2026-06-26**, `decisions/2026-06-26-arbitrages-langage-conformite.md` §5) : ce raccourci mono-acteur domine le corpus (74 scènes : `scenes/vina.bps:11`, `ruwet.bps:11`, `random-melody.bps:6`) ; plutôt que le déprécier sèchement, l'absence de déclaration complète déclenche l'**acteur par défaut matérialisé dans l'AST** (C-1, LAN-5). Pas de migration de masse imposée. (L'ancienne consigne « imposer `@actor`, migrer 74 scènes » est **abrogée**.)
- L'alphabet est **purement nominal** : tout alphabet portant `midi/semitones/generator/octaveChains` = **périmé** (ces données vont dans temperaments/tunings — `PITCH.md:32,940-941`).
- **Périmé** : `@templates` pluriel → `@template` (`LANGUAGE.md:919-940`). `@alphabet.raga(transport=sc,…)` = « not yet implemented » (`EBNF.md:72`), ne pas présenter comme dispo.

### C-3. Transports
- **Canon** : `transport.midi(ch:10)`, `transport.webaudio`. Source `ACTOR.md:58-66`, `EBNF.md:122-127`, AST `AST_SPEC.md:338-343`.
- Le **nom d'appareil est un IDENT LIBRE** (clé de `@devices`), PAS une liste fermée ; `webaudio` = alias de `audio` ; le canal vit dans `params` (`{ch:10}`).
- `transport` (appareil de rendu) ≠ `eval` (interpréteur du code encapsulé) ; le code encapsulé est **toujours transporté**, jamais rendu en place (`ACTOR.md:48-53`).
- **Périmé v0.7** : `transport:midi(ch:3)` (`:`).

### C-4. Tempéraments (la grille mathématique) — jamais en surface
- **Canon** : grille d'intervalles dans `lib/temperaments.json`, **jamais** une directive `@temperament` ni une clé d'acteur. Pointé transitivement par le champ `temperament` d'une entrée `tunings.json`. Source `PITCH.md:34,427-475`, resolver `public/src/dispatcher/resolver.js:22,62-70`.
- Deux types : `table` (ratios fixes — fraction `"9/8"` / décimal `1.0594` / cents `"100c"`) et `parametric` (Dynamic Tonality : period+generator+mapping). `PITCH.md:459-507`.
- **Périmé** : tempérament empaqueté dans l'alphabet ; `lib/tuning.json` (singulier, legacy BP3, clé `scales`) mêlant gammes+tempéraments → séparé en `temperaments.json`/`scales.json`/`tunings.json` (`PITCH.md:24-36`, chargé à la demande `libs-bundle.js:41`).
- **Reconnaissance** : un nom de tempérament (`12TET`, `pythagorean`) n'apparaît jamais en surface BPScript.

### C-5. Gammes / échelles (scales) + renommage `scale → tuning`
- Deux objets distincts :
  - `lib/scales.json` = **catalogue** de collections de hauteurs (gammes/modes/maqams/ragas). `PITCH.md:35,620-679`.
  - clé d'acteur **`tuning`** (`lib/tunings.json`, pluriel) = **gamme concrète bindée** (alphabet+tempérament+réf Hz). `ACTOR.md:16-18`, ex. `tunings.json["sargam_22shruti"]={alphabet,temperament,degrees,baseHz:240,…}` (`libs-data.js:40`).
- **⚠️ TROIS choses ont porté le mot `scale`, ne les confonds pas** (mis à jour 2026-07-26) :
  - **contrôle runtime `(scale:<nom> <clé>)`** — la **gamme microtonale**, de `_scale(name,key)` en BP3.
    **CONSERVÉ.** Exemple vérifié à l'oracle 2026-08-01 : `!(scale:just_intonation C4)` compile —
    valeur à deux parties séparées par une espace, **aucune espace après le deux-points** :
    `!(scale: just_intonation C4)` est **REFUSÉ** (message « pas d'espace après le deux-points »).
  - **contrôle moteur `[scale:N]`** — le facteur d'échelle **temporel** d'un bloc. **SUPPRIMÉ**
    (Romain 2026-07-26), subsumé par `{…}:durée` : `{C4, D4}[scale:2]` s'écrit `{C4, D4}:2`. ⚠️ il
    **compile encore** (suppression routée bpscript, pas encore faite). Même verdict que `speed` le
    2026-06-26 : deux écritures pour une fonction, on garde celle qui nomme la chose.
    `hub/decisions/2026-07-26-controle-moteur-scale-supprime-subsume-par-la-duree.md`.
  - **clé d'acteur `scale`** — renommage v0.7→v0.8 vers `tuning`, voir ci-dessus.
  L'homonymie des deux premiers est **héritée de BP3** : Bernard porte la même, et son aide ne la
  signale nulle part.
- **Périmé** : clé d'acteur `scale:X`. **Pas** de directive `@scale` de scène (n'existe pas, ne pas inventer).

### C-6. Sons (`@sound` / `sound.X`)
- **Canon v0.8** : territoire déclaratif `@sound` (singulier), entrées anonymes (défaut scène) ou nommées. Affectations **depuis l'origine du sujet** (pas depuis `@sound`) via `:` : `*:sound.bell`, `Sa:sound.kick`, inline `Sa(sound.bell)`. Cascade 8 niveaux. Source `LANGUAGE.md:948-1068`, `EBNF.md:148-220`.
- **Périmé** : `@sounds:X` (pluriel+`:`) → `@sound.X` ; encore dans le corpus actif (`scenes/vina.bps:14`, `vina2.bps:21`, `vina3.bps:10`). Directive `@synth` séparée supprimée. Affectation écrite DANS `@sound` = faute de territoire.

### C-7. Homomorphismes / transcriptions
- **Canon** : déclaration `@transcription.<subkey>` (`.` = namespace, table `lib/transcription.json`). Source `principes-syntaxe.md:17`, `EBNF.md:804`, `AST.md:1197-1202`, design `HOMOMORPHISMS.md`. Application inline : `$X tabla_stroke &X` (BP3 natif `(=X)`/`(:X)` → `$X`/`&X` en BPScript, `EBNF.md:1124,1432`, vérifié à l'oracle : `S -> $A C4 &A` compile). Substitution voisine : `@sub` + `&N14[sub:dhati]` (`sub.json`).
- **Périmé / piège** : `|x|` = **variable/métavariable BP3**, PAS un homomorphisme (`EBNF.md:803-804`). Pas de directive `@homomorphism` (le terme de surface est `@transcription`).

### C-8. Directives de scène hors-temps (`@xxx:`)
- **Canon** : `@tempo:N` (tempo de scène — **arbitrage Romain 2026-06-26 : tout migrer en `@tempo`**), `@duration:16b`, `[@seed:N]` (graine, bloc crochets — décision `2026-06-11-directives-production-crochets.md`). Routage production : `lib/settings.json:53-68`.
  - **Périmé (2026-07-29)** : `@cc breath:2` comme directive de scène autonome **disparaît**
    (`hub/decisions/2026-07-29-les-formes-declaratives-de-bpscript.md` §7, Romain : « spécifique MIDI,
    devrait UNIQUEMENT être déclaré en propriété d'un acteur MIDI ou d'un terminal MIDI »). `@cc` ne se
    déclare plus qu'en propriété d'un acteur MIDI ou d'un terminal MIDI, jamais comme directive de
    scène — cf. C-0ter (« DÉCIDÉES SUPPRIMÉES, non câblées » ; compile encore).
  - **Absolu ≠ relatif (précision Romain, décision arbitrages §2)** : `@tempo:120` = BPM **absolu** (`:` affecte une valeur, naturel). Le tempo **relatif** garde une **autre forme** (un multiplicateur — p. ex. `[tempo:*2]`, cf. `decisions/2026-06-26-trois-concepts-temps-duree.md §1`), **pas** un `:`. Ne pas fondre les deux sous un `@tempo` ambigu.
  - ⚠️ **`[tempo:160]` et `[tempo:*2]` sont la forme CANONIQUE, pas encore CÂBLÉE** (vérifié au compilateur, 2026-07-10). **Arbitrage Romain 2026-07-10 : À IMPLÉMENTER**, pas à retirer — la doc enseigne le canon, marqué « à venir », jamais `![*2]`. Le transpileur les **refuse** — en préfixe de règle comme en suffixe d'élément. Ce qui compile aujourd'hui : `C4[/2]` → émet le marqueur BP3 `/2` en tête de règle (absolu, persistant) ; `C4[*2]` → émet la **paire encadrante** `_tempo(1/2) C4 _tempo(1/1)` (portée bornée à l'élément) ; `![*2]` / `![/2]` en position libre → `_tempo(1/2)` / `_tempo(2/1)`, sans sortie (persistant à partir de là). Sources : `encoder.js:1067-1068` (« tempoOp `/` → bare prefix `/N` ; tempoOp `*` → `_tempo(1/N)` bracket ») et `encoder.js:411-412` (Encode.c : `*` = marqueur d'**étirement**, `/` = marqueur de tempo).
  - **`*N` ne veut pas dire « N fois plus vite ».** C'est un **étirement** : `![*2]` émet `_tempo(1/2)`, donc **ralentit** de moitié — et `_tempo(x)` multiplie le tempo par `x` (guide de Bernard, `BP3_help.txt:1642`). Le sens est cohérent, pas inversé ; l'écriture est trompeuse et l'aide doit l'expliquer.
- **Périmé / à migrer** :
  - `@mm:N` → **`@tempo:N`** (arbitrage 2026-06-26). **RÉSOLU** (BPscript, commit `0f4a6a1`, 2026-07-05) :
    le parser normalise `tempo`→`mm` sur TOUT directive (top-level et modificateur `@mode:X(tempo:N)`)
    avant tout consommateur (`parser.js:465-475`) ; `@mm` reste le nœud interne lu par BPx (rétrocompat
    douce, déprécié-doux), mais `@tempo` est intégralement routé jusqu'à `_mm`
    (`libs.js:393` — `subgrammarControls.set('mm', {bp3:'_mm', args:['bpm']})`). Ce n'est plus un écart ouvert.
  - `@octaves:western` (directive de scène) = **OBSOLÈTE, à supprimer** (arbitrage 2026-06-26). Présent dans le corpus (`scenes/kss2.bps:11`, `vina.bps:12`) → à retirer. La clé d'acteur `octaves` reste valide ; seule la **directive de scène** `@octaves:` disparaît.
  - `@seed:N` nu → `[@seed:N]` (`constants.js:20-34`, décision `2026-06-14-shuffle-seed-orthogonaux.md`).

### C-9. Fréquence de référence — portée par `@diapason`
- **Canon (depuis le CUTOVER graphie universelle, Romain 2026-07-14, tour [412])** : la fréquence de
  référence se règle par **`@diapason:<N>`** (`:` = affecter la valeur). `@tuning:<valeur>` est
  **REJETÉ à la compilation** (ParseError, tout axe de catalogue) — ce n'est plus une graphie licite
  distincte de `@tuning.<nom>` (cf. section A). Preuve : `BPscript/src/transpiler/parser.js:1899-1913`
  (ParseError + hint vers `@diapason:<N>`), mesuré à l'oracle 2026-08-01. `@diapason:N` est documenté
  comme défaut de scène overridable dans `BPscript/lib/alphabets.json:13`. Confirmé côté Kairos :
  `hub/contrats/bpx-kairos-arbre.md:75` (« 1er nom contracté : diapason ») et
  `kairos/src/projection/hauteur.ts:95-98` (`ActorEntry.values.diapason`).
- Niveau binding : la valeur vit dans `tunings.json` (`baseHz`/`baseNote`/`baseRegister`, ex. `western_12TET`→`baseHz:440`). `resolver.js:5-70`.
- **Périmé / à migrer** : `@reference:442` (`PITCH.md:875`), `a4:N` (`BPscript/lib/settings.json:66`,
  clé `directive_map.a4` — donnée **orpheline**, vérifié 2026-08-01 : aucun code de `BPscript/src/` ne
  lit `directive_map[...]`, seul un commentaire de `constants.js:32` la mentionne). Le mécanisme
  réellement implémenté et imposé par le parser est `@diapason:<N>`. Ce n'est plus un écart ouvert.

### C-10. Durée, cadre, `speed` — décision temps 2026-06-26
Source : `decisions/2026-06-26-trois-concepts-temps-duree.md` (trois concepts distincts : tempo / durée
de note / cadre polymétrique). Remarque d'origine : Bernard 2026-06-25 (le 1er champ d'un `{M,…}` est
une **durée**, pas une vitesse).
- **`speed` est SUPPRIMÉ** (pas renommé) : subsumé par le cadre. Le qualificateur `[speed:N]` (encore
  dans `LANGUAGE.md:476,492,689-703,1201,1233` — migration LAN-8) → forme cadre. **Périmé.**
- **La durée qui JOUE aujourd'hui = le cadre `{N, …}`** (1er champ = empan ; durée = M/N). Prouvé
  bpscript : `{1/2,A}`=500 ms, `{2,A}`=2000 ms à `@mm:60`. Équivalent BP3 identique : `{2,A B}`.
- **Raccourci `:N` — LIVRÉ (LAN-7, réalisé 2026-07-05).** ⚠️ *Cette entrée corrige la précédente,
  qui disait « parse mais silencieusement avalé » — c'était vrai au 2026-06-26, ce ne l'est plus.*
  Le suffixe désucre **exactement** vers le cadre, vérifié sur la grammaire BP3 émise (atlas, 2026-07-10) :
  `C4:1/2 D4` → `{1/2,C4} D4` · `{C4 D4}:2 E4` → `{2,C4 D4} E4` · `S -> C4 D4 :2` → `S -> {2,C4 D4}`.
  **Trois portées, et rien d'autre** : un terminal, un groupe, ou toute la règle (en fin de RHS).
  Une durée isolée **au milieu du flux** (`S -> C4 :2 D4`) est **refusée** (fail-loud, le message
  énonce les trois portées). Source : `decisions/2026-06-26-trois-concepts-temps-duree.md`, réalisée
  le 2026-07-05 ; feu vert de documentation donné par l'architecte le 2026-07-09.

---

### C-11. Drapeaux — garde, mutation (vérifié atlas 2026-07-10, corrigé par bpscript le même jour)
- **`@flag` ne déclare PAS un drapeau** : il nomme les **ÉTATS** d'un drapeau (`@flag scene: calm:1,
  full:2` dit que le drapeau `scene` a un état `1` nommé `calm`). **Les drapeaux existent par
  l'USAGE** — fidélité BP3, `parser.js:308` : « un IDENT NON déclaré reste tel quel (référence à un
  autre drapeau) ». Preuve par le corpus : **0 des 74 scènes** ne déclare `@flag`, et plusieurs
  utilisent des drapeaux (`[Choice==1]`, `[Atrans-1]`…).
- **Garde** — AVANT le LHS, c'est une **COMPARAISON** (`LANGUAGE.md:301`) :
  `[calm] S -> …` → `/calm/` · `[scene==1] S -> …` (le test d'une valeur s'écrit `==`, jamais `=`).
- **Mutation** — **en FIN DE RÈGLE**, c'est un **CALCUL**. Elle nomme le **DRAPEAU**, l'alias se
  résout : `[scene=full]` → `/scene=2/` · `[scene=2]` → `/scene=2/` · `[scene+1]` → `/scene+1/`.
  ⚠️ **Piège** : `[calm=1]` compile, mais `calm` est un nom d'**état**, pas de drapeau — il crée un
  drapeau *nommé* `calm` et émet `/calm=1/`. Ce n'est pas ce qu'on croit. Ne pas l'écrire.
- `[scene=1]` **en préfixe** est **refusé bruyamment** (« `=` est une MUTATION, elle s'écrit en fin de
  règle ; pour TESTER, comparer avec `==` » — message amendé par bpscript, commit `25b2c5f`).
  ⚠️ *J'avais rapporté ici deux « trous » : `[zzz=1]` accepté et `[scene=1]` produisant une grammaire
  vide « sans erreur ». **Les deux étaient faux.** Le premier est la fidélité BP3 ci-dessus ; pour le
  second, j'avais imprimé la grammaire émise **sans regarder les erreurs** — le vide était le
  SYMPTÔME de l'échec, pas la preuve d'un silence. Lire les erreurs avant de conclure.*
- **Vérifié sur un corpus de transcription BP3→BPScript** (grammaires traduites, 2026-07-18) : la même
  garde/mutation vaut partout — `/pos = 4/` (garde, avant LHS) → `[pos==4]` ; `/pos +1/` (mutation, fin
  de RHS) → `[pos+1]` ; poids infini natif `<inf>` → `[weight:inf]`. Exemples réels, vérifiés à l'oracle
  2026-08-01 (`kanopi/packages/library/scenes/BPScript-tests/tryflags3.bps`,
  `kanopi/packages/library/scenes/BPScript-tests/bells.bps` — ces scènes ne vivent plus sous
  `BPscript/test/grammars/`, seuls les instantanés de conformité y restent).

### C-12. Templates — section `@template` (vérifié atlas 2026-07-10)
- **Canon** : section OPTIONNELLE en fin de scène, singulier (`EBNF.md:345-362`). Entrées indexées :
  `[1] /1 ????` · `[2] /2 ?? . ??`. `?` = un slot terminal (compactable : `????`), `.` = séparateur de
  fragments, `/N` (ou `*N/M`) = facteur d'échelle, `($0 ???)` = master entre parenthèses.
- **Périmé** : `@templates` (pluriel). **N'existe pas** : `@template T = _ _ _` (forme inventée).
- Régime toujours **catalogue** (consommé par `[mode:tem]` pour l'analyse inverse) ; la section
  déclare des FORMES temporelles, elle ne les applique pas.

## D. Arbitrages Romain (2026-06-26) — TRANCHÉS

| # | Sujet | Décision | Écart à porter |
|---|---|---|---|
| 1 | `@octaves:` directive de scène | **OBSOLÈTE, supprimer** (la clé d'acteur `octaves` reste) | retirer du corpus |
| 2 | tempo `@mm` vs `@tempo` | **tout migrer en `@tempo`** | **RÉSOLU** (`parser.js:465-475`, commit `0f4a6a1`, 2026-07-05) — `@tempo` routé jusqu'à `_mm` ; reste : migration corpus |
| 3+4 | `@tuning` de scène + fréquence de référence | `@tuning.<nom>` = appeler un tuning (seule graphie licite) ; `@tuning:<freq>` **REJETÉ** à la compilation depuis le cutover 2026-07-14 ; fréquence de référence = **`@diapason:<N>`** | **RÉSOLU** (`parser.js:1899-1913`) — plus d'écart à porter |
| 5 | `@alphabet` seul vs `@actor` | **RÉVISÉ** : `@actor` reste l'unité unique mais **non obligatoire** ; si rien n'est exprimé, **acteur par défaut matérialisé dans l'AST** depuis une conf éditable Kanopi (LAN-5). `@alphabet`-seul **licite**, pas de migration de masse | conf défaut + matérialisation AST (bpscript) |
| 6 | temps : tempo / durée / cadre | `decisions/2026-06-26-trois-concepts-temps-duree.md` : **`speed` supprimé** (cadre `{N,…}`) ; durée de note `note:durée` **LIVRÉE** (LAN-7, réalisée 2026-07-05, cf. C-10) ; tempo absolu `@tempo:120` vs relatif multiplicateur | LAN-8 (migration `speed`) |

Décisions consignées en `hub/decisions/2026-06-26-*` + backlog langage LAN-2…LAN-9 (architecte). Écarts
code tous **résolus** (routage `@tempo` — ligne 2 ; `@tuning:<freq>`/`@diapason:<N>` — ligne 3+4 ;
désucrage durée `:N` — C-10) ; reste ouvert : **migrations corpus**.

### Corrections purement documentaires (le code fait foi, pas d'arbitrage — atlas route)
- `|x|` nommé « homomorphisme » (`LANGUAGE.md:278`) au lieu de « variable BP3 » (`EBNF.md:804`) → harmoniser LANGUAGE sur EBNF.
- `PITCH.md` Layer 4 / `ACTOR.md:18` citent `tuning.json` (singulier) ; le code lit `tunings.json` (pluriel) → corriger les docs.

---

## E. L'oracle mécanique — comment l'invoquer
`/home/romi/dev/bp/atlas/tools/oracle-bpscript.mjs` pilote le **compilateur réel**
(`BPscript/src/transpiler` `compileBPS`). Chemins absolus (le skill sert tout l'écosystème) :
```
node /home/romi/dev/bp/atlas/tools/oracle-bpscript.mjs <fichier.bps|.md>          # juge un fichier
node /home/romi/dev/bp/atlas/tools/oracle-bpscript.mjs "<texte>" --src            # juge un extrait
node /home/romi/dev/bp/atlas/tools/oracle-bpscript.mjs --scan <dirs...> [--json]  # balaye la doc
```
Un rejet = faute **structurelle** certaine (à trier : vraie faute vs fragment incomplet vs proposition non implémentée). Ce qui **compile mais emploie une forme périmée** (section C) échappe au compilateur → c'est le travail de l'expert avec cette fiche. Les blocs ` ```bp3 ` sont recensés mais **non jugés** (autre oracle).

---

## F. Limites connues du parser (bugs ouverts — le compilateur rejette une forme licite)

Quand le compilateur **rejette** une forme que le langage autorise, ce n'est pas une faute de l'auteur :
c'est un bug parser. À distinguer d'un vrai rejet de conformité. Recensé ici jusqu'au fix.

- **LAN-9 — override en ligne `(ch:N)` sur une note préfixée d'acteur, en combinaison.** Vérifié au
  compilateur réel (2026-06-26) :
  - `S -> bass.C4(ch:9)` **seul** → OK ; mais `S -> bass.C4(ch:9) C4` (suivi d'un symbole) et
    `S -> { bass.C4(ch:9) }` (dans les accolades) → **REJET** (`Expected RBRACE/arrow, got LPAREN/NEWLINE`).
  - La **note nue** `{ C4(ch:9) }` passe ; `{ bass.C4(vel:80) }` passe aussi. Déclencheur précis =
    **préfixe d'acteur + override `(ch:N)` combiné** (dans `{}` ou en séquence), pas le `(ch:N)` ni le
    préfixe seuls. Forme valide isolée, invalide en combinaison → bug parser (backlog LAN-9).
  - **Note de triage** : la formulation « `(ch:N)` rejeté dans `{}` » est trop large ; c'est la
    conjonction préfixe-acteur + `(ch:N)` qui casse. Le finding original (architecte) est ainsi resserré.
