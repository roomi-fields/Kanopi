# Kanopi Docs — Index

Cet index liste **tous** les documents de `docs/`. Un fichier qui n'y figure pas est un orphelin :
soit il rejoint cette liste, soit il n'a pas de raison d'être. Reconstruit le 2026-07-31 sur le
contenu réel du dossier — l'ancien index citait douze entrées pour vingt-six fichiers, dont quatre
qui n'existaient plus.

## Architecture

- [ARCHITECTURE.md](design/ARCHITECTURE.md) — stack technique, topologie des dépôts, flux de données
- [KANOPI_PRINCIPLES.md](design/KANOPI_PRINCIPLES.md) — principes fondateurs
- [carte-reel.md](arch/carte-reel.md) — carte du réel de l'hôte Kanopi, phase 1
- [contrat-DRAFT.md](arch/contrat-DRAFT.md) — contrat d'architecture de l'hôte (**brouillon**)

## Contrats et interfaces

- [ADAPTER_SPEC.md](design/ADAPTER_SPEC.md) — `RuntimeAdapter` : ce que Kanopi attend d'un runtime
- [EVENTS.md](design/EVENTS.md) — le bus `KanopiEvent`
- [LANGUAGE_SPEC.md](design/LANGUAGE_SPEC.md) — `LanguageSpec` : déclarer un langage à Kanopi
- [API_PILOTAGE-DRAFT.md](design/API_PILOTAGE-DRAFT.md) — API publique de pilotage (**brouillon**)

## Temps et transport

- [HORLOGE_TEMPO.md](design/HORLOGE_TEMPO.md) — pointeur vers la référence centralisée chez Atlas
- [TRANSPORT_BEHAVIOR.md](design/TRANSPORT_BEHAVIOR.md) — comportements du transport, **non régressables**
- [TEMPORAL_INTERPRETER.md](design/TEMPORAL_INTERPRETER.md) — interprétateur temporel (**proposition**)

## Son, hauteur, modulation

- [TONALITY.md](design/TONALITY.md) — la hauteur côté Kanopi, après la bascule vers Kairos
- [MODULATION_INPUTS.md](design/MODULATION_INPUTS.md) — registre CV du runtime webaudio

## Bibliothèque et espace perso

- [LIBRARY.md](design/LIBRARY.md) — système de bibliothèque à trois sources (livrée / perso / communauté)
- [LIBRARY_SPEC.md](design/LIBRARY_SPEC.md) — format d'une bibliothèque
- [DEVICES_SPEC.md](design/DEVICES_SPEC.md) — format des devices (`@devices`)
- [ESPACE_PERSO_SPEC.md](design/ESPACE_PERSO_SPEC.md) — comptes et fichiers (**brouillon**)

## Langage de session

- [KANOPI_LANGUAGE.md](spec/KANOPI_LANGUAGE.md) — spécification du langage de session Kanopi

## Intégrations — audits de phase 0

- [TIDAL.md](integrations/TIDAL.md) — TidalCycles / Strudel : matrice, keymap, coloration, autocomplétion
- [STRUDEL.md](integrations/STRUDEL.md) — visualiseurs Strudel et intégration CodeMirror
- [HYDRA.md](integrations/HYDRA.md) · [P5.md](integrations/P5.md) — visuel
- [CSOUND.md](integrations/CSOUND.md) · [SUPERCOLLIDER.md](integrations/SUPERCOLLIDER.md) · [MERCURY.md](integrations/MERCURY.md) — sonore

## Référence

- [HARDWARE_COLLECTION.md](reference/HARDWARE_COLLECTION.md) — collection matérielle et stratégie contrôleurs

## Maquettes

- [kanopi-v1-mockup.html](mockups/kanopi-v1-mockup.html) — maquette de l'interface v1 (à ouvrir dans un navigateur)

## Dépôts liés

- [BPscript](https://github.com/roomi-fields/BPscript) — le langage : analyseur et encodeur
- [BPx](https://github.com/roomi-fields/BPx) — le moteur
- [bp3-engine](https://github.com/roomi-fields/bp3-engine) — moteur WASM de Bernard Bel
