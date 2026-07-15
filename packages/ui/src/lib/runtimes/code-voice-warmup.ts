// PRÉCHAUFFE GATÉE (chantier latence [786], décision archi [786]) — l'hôte ne fait que
// TRANSPORTER + MÉMOÏSER une promesse par interprète voix-de-code : le paquet `runtime-codevoices`
// reste seul propriétaire du warmup réel (`preload`, idempotent côté paquet). Avant ce module, le
// warmup à l'ouverture était fire-and-forget (`void preload?.(interps)`) : rien n'attendait sa fin,
// donc un play immédiat après ouverture pouvait payer l'init moteur EN COURSE avec le warmup de fond.
//
// Ce tracker donne un point d'attente DÉTERMINISTE, dédupé par interprète : un 2e appel pour le
// même interprète (ouverture puis play, ou 2 plays successifs) rend la MÊME promesse — jamais un
// second `preload()`. Best-effort de bout en bout (comme `preload` lui-même) : un warmup en échec
// ne rejette jamais côté appelant, il ne bloque donc jamais un play.

import { preload, type PreloadAssets } from 'runtime-codevoices';

/** Promesse en vol ou résolue, par interprète (ex. 'strudel', 'csound', 'hydra'). Une entrée
 *  présente = un warmup a déjà été lancé pour cet interprète (en vol ou terminé) ; l'appelant
 *  suivant réutilise la MÊME promesse plutôt que de relancer `preload`. */
const warmups = new Map<string, Promise<void>>();

/**
 * Préchauffe les `interps` donnés, PUIS pré-tire les `assets` déclarés par la scène qui a
 * déclenché cet appel (chantier latence [788] : banques `@library.strudel` + instruments `gm_*`
 * — voir `bpx-adapter.ts:assetsForScene`). Idempotent + dédupliqué PAR INTERPRÈTE : les
 * interprètes déjà en vol/chauds ne redéclenchent pas `preload`, seuls les nouveaux sont groupés
 * en UN appel `preload(nouveaux, assets)`. Best-effort : ne rejette jamais, un `preload` absent
 * (pair pas encore livré) ou en échec résout silencieusement.
 *
 * Choix de dédup : la clé reste l'INTERPRÈTE (inchangé), pas l'interprète+assets. Une scène
 * n'a qu'UNE seule ouverture par interprète (garde par fileId dans `preload-on-open.svelte.ts`),
 * donc les assets d'une scène accompagnent TOUJOURS le 1er appel qui lance réellement `preload`
 * pour ses interprètes — un 2e appel pour un interprète déjà chaud (ex. le gate play de
 * `real-core.ts`, qui n'a que l'interprète, pas les assets) réutilise la promesse mémoïsée sans
 * relancer `preload`, donc sans jamais perdre le préfetch déjà fait/en vol à l'ouverture.
 */
export function warmUp(interps: readonly string[], assets?: PreloadAssets): Promise<void> {
  const wanted = [...new Set(interps.filter((i) => i && i.length > 0))];
  if (wanted.length === 0) return Promise.resolve();

  const toLaunch = wanted.filter((i) => !warmups.has(i));
  if (toLaunch.length > 0) {
    const shared = Promise.resolve()
      .then(() => preload?.(toLaunch, assets))
      .catch(() => undefined)
      .then(() => undefined);
    for (const i of toLaunch) warmups.set(i, shared);
  }

  // Cas courant (real-core.ts play gate) : UN seul interprète — renvoie la promesse mémoïsée
  // TELLE QUELLE (référence stable), pas un wrapper Promise.all frais à chaque appel, pour qu'un
  // 2e appel avec le même interprète soit littéralement la MÊME promesse.
  if (wanted.length === 1) return warmups.get(wanted[0])!;

  return Promise.all(wanted.map((i) => warmups.get(i))).then(() => undefined);
}

/** Introspection lecture seule : un warmup a-t-il déjà été lancé (en vol ou terminé) pour cet
 *  interprète ? Utile au débogage/preuve, jamais consultée pour une décision de gating (le gating
 *  se fait en appelant `warmUp` — best-effort, jamais en lisant cet état au préalable). */
export function hasWarmupStarted(interp: string): boolean {
  return warmups.has(interp);
}
