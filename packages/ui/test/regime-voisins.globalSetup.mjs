// LA LÉGENDE D'UNE CAMPAGNE DE BANCS — sur quel état de ses voisins ce résultat porte.
//
// Kanopi consomme onze dépôts par LIEN SYMBOLIQUE : leur arbre de travail est déjà dans ce qui
// s'exécute ici. Un vert obtenu contre un voisin dont le travail n'est pas enregistré change de
// sens si ce voisin revient en arrière, et aucun fichier ne bouge ici pour le signaler. La ligne
// posée en tête de campagne rend ce vert relisible plus tard, et citable dans un rapport.
//
// ICI PLUTÔT QU'EN AMORCE DE BANC (`setupFiles`), ET C'EST MESURÉ : une amorce de banc s'exécute
// DANS chaque worker, avant les simulacres du fichier de banc, et instancie la chaîne du registre
// — trois bancs ont rougi ainsi le 2026-08-10 (l'en-tête de `vitest.config.ts` porte la mesure).
// La mise en place GLOBALE tourne dans le processus principal, une fois, et ne touche aucun
// module de l'application.
//
// ⛔ ELLE ARRÊTE LA CAMPAGNE PLUTÔT QUE DE S'AFFICHER VIDE : une mention absente se lit « rien à
// signaler » quand elle signifie « la mesure n'a pas eu lieu ». Le refus vit dans la librairie,
// avec ses trois cas — aucun voisin trouvé, état d'un voisin non mesurable, porte déclarée muette.
//
// ⛔ ET ELLE RELÈVE AVANT DE MESURER. Un contrôle passé après la panne mesure le mauvais instant :
// la fenêtre s'est refermée, le paquet du voisin est de nouveau entier, et il répond que tout va
// bien. L'empreinte prise ici est comparée à la fin de campagne ; un paquet remplacé pendant la
// mesure fait un résultat qui porte sur deux états, donc sur aucun.
import {
  mentionDeRegime,
  empreinteDesPortes,
  cequiABascule
} from '../../../scripts/lib/voisins-lies.mjs';

const RACINE_ATELIER = new URL('../../..', import.meta.url).pathname;

export default function annoncerLeRegime() {
  console.log(mentionDeRegime(RACINE_ATELIER));
  // Le relevé voyage par `globalThis` : la comparaison de fin vit dans un autre module, et pour
  // la campagne d'écran dans un autre fichier encore. Un relevé absent au moment de comparer ne
  // se tait pas — la librairie le refuse.
  globalThis.__kanopiRelevePortes = empreinteDesPortes(RACINE_ATELIER);
  return verifierQueRienNaBascule;
}

export function verifierQueRienNaBascule() {
  // ⛔ COMPARAISON SYNCHRONE, ET C'EST MESURÉ : écrite d'abord avec un import tardif, elle rendait
  // une PROMESSE dont `.length` vaut `undefined` — le garde échouait donc à TOUS les coups, y
  // compris quand rien n'avait bougé. Un garde qui mord toujours ne garde rien : il se fait
  // désarmer à la première campagne honnête.
  const bouges = cequiABascule(globalThis.__kanopiRelevePortes, RACINE_ATELIER);
  if (bouges.length === 0) return;
  throw new Error(
    'UN VOISIN A BASCULÉ PENDANT CETTE CAMPAGNE — le résultat porte sur deux états, donc sur aucun :\n' +
      bouges.map((b) => `  • ${b.nom} — ${b.quoi.join(' · ')}`).join('\n') +
      "\n⛔ CE QUI PRÉCÈDE RETIRE L'ACCUSATION, PAS LE REFUS : un rouge de cette campagne peut ne pas" +
      " venir du code d'ici. Il ne se relance pas pour autant — une relance fait disparaître un" +
      ' défaut intermittent du rapport, jamais du produit.'
  );
}
