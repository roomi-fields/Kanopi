// LES ROUGES INSCRITS DU GARDE DE PRODUCTION — nommés, datés, avec leur amont et leur sortie.
//
// ⛔ POURQUOI CE REGISTRE EXISTE. Le garde `production-sur-paquets-publies.test.ts` BARRE ma
// poussée : quand il échoue, ma production est vraiment cassée à cet instant, quelle qu'en soit la
// cause. Arbitrage de l'architecte du 2026-08-24, rendu EN SON NOM et daté — aucun contrat de la
// tour ne porte cette règle. Ce qui m'évite le blocage n'est pas un avertissement : c'est un rouge
// INSCRIT AVEC SA CAUSE.
//
// ⛔ ET L'INSCRIPTION VERROUILLE DANS LES DEUX SENS. Un rouge inscrit passe s'il échoue POUR SA
// RAISON — le motif doit coller au message réel. Il ÉCHOUE si le motif ne colle plus, et il échoue
// AUSSI quand le témoin redevient vert : la cause est levée, l'entrée doit sortir du registre. Sans
// ce second verrou, une inscription survivrait à ce qu'elle décrit et couvrirait la casse suivante.
//
// Une entrée sans `motif`, sans `amont` ou sans `sortie` est refusée par le garde lui-même.

export type RougeInscrit = {
  /** Le témoin qui échoue, tel que le garde le nomme. */
  temoin: string;
  /** Date de l'inscription (AAAA-MM-JJ). */
  le: string;
  /** Le message réel, à la lettre : le rouge doit échouer POUR CETTE RAISON. */
  motif: RegExp;
  /** Chez qui vit la cause, et à quel état mesuré. */
  amont: string;
  /** Ce qui doit arriver pour que cette entrée sorte du registre. */
  sortie: string;
};

export const ROUGES_INSCRITS: readonly RougeInscrit[] = [];
