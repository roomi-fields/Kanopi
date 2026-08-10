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
    ...codeVoices.map((a): [Runtime, RuntimeAdapter] => [a.id, a]),
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
