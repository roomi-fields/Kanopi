// ⛔ LA CONFIGURATION DU GARDE DE PRODUCTION — elle reprend celle de l'application, et n'en change
// qu'une chose : tout est INLINÉ.
//
// POURQUOI. Le garde s'exécute en Node nu. Laisser les dépendances EXTERNES les ferait résoudre par
// Node à l'exécution, donc sans le traitement que ma construction leur applique — les pairs
// optionnels d'un paquet lié deviennent des bouchons chez moi, et un module de navigateur chargé
// tel quel refuse d'ouvrir hors navigateur. En inlinant, Vite résout avec les conditions de
// PRODUCTION, exactement comme pour l'application : mes voisins à deux régimes y entrent par leur
// `exports['.'].import`, c'est-à-dire leur PAQUET PUBLIÉ. C'est ce que le garde doit mesurer.
import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

export default defineConfig((env) =>
  mergeConfig(typeof base === 'function' ? base(env) : base, {
    ssr: { noExternal: true },
    build: { ssr: true, minify: false, emptyOutDir: true }
  })
);
