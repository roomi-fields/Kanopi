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
  /** Stable identity of the `cursor` object (same number = SAME handle across pushes). */
  cursorId: number | null;
  /** Stable identity of the `structure` object (new number = re-pushed → view `load()` re-render). */
  structureId: number | null;
}

type LoosyInput = {
  transport?: { mode?: unknown; cursor?: unknown };
  structure?: { durationSec?: unknown } | null;
};

const lastByView = new Map<string, ViewInputSnapshot>();

// Stable per-object identity (a monotone id assigned on first sighting) — lets a caller tell
// whether the SAME cursor/structure object is re-pushed or a NEW one replaced it, without
// leaking the object itself. Diagnostic only.
const idMap = new WeakMap<object, number>();
let nextId = 1;
function identityOf(o: unknown): number | null {
  if (o == null || typeof o !== 'object') return null;
  let id = idMap.get(o as object);
  if (id === undefined) {
    id = nextId++;
    idMap.set(o as object, id);
  }
  return id;
}

/** Called by ProductionViewHost right after each `view.update(input)`. */
export function recordViewInput(viewId: string, input: LoosyInput): void {
  lastByView.set(viewId, {
    viewId,
    mode: input.transport?.mode ?? null,
    hasCursor: input.transport?.cursor != null,
    durationSec: input.structure?.durationSec ?? null,
    cursorId: identityOf(input.transport?.cursor),
    structureId: identityOf(input.structure)
  });
}

/** Read the last input pushed to a given view, or all of them. Lecture seule. */
export function lastViewInput(viewId?: string): ViewInputSnapshot | ViewInputSnapshot[] | null {
  if (viewId) return lastByView.get(viewId) ?? null;
  return [...lastByView.values()];
}
