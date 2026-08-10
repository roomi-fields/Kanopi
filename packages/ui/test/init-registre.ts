// L'ENVIRONNEMENT DE BANC CONSTRUIT LE REGISTRE COMME LE FAIT L'APPLICATION.
//
// Depuis le chantier bus (2026-08-10), les six voix de code reçoivent le bus commun à leur
// CONSTRUCTION : le registre n'existe plus au chargement du module, il se bâtit par
// `initAdapters(bus)` — et il CRIE s'il est lu avant. Le cœur le fait dans son constructeur ;
// ici, l'environnement de banc fait le même geste, une fois, pour tous les fichiers.
//
// ⚠️ CE N'EST PAS UN CONTOURNEMENT DU CRI, ET LA DISTINCTION EST LA SEULE QUI COMPTE : le cri
// protège le PRODUIT contre un registre vide qui rendrait « aucune voix reconnue » — un silence
// qu'aucun garde ne distingue de la vérité. Le faire taire aurait été le contournement ; lui donner
// ce que l'application lui donne est la fidélité. Un banc qui voudrait vérifier le cri lui-même
// appelle le registre depuis un module frais.
import { createEventBus } from '../src/lib/events/bus';
import { initAdapters } from '../src/lib/runtimes/registry';

initAdapters(createEventBus());
