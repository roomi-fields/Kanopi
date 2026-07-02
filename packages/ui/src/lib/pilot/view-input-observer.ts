// Sonde DEV lecture-seule : le DERNIER `ProductionInput` que l'hôte (ProductionViewHost) a
// poussé à chaque vue de production, capturé VERBATIM (champs saillants). Sert à prouver, sans
// deviner, ce que la couche RENDU reçoit — p.ex. diagnostiquer un curseur figé au re-play :
// `mode`, présence du `cursor`, et `durationSec` de la structure au moment du push. Exposé par
// `window.kanopi.inspect.lastViewInput()`. N'a AUCUN effet sur le rendu (pur enregistrement).

export interface ViewInputSnapshot {
  viewId: string;
  mode: unknown;
  hasCursor: boolean;
  durationSec: unknown;
}

type LoosyInput = {
  transport?: { mode?: unknown; cursor?: unknown };
  structure?: { durationSec?: unknown } | null;
};

const lastByView = new Map<string, ViewInputSnapshot>();

/** Called by ProductionViewHost right after each `view.update(input)`. */
export function recordViewInput(viewId: string, input: LoosyInput): void {
  lastByView.set(viewId, {
    viewId,
    mode: input.transport?.mode ?? null,
    hasCursor: input.transport?.cursor != null,
    durationSec: input.structure?.durationSec ?? null
  });
}

/** Read the last input pushed to a given view, or all of them. Lecture seule. */
export function lastViewInput(viewId?: string): ViewInputSnapshot | ViewInputSnapshot[] | null {
  if (viewId) return lastByView.get(viewId) ?? null;
  return [...lastByView.values()];
}
