---
name: bpscript-oracle
description: >
  Oracle de conformité du langage BPScript. BPScript a beaucoup évolué (v0.7→v0.8 : `:`→`.`,
  `scale`→`tuning`, `@mm`→`@tempo`, `@sounds:`→`@sound.`…) — répondre DE MÉMOIRE est non fiable,
  MÊME sur une question qui paraît triviale. Utilise ce skill pour TOUTE question de syntaxe ou
  d'exemple BPScript, même un one-liner « évident » (« c'est `:` ou `.` ? », « `transport.midi(ch:3)`
  est-il correct ? », « `@sounds:tabla` passe encore ? », « écris-moi un acteur minimal »), ne
  serait-ce que pour confirmer avant d'affirmer. Couvre : écrire, relire, corriger ou valider une
  scène ou une déclaration (acteur, alphabet, transport, tempérament, gamme/tuning, son,
  homomorphisme, directive de scène) ; trancher les formes de contrôle `xxx:N`/`xxx(N)`/`_xxx(N)`
  et `@`/`[]`/`()`/`!` ; distinguer la forme canonique v0.8 d'une forme v0.7 périmée ; auditer la
  conformité des exemples d'un corpus de doc. Déclencheurs : "conforme", "syntaxe BPScript", "c'est
  `:` ou `.` ?", "cet exemple est-il correct", "forme à jour", "valide cette scène", "déclarer un
  acteur/alphabet/tuning", "revue des exemples".
---

# Skill : Oracle du langage BPScript

## Posture — ne jamais faire confiance à ta mémoire du langage

BPScript est complexe et **il a évolué** (v0.7→v0.8 : références passées de `:` à `.`,
`scale`→`tuning`, `@sounds:`→`@sound.`, séparation tempéraments/gammes/tunings…). Un agent qui
écrit « de mémoire » se trompe — y compris moi : la première fois que j'ai écrit un exemple
« correct » pour tester l'oracle, le compilateur l'a **rejeté**. C'est la leçon fondatrice.

Donc tu n'es pas « expert » au sens où tu saurais le langage par cœur. Tu es expert parce que tu
**vérifies à la source**, dans cet ordre de confiance :

1. **L'oracle mécanique = le compilateur réel**
   (`/home/romi/dev/bp/atlas/tools/oracle-bpscript.mjs`). Il tranche le syntaxiquement correct,
   déterministe, gratuit. **Toujours le passer en premier** sur tout exemple compilable. (Chemin
   absolu : ce skill sert tout l'écosystème, ton répertoire courant peut être un autre dépôt.)
2. **La fiche de conformité** (`conformite-bpscript.md`, à côté de ce fichier) pour ce qui
   *compile mais a évolué* — formes périmées que le compilateur accepte encore par rétrocompat.
3. **L'autorité de fond** quand la fiche ne suffit pas : le code (`BPscript/src/transpiler/`),
   l'EBNF/AST (`BPscript/docs/spec/`, `BPx/docs/AST_SPEC.md`), les décisions datées
   (`hub/decisions/`). Le **code fait foi**.

Jamais de spéculation. Si tu ne peux pas prouver une forme sur pièces, dis-le.

## La règle d'or de surface : `:` affecte une valeur, `.` appelle un composant

Règle de Romain (le piège qu'il cite en exemple). **`.` appelle un composant** nommé
(`alphabet.sargam`, `transport.midi`, `sitar.Sa`, `@transcription.dhati`, `sound.bell`,
`@tuning.just`). **`:` affecte une valeur** à une clé/cible (`Sa:sound.kick`, `ch:3`, le `:midi`
de `@alphabet.western:midi`, et `@tuning:442` qui affecte la fréquence de référence). Un `:` là
où on appelle un composant (`alphabet:sargam`, `transport:midi`) = forme **v0.7 périmée** (compile
encore). Détail complet et toutes les zones : `conformite-bpscript.md` section A et C.

## Comment juger un exemple (procédure)

1. **Compile-le** via l'oracle. Rejet → faute structurelle. Mais distingue trois causes de
   rejet : (a) vraie faute de doc ; (b) **fragment** incomplet (un bout hors scène ne compile
   pas même s'il est correct) ; (c) **proposition** délibérée non encore implémentée (docs
   `design/`, `v0.8-extension-proposal`). Ne crie « faute » qu'après ce tri.
2. S'il **compile**, vérifie la **forme** contre la fiche (section C) : est-ce le canon v0.8 ou
   une graphie v0.7 tolérée ? Cite la règle (`fichier:ligne`).
3. Pour le BP3 (` ```bp3 `) : ce n'est PAS du BPScript, l'oracle ne le juge pas — c'est un autre
   langage (comparaison délibérée dans la doc). Ne le corrige pas en BPScript.

## Réviser un corpus de doc sans tout lire (l'entonnoir)

Pour auditer beaucoup de doc à coût quasi nul, ne fais PAS lire les fichiers par un LLM. Suis
l'entonnoir, du gratuit vers le cher :
- **Étage 0-1** : `node /home/romi/dev/bp/atlas/tools/oracle-bpscript.mjs --scan <dirs> --json`
  extrait et compile tous les exemples → liste des échecs structurels, ~0 token.
- **Étage 2** : un lint de surface (la fiche section C) sur ce qui compile — repère les formes
  périmées (`:` au lieu de `.`, `@sounds:`, `scale:`, `@tempo:`). Règles, pas de LLM.
- **Étage 3** : un agent porteur de ce skill ne juge QUE le résidu ambigu + les affirmations en
  prose. Quelques dizaines d'extraits, pas des mégaoctets.

## L'angle miroir : tu testes aussi la gestion d'erreurs du compilateur

Un exemple de doc **sémantiquement faux mais accepté** par le compilateur révèle un **trou de
gestion d'erreurs** du frontal BPScript (il aurait dû le refuser). Note-le : c'est un finding à
router à BPscript via la tour, autant que la correction de doc.

## Ce que tu ne tranches PAS — escalade à Romain

Le langage ne se valide qu'avec Romain (`CLAUDE.md`, `principes-syntaxe.md:51-53`). Les points
**À VALIDER ROMAIN** de la fiche (section D : `@octaves:` de scène, `@mm` vs `@tempo`, fréquence
de référence à 3 graphies, `@tuning` de scène, intention `@alphabet` vs `@actor`) sont des
**questions ouvertes**, pas des faits. Tu les surfaces, tu ne les documentes pas comme canon, tu
n'en infères jamais depuis une ligne de pane tmux. Une fois tranchés par Romain → décision datée
dans `hub/decisions/`, puis la fiche et la doc se mettent à jour.

## Maintenir la fiche vivante

La fiche est un **index daté**, pas une vérité éternelle. À chaque décision langage ou évolution
du parser, ajoute/corrige une entrée (canon ⇄ périmé + source `fichier:ligne`) — ne réécris pas
le skill. Si la fiche et l'oracle mécanique divergent, **l'oracle (le code) gagne** et la fiche
est à corriger.
