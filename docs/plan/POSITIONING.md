# Kanopi Positioning

## Pitch en une phrase

> **Kanopi est le VSCode du live coding.**
> Ouvre tes fichiers Tidal, SuperCollider, Python, Hydra dans des onglets.
> Un fichier de session orchestre le clock, les scènes et ton hardware.
> Zéro migration, zéro nouveau langage à apprendre.

## Pitch en trois phrases

> Les live coders jonglent entre 4 apps (éditeur, REPL, mapper hardware, viz).
> Kanopi réunit tout dans une app locale : plusieurs langages en onglets avec clock partagé, scènes réutilisables, surfaces hardware bidirectionnelles, bibliothèque de contenu prêt à jouer.
> Gratuit, open-source, fonctionne dans le navigateur aujourd'hui, en desktop demain.

## Les 3 démos qui vendent

**Demo 1 — "Un fichier, trois langages synchro" (90s)**
Montre un workspace Tidal + SC + Hydra, tout lancé d'un Ctrl+Enter, clock partagé. Le viewer comprend : *"ah, c'est VSCode pour tous mes runtimes à la fois."*

**Demo 2 — "Mon Minilab 3 bookmarks des scènes" (60s)**
Presse pad 1 → scene "intro" (Tidal seul), pad 2 → "drop" (Tidal + SC + visuels). LEDs Minilab reflètent l'état actif. Le viewer comprend : *"mon hardware devient enfin utile."*

**Demo 3 — "CC mappé en une ligne" (30s)**
`@map cc:74 -> tidal.filter` et ça marche immédiatement. Le viewer comprend : *"c'est simple et ça bouge."*

Si ces 3 démos existent et marchent, tu as ton buzz TOPLAP / Mastodon / ICLC.

## Public cible

### Primaire
- **Live coders actifs** (TidalCycles, SuperCollider, Strudel, Sardine)
- **Musiciens électroniques** flirting avec le live coding mais rebutés par le setup
- **Performers multi-runtime** (Tidal + Hydra, SC + Python)

### Secondaire
- **Étudiants** en musique algorithmique
- **Chercheurs** en informatique musicale
- **Sound designers** voulant prototyper rapidement
- **Artistes immersifs** combinant audio + visuel

### Tertiaire (v3+)
- **Compositeurs** curieux du formalisme (BPscript + BPx)
- **Éducation** : conservatoires, universités

## Différenciation concurrentielle

Voir [MARKET_STUDY.md](MARKET_STUDY.md) pour l'analyse complète. Synthèse :

| Outil | Multi-runtime | Clock partagé | État partagé | Hardware bidi | Local/Web | Library |
|-------|---------------|---------------|--------------|---------------|-----------|---------|
| **Flok** | ✅ (8+ langages) | ⚠️ via Link | ❌ | ❌ | Web | ❌ |
| **Estuary** | ✅ | ✅ | ⚠️ limité | ❌ | Web only | ❌ |
| **Dublang** | ✅ (Neovim) | ❌ | ❌ | ❌ | Local | ❌ |
| **VSCode + ext** | ⚠️ juxtaposé | ❌ | ❌ | ⚠️ per-ext | Local | ⚠️ par ext |
| **Sonic Pi** | ❌ (mono) | ✅ | ✅ | ⚠️ basique | Local | ⚠️ |
| **Max/MSP** | ⚠️ bricolé | ✅ | ✅ | ✅ | Local | ✅ |
| **Kanopi** | ✅ | ✅ | ✅ | ✅ | Hybride | ✅ |

**Les trois axes combinés (multi-runtime textuel + état partagé sémantique + hardware bidi + library) = territoire vide.** Aucun concurrent ne fait les quatre. C'est la thèse défendable.

## Positionnement produit

### Ce que Kanopi EST
- Un **IDE** (éditeur structuré + outils intégrés)
- Un **orchestrateur** (clock, scènes, hardware)
- Un **hub de contenu** (library)
- Un **environnement local** (pas un service cloud)

### Ce que Kanopi N'EST PAS
- ❌ Un DAW (pas de timeline linéaire, pas de mixage multi-piste classique)
- ❌ Un langage (BPscript reste optionnel)
- ❌ Un remplaçant de Tidal/SC (Kanopi les orchestre)
- ❌ Une plateforme collab temps réel (Flok fait ça)

## Narratif de lancement

### V1 public (octobre 2026)
*"Kanopi v1 est là. Ouvre tes fichiers de live coding dans un IDE qui les comprend tous. Multi-runtime, clock partagé, hardware bidi, library communautaire. Gratuit, open-source, fonctionne dans le navigateur."*

### V2 (février 2027)
*"Kanopi desktop. Vrai SuperCollider, vrai Tidal, vrai Sardine, accès hardware natif. Même app, plus de puissance."*

### V3 (juin 2027)
*"Kanopi + BPscript. Compose des grammaires musicales en live. Dérive l'infini à partir de quelques règles. Papier ICLC 2027."*

## Canaux de communication

### Communautés cibles
- **TOPLAP** (toplap.org, Mastodon, Discord) — cœur live coding
- **Strudel Discord** (grande communauté web live coding)
- **TidalCycles Discord** (communauté historique)
- **SuperCollider Mailing list**
- **r/livecoding** (Reddit)
- **Hydra Discord** (ojack)
- **Bleep/Cloudbass/Scenes algorave**

### Événements
- **ICLC 2027** — paper + perf + demo (jalon)
- **Algoraves** (lancements, démos)
- **FOSDEM** (track live coding potentiel)
- **Eulerroom Equinox** (streaming algorave)

### Media
- Vidéos YouTube 90s démo
- Blog post détaillé sur roomi-fields.com (ou similaire)
- Interviews potentielles : Sam Aaron, Alex McLean, Raphaël Forment

## Modèle économique

### V1 → V2
**100% gratuit, open-source, pas de freemium.** Construire la communauté d'abord.

### V3+
Pistes envisageables :
- **Sponsorship GitHub** / Patreon
- **Hub premium** : collections curées, artistes invités, tutoriels vidéo
- **Assistant IA intégré** (le seul SaaS viable — coût réel à répercuter)
- **Hardware partnerships** : profils premium pour synthés récents (certifiés constructeur)
- **Workshops / formations** (revenu direct)
- **Commandes / consulting** pour performances/installations

Pas de modèle commercial en v1-v2. Priorité = adoption.

## Éthique & valeurs

- **Open-source** (licence à trancher : MIT ? AGPL ?)
- **Respect des langages existants** (Kanopi orchestre, ne remplace pas)
- **Hardware ownership** (pas de vendor lock-in, profils ouverts)
- **Communauté** > plateforme captive
- **Performance native** (pas de bloat, chargement rapide comme openDAW)
