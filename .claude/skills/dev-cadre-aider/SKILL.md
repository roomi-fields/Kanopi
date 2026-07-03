---
name: dev-cadre-aider
description: >
  Réaliser un item de backlog d'assainissement avec aider (mains pas chères, Gemini gratuit) DANS UNE
  CAGE : spéc tirée de la bible + périmètre borné + portillon vert + relecture agent obligatoire du
  diff. Pour un agent de dépôt qui exécute son backlog contre son contrat d'architecture. Déclencheurs :
  "lancer aider", "dev cadré", "item de backlog via aider", "assainir avec aider", "cage aider".
  Prouvé sur runtime-ui UI-7 (2026-06-28).
---

# Développer un item de backlog dans la cage aider

But : faire écrire le code **bien spécifié** par des **mains pas chères** (aider + Gemini gratuit),
sans jamais laisser entrer du code non conforme. La cage = ce qui rend aider **fiabilisé, pas
garanti** : la pastèque reste possible (gate vert ≠ propre), donc la **relecture agent est non
négociable**.

## Pré-requis
- **Bible** du dépôt prête : contrat d'archi (`hub/contrats/<repo>-architecture.md`) + carte du réel.
- **aider** installé (`aider --version`). **Clé Gemini** dans `hub/tools/cleanup/.gemini-key`
  (gitignorée, ne JAMAIS l'afficher/committer). **Node 22** (`nvm use 22`).
- **Garde structurel** `npm run arch` en place (cf. skill `carto-conformite-archi`).

## Choisir l'item — PAS n'importe lequel
- ✅ Item **in-repo** et **bien spécifié** (un changement local clair).
- ❌ **Amendement de contrat cross-repo** (ex. changer une forme d'entrée gelée qui touche d'autres
  dépôts) → **remonte à l'architecte**, ne se fait pas en aider solo.
- ❌ Item dont la décision (nommage, sémantique langage) n'est pas tranchée → escalade d'abord.

## La boucle (cage)

### 1. Baseline VERT obligatoire
`npm run check` + `npm run test` + `npm run arch` tous verts AVANT de toucher quoi que ce soit. Sinon
on ne distingue pas une régression d'aider d'un échec préexistant.

### 2. Spéc + périmètre bornés
- **Spéc** = le changement EXACT (fichier, ligne, valeur) **+ la règle de bible** qui le justifie.
  Pas « débrouille-toi » : aider invente sinon (vu : commentaires hors sujet).
- **Périmètre** = la **liste exacte** des fichiers qu'aider a le droit de toucher (ce sont les args).

### 3. Lancer aider, borné
```
export GEMINI_API_KEY="$(cat hub/tools/cleanup/.gemini-key)"
aider --model gemini/gemini-2.5-flash --yes --no-auto-commits --no-stream \
  --message "<spéc précise : changements EXACTS et RIEN d'autre ; ne touche aucun autre fichier>" \
  <fichier1> <fichier2>
```
`--no-auto-commits` = on garde le contrôle du commit (valider d'abord). Coût observé : ~0,004 $ / 9k
tokens pour un petit item — négligeable.

### 4. Portillon — TOUT vert
`npm run check` + `npm run test` + `npm run arch`. Si rouge : corriger (ou refaire la spéc), ne pas
garder.

### 5. Relecture agent du diff — NON NÉGOCIABLE
`git diff` et confronter à la bible. **Le gate vert ne suffit pas** — vu sur UI-7, gate 100 % vert avec
DEUX scories qu'il ne voit pas :
- un **commentaire mal placé** (aider en invente) ;
- une **retouche hors-périmètre** (aider a ajouté une ligne au `.gitignore`).
Retirer toute scorie et tout hors-périmètre. Le diff final doit être **exactement** la spéc.

### 6. Commit minimal + clôture + report
- Commit = la spéc, rien d'autre. Hygiène annexe (artefacts d'outil) = **commit séparé**.
- Clore l'item au backlog **via report à l'architecte** (`tour send architecte`) — l'agent de dépôt
  **ne pilote pas** le backlog, il reporte ; l'architecte inscrit/clôt.

## S'inscrire dans la procédure de dev (le cadre global)
Tout dev suit `hub/procedure-developpement.md` (3 couches de conformité). **AVANT** de coder un item :
- **Compréhension d'abord** : `rtfm_search` pour retrouver la **loi** (constitution) + le **contrat** du
  dépôt concernés ; `codegraph` pour le **rayon d'impact** et **qui consomme** la frontière touchée
  (per-repo + index cross-repo `~/codegraph-archi-ws`).
- **Confronter à l'intention** : la **constitution** (`atlas/architecture/00-constitution.md`) = l'étalon
  PREMIER ; le contrat du dépôt = la forme. Si une **forme nouvelle** est nécessaire à une frontière →
  la **proposer côté propriétaire d'abord** (loi L6), jamais l'inventer (pas de cast `as unknown as`).
- **Garde machine** : `npm run arch` mord au **pre-push** (portillon bloquant, Node 20+, cf.
  `tools/install-gate.sh`) ; `tools/garde-cross-repo.sh` tient les lois **structurelles transverses**.
  ⚠️ « garde vert ≠ conforme » — le **sémantique** reste la relecture / la revue adversariale.
- **Registre** : toute déviation assumée → **inscrite** (`<repo>/docs/DECISIONS.md` ou `hub/decisions`),
  classée et justifiée ; une déviation **sémantique** exige autorisation Romain.

## Honnêteté (à répéter)
- aider/Gemini = mains **faillibles** : scories, dérive de périmètre, « vert mais pas propre ». La cage
  borne le risque ; elle ne le supprime pas. **La relecture (étape 5) est ce qui tient la qualité**,
  pas le gate seul.
- Ce qui n'est pas mécanique (conformité sémantique au contrat) reste un **jugement** — d'où la
  relecture contre la bible, pas seulement contre les tests.
