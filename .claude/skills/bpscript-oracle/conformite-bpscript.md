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
- **`:` affecte une valeur** à une clé/cible : `Sa:sound.kick`, `ch:3`, le `:midi` de `@alphabet.western:midi`, et `@tuning:442` (affecter la fréquence de référence).
- Conséquence pour `@tuning` : `@tuning.<nom>` = **appeler** un tuning (composant) ; `@tuning:<valeur>` = **affecter** une valeur (la fréquence de référence). Deux graphies, deux sens distincts et licites.
- Règle d'évolution **constante v0.7→v0.8** : les *références de composant* sont passées de `:` à `.`. Donc un `:` là où on appelle un composant (ex. `alphabet:sargam`, `transport:midi`) = **forme v0.7 périmée** (compile encore par rétrocompat — `parser.js:949-989`).

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
- **Renommage** : clé d'acteur `scale`(v0.7) → `tuning`(v0.8). **NE TOUCHE QUE la clé d'acteur.** L'**opérateur moteur `[scale:N]` est SUPPRIMÉ** (Romain 2026-07-26) — sa fonction, multiplier la durée d'un bloc, est déjà celle de `{…}:durée` : `{C4, D4}[scale:2]` s'écrit `{C4, D4}:2`. Il compile encore (suppression routée bpscript). Le contrôle **runtime** `(scale:<nom> <clé>)` — gamme microtonale — est conservé. Décision `hub/decisions/2026-07-26-controle-moteur-scale-supprime-subsume-par-la-duree.md`.
- **Périmé** : clé d'acteur `scale:X`. **Pas** de directive `@scale` de scène (n'existe pas, ne pas inventer).

### C-6. Sons (`@sound` / `sound.X`)
- **Canon v0.8** : territoire déclaratif `@sound` (singulier), entrées anonymes (défaut scène) ou nommées. Affectations **depuis l'origine du sujet** (pas depuis `@sound`) via `:` : `*:sound.bell`, `Sa:sound.kick`, inline `Sa(sound.bell)`. Cascade 8 niveaux. Source `LANGUAGE.md:948-1068`, `EBNF.md:148-220`.
- **Périmé** : `@sounds:X` (pluriel+`:`) → `@sound.X` ; encore dans le corpus actif (`scenes/vina.bps:14`, `vina2.bps:21`, `vina3.bps:10`). Directive `@synth` séparée supprimée. Affectation écrite DANS `@sound` = faute de territoire.

### C-7. Homomorphismes / transcriptions
- **Canon** : déclaration `@transcription.<subkey>` (`.` = namespace, table `lib/transcription.json`). Source `principes-syntaxe.md:17`, `EBNF.md:804`, `AST.md:1197-1202`, design `HOMOMORPHISMS.md`. Application inline : `$X tabla_stroke &X`. Substitution voisine : `@sub` + `&N14[sub:dhati]` (`sub.json`).
- **Périmé / piège** : `|x|` = **variable/métavariable BP3**, PAS un homomorphisme (`EBNF.md:803-804`). Pas de directive `@homomorphism` (le terme de surface est `@transcription`).

### C-8. Directives de scène hors-temps (`@xxx:`)
- **Canon** : `@tempo:N` (tempo de scène — **arbitrage Romain 2026-06-26 : tout migrer en `@tempo`**), `@duration:16b`, `@cc breath:2`, `[@seed:N]` (graine, bloc crochets — décision `2026-06-11-directives-production-crochets.md`). Routage production : `lib/settings.json:53-68`.
  - **Absolu ≠ relatif (précision Romain, décision arbitrages §2)** : `@tempo:120` = BPM **absolu** (`:` affecte une valeur, naturel). Le tempo **relatif** garde une **autre forme** (un multiplicateur — p. ex. `[tempo:*2]`, cf. `decisions/2026-06-26-trois-concepts-temps-duree.md §1`), **pas** un `:`. Ne pas fondre les deux sous un `@tempo` ambigu.
