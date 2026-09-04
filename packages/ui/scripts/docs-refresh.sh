#!/usr/bin/env bash
# Rebuild the embedded user docs (public/docs/, git-ignored) from atlas/doc-utilisateur
# for the DEV loop. Same command as scripts/publish/build-and-deploy.sh's [0/6] step,
# which is the only place this normally runs (at deploy time) — dev sessions never see
# doc-utilisateur updates until this is run manually.
#
# ⛔ CE SCRIPT SE REFUSE, IL N'AVERTIT PLUS. Il portait un repli : mkdocs absent → un mot sur la
# sortie d'erreur, et `public/docs` restait tel quel, sous le code de sortie zéro. Or ce dossier
# EXISTE déjà, régénéré à un déploiement antérieur — donc la boucle de développement continuait de
# servir une aide PÉRIMÉE, avec l'apparence d'une aide fraîche. Un avertissement noyé dans une sortie
# de commande ne prévient personne : c'est le code de sortie qu'on lit, et il disait vert.
#
# ⇒ La forme est celle que porte déjà `build-and-deploy.sh` pour sa cible de production. La différence
#   de régime entre développement et production n'a jamais justifié une différence de VÉRACITÉ : dans
#   les deux cas, ou bien l'aide embarquée vient d'être bâtie, ou bien la commande a échoué.
set -euo pipefail

UI_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ⛔ LA SOURCE EST LE SITE BÂTI PAR ATLAS, DANS SON ESPACE PUBLIÉ. Ce script bâtissait lui-même
# l'aide, en appelant le mkdocs qui vit dans l'arbre d'atlas. Ce chemin a cessé d'exister le
# 2026-09-04 : ma session tourne sous enveloppe, et de mes voisins je ne vois plus que
# `.publie/<nom>/`. Mesuré — `/home/romi/dev/bp` ne porte que `hub`, `kanopi`, `.paquets`, `.publie`.
#
# ⇒ Bâtir l'aide n'a jamais été mon geste : je porte l'interface, atlas porte la documentation. Tant
#   que j'appelais son outil, je faisais son travail avec ses affaires, et je dépendais de l'état de
#   son arbre — donc de sa vitesse de rédaction.
# ⇒ ⇒ Je consomme désormais ce qu'il PUBLIE. La différence est celle de tous mes autres voisins :
#   son écriture ne m'atteint plus, sa publication oui, et elle seule.
# ⇒ LE CHEMIN EST CELUI QU'ATLAS DÉCLARE. Il a porté pendant un quart d'heure une seconde valeur,
# `site/` à la racine de l'archive : l'outil de publication du hub aplatissait un chemin de DEUX
# segments, pendant que l'empreinte annonçait quand même le chemin déclaré. J'ai lu aux deux
# emplacements le temps que ça dure, le déclaré d'abord — se caler sur le chemin accidentel aurait
# été hériter du défaut d'un autre. L'architecte l'a réparé (`64096fbb`), l'emplacement à plat a
# DISPARU, et le second candidat est mort avec lui.
#
# ⛔ ET LE CHEMIN S'ÉCRIT D'UN SEUL TENANT, CE N'EST PAS UN DÉTAIL DE STYLE. Ma propre dérivation de
# population lit les chemins littéraux de mes fichiers pour savoir qui je lis et quoi geler pendant
# une campagne. Coupé en deux variables — une racine `.publie/atlas`, puis `$RACINE/doc-utilisateur/
# site` — le chemin ne matche plus, et ATLAS EST SORTI DE MA LISTE DE GEL sans que rien ne rougisse.
# ⇒ Mesuré : mon arme relevait onze dépôts au lieu de douze, dix minutes après que j'aie moi-même
#   changé cette graphie. *Un outil qui dérive d'une graphie se casse quand on embellit la graphie.*
DOC_SITE="$UI_DIR/../../../.publie/atlas/doc-utilisateur/site"

if [[ ! -f "$DOC_SITE/index.html" ]]; then
  echo "ERREUR : le site bâti d'atlas est absent ($DOC_SITE/index.html)." >&2
  echo "         public/docs N'A PAS été régénéré — s'il existe, il porte l'aide d'un" >&2
  echo "         déploiement antérieur, et rien à l'écran ne le distinguera d'une aide à jour." >&2
  echo "         Atlas doit PUBLIER sa documentation construite ; son espace publié ne porte" >&2
  echo "         aujourd'hui que les sources markdown, et l'outil qui les bâtit vit chez lui." >&2
  exit 1
fi

rm -rf "$UI_DIR/public/docs"
cp -r "$DOC_SITE" "$UI_DIR/public/docs"
echo "docs:refresh — public/docs mis à jour depuis $DOC_SITE"
