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
  empreinteDuVoisin,
  cequiABascule
} from '../../../scripts/lib/voisins-lies.mjs';

const RACINE_ATELIER = new URL('../../..', import.meta.url).pathname;

export default function annoncerLeRegime() {
  console.log(mentionDeRegime(RACINE_ATELIER));
  // Le relevé voyage par `globalThis` : la comparaison de fin tourne dans un autre appel. Un
  // relevé absent au moment de comparer ne se tait pas — la librairie le refuse.
  //
  // ⛔ ET LA CLÔTURE EST CELLE-CI, POUR LES DEUX CAMPAGNES. J'avais posé en plus un fichier
  // `globalTeardown` séparé, sur l'idée que Playwright n'appelle pas la fonction rendue ici. Il
  // l'appelle : mesuré le 2026-08-20 en comptant les entrées — DEUX avec le fichier déclaré, UNE
  // sans. Le refus sortait donc en double, et deux erreurs pour un seul défaut font chercher deux
  // causes. Une seule voie, celle-ci.
  globalThis.__kanopiRelevePortes = empreinteDuVoisin(RACINE_ATELIER);
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
      // ⛔ ON DIT LE COMPTE, ON N'ÉNUMÈRE PAS. Mesuré en conditions réelles le 2026-08-20 : une
      // republication de Kairos a fait lister 156 fichiers sur UNE ligne, et le refus est devenu
      // illisible au moment précis où il devait être lu. Un garde qui noie son constat ne le rend
      // pas — les six premiers nomment ce qui a bougé, le compte dit l'ampleur.
      bouges
        .map((b) => {
          const tete = b.quoi.slice(0, 6).join('\n      ');
          const reste = b.quoi.length > 6 ? `\n      … et ${b.quoi.length - 6} autres` : '';
          return `  • ${b.nom} — ${b.quoi.length} entrée(s) ont bougé :\n      ${tete}${reste}`;
        })
        .join('\n') +
      "\n⛔ CE QUI PRÉCÈDE RETIRE L'ACCUSATION, PAS LE REFUS : un rouge de cette campagne peut ne pas" +
      " venir du code d'ici. Il ne se relance pas pour autant — une relance fait disparaître un" +
      ' défaut intermittent du rapport, jamais du produit.'
  );
}
