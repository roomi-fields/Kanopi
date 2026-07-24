# Fonctionnalités UI — référence utilisateur

Ce document décrit des fonctionnalités livrées et visibles à l'écran qui n'avaient
pas encore de trace dans la doc vivante (audit doc atlas, 2026-07-09). Chaque entrée
dit ce que c'est, où ça se trouve dans l'interface, et le comportement clé
(persistance, raccourcis). Les références de commit pointent l'implémentation.

---

## Mixer — master + tranches par acteur (KAN-UX3)

**Quoi.** Une table de mixage minimale : une tranche « master » puis une tranche par
acteur vivant de la scène, chacune avec un curseur de volume et un bouton mute (M).

**Où.** Bandeau droit, widget « Actors » : bande master en tête, puis une ligne
fusionnée par acteur (armement + méta + volume + mute mixer)
(`components/right-panel/ActorsPanel.svelte`, `MixerMaster.svelte`).

**Comportement.**
- Le **mute du mixer est une couche performeur persistante**, distincte de
  l'armement (le M de la liste d'acteurs, remis à zéro au replay). Il est stocké en
  local (`localStorage`, clé `kanopi.mixer.v1`), indexé par **nom** d'acteur : il
  survit aux re-évaluations, aux rechargements de scène et au reset du replay.
- Démuter au mixer ne réarme jamais un acteur que la couche d'armement tient
  silencieux ; inversement un changement d'armement n'écrase jamais le mute du mixer.
- Le **mute master** coupe tous les acteurs.
- Le **volume** (0..1 linéaire, par tranche) est mémorisé et persisté comme
  intention. Son application passe par l'API de gain du runtime audio
  (contrat [651] : gain effectif = acteur × master, rampe anti-clic côté
  runtime) — câblage en cours d'atterrissage au moment où ces lignes sont
  écrites (2026-07-09) ; tant qu'il n'est pas là, les curseurs s'affichent
  **désactivés** (un curseur mort ne simule rien). À rafraîchir ici au land.

Commit : `d803443`. Autorité : `lib/mixer/mixer-intent.ts` (saisie utilisateur,
seule catégorie d'état local que l'hôte possède) ; projection UI :
`stores/mixer.svelte.ts`.

## Espaces perso par compte minimal (KAN-UX5)

**Quoi.** Des espaces de travail séparés par « compte », sans authentification :
taper un nom inconnu crée son espace.

**Où.** Barre latérale, vue Files, ligne « personal space » en tête
(`components/sidebar/AccountSwitcher.svelte`). Le nom du compte actif est
cliquable ; le champ propose la liste des comptes connus (datalist).

**Comportement.**
- Entrée = bascule (ou création) ; Échap = annule. Un nom vide est refusé.
- L'espace du compte sortant est sauvegardé avant la bascule ; un compte **neuf**
  reproduit le premier lancement (fichiers starters, aucun onglet ouvert) — rien
  n'est fabriqué.
- Persistance locale par compte : `kanopi:workspace:v1:<nom>` ; compte actif dans
  `kanopi:account:current` (`lib/persistence/workspace-db.ts`).
- **Migration une fois** : le snapshot global d'avant les comptes devient l'espace
  du compte `default`, puis la clé legacy est retirée.
- La bibliothèque bundlée (panneau Library) reste commune et en lecture seule ;
  seul l'espace perso est namespacé.

Commit : `3f030a5`. Store : `stores/account.svelte.ts`.

## Bandeau droit en widgets empilés (KAN-UX1) + retrait icône git (KAN-UX4)

**Quoi.** La colonne de droite n'a plus d'onglets : les surfaces de contrôle
« Actors » et « Inspector » sont empilées et visibles en même temps
(`components/right-panel/RightPanel.svelte`).

**Comportement.**
- L'onglet **Scenes a été supprimé**. L'activation d'une scène passe par
  **Alt+1..9** (n-ième scène de la session) ou la **palette de commandes**
  (Ctrl/Cmd+K, « Switch to scene: <nom> ») — même point d'entrée interne dans
  les deux cas.
- L'**icône git** de la barre d'activité a été retirée : aucune vue n'existait
  derrière.

Commit : `be1d009`.

## Onglets du bas : Structure · Texte · Console (KAN-21)

**Quoi.** Le panneau du bas porte trois onglets, dans cet ordre : **Structure**
(onglet par défaut) · **Texte** · **Console** (`components/bottom-panel/BottomPanel.svelte`).

**Comportement.**
- Structure et Texte sont des vues de production rendues par le runtime d'affichage
  amont ; Kanopi ne fait que les câbler et fixer l'ordre. La Console est le journal
  des runtimes.
- L'onglet actif est persisté dans le snapshot du workspace (l'ancien identifiant
  `timeline` est relu comme `structure`).

Commit : `816df95`.

## Préchauffage au chargement de scène (M1, décision archi [589])

**Quoi.** Au chargement/produce d'une scène (clic library, Ctrl+Entrée) — pas au
premier play — les moteurs des voix de code utilisés par la scène sont préchauffés,
pour que le premier départ se fasse sans à-coup d'initialisation.

**Comportement.**
- L'hôte énumère les interprètes voix-de-code de la scène (acteurs à `eval.*` +
  blocs backticks) et les passe à l'entrée de préchargement du paquet voix-de-code
  (`lib/runtimes/warmup.ts`, appel dans `lib/runtimes/bpx-adapter.ts`).
- **Best-effort** : un préchauffage qui échoue est loggé en avertissement et ne
  casse jamais le chargement. Idempotent (recharger la même scène ne cumule rien).
- Le **contexte audio** est chauffé à part, au même moment (construction sans
  lecture), là où le runtime audio vit.

Commits : `cd11146` + `cb559dc`.

## Composition CV sur l'arbre (KAN-kro24)

**Quoi.** Pas de surface UI nouvelle : un déplacement de responsabilité qui
concerne le comportement des patchs CV (`env1:voix.cvin = filter.adsr(...)`).
La **composition des modulations n'est plus faite par l'hôte** : elle est
composée à la projection de l'arbre dérivé (côté Kairos/Kronos), et rendue par
le runtime audio.

**Comportement.**
- Kanopi transmet seulement, sur le contexte de projection, la librairie de
  modulation et la fabrique de courbes du runtime audio
  (`modulation: { modLib, exprSource }`, `lib/runtimes/bpx-adapter.ts`) ; il ne
  compose ni ne rend aucune courbe lui-même.
- Une scène sans CV est strictement inchangée ; les scènes avec CV sonnent comme
  avant, la propriété a juste changé de main (conforme au contrat : l'hôte ne
  détient aucun état d'autorité).

Commit : `24d4e01`.
