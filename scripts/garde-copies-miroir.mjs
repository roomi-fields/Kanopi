// GARDE — les COPIES MIROIR que je consomme concordent-elles encore ?
//
// MOTIF REPRIS DE `runtime-in/scripts/garde-copie-contrat.mjs` (leur IN-8, commit 9609a91), sur
// consigne de l'architecte : même principe, comparer des ENSEMBLES DE NOMS et pas du texte, mordre
// dans les DEUX sens (champ perdu ET champ inventé), rester vert sur un simple réordonnancement,
// et ÉCHOUER si une référence devient illisible plutôt que se taire.
//
// POURQUOI CE GARDE EXISTE — date de naissance : la nuit du 2026-07-27, DEUX fois en une nuit.
//   1. runtime-codevoices portait l'union du bus sans `input` ; `on<T extends EventType>` rend le
//      bus CONTRAVARIANT, donc une copie à six types ne peut pas servir de bus qui en déclare
//      sept. L'événement d'entrée est resté bloqué jusqu'à la propagation.
//   2. Kairos a élargi le rôle du nœud de structure avec `wait` (point d'attente [538]) et publié ;
//      la copie de runtime-ui est restée à trois valeurs. Mon dépôt, au milieu, a rougi.
// Dans les DEUX cas, personne n'avait menti : une copie avait vieilli sans que rien ne le dise, et
// je l'ai découvert par un mur de variance TypeScript — après coup, sur un push refusé.
//
// CE QUE CE GARDE CHANGE, et c'est le point de l'architecte : il RETOURNE LA CHARGE du bon côté.
// La règle de contrat (« tout changement de forme se propose avant d'être figé partout ») ne mord
// que si l'élargisseur prévient — on ne fonde pas une garantie sur la politesse de l'amont. Ici
// c'est le CONSOMMATEUR qui détecte, sans dépendre de personne, et il NOMME l'écart (« le rôle
// `wait` manque chez runtime-ui ») au lieu de laisser lire une variance de types.
//
// CE QU'IL NE FAIT PAS : juger la forme. Il constate une DIVERGENCE entre deux copies d'une même
// forme et refuse de la laisser passer en silence. Qui a raison des deux se tranche à l'architecte.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Chaque référence est surchargeable par variable d'environnement : c'est ce qui permet de PROUVER
// que le garde mord (on lui montre une copie divergente) sans jamais écrire dans le dépôt d'un
// voisin — écrire chez le voisin serait une guerre d'édition, pas une preuve.
const CHEMINS = {
  contratEntree:
    process.env.KANOPI_CONTRAT_ENTREE ??
    path.resolve(RACINE, '..', 'hub', 'contrats', 'hote-runtime-in.md'),
  monBus: path.join(RACINE, 'packages', 'ui', 'src', 'lib', 'events', 'types.ts'),
  busCodevoices:
    process.env.KANOPI_BUS_CODEVOICES ??
    path.join(RACINE, 'node_modules', 'runtime-codevoices', 'dist-types', 'contract', 'events.d.ts'),
  structureKairos:
    process.env.KANOPI_STRUCTURE_KAIROS ??
    path.join(RACINE, 'node_modules', '@kairos', 'core', 'dist', 'projection', 'structure.d.ts'),
  structureRuntimeUi:
    process.env.KANOPI_STRUCTURE_RUNTIME_UI ??
    path.join(RACINE, 'node_modules', 'runtime-ui', 'src', 'contract', 'production.ts')
};

const ecarts = [];
// Ce que le garde a réellement EXAMINÉ — annoncé dans le verdict vert (voir en bas de fichier).
const compte = {
  champsEntree: 0,
  naturesSignal: 0,
  typesBus: 0,
  variantesStructure: 0,
  rolesStructure: 0
};

function rater(quoi) {
  console.error(`✗ copies miroir — ${quoi}`);
  process.exit(1);
}

