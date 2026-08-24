import type { Runtime } from '../core-mock';
import type { RuntimeAdapter } from './adapter';
// The 6 code voices (strudel/hydra/p5/mercury/csound/js) live in the
// `runtime-codevoices` package and are pulled by Kronos at the backtick token
// onset. The natives bp3/bpscript stay in Kanopi (BPx path).
import { createCodeVoiceAdapters } from 'runtime-codevoices';
import type { EventBus } from '../events/types';
import { bp3Adapter, bpscriptAdapter, setCodeVoicePredicate } from './bpx-adapter';

// LES VOIX SE CONSTRUISENT AVEC LE BUS, PAS APRÈS — contrat `hote-runtimes-sortie.md`,
// amendement du 2026-08-10 point 5 : une runtime qui produit publie DIRECTEMENT sur le bus
// commun, elle n'expose aucun canal montant, et le bus SE REMET À LA CONSTRUCTION.
//
// ⚠️ POURQUOI UNE FABRIQUE ET PAS UN `bindBus()` POSÉ APRÈS : une méthode d'après-coup laisse une
// FENÊTRE où l'adaptateur existe sans son bus, et une émission dans cette fenêtre se perd sans
// rien faire rougir. Le paquet a fermé la fenêtre pour de bon en RETIRANT son tableau exporté dans
// le même mouvement : la fabrique est le SEUL chemin pour obtenir une voix, donc elle n'est pas
// contournable. C'est son point, meilleur que ma proposition initiale.
let codeVoices: ReturnType<typeof createCodeVoiceAdapters> | null = null;
let adapters: Map<Runtime, RuntimeAdapter> | null = null;

/** Construit les voix AVEC le bus commun. Appelé UNE fois, par le cœur, avant tout autre appel. */
export function initAdapters(bus: EventBus): void {
  codeVoices = createCodeVoiceAdapters(bus);
  // Le prédicat descend VERS l'adaptateur au lieu d'être importé PAR lui : l'import inverse
  // fermait un cycle d'évaluation (le registre prend déjà ses adaptateurs natifs là-bas).
  setCodeVoicePredicate((r) => voix().some((a) => a.id === r));
  adapters = new Map<Runtime, RuntimeAdapter>([
    // Les voix de code entrent dans la carte par leur PORTE (voir `porteVersLaVoix`) : ce que
    // l'hôte obtient ici n'est jamais l'instance que le runtime appelle.
    ...codeVoices.map((a): [Runtime, RuntimeAdapter] => [a.id, porteVersLaVoix(a)]),
    ['bp3', bp3Adapter],
    ['bpscript', bpscriptAdapter]
  ]);
}

/** ÉCHEC BRUYANT plutôt que carte vide : un registre non initialisé rendrait « aucune voix
 *  reconnue » — un silence qui ressemble à une scène sans voix de code, et qu'aucun garde ne
 *  distingue de la vérité. */
function carte(): Map<Runtime, RuntimeAdapter> {
  if (!adapters) throw new Error('registre des runtimes lu avant initAdapters(bus)');
  return adapters;
}

function voix(): ReturnType<typeof createCodeVoiceAdapters> {
  if (!codeVoices) throw new Error('voix de code lues avant initAdapters(bus)');
  return codeVoices;
}

/**
 * Runtimes Kanopi recognizes that don't (yet) have a live browser adapter:
 *  - `.scd` / `.py` → level 3 (osc-bridge → local sclang / python), Tauri v2.
 *
 * Kept as a tiny fallback table so `runtimeFromExt` still routes files to
 * the right tab header / icon / placeholder, while the adapter list stays
 * the single source of truth for languages that actually execute.
 */
const PLACEHOLDER_EXTENSIONS: Record<string, Runtime> = {
  '.scd': 'sc',
  '.py': 'python'
};

// ════════════════════════════════════════════════════════════════════════════════
// LA PORTE DE L'HÔTE VERS UNE VOIX DE CODE — couture d'observation, arbitrage 2026-08-22
// ════════════════════════════════════════════════════════════════════════════════
//
// `createCodeVoiceAdapters` rend le tableau d'instances INTERNE du paquet lui-même
// (`runtime-codevoices/src/adapters.ts:48` — `return codeVoiceAdapters`), et c'est CE MÊME objet
// que le runtime appelle quand une sourdine s'exécute chez lui (`code-voices-runtime.ts:743`,
// arbitrage [76]/[77]). L'hôte et le runtime tenaient donc le même adaptateur : un espion posé
// dessus voyait les deux, et rien ne les séparait — ni l'argument (même forme des deux côtés) ni
// le moment (les deux chemins sont asynchrones). Un banc qui voulait dire « l'hôte n'appelle pas »
// attrapait l'exécution LÉGITIME du runtime dès qu'un jeton avait tiré, donc au gré de la charge.
//
// La façade rend le discriminant STRUCTUREL au lieu d'observationnel : l'hôte n'atteint plus
// l'instance nue, il passe par cet objet-ci ; le runtime continue d'appeler l'instance. Ce que la
// porte a vu est donc, par construction, ce que l'HÔTE a fait.
//
// LA SURFACE EST DÉRIVÉE, JAMAIS RECOPIÉE : tout ce que l'amont porte traverse, y compris ce qu'il
// ajoutera demain — une liste de méthodes tenue à la main ici périmerait en silence.
const portes = new Map<Runtime, RuntimeAdapter>();

