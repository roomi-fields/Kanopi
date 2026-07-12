# Espace perso — Spécification comptes & fichiers (BROUILLON)

**Statut** : **RATIFIÉ Romain 2026-07-12** (périmètre complet). Décisions §7 tranchées ci-dessous.
Extensions d'interface (reset mot de passe, nom d'utilisateur) + infra email = escaladées archi.
**Portée** : l'expérience complète « profils utilisateurs + stockage de scènes/libs perso +
gestion des fichiers (save, save as, remove…) » (demande Romain #5). Ce document pose le
**modèle d'ensemble AVANT tout nouveau code UI** — il remplace l'approche réactive (un bouton
ajouté à chaque bug rencontré) par une cible unique et cohérente.

---

## 0. Pourquoi ce document

Le socle déjà livré (connexion, création de compte, stockage cloud CRUD, auto-save) est la
**plomberie** : il marche et il est prouvé. Mais il a été posé **sans la spéc de l'expérience**,
d'où le ressenti « aucune gestion de fichiers » : un fichier de bibliothèque qu'on modifie n'a
nulle part où être « enregistré chez moi », les actions cloud sont des glyphes cachés, et la
gestion de mot de passe / profil n'existe pas. Cette spéc définit l'**expérience cible** ; le code
existant devient sa fondation, pas son plafond.

---

## 1. Principe directeur (loi Kanopi)

Kanopi **projette** une autorité de stockage ; il n'invente aucun état. Toute opération fichier ou
compte est une **commande** au service, puis une **reprojection** de ce que le service renvoie.
L'identité et les fichiers **appartiennent au service** ; Kanopi = les boutons + l'afficheur.
Conséquence directe pour cette spéc : « Enregistrer », « Renommer », « Supprimer » ne sont jamais
des mutations locales — ce sont des commandes (`create` / `write` / `rename` / `remove`) dont
l'écran reflète le résultat.

---

## 2. Les trois espaces (le modèle mental de l'utilisateur)

Toute la gestion de fichiers se lit à travers **trois espaces** distincts. C'est le concept que
l'UI doit rendre évident (aujourd'hui il est implicite, d'où la confusion).

| Espace | Autorité | Persistance | Éditable | Où on le voit |
|---|---|---|---|---|
| **Bibliothèque** | embarquée (livrée avec l'app) | dans l'app | non (lecture seule) | panneau *Bibliothèque* |
| **Brouillon local** | navigateur (anonyme) | navigateur (ce poste) | oui | panneau *Fichiers* (déconnecté) |
| **Espace perso** | service cloud (compte) | cloud (partout) | oui | panneau *Fichiers* (connecté) |

**Ponts entre espaces** (le cœur de « gestion de fichiers ») :
- Bibliothèque → on **ouvre une copie** éditable (jamais on ne modifie l'original).
- Copie / brouillon → **« Enregistrer chez moi »** la promeut dans l'espace perso (compte requis).
- Espace perso → **« Enregistrer sous »** en fait une nouvelle copie ; **Renommer / Dupliquer /
  Supprimer** la gèrent.

---

## 3. Comptes (gestion des profils)

### 3.1 États
- **Anonyme** : pas de compte. On travaille dans le *brouillon local*. On peut créer un compte ou
  se connecter à tout moment.
- **Connecté** : session ouverte. L'espace perso (cloud) est actif.

### 3.2 Opérations comptes

| Opération | État requis | Détail | Existe ? |
|---|---|---|---|
| **Créer un compte** | anonyme | email + mot de passe (≥ 8) + confirmation → auto-connexion | ✅ livré |
| **Se connecter** | anonyme | email + mot de passe | ✅ livré |
| **Se déconnecter** | connecté | ferme la session, revient au brouillon local | ✅ livré |
| **Changer le mot de passe** | connecté | ancien + nouveau + confirmation | ❌ à faire *(étend l'interface → archi)* |
| **Mot de passe oublié** | anonyme | reset par email | 🔶 décision (SMTP requis) |
| **Profil : nom affiché** | connecté | nom optionnel (à défaut : l'email) | 🔶 décision (utile v1 ?) |
| **Profil : avatar** | connecté | image | post-v1 |

### 3.3 Promotion du brouillon
À la **première connexion** d'un compte, le travail *propre* du brouillon local (fichiers créés ou
modifiés, jamais les démos vierges) est **promu** dans l'espace perso. Additif, une seule fois par
compte, zéro écrasement. **✅ livré.**

### 3.4 Sécurité
- Inscription **prod ouverte à tous** (acté Romain 2026-07-12) ; le déverrouillage effectif est
  gaté au déploiement prod (agent infra).
- Chaque document est **propriétaire-seul** (imposé côté service).

---

## 4. Fichiers (gestion des fichiers)

### 4.1 Cycle de vie d'un fichier

```
  Bibliothèque (RO) ──"ouvrir une copie"──▶ copie éditable ──"enregistrer chez moi"──▶ doc perso (cloud)
                                                  ▲                                          │
   nouveau fichier ─────────────────────────────┘                       auto-save ◀─── frappe
   (scratch)                                                             renommer / dupliquer / supprimer
```

### 4.2 Le tableau maître des opérations

| Opération | Déclencheur UI | Commande service | Résultat |
|---|---|---|---|
| **Nouveau fichier** | panneau *Fichiers* → « + Nouveau » | `create(path, "")` (connecté) | doc perso vide ouvert |
| **Ouvrir une copie** (biblio) | panneau *Bibliothèque* → un item | — (copie éditable locale) | onglet éditable, non encore enregistré |
| **Enregistrer chez moi** | zone éditeur → « Enregistrer chez moi » | `create(path, contenu)` | la copie devient un doc perso ; auto-save ensuite |
| **Enregistrer** (doc perso) | *implicite* (auto-save) ou ⌘S | `write(id, contenu)` | contenu poussé (débouncé) |
| **Enregistrer sous** | zone éditeur → « Enregistrer sous… » | `create(nouveauPath, contenu)` | nouvelle copie perso, on bascule dessus |
| **Renommer** | panneau *Fichiers* → action fichier | `rename(id, nouveauPath)` | nom/dossier/extension changés, id stable |
| **Dupliquer** | panneau *Fichiers* → action fichier | `duplicate(id)` | copie « … copy » |
| **Supprimer** | panneau *Fichiers* → action fichier (confirm.) | `remove(id)` | doc retiré |
| **Déplacer / dossier** | (renommer le chemin) | `rename(id, "dossier/nom.ext")` | l'arbre reflète les dossiers |
| **Importer / Exporter** | (télécharger .bps / téléverser) | — | 🔶 post-v1 |

### 4.3 Modèle d'enregistrement — LE point à trancher

Deux régimes cohabitent, et il faut être **explicite** :
- **Doc perso déjà dans le cloud** → **auto-save** (débouncé, write-through, déjà livré). L'écran
  affiche un **état** : « enregistré » / « enregistrement… » / « hors-ligne, réessai en cours ».
- **Copie de bibliothèque ou brouillon** → **enregistrement EXPLICITE** (« Enregistrer chez moi »),
  parce qu'il faut choisir un nom/emplacement et créer le doc. Après ça, on retombe en auto-save.

🔶 **Décision Romain** : garde-t-on ce modèle mixte (auto pour le cloud, explicite pour la
promotion) — recommandé, c'est le comportement d'un IDE moderne — **ou** veux-tu un
**« Enregistrer » explicite partout** (⌘S obligatoire, pas d'auto-save) ? Ça change le contrat UX.

### 4.4 Zéro-perte & hors-ligne
Le cache local **retient toujours la dernière frappe** ; un `write` échoué (réseau, hors-ligne)
ne **jette jamais** l'édition — il est retenté tant que le doc existe. « En ligne requise » ne
porte que sur la copie **autoritaire** (le cloud), pas sur ta frappe. **✅ mécanisme livré.**

### 4.5 Conflits (même doc édité sur 2 appareils/onglets)
Post-v1. Stratégie proposée : dernière écriture gagne + horodatage `updatedAt` visible ;
avertissement si l'aval a changé depuis l'ouverture. À spécifier séparément.

---

## 5. Placement à l'écran (où vit chaque chose)

**Panneau *Fichiers*** (barre latérale) — l'espace perso quand connecté, le brouillon local sinon :
```
  ┌─ FICHIERS ─────────────────┐
  │ [compte : moi@…]     (⇄)   │  ← sélecteur de compte
  │ + Nouveau   + Dossier      │
  │ ▾ scènes/                  │
  │    mohanam.bps    ✎ ⧉ ✕    │  ← actions VISIBLES (plus cachées au survol)
  │    drone.bps      ✎ ⧉ ✕    │
  │ live.strudel      ✎ ⧉ ✕    │
  └────────────────────────────┘
```

**Zone éditeur** (barre d'onglets) — l'état + les actions du **document actif** :
```
  ┌ mohanam.bps ×  live.strudel × ───────────────── [✓ enregistré] [⋯] [compiles ●] ┐
  │                                                    │      └ menu : Enregistrer sous… / Renommer
  │  (copie de biblio non enregistrée →  [☁ Enregistrer chez moi] )
```
- Doc perso : « ✓ enregistré » / « enregistrement… » + menu ⋯ (Enregistrer sous, Renommer).
- Copie de biblio / brouillon (connecté) : bouton **« ☁ Enregistrer chez moi »** bien visible.
- Déconnecté : « ☁ Se connecter pour enregistrer » → ouvre le panneau *Compte*.

**Panneau *Bibliothèque*** : lecture seule, chaque item → « Ouvrir une copie ».

**Panneau *Compte*** : Créer un compte / Connexion (✅) · Déconnexion (✅) · **Changer le mot de
passe** · **Mot de passe oublié** · **Profil (nom affiché)**.

---

## 6. Ce qui existe (fondation livrée) vs ce que la spéc ajoute

| Brique | État | Reste à faire |
|---|---|---|
| Connexion / déconnexion | ✅ | — |
| Création de compte (in-app) | ✅ | — |
| Stockage cloud CRUD (list/read/create/write/rename/duplicate/remove) | ✅ | — |
| Auto-save débouncé + zéro-perte | ✅ | exposer l'**état** à l'écran (enregistré/en cours) |
| Promotion du brouillon au 1er login | ✅ | — |
| **Enregistrer chez moi** (copie → cloud) | ❌ | store + bouton éditeur |
| **Enregistrer sous** | ❌ | store + menu éditeur |
| Actions fichier **visibles** (renommer/dupliquer/supprimer) | ⚠️ existent mais cachées | rendre discoverables + dialogues propres (pas `prompt()`) |
| **Dossiers** (Nouveau dossier / déplacer) | ⚠️ l'arbre gère les chemins | UI de création/déplacement |
| **Changer le mot de passe** | ❌ | étend l'interface (archi) + UI |
| **Mot de passe oublié** | ❌ | décision + SMTP service |
| **Profil (nom affiché)** | ❌ | décision + UI |
| Import / Export (.bps) | ❌ | post-v1 |
| Conflits multi-appareil | ❌ | post-v1, spéc séparée |

---

## 7. Décisions — TRANCHÉES (Romain 2026-07-12)

1. **Modèle d'enregistrement** : ✅ **mixte** — auto-save cloud + « Enregistrer chez moi »
   explicite pour promouvoir une copie. (la reco)
2. **Mot de passe oublié** : ✅ **oui, en v1** — reset par email. ⚠️ *dépend d'un envoi d'emails
   configuré côté service (infra VPS)* : le flux se construit, la livraison réelle est gatée sur
   cette config → escaladée archi. Pas de « fait » tant que l'email ne part pas.
3. **Profil** : ✅ **nom d'utilisateur affiché en v1** (username). Avatar = post-v1.
4. **Dossiers** : ✅ **oui en v1** (créer dans un dossier + déplacer via le chemin).
5. **Périmètre v1** : ✅ **complet** — toutes les lignes ❌ des §6, sauf import/export et conflits
   multi-appareil (restent post-v1).

---

## 8. Phasage proposé (à valider)

- **Phase A — Fichiers (le blocage actuel)** : Enregistrer chez moi + Enregistrer sous + état
  d'enregistrement visible + actions fichier discoverables + dialogues propres. *Aucune extension
  d'interface* (create/write/rename/remove existent) → constructible dès validation de cette spéc.
- **Phase B — Comptes** : Changer le mot de passe (+ éventuellement reset) + profil. *Étend
  l'interface de stockage* → dépend de l'arbitrage archi (escalade déjà envoyée).
- **Phase C — post-v1** : import/export, avatar, conflits multi-appareil, dossiers avancés.

---

## 9. Impact interface de stockage (frontière archi)

- **Phase A** : **aucune** extension — les commandes nécessaires (`create`, `write`, `rename`,
  `duplicate`, `remove`) sont déjà dans `StorageService` §3.
- **Phase B** : ajoute `changePassword(oldPassword, newPassword)` et, si retenu,
  `requestPasswordReset(email)`. **Escalade envoyée à l'architecte** (le contrat `kanopi-storage.md`
  §3 est figé — toute extension passe par lui).