/** Un commentaire n'est pas une déclaration. Les deux bords documentent leurs champs en citant la
 *  graphie (`role:'leaf'`, « type: 'input' ») : lus tels quels, ces exemples se font passer pour la
 *  vraie déclaration et le garde accuse à côté — il l'a fait à sa première passe, sur Kairos. On
 *  retire donc les commentaires AVANT toute mesure. */
function sansCommentaires(texte) {
  return texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

async function lire(cle) {
  try {
    return sansCommentaires(await readFile(CHEMINS[cle], 'utf8'));
  } catch {
    // Une référence illisible n'est PAS un laissez-passer : sans elle, aucune concordance ne se
    // vérifie, et un garde qui se tait dans ce cas ne garde rien.
    rater(`référence illisible (${cle} → ${CHEMINS[cle]}). Sans elle, rien ne se vérifie.`);
  }
}

/** Les champs d'un bloc `{ … }`, quel que soit le séparateur (virgule, point-virgule, ligne). */
function champs(bloc) {
  return new Set(
    bloc
      .split(/[;,\n]/)
      .map((morceau) => morceau.trim())
      .map((morceau) => /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*:/.exec(morceau)?.[1])
      .filter(Boolean)
  );
}

/** Le corps d'un bloc nommé : `Nom = {` (contrat), `interface Nom {` et `interface Nom extends X {`
 *  (copies TypeScript — la mienne étend la base commune du bus). */
function corps(texte, nom) {
  const debut = new RegExp(
    `(?:interface|type)?\\s*\\b${nom}\\b\\s*(?:extends\\s+[\\w$.]+\\s*)?=?\\s*\\{`
  ).exec(texte);
  if (!debut) return null;
  const depuis = debut.index + debut[0].length;
  const fin = texte.indexOf('}', depuis);
  return fin === -1 ? null : texte.slice(depuis, fin);
}

/** Les variantes d'une union, indexées par la valeur du discriminant (`kind`, `type`…). */
function variantes(texte, nom, discriminant) {
  const debut = new RegExp(`(?:type)?\\s*\\b${nom}\\b\\s*=`).exec(texte);
  if (!debut) return null;
  const reste = texte.slice(debut.index + debut[0].length);
  // La fin de la déclaration est le premier `;` HORS accolade : un `;` interne sépare les champs
  // d'une variante multi-lignes (`readonly kind: 'note';`) et couperait l'union en plein milieu si
  // on le prenait pour une fin. On balaie donc en suivant la profondeur d'accolades.
  const par = new Map();
  let profondeur = 0;
  let depuis = -1;
  for (let i = 0; i < reste.length; i++) {
    const c = reste[i];
    if (c === '{') {
      if (profondeur === 0) depuis = i + 1;
      profondeur++;
    } else if (c === '}') {
      profondeur--;
      if (profondeur === 0 && depuis !== -1) {
        const bloc = reste.slice(depuis, i);
        const sorte = new RegExp(`${discriminant}\\s*:\\s*'([^']+)'`).exec(bloc)?.[1];
        if (sorte) par.set(sorte, champs(bloc));
        depuis = -1;
      }
    } else if (c === ';' && profondeur === 0) {
      break;
    }
  }
  return par.size > 0 ? par : null;
}

/** Les types d'événement que l'union `KanopiEvent` ADMET RÉELLEMENT.
 *
 *  Piège éprouvé, et il vaut d'être écrit : compter les `type: '…'` du fichier ne mesure PAS
 *  l'union — un événement peut être déclaré comme interface et absent de l'union, et c'est
 *  EXACTEMENT la forme qu'avait l'incident de cette nuit. Mesuré ainsi, le garde annonçait
 *  « aligné » sur un bus cassé : un garde qui ne mord pas est pire que pas de garde.
 *  On lit donc les MEMBRES de l'union, puis on résout le littéral de chacun. */
function typesDeLUnion(texte) {
  const decl = /type\s+KanopiEvent\s*=([^;]*);/.exec(texte);
  if (!decl) return new Set();
  const membres = [...decl[1].matchAll(/\b([A-Z][\w$]*)\b/g)].map((m) => m[1]);
  const types = new Set();
  for (const membre of membres) {
    const bloc = corps(texte, membre);
    const litteral = bloc && /\btype\s*:\s*'([^']+)'/.exec(bloc)?.[1];
    // Un membre dont le littéral est introuvable ne se tait pas : on le porte sous son nom, sinon
    // une union qui gagne un membre illisible passerait pour inchangée.
    types.add(litteral ?? `${membre}(littéral introuvable)`);
  }
  return types;
}