// ⛔ CE QUE L'HÔTE A APPELÉ, COMPTÉ SUR LA PORTE — et c'est le seul endroit où ce compte est
// opposable. Le paquet des voix rend son tableau d'instances INTERNE, celui-là même que le runtime
// appelle quand une sourdine s'exécute chez lui : un espion posé sur l'instance voit les DEUX
// chemins et ne peut pas les séparer, ni par l'argument (même forme) ni par le moment (les deux
// sont asynchrones). La porte, elle, n'est empruntée que par l'hôte, par construction.
//
// ⇒ POURQUOI CE COMPTEUR EXISTE, ET IL RÉPOND À UNE QUESTION PRÉCISE. KAN-65 : la toile p5 est
//   montée puis DÉTRUITE, et rien ne la remonte. runtime-codevoices a mesuré chez lui que sa
//   déduplication d'évaluation n'explique QU'UNE des deux occurrences — 17 ms sous son seuil de
//   50 ms, puis 60 ms au-dessus. ⇒ Il reste deux lectures, et il m'a rendu celle qui se lit ici :
//
//     a. aucune évaluation n'a été TENTÉE après l'arrêt  →  l'hôte ne s'est pas réarmé — chez moi
//     b. une évaluation a été tentée et a échoué DANS la construction  →  chez lui
//
// ⛔ ET CE COMPTE NE RÉPOND PAS À CETTE QUESTION — MESURÉ, APRÈS L'AVOIR ÉCRIT. Le 2026-08-25, la
//   sonde a rendu `{}` sur une troisième occurrence de KAN-65, et ce zéro ne discrimine RIEN :
//   `real-core.ts:291` route une voix de code vers `autonomousCodeVoices(...).evaluate(...)`, et un
//   backtick orchestré est tiré par Kronos sur l'instance. Le commentaire de ce chemin le dit :
//   « pas via la registry hôte ». ⇒ AUCUNE ÉVALUATION DE VOIX NE TRAVERSE CETTE PORTE.
//
// ⇒ CE QUE CE COMPTE DIT VRAIMENT, et c'est un fait réel mais plus étroit : ce que l'hôte appelle
//   par sa porte — les `stop` de ses diffusions de transport. Un `{}` dit « l'hôte n'a rien diffusé
//   à ce moment-là », pas « aucune évaluation n'a été tentée ».
//
// ⚠️ Il reste posé parce que ce qu'il mesure est vrai et opposable ; l'affirmation qu'il tranchait
//   KAN-65 est retirée. Une description plus large que le mécanisme désigne la « correction » qui
//   le casserait.
//
// ⚠️ IL N'A AUCUN EFFET SUR LE CHEMIN : il incrémente et délègue. Un compteur qui changerait l'ordre
// des appels mesurerait sa propre présence.
const appels = new Map<string, number>();

function compter(id: Runtime, méthode: string): void {
  const clé = `${id}.${méthode}`;
  appels.set(clé, (appels.get(clé) ?? 0) + 1);
}

/** Ce que l'HÔTE a appelé sur les voix de code depuis le chargement, par `runtime.méthode`.
 *  Lecture seule, DEV — exposée par la surface de pilotage (`inspect.appelsDeLHote`). */
export function appelsDeLHote(): Record<string, number> {
  return Object.fromEntries(appels);
}

/** Les noms portés par l'objet ET par sa chaîne de prototypes : un adaptateur écrit en classe
 *  porte ses méthodes sur le prototype, où `Object.keys` ne va pas. */
function clésDeSurface(o: object): string[] {
  const clés = new Set<string>();
  for (let n: object | null = o; n && n !== Object.prototype; n = Object.getPrototypeOf(n)) {
    for (const c of Object.getOwnPropertyNames(n)) if (c !== 'constructor') clés.add(c);
  }
  return [...clés];
}

