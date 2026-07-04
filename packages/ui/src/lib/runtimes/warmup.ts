/**
 * PRÉCHAUFFAGE au CHARGEMENT de scène (design ratifié archi [589]). Au produce/load d'une scène
 * (PAS au 1er play), on préchauffe les moteurs voix-de-code pour un démarrage sans glitch. Ce module
 * est PUR : il ÉNUMÈRE les interprètes voix-de-code de la scène ; l'hôte passe cette liste à
 * l'entrée paquet `preload` de runtime-codevoices. (Le CONTEXTE AUDIO de runtime-audio est warmé À
 * PART, dans `startKronosAudio` au `buildOnly` — son AudioRuntime vit sur le handle, pas dans la
 * registry statique de l'hôte, donc pas atteignable ici.)
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
