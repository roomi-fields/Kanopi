// PILOTAGE — sonde de PILE CHAUDE (`window.kanopi.inspect.profileScroll(ms)`).
//
// But : NOMMER la fonction qui tient le fil principal pendant un geste reproduit
// (scroll/saisie) dans la session réelle — là où frameStats dit QUAND/COMBIEN, cette
// sonde dit QUOI. S'appuie sur la JS Self-Profiling API (`new Profiler(...)`), qui
// échantillonne la pile du fil principal PENDANT les longues tâches — chose qu'aucun
// timer JS ne peut faire (un timer ne court qu'APRÈS la tâche).
//
// PRÉREQUIS NAVIGATEUR : l'API exige l'en-tête de réponse `Document-Policy: js-profiling`
// (posé par le serveur dev ET le preview — vite.config `server.headers`/`preview.headers`).
// Un serveur démarré AVANT ce changement ne le sert pas → redémarrer le dev server. Si
// l'API manque, la sonde le dit explicitement au lieu de rendre un résultat vide.

interface ProfilerLike {
  stop(): Promise<{
    frames: { name?: string; resourceId?: number; line?: number; column?: number }[];
    resources: string[];
    stacks: { frameId: number; parentId?: number }[];
    samples: { stackId?: number; timestamp: number }[];
  }>;
}

export interface HotFrame {
  /** `fonction @ fichier:ligne` (fichier réduit à ses 2 derniers segments). */
  fn: string;
  /** Self-time estimé (ms) : échantillons dont cette frame est la FEUILLE. */
  selfMs: number;
  /** Part du temps NON-idle (%). */
  pct: number;
}

export interface ScrollProfile {
  ok: boolean;
  /** Explication quand `ok` est false (API absente / policy manquante). */
  reason?: string;
  windowMs?: number;
  samples?: number;
  idlePct?: number;
  top?: HotFrame[];
}

/** Profile la pile du fil principal pendant `ms` (défaut 8000) et rend les frames
 *  chaudes agrégées par self-time. Lancer PUIS reproduire le geste pendant la fenêtre. */
export async function profileMainThread(ms = 8000): Promise<ScrollProfile> {
  const Ctor = (globalThis as { Profiler?: new (o: object) => ProfilerLike }).Profiler;
  if (!Ctor) {
    return {
      ok: false,
      reason:
        "JS Self-Profiling API indisponible — il faut l'en-tête `Document-Policy: js-profiling` " +
        '(redémarrer le serveur dev pour prendre la config) et un Chrome ≥ 94.'
    };
  }
  const sampleInterval = 10; // ms
  let profiler: ProfilerLike;
  try {
    profiler = new Ctor({ sampleInterval, maxBufferSize: Math.ceil((ms / sampleInterval) * 2) });
  } catch (e) {
    return { ok: false, reason: `Profiler refusé : ${String(e)}` };
  }
  await new Promise((r) => setTimeout(r, ms));
  const trace = await profiler.stop();

  // Self-time = échantillons dont la frame est la FEUILLE de pile ; stackId absent = idle.
  const short = (rid?: number) =>
    rid === undefined ? '(natif)' : (trace.resources[rid] || '').split('/').slice(-2).join('/');
  const agg = new Map<string, number>();
  let idle = 0;
  for (const s of trace.samples) {
    if (s.stackId === undefined) {
      idle++;
      continue;
    }
    const stack = trace.stacks[s.stackId];
    const f = stack ? trace.frames[stack.frameId] : undefined;
    const key = f
      ? `${f.name || '(anonyme)'} @ ${short(f.resourceId)}${f.line != null ? ':' + f.line : ''}`
      : '(inconnu)';
    agg.set(key, (agg.get(key) ?? 0) + 1);
  }
  const busy = trace.samples.length - idle;
  const top = [...agg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([fn, n]) => ({
      fn,
      selfMs: +(n * sampleInterval).toFixed(0),
      pct: busy ? +((n / busy) * 100).toFixed(1) : 0
    }));
  return {
    ok: true,
    windowMs: ms,
    samples: trace.samples.length,
    idlePct: trace.samples.length ? +((idle / trace.samples.length) * 100).toFixed(1) : 0,
    top
  };
}
