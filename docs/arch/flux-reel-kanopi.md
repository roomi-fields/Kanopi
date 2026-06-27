# Flux réel de Kanopi — carte complète (extrait du code)

> **Preuve d'honnêteté (zéro orphelin)** : 248 modules lus = **196 de code, TOUS rangés dans un bloc**
> + 48 fichiers de données + 4 librairies extérieures + **0 non rangé**.
> Flèches entre code : **441 = 236 entre-blocs + 205 internes** (toutes classées).
> Chaque bloc indique (nb fichiers, nb liens internes) — le matériau pour zoomer au niveau suivant.
> Une flèche A → B = « A utilise B ».

```mermaid
flowchart TD
  N0["coeur (13 fichiers, 22 liens internes)"]
  N1["UI (50 fichiers, 52 liens internes)"]
  N2["stores (22 fichiers, 21 liens internes)"]
  N3["texte (3 fichiers, 1 liens internes)"]
  N4["adaptateur (37 fichiers, 30 liens internes)"]
  N5["BPx (4 fichiers, 0 liens internes)"]
  N6["KAIROS (15 fichiers, 24 liens internes)"]
  N7["KRONOS (14 fichiers, 19 liens internes)"]
  N8["RUNTIMES (9 fichiers, 13 liens internes)"]
  N9["bibliotheque (12 fichiers, 11 liens internes)"]
  N10["persistance (8 fichiers, 9 liens internes)"]
  N11["midi (1 fichiers, 0 liens internes)"]
  N12["BPScript (5 fichiers, 2 liens internes)"]
  N13["commandes (3 fichiers, 1 liens internes)"]
  N12 --> N4
  N5 --> N6
  N5 --> N7
  N5 --> N8
  N5 --> N4
  N5 --> N9
  N5 --> N0
  N5 --> N2
  N8 --> N5
  N1 --> N12
  N1 --> N8
  N1 --> N4
  N1 --> N9
  N1 --> N0
  N1 --> N13
  N1 --> N11
  N1 --> N10
  N1 --> N2
  N1 --> N3
  N4 --> N5
  N4 --> N6
  N4 --> N7
  N4 --> N9
  N4 --> N0
  N4 --> N2
  N9 --> N4
  N9 --> N0
  N9 --> N10
  N0 --> N5
  N0 --> N4
  N0 --> N11
  N0 --> N2
  N13 --> N0
  N13 --> N10
  N13 --> N2
  N10 --> N4
  N10 --> N0
  N10 --> N2
  N2 --> N5
  N2 --> N6
  N2 --> N7
  N2 --> N8
  N2 --> N4
  N2 --> N9
  N2 --> N0
  N2 --> N10
  N2 --> N3
  N3 --> N0
```

## À challenger (ton rôle)

- Les flèches **entre les blocs de Kanopi** (UI, stores, adaptateur, cœur, persistance…) sont fiables.
- Les flèches **impliquant les paquets amont** (BPx, KRONOS, KAIROS, RUNTIMES) sont à confirmer :
  l'outil suit les paquets liés et la frontière devient floue (ex. `BPx → stores` paraît à l'envers).
  Correctif simple si tu veux : traiter les paquets amont comme **opaques** (on note « Kanopi utilise X »
  sans entrer dedans). Je ne tranche pas — toi tu dis ce qui est juste, ça devient une règle.
