import type { Runtime } from '../core-mock/types';
import type { RuntimeAdapter } from './adapter';

/**
 * PRÉCHAUFFAGE au CHARGEMENT de scène (design ratifié archi [589]). Au produce/load d'une scène
 * (PAS au 1er play), on préchauffe les moteurs voix-de-code + le contexte audio pour un démarrage
 * sans glitch. Ce module est PUR (énumération des interprètes) + un enrobage DÉFENSIF du réveil
 * audio. Les vraies méthodes `preload` (runtime-codevoices) / `warmup` (runtime-audio) vivent chez
 * les pairs et ne sont PAS encore livrées → tout est additif/no-op tant qu'elles n'existent pas.
 */

interface ActorLike {
  /** Langage d'éval d'un acteur orchestré (`eval.strudel`, `eval.hydra`, …), ou undefined. */
  evalInterp?: string;
}
interface OrchestrationLike {
  actors: ActorLike[];
}
interface BacktickLike {
  /** Tag interprète d'un backtick (`strudel`, `hydra`, …). */
  interp?: string;
}

/**
 * Interprètes voix-de-code DISTINCTS qu'une scène dérivée utilise, pour préchauffer leurs moteurs.
 * Sources: l'`evalInterp` de chaque acteur orchestré + l'`interp` de chaque backtick. Filtre les
 * valides (non vides), dédoublonne (ordre de première apparition). Pur → testable.
 */
export function codeVoiceInterps(
  orchestration: OrchestrationLike | undefined,
  backticks: Record<string, BacktickLike> | undefined
): string[] {
  const seen = new Set<string>();
  const add = (i: string | undefined): void => {
    if (typeof i === 'string' && i.length > 0) seen.add(i);
  };
  for (const a of orchestration?.actors ?? []) add(a.evalInterp);
  for (const bt of Object.values(backticks ?? {})) add(bt.interp);
  return [...seen];
}

// Ids sous lesquels runtime-audio POURRA enregistrer son adaptateur de sortie. Aucun n'est encore
// un Runtime enregistré (runtime-audio n'expose pas d'adaptateur / de `warmup`) → getAdapter renvoie
// undefined → no-op. Cast documenté : l'id rejoindra l'union `Runtime` quand le pair livrera.
const AUDIO_RUNTIME_IDS = ['webaudio', 'audio'] as const;

/**
 * Réveille (resume) le contexte audio des sorties runtime-audio AU CHARGEMENT, dans la chaîne du
 * geste. DÉFENSIF : `warmup?()` est optionnel sur RuntimeAdapter → no-op tant que runtime-audio ne
 * l'implémente/enregistre pas. Idempotent (repose sur l'idempotence du pair). Ne fabrique aucun état
 * hôte. L'appelant enrobe déjà en try/catch (best-effort) — un échec ne casse jamais le produce.
 */
export async function warmupAudioContext(
  getAdapter: (runtime: Runtime) => RuntimeAdapter | undefined
): Promise<void> {
  for (const rid of AUDIO_RUNTIME_IDS) {
    await getAdapter(rid as Runtime)?.warmup?.();
  }
}