function porteVersLaVoix(amont: RuntimeAdapter): RuntimeAdapter {
  const déjà = portes.get(amont.id);
  // Identité STABLE : un espion posé sur la porte doit survivre à un second `initAdapters`
  // (les bancs le rappellent), sinon il observerait un objet que plus personne n'appelle.
  if (déjà) return déjà;
  const nue = amont as unknown as Record<string, unknown>;
  const porte: Record<string, unknown> = {};
  for (const clé of clésDeSurface(amont)) {
    if (typeof nue[clé] === 'function') {
      porte[clé] = (...args: unknown[]) => {
        compter(amont.id, clé);
        return (nue[clé] as (...a: unknown[]) => unknown).apply(nue, args);
      };
    } else {
      // Les champs se LISENT sur l'amont à chaque accès — un `outputType` figé à la construction
      // mentirait le jour où l'amont le rendrait mutable.
      Object.defineProperty(porte, clé, { get: () => nue[clé], enumerable: true });
    }
  }
  const faite = porte as unknown as RuntimeAdapter;
  portes.set(amont.id, faite);
  return faite;
}

/** L'UNIQUE chemin de l'hôte vers un adaptateur. Pour une voix de code il rend la PORTE ci-dessus,
 *  jamais l'instance que le runtime appelle ; pour les natifs bp3/bpscript, l'adaptateur de l'hôte
 *  lui-même, qu'aucun runtime tiers n'appelle. */
export function getAdapter(runtime: Runtime): RuntimeAdapter | undefined {
  return carte().get(runtime);
}

// Code-voice runtimes (strudel/hydra/p5/mercury/csound/js). Their MASTER TEMPO
// arrives via Kronos's bus (`onTempo` → runtime-codevoices `reslaveTempo`, M2 [261]),
// NOT a parallel host tempo fan-out — `clock.svelte.ts` skips them so the guest engine
// has a single tempo authority (Kronos). bp3/bpscript are NOT here: their `setBpm`
// retunes the Kronos handle in place (the host warp), which stays.
export function isCodeVoiceRuntime(runtime: Runtime): boolean {
  return voix().some((a) => a.id === runtime);
}

/**
 * Cette voix de code honore-t-elle le niveau MAÎTRE (`setMasterMuted`/`setMasterGain`) ?
 *
 * LU OÙ LA CAPACITÉ VIT — sur l'adaptateur lui-même, jamais sur une liste en dur ici
 * (consigne architecte 2026-07-24 [901] : « ne déduis pas la liste, lis la capacité là où
 * elle vit, sinon la prochaine voix câblée en amont te retrouvera désynchronisé »). Le jour
 * où hydra gagne un étage de sortie, ce prédicat le sait sans qu'on touche Kanopi.
 *
 * À NE PAS CONFONDRE avec `codeVoiceReachesGainBus` (lib/mixer/mixer-gain.ts), qui porte sur
 * le niveau PAR ACTEUR (`setActorGain`) : celui-là reste strudel/csound, pour une raison qui
 * tient (aucun point d'insertion par acteur sans changer l'objet audio que manipule l'auteur —
 * runtime-codevoices/src/voices/js.ts:72-75). Deux niveaux, deux prédicats.
 */
export function codeVoiceReachesMasterBus(runtime: Runtime): boolean {
  // Lu sur `codeVoiceAdapters` (le tableau AMONT, avec son type amont qui déclare
  // `setMasterMuted?`) et non sur la carte locale : la carte mélange les natifs bp3/bpscript,
  // typés par le contrat d'adaptateur de l'hôte, qui ne porte pas cette méthode. Pas de copie
  // de surface à la main ici — la capacité est lue chez son propriétaire.
  return voix().some((a) => a.id === runtime && typeof a.setMasterMuted === 'function');
}

export function listRuntimes(): Runtime[] {
  return [...carte().keys()];
}

/**
 * Every file extension recognized by Kanopi (leading dot, e.g. `.hydra`).
 * Derived from each adapter's `extensions` field plus the placeholder list
 * above — adding a new language only means declaring `extensions` on its
 * adapter and dropping the adapter into the registry.
 */
export function knownExtensions(): string[] {
  const live = [...carte().values()].flatMap((a) => [...a.extensions]);
  return [...live, ...Object.keys(PLACEHOLDER_EXTENSIONS)];
}

/** Table extension → runtime. CONSTRUITE À LA DEMANDE, plus au chargement du module : la carte
 *  des adaptateurs n'existe qu'après `initAdapters(bus)`, et une table bâtie trop tôt aurait été
 *  vide sans rien dire — un fichier « inconnu » au lieu d'une erreur. */
const extToRuntime = (() => {
  let cache: Map<string, Runtime> | null = null;
  return () => {
    if (cache) return cache;
    const m = new Map<string, Runtime>();
    for (const [runtime, a] of carte()) {
      for (const ext of a.extensions) m.set(ext, runtime);
    }
    for (const [ext, runtime] of Object.entries(PLACEHOLDER_EXTENSIONS)) {
      m.set(ext, runtime);
    }
    cache = m;
    return m;
  };
})();

export function runtimeFromExtension(ext: string): Runtime {
  return extToRuntime().get(ext.toLowerCase()) ?? 'bpscript';
}
