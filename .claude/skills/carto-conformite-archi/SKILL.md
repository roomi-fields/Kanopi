---
name: carto-conformite-archi
description: >
  Cartographier l'EXISTANT d'un dépôt TypeScript/JavaScript depuis le code (carte de flux complète,
  preuve "zéro orphelin", niveau par niveau, rôles lus dans le code) PUIS le confronter à son contrat
  d'architecture pour produire le backlog de sanitization. Outil = dependency-cruiser (déjà éprouvé).
  Déclencheurs : "cartographie", "carte de flux", "conformité archi", "confronter le code au contrat",
  "assainir l'existant", "spec d'archi d'un dépôt", "zéro orphelin". À lancer dépôt par dépôt.
---

# Cartographie + conformité d'architecture (depuis le code)

But : rendre la structure réelle d'un dépôt **visible et confrontable à l'archi définie**, de façon
**honnête** (chaque fichier de code rangé dans un bloc, zéro orphelin ; chaque flèche classée). La
carte vient de la **machine** (vérité du code), la confrontation structurelle de la machine, la
validation sémantique de **Romain**. Aucun outil ne juge le « bon job » sémantique — ça reste la
relecture humaine.

## Prérequis
- **Node 20+** (les outils modernes l'exigent). Si le dépôt est en Node 18 : `nvm use 22`.
- **dependency-cruiser** dispo (`npx dependency-cruiser` ou devDep). S'il n'installe pas : vérifier
  les deps locales (`link:` non supporté par npm → passer en `file:`).

## Procédure (par dépôt)

### 1. Extraire le graphe réel
Config minimale `.dependency-cruiser.cjs` à la racine du paquet :
```js
module.exports = {
  forbidden: [{ name: 'no-circular', severity: 'error', from: {}, to: { circular: true } }],
  options: { tsConfig: { fileName: 'tsconfig.json' }, doNotFollow: { path: 'node_modules' }, tsPreCompilationDeps: true },
};
```
**Inclure .ts ET .svelte** (sinon ~40 % de liens manquent), utiliser un **glob explicite** (un dossier
seul donne « 0 module ») et inclure les paquets-frères qui portent du code (ex. `packages/core`) :
```
npx depcruise "src/**/*.{ts,svelte}" "../core/src/**/*.{ts,js}" --config .dependency-cruiser.cjs --output-type json > /tmp/dc.json
```
⚠️ Piège vu : « ✔ 0 violation » avec « 0 module cruised » = il n'a **rien** analysé (faux vert). Toujours
vérifier le nombre de modules.

### 2. Partition complète + preuve zéro-orphelin + carte
Écrire un `blocks.json` (les blocs du dépôt = dossiers ; voir l'en-tête de `partition.cjs`), puis :
```
node <skill>/partition.cjs /tmp/dc.json blocks.json
```
Itérer `blocks.json` **jusqu'à NON RANGES = 0** (chaque fichier de code dans exactement un bloc).
Sortie : la preuve chiffrée, les flèches entre-blocs, le `carte.mmd` (mermaid, ouvrable en aperçu).
Les **tests** et les **données** (.json/.bps/.gr) sont mis de côté et comptés, jamais cachés.

### 3. Niveau par niveau (zoom d'un bloc)
Pour un bloc : refiltrer ses fichiers (hors `.test.`), sortir ses flux internes, et **lire le rôle de
chaque fichier dans son en-tête** (`grep -m1 '^//' fichier`) — pas l'inventer. Signaler les fichiers
**sans rôle écrit** (candidats mal placés) et les **boucles** (A↔B).
NB : une pièce « sans flèche interne » n'est PAS morte — elle est souvent utilisée par un **autre bloc**
(vérifier ses importeurs). Vrai code mort = importé par personne.

### 4. Confronter au contrat → backlog de sanitization
**Les drivers du contrat NE sont PAS qu'une seule prose.** Avant de rédiger/confronter, lire et prendre
en compte TOUS les documents d'archi existants du dépôt — ils ne s'ignorent jamais :
- le doc d'**archi globale** (`atlas/architecture/`) = l'**ÉTALON PREMIER de l'INTENTION** (lois
  transverses, mandats de composant, contrat d'arbre central) — il **PRIME** sur les contrats de
  frontière, qui lui sont **subordonnés et justiciables** (un contrat qui dévie d'atlas = la dérive) ;
- les contrats de frontière ratifiés (`hub/contrats/*`) + les **décisions** (`hub/decisions/*`) ;
- les docs **propres au dépôt** : `architecture.md`, `CHARTER.md`, `README.md`, `docs/…` — souvent déjà
  riches (les contrats de frontière scrupuleux `*FRONTIERE*.md` / `CONTRACT_*.md` donnent les **types
  précis** de la forme). Utiliser **RTFM** (`rtfm_search`) pour les trouver, pas grep/find.
- ⚠️ **Confronter D'ABORD à l'intention d'atlas, PUIS aux contrats pour la forme** — jamais l'inverse
  (sinon on rate les dérives gravées dans les contrats eux-mêmes, cf. BPx-2-interfaces 2026-06-29).

⚠️ **Ces docs peuvent être PÉRIMÉS.** Quand un doc contredit le code, **le CODE tranche** pour « ce qui
est » ; le doc qui ment = **dérive à signaler** (backlog), jamais une preuve. (Vu sur Kronos : un doc
disait « pitch encore là », le code prouvait l'inverse — c'est le doc qui était à corriger.)

Contrat du dépôt = l'intention issue de CES drivers. L'agent en rédige le **brouillon**
(`docs/arch/contrat-DRAFT.md`) ; une fois **ratifié par Romain**, il est promu en contrat de référence
(`hub/contrats/<repo>-architecture.md`, `kronos-transport.md`…). Confronter la carte à cette intention.
Pour chaque règle :
- **Structurelle** (« X ne doit pas dépendre de Y », sens d'un flux, pas de boucle) → l'encoder comme
  règle `forbidden` dependency-cruiser → la machine **signale les divergences**.
- **Sémantique** (« l'hôte n'invente rien », « la valeur est correcte ») → **PAS** vérifiable par règle
  de dépendance → relecture de Romain sur la carte + les rôles.
Chaque divergence → item de backlog (`tour bl add`), priorisé.

### 5. Le garde anti-rechute
Brancher les règles structurelles dans le gate du dépôt (`npm run arch`) → aucune **nouvelle**
divergence ne rentre pendant l'assainissement.

## Boucle d'escalade FERMÉE : détecter ne suffit pas (Romain 2026-07-02, demande [95])

Trou de processus constaté : la carto **DÉTECTE** bien les écarts, mais consignés dans la carte-reel
ou le contrat-DRAFT comme « transitoire connu », ils restent **ENTERRÉS** localement — jamais miroités
au backlog central ni escaladés. RUN-1 (`runtime-MIDI`, doublure Kairos) a ainsi dormi ~1 semaine,
invisible ; idem RUN-6, dette FIXTEMP (BPx), transitoire OSC. C'est le « **vert ≠ conforme** » au
niveau **PROCESSUS** : la détection n'a de valeur que si la boucle **détection → backlog → action**
est **FERMÉE**. Règles dures (jamais optionnelles) :

1. **Tout écart consigné dans une carte-reel / contrat-DRAFT est miroité en item de backlog central**
   — reporté à l'architecte (`tour send architecte`), qui pilote le backlog. Un écart documenté mais
   non escaladé = **trou**, au même titre qu'un test non exécuté.
2. **Un écart ARCHITECTURAL** (résidu de chemin/résolveur, RUN-x, divergence vs une **LOI** de la
   constitution comme L10) s'escalade comme **CONFORMITÉ** — **jamais** classé « transitoire
   oubliable ». « Transitoire » ne veut pas dire « invisible » : il porte un item de backlog daté
   avec sa **cible de fermeture**.
3. **Passe systématique** — `atlas/tools/ecarts-cartes-reel.py` récolte les écarts de **TOUTES** les
   cartes-reel/contrat-DRAFT de l'écosystème (marqueurs `RUN-x`, `ÉCART`, `⚠`, transitoire, dette,
   doublure/résidu) et les liste par dépôt. La lancer **après chaque vague de carto ET
   périodiquement**, puis **remonter la liste à l'architecte** pour qu'il backlogue. L'agent ne pilote
   pas le backlog — il **garantit que rien ne reste enterré**.

## Granularité & médium (règle Romain, 2026-06-28)

- **Médium = des DESSINS (mermaid) pour le FLUX et la STRUCTURE.** Romain lit visuellement ; un tableau
  « ne lui parle pas » pour montrer une forme. La carte mène par un **diagramme**.
- **MAIS l'inventaire d'INTERFACE se rend en TABLEAU de directions** (règle Romain, 2026-06-29). La
  **partie 3 du contrat** (les frontières : qui→qui, **sens**, **type** exact échangé) est le bon usage
  d'un **tableau** — pas une annexe : un dessin ne porte pas les types. Donc **dessin pour la forme,
  tableau pour l'inventaire d'interface**.
- **La partie INTERFACE (3) est la plus scrutée — ne PAS la sous-documenter** (défaut vu sur codevoices
  ET Kairos, 2026-06-29). Chaque frontière de module : nom, propriétaire, sens, **forme/type complet**,
  invariant. C'est là que se joue la cohérence cross-repo ; un survol ne suffit pas.
- **Le mermaid doit RENDRE.** Un diagramme à la syntaxe cassée (qui ne s'affiche pas) = livrable
  **refusé** ; valider l'aperçu avant de livrer (constat Kairos, 2026-06-29).
- **Contrats aux FRONTIÈRES de module** (intention, figés) ; **carte pour les internes** (photo,
  régénérée). **Ne JAMAIS figer une interface interne** (entre fichiers) en contrat → ça ossifie les
  entrailles et combat le « propre » (on veut refactorer les internes librement).
- **Zoom à la demande, selon la complexité.** Ne pas dessiner tous les internes systématiquement : le
  **diagramme de fonctions** ne paie que pour un fichier/module **profond ou emmêlé** — c'est là son
  vrai usage, **détecter le spaghetti** (des flèches qui se croisent entre blocs). Sur un module plat
  et sain, le dessin de haut niveau suffit.

## Livrables par dépôt (les 4 — PRODUITS, pas committés ; l'architecte valide, Romain ratifie)
1. **La carte du réel** → `docs/arch/carte-reel.md` : photo du code, **zéro-orphelin prouvé**, DESSINS
   (+ zoom fonction là où c'est emmêlé). C'est « ce qui EST ».
2. **Le contrat-brouillon** → `docs/arch/contrat-DRAFT.md` : l'INTENTION, en **4 parties** (ci-dessous),
   semée sur les drivers — jamais une photo du code déguisée. C'est « ce qui DOIT être ».
3. **Le garde** → `.dependency-cruiser.cjs` + `npm run arch` branché au gate ; **prouver qu'il mord**
   (vert → injecter une violation → capturée exit≠0 → retirer → re-vert : montrer les 3 sorties).
4. **La confrontation** → la **liste des écarts** carte↔contrat (dont les dérives des docs du dépôt) =
   la **§5 DU contrat-DRAFT**, PAS un fichier `confrontation.md` séparé. Reportée à l'architecte
   (`tour send architecte`) ; **lui** inscrit le backlog. L'agent ne pilote pas. **TOUT écart y est
   miroité en backlog central — même « transitoire » ou « connu » ; aucun n'est enterré** (règle
   dure, cf. § Boucle d'escalade fermée).

**Emplacements FIGÉS (ne pas improviser)** : `docs/arch/carte-reel.md` · `docs/arch/contrat-DRAFT.md` ·
garde `.dependency-cruiser.cjs` **à la RACINE** branché `npm run arch`. Pas de `confrontation.md` ni
`garde.cjs` ailleurs. Les fichiers de support (`.mmd`, `blocks.json`) = scratch, **non committés**.

### Gabarit CANONIQUE du contrat-DRAFT (squelette figé — sections jamais sautées)
Tout `contrat-DRAFT.md` suit CE squelette. La **profondeur** de chaque section varie avec la
complexité, mais **aucune section ne disparaît** :
- **Statut** (brouillon/ratifié, drivers confrontés).
- **1. Fonctionnel** — raison d'être du module.
- **2. Contextuel** — place dans le flux, voisins amont/aval, **lois cross-repo** qui le lient.
- **3. Interface** (la plus scrutée) : **3.1** inventaire des directions (**TABLEAU par frontière** :
  nom · propriétaire · sens · type/forme exact · invariant) ; **3.2** signatures exactes (la forme
  complète, chaque champ) ; **3.3** accord des deux bords (vérifié contre l'étalon de l'autre dépôt).
- **4. Topologie voulue** — organisation interne CIBLE (≠ décalque du code) + règles de structure.
- **Invariants vérifiables MACHINE** — les règles encodées par le garde.
- **5. Écarts code↔contrat** — la confrontation, ici (pas un fichier à part).
- **Questions Romain** (récap).
Marquage : ✅ratifié / ⚙️dérivé / 🔶proposé / ❓question-Romain. **Ne jamais figer une interface
INTERNE** (entre fichiers) — seulement les frontières de module.

### Profondeur PROPORTIONNELLE à la complexité — contre la dilution LLM (Romain 2026-06-29)
**Travers LLM observé, À COMBATTRE** : un agent **sur-spécifie le simple** (quand il maîtrise) et
**dilue l'info dans le complexe** (quand il sature). Résultat **inversé** sur la 1ʳᵉ vague : les dépôts
les PLUS complexes (moteur, langage) ont eu les contrats les PLUS maigres — exactement la dérive qu'on
combat (cousine du code-pastèque). La richesse du contrat doit être **proportionnelle à la complexité
réelle** : le contrat du moteur doit **ÉCRASER** celui d'un runtime mince, pas l'inverse.

**Comment l'obtenir sur un dépôt complexe** : ne PAS écrire le contrat en UN seul passage saturé.
**DÉCOMPOSER la production** — un sous-traitement **focalisé et profond par frontière** + par
sous-système dense + topologie, puis **synthèse**. Chaque frontière reçoit son plein traitement
(forme/types exacts, chaque champ, invariants, accord des deux bords) sans compression. Pour les
**géants** : workflow de lecteurs ciblés (cf. la phase 2 BPx, où la décomposition a tenu la profondeur).
Pour un dépôt **simple** : un passage suffit (risque de dilution ≈ nul). **Critère de réussite** : trier
les contrats par taille doit refléter le tri par complexité — sinon il y a eu dilution, à reprendre.

## Honnêteté (à répéter à Romain)
- Couvre le **structurel** (qui dépend de qui). Le **sémantique** reste sa relecture.
- « Gate vert » ≠ conforme. La carte ne ment pas (zéro orphelin prouvé) ; les **rôles** viennent des
  en-têtes du code (faillibles) et se **valident**.
- **Détecter ≠ escalader** : un écart repéré mais laissé « transitoire connu » dans un doc local est
  **invisible** — la détection est stérile sans la boucle escalade→backlog→action fermée (§ Boucle
  d'escalade fermée). Vaut aussi au niveau PROCESSUS, pas que STRUCTUREL.
- Ne pas spécifier les géants (BPx, BPScript) en entier d'amont — **boîte opaque** + lecture rapide,
  spec profonde seulement où une feature l'exige.
