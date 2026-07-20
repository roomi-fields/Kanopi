# BP3 grammars — unpublished (out of the UI library)

Ce dossier ne contient plus qu'une chose : les trois `.gr` qui servent de
**fixtures** au verrou de régression `gr-head-sections.test.ts` (F11 — le
lecteur de sections de tête lit désormais l'AST, plus le texte de la grammaire).

- `bp-rotate-scales.gr` — l'ancien lecteur textuel y voyait 3 sections et
  perdait le vrai polymètre ; la bonne réponse est `[M, N]`.
- `bp-transposition.gr` — l'ancien lecteur y fabriquait 36 fausses sections
  (dont `-->`, `lambda`) ; la bonne réponse est `[A]`.
- `bp-visser5.gr` — cas de contrôle.

## Pourquoi elles ne sont PAS remplacées par le corpus officiel

Depuis la décision `2026-07-20-bibliotheque-kanopi-source-officielle-des-113.md`,
la source officielle du corpus BP3 est `packages/library/scenes/BP3-tests/`, et
les copies divergentes ont été supprimées d'ici (11 fichiers, 2026-07-20).

Ces trois-là restent, et ce n'est pas un oubli — c'est **mesuré**. Le corpus
contient des grammaires au nom voisin qui ne sont **pas la même œuvre** :
`BP3-tests/transposition.gr` produit les sections `[M, N, P, ¬]` là où
`bp-transposition.gr` produit `[A]`. Y pointer les fixtures ne serait pas une
migration, ce serait **changer ce que le test verrouille** en croyant déplacer un
fichier — exactement le motif de l'incident vina (deux contenus différents sous
un nom proche).

Ce sont des fixtures d'un lecteur de syntaxe, pas des scènes : elles ne sont ni
dans la vitrine, ni dans le corpus de conformité, et n'ont pas vocation à y
entrer. Leur contenu doit rester **figé** — le test verrouille les sections de
CE texte-là. Ne pas les « mettre à jour » depuis l'amont : ça casserait le
verrou sans rien prouver de mieux.
