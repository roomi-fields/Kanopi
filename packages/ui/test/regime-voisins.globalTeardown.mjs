// La comparaison de fin de campagne d'ÉCRAN — le pendant du relevé pris par la mise en place.
//
// Playwright n'appelle pas la fonction que sa mise en place retourne (vitest, si), d'où ce fichier
// séparé. Il ne réimplémente rien : la comparaison vit dans la mise en place, une seule fois.
import { verifierQueRienNaBascule } from './regime-voisins.globalSetup.mjs';

export default function comparerLeReleve() {
  verifierQueRienNaBascule();
}