/** Les valeurs littérales d'une union de chaînes portée par un champ (`role: 'a' | 'b'`). */
function valeursDuChamp(texte, champ) {
  const ligne = new RegExp(`${champ}\\s*:\\s*((?:'[^']+'\\s*\\|?\\s*)+)`).exec(texte);
  if (!ligne) return null;
  return new Set([...ligne[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

function comparer(quoi, gaucheNom, gauche, droiteNom, droite) {
  for (const nom of gauche) {
    if (!droite.has(nom)) ecarts.push(`${quoi} : ${gaucheNom} porte « ${nom} », ${droiteNom} ne l'a pas`);
  }
  for (const nom of droite) {
    if (!gauche.has(nom)) ecarts.push(`${quoi} : ${droiteNom} porte « ${nom} », ${gaucheNom} ne l'a pas`);
  }
}

// ————— 1. MA copie de l'événement d'entrée ↔ le contrat opposable —————
// Référence = `hub/contrats/hote-runtime-in.md`, le MÊME contrat que celui que runtime-in oppose à
// sa propre copie. Les deux bords se mesurent au même étalon, jamais l'un à l'autre.
{
  const contrat = await lire('contratEntree');
  const mien = await lire('monBus');

  const evtContrat = corps(contrat, 'InputEvent');
  const evtMien = corps(mien, 'InputEvent');
  if (!evtContrat) rater('le contrat ne déclare plus InputEvent — sa forme a changé, relis-le.');
  if (!evtMien) rater('ma copie ne déclare plus InputEvent.');
  // Le contrat écrit la forme À PLAT ; ma copie porte `schemaVersion`/`t`/`runtime`/`source` par la
  // BASE COMMUNE du bus (`KanopiEventBase`), qui est le bon dessin chez moi — sept événements la
  // partagent. Comparer sans en tenir compte accuserait l'héritage d'être un champ manquant : on
  // mesure donc l'ensemble EFFECTIF des champs, base comprise.
  const base = corps(mien, 'KanopiEventBase');
  if (!base) rater('ma copie ne déclare plus KanopiEventBase — la base commune du bus a disparu.');
  const champsEffectifs = new Set([...champs(base), ...champs(evtMien)]);
  compte.champsEntree = champs(evtContrat).size;
  comparer('InputEvent', 'le contrat', champs(evtContrat), 'ma copie', champsEffectifs);

  const sigContrat = variantes(contrat, 'InputSignal', 'kind');
  const sigMien = variantes(mien, 'InputSignal', 'kind');
  if (!sigContrat) rater('le contrat ne déclare plus les natures de InputSignal.');
  if (!sigMien) rater('ma copie ne déclare plus les natures de InputSignal.');
  comparer(
    'InputSignal (natures)',
    'le contrat',
    new Set(sigContrat.keys()),
    'ma copie',
    new Set(sigMien.keys())
  );
  compte.naturesSignal = sigContrat.size;
  for (const [sorte, attendus] of sigContrat) {
    const presents = sigMien.get(sorte);
    if (presents) comparer(`InputSignal/${sorte}`, 'le contrat', attendus, 'ma copie', presents);
  }
}

// ————— 2. L'union du bus : MA copie ↔ celle de runtime-codevoices —————
// Ici la référence est la copie du PAIR, pas un document : c'est l'assignabilité des deux `EventBus`
// qui casse, et elle se joue sur les types publiés, pas sur la prose (le §5 de
// `kanopi-runtime-codevoices.md` est d'ailleurs resté à six types — la prose dérive, les copies non).
{
  const mien = await lire('monBus');
  const pair = await lire('busCodevoices');
  const miens = typesDeLUnion(mien);
  const siens = typesDeLUnion(pair);
  if (miens.size === 0) rater('ma copie ne déclare plus aucun type d\'événement.');
  if (siens.size === 0) rater('la copie de runtime-codevoices ne déclare plus aucun type d\'événement.');
  compte.typesBus = miens.size;
  comparer("union du bus (types d'événement)", 'ma copie', miens, 'runtime-codevoices', siens);
}

// ————— 3. La structure de production : Kairos (amont) ↔ runtime-ui (copie) —————
// AUCUNE des deux n'est à moi : je suis le CONSOMMATEUR des deux, donc celui qui casse quand elles
// divergent. C'est exactement le cas de cette nuit (`role: 'wait'` publié par Kairos, absent chez
// runtime-ui) et la raison pour laquelle le garde vit ici et pas chez eux.
{
  const kairos = await lire('structureKairos');
  const ui = await lire('structureRuntimeUi');

  const varKairos = variantes(kairos, 'StructureNode', 'type');
  const varUi = variantes(ui, 'StructureNode', 'type');
  if (!varKairos) rater('Kairos ne déclare plus les variantes de StructureNode.');
  if (!varUi) rater('runtime-ui ne déclare plus les variantes de StructureNode.');
  comparer(
    'StructureNode (variantes)',
    'Kairos',
    new Set(varKairos.keys()),
    'runtime-ui',
    new Set(varUi.keys())
  );
  for (const [sorte, attendus] of varKairos) {
    const presents = varUi.get(sorte);
    if (presents) comparer(`StructureNode/${sorte}`, 'Kairos', attendus, 'runtime-ui', presents);
  }

  compte.variantesStructure = varKairos.size;
  const roleKairos = valeursDuChamp(kairos, 'role');
  const roleUi = valeursDuChamp(ui, 'role');
  if (!roleKairos) rater('Kairos ne déclare plus les rôles du nœud occupant.');
  if (!roleUi) rater('runtime-ui ne déclare plus les rôles du nœud occupant.');
  compte.rolesStructure = roleKairos.size;
  comparer('StructureNode (rôles)', 'Kairos', roleKairos, 'runtime-ui', roleUi);
}

if (ecarts.length > 0) {
  console.error(`✗ copies miroir — ${ecarts.length} divergence(s) :`);
  for (const e of ecarts) console.error(`   ${e}`);
  console.error('  Une copie qui diverge sans mise à jour est une faute (contrats, § Engagement de cohérence).');
  console.error('  Élargir un type MIROIR n\'est jamais une édition locale : ça se PROPOSE à');
  console.error('  l\'architecte avant d\'être figé d\'un seul côté.');
  process.exit(1);
}

// UN VERDICT QUI NE DIT PAS SUR QUOI IL CONCLUT N'EST PAS UN VERDICT (exigence de l'architecte,
// 2026-07-27, après trois cas d'« absence de signal prise pour un bon signal » dans la journée).
// Le vert ANNONCE donc ce qui a été examiné. Le refus du zéro, lui, est déjà en amont : chaque bloc
// introuvable appelle `rater()`, ce qui est MESURÉ — les quatre références pointées sur un fichier
// vide échouent bruyamment, aucune ne verdit.
console.log(
  `✓ copies miroir — ${compte.champsEntree} champs de l'événement d'entrée et ${compte.naturesSignal} natures de signal conformes au contrat, ` +
    `${compte.typesBus} types de bus alignés avec runtime-codevoices, ` +
    `${compte.variantesStructure} variantes et ${compte.rolesStructure} rôles de structure alignés Kairos↔runtime-ui.`
);