- **Périmé / à migrer** :
  - `@mm:N` → **`@tempo:N`** (arbitrage 2026-06-26). ⚠️ **Écart code** : le pipeline route encore `@mm`→`_mm` (`libs.js:172`) et non `@tempo` ; l'implémentation du routage `@tempo` est à faire côté bpscript.
  - `@octaves:western` (directive de scène) = **OBSOLÈTE, à supprimer** (arbitrage 2026-06-26). Présent dans le corpus (`scenes/kss2.bps:11`, `vina.bps:12`) → à retirer. La clé d'acteur `octaves` reste valide ; seule la **directive de scène** `@octaves:` disparaît.
  - `@seed:N` nu → `[@seed:N]` (`constants.js:20-34`, décision `2026-06-14-shuffle-seed-orthogonaux.md`).

### C-9. Fréquence de référence — portée par `@tuning`
- **Canon (arbitrage Romain 2026-06-26)** : la fréquence de référence est **portée par `tuning`**, en
  affectation de valeur : **`@tuning:442`** (`:` = affecter la valeur 442). À distinguer de
  `@tuning.<nom>` (`.` = appeler un tuning nommé). Cf. section A.
- Niveau binding : la valeur vit dans `tunings.json` (`baseHz`/`baseNote`/`baseRegister`, ex. `western_12TET`→`baseHz:440`). `resolver.js:5-70`.
- **Périmé / à migrer** : `@reference:442` (`PITCH.md:875`). ⚠️ **Écart code** : l'override de scène
  réellement routé aujourd'hui est `a4:N` (`settings.json:66`) ; le routage de `@tuning:<freq>` comme
  fréquence de référence est à implémenter côté bpscript.

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
  le 2026-07-05 ; feu vert de documentation donné par l'architecte le 2026-07-09. (Fiche jumelle
  `atlas/.claude/skills/bpscript-oracle/conformite-bpscript.md:223-230`, corrigée le 2026-07-10 ;
  cette copie-ci, importée le 2026-07-03, n'avait pas été resynchronisée depuis.)

---

## D. Arbitrages Romain (2026-06-26) — TRANCHÉS

| # | Sujet | Décision | Écart à porter |
|---|---|---|---|
| 1 | `@octaves:` directive de scène | **OBSOLÈTE, supprimer** (la clé d'acteur `octaves` reste) | retirer du corpus |
| 2 | tempo `@mm` vs `@tempo` | **tout migrer en `@tempo`** | code : router `@tempo` (route `@mm` auj.) ; corpus |
| 3+4 | `@tuning` de scène + fréquence de référence | `@tuning.<nom>` = appeler un tuning ; **`@tuning:<freq>` = affecter la fréquence de référence** ; règle générale `:` affecte une valeur / `.` appelle un composant | code : router `@tuning:<freq>` (route `a4` auj.) |
| 5 | `@alphabet` seul vs `@actor` | **RÉVISÉ** : `@actor` reste l'unité unique mais **non obligatoire** ; si rien n'est exprimé, **acteur par défaut matérialisé dans l'AST** depuis une conf éditable Kanopi (LAN-5). `@alphabet`-seul **licite**, pas de migration de masse | conf défaut + matérialisation AST (bpscript) |
| 6 | temps : tempo / durée / cadre | `decisions/2026-06-26-trois-concepts-temps-duree.md` : **`speed` supprimé** (cadre `{N,…}`) ; durée de note `note:durée` **LIVRÉE** (LAN-7, réalisée 2026-07-05, cf. C-10) ; tempo absolu `@tempo:120` vs relatif multiplicateur | LAN-8 (migration `speed`) |

Décisions consignées en `hub/decisions/2026-06-26-*` + backlog langage LAN-2…LAN-9 (architecte). **Écarts code** (routage `@tempo`, `@tuning:<freq>`, impl désucrage durée) + **migrations corpus** = routés à bpscript.

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
