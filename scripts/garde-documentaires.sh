#!/usr/bin/env bash
# LES GARDES DOCUMENTAIRES DU HUB, APPELÉS DEPUIS LE PORTILLON (arbitrage Romain 2026-08-14).
#
# CE QUE CE MAILLON RÉPARE : les deux gardes vivaient dans un BLOC GREFFÉ après `verify`, dans le
# crochet de POUSSÉE seulement. « verify vert » ne valait donc pas « portillon vert » — et chez
# kronos, dépôt témoin, les deux crochets étaient à des niveaux différents sans que rien ne le dise.
# Les appeler d'ici met tout ce qui lance `verify` au même niveau.
#
# UN APPEL, JAMAIS UNE COPIE : la logique reste sa source unique, `hub/tools/`. Zéro ligne dupliquée
# — c'est ce qui distingue ce maillon d'une quinzième rédaction du même garde.
#
# ⛔ IL ÉCHOUE, IL N'AVERTIT PAS. Le bloc greffé imprimait un avertissement quand le dossier partagé
# était introuvable, et la poussée passait au VERT sans que les deux gardes aient tourné. Un garde
# qu'on peut sauter doit échouer : présent dans le portillon n'est pas exécuté.
# ⛔ COUTURE DE MESURE, ET ELLE EXISTE POUR UNE RAISON MESUREE : éprouver la branche
# « dossier introuvable » en DÉPLAÇANT le dépôt partagé le retire aux quinze autres agents pendant
# la mesure. Leurs portillons échouent alors sur un « hub introuvable » vrai deux secondes et
# incompréhensible. Quatorze agents ont choisi ce geste le 2026-08-14, moi compris, parce que la
# consigne disait QUOI éprouver sans dire COMMENT. On surcharge le chemin, on ne déplace rien.
set -e
racine="$(git rev-parse --show-toplevel)"
hub="${KANOPI_HUB:-$(cd "$racine/.." && pwd)/hub}"
moi="$(basename "$racine")"

if [ ! -f "$hub/tools/garde-navigation.py" ]; then
  echo "✗ gardes documentaires INEXÉCUTABLES — hub introuvable à $hub" >&2
  echo "  Ces gardes ne se sautent pas : sans eux, le portillon n'est pas complet." >&2
  exit 1
fi

python3 "$hub/tools/garde-navigation.py" --depot "$moi"
python3 "$hub/tools/garde-copies.py"      --depot "$moi"
