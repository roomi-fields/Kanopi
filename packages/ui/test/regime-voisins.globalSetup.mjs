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
// avec ses deux cas (aucun voisin trouvé, état d'un voisin non mesurable).
import { mentionDeRegime } from '../../../scripts/lib/voisins-lies.mjs';

const RACINE_ATELIER = new URL('../../..', import.meta.url).pathname;

export default function annoncerLeRegime() {
  console.log(mentionDeRegime(RACINE_ATELIER));
}
