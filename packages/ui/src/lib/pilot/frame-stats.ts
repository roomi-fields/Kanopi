// PILOTAGE — sonde de fluidité du fil principal (`window.kanopi.inspect.frameStats()`).
//
// But : mesurer les gels d'affichage DANS LA SESSION RÉELLE de l'utilisateur (frappes,
// coller, molette pendant lecture) au lieu d'un banc Playwright qui ne partage ni sa
// fenêtre ni ses périphériques. Lecture seule, aucun effet sur le rendu ; le moniteur
// est TOUJOURS actif mais quasi gratuit : un callback rAF qui pousse un delta dans un
// anneau + un PerformanceObserver `longtask` passif.
//
// La sonde N'attribue PAS les causes (l'API longtask n'expose qu'une attribution
// pauvre) — elle dit QUAND le fil a gelé et COMBIEN, horodaté, pour confronter au
// geste reproduit. L'attribution fine reste au Performance panel des DevTools.

interface Stall {
  /** Il y a combien de ms (au moment du read) le gel s'est produit. */
  agoMs: number;
  /** Durée du gel (ms). */
  ms: number;
}

const RING = 900; // ~15 s de frames à 60 fps
const LONGTASK_RING = 100;

const frameDeltas: number[] = [];
const rafStalls: { at: number; ms: number }[] = [];
const longtasks: { at: number; ms: number; name: string }[] = [];
let lastFrame = 0;
let started = false;

function loop(now: number) {
  if (lastFrame > 0) {
    const d = now - lastFrame;
    frameDeltas.push(d);
    if (frameDeltas.length > RING) frameDeltas.shift();
    if (d > 100) {
      rafStalls.push({ at: now, ms: d });
      if (rafStalls.length > LONGTASK_RING) rafStalls.shift();
    }
  }
  lastFrame = now;
  requestAnimationFrame(loop);
}

/** Démarre le moniteur (idempotent). Appelé à l'installation de l'API pilotage. */
export function startFrameMonitor(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  requestAnimationFrame(loop);
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longtasks.push({
          at: e.startTime,
          ms: Math.round(e.duration),
          name: e.name
        });
        if (longtasks.length > LONGTASK_RING) longtasks.shift();
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
  } catch {
    /* longtask non supporté → la sonde rAF suffit */
  }
}

export interface FrameStats {
  /** Fenêtre couverte par l'anneau de frames (ms). */
  windowMs: number;
  frames: { n: number; p50: number; p95: number; max: number };
  /** Gels de la boucle d'affichage > 100 ms, du plus récent au plus ancien. */
  rafStallsOver100: Stall[];
  /** Tâches > 50 ms sur le fil principal (PerformanceObserver longtask). */
  longtasks: (Stall & { name: string })[];
}

/** Photographie des ~15 dernières secondes de fluidité. Lecture seule. */
export function readFrameStats(): FrameStats {
  const now = performance.now();
  const sorted = [...frameDeltas].sort((a, b) => a - b);
  const pick = (q: number) =>
    sorted.length
      ? +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(1)
      : 0;
  return {
    windowMs: Math.round(frameDeltas.reduce((s, d) => s + d, 0)),
    frames: {
      n: sorted.length,
      p50: pick(0.5),
      p95: pick(0.95),
      max: sorted.length ? +sorted[sorted.length - 1].toFixed(1) : 0
    },
    rafStallsOver100: [...rafStalls]
      .reverse()
      .map((s) => ({ agoMs: Math.round(now - s.at), ms: Math.round(s.ms) })),
    longtasks: [...longtasks]
      .reverse()
      .map((t) => ({ agoMs: Math.round(now - t.at), ms: t.ms, name: t.name }))
  };
}
