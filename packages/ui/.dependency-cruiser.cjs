/** Conformité de dépendances — vérifiée par machine, tourne dans le gate (npm run arch).
 *  Règles SANS jugement humain : la CI tranche, pas l'agent.
 *  On ajoute ici, incrémentalement, une règle par contrat d'architecture (revue par Romain). */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Pas de dépendance circulaire (signe de couplage / couches mal séparées).',
      from: {},
      to: { circular: true }
    }
    // NB : no-orphans désactivé tant que les .svelte ne sont pas parsés (sinon faux positifs :
    // un module importé seulement par un .svelte paraît orphelin). À réactiver avec le support svelte.
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    exclude: { path: 'node_modules' }
  }
};
