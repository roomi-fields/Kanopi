// PILOTE CONFORMITÉ — « pureté temporelle de l'hôte » (backlog CONF-TEMPS).
//
// But (recherche Romain : NE PAS croire l'agent sur parole) : rendre les invariants
// « l'hôte n'invente aucun temps » VÉRIFIABLES MACHINE. Ce test SCANNE la source Kanopi
// et ÉCHOUE, sans aucun jugement humain, si le code viole un invariant du contrat
// `hub/contrats/kronos-transport.md` / `temps-horloge.md` :
//
//   inv#1 — pas de COMPTEUR/intégrateur de position ou de beat côté hôte.
//           Autorisé : lire `transport.position()`/`beatPosition()` par frame et MÉMORISER
//           la dernière valeur lue (baseline de crossing). Interdit : ACCUMULER (`+=`/`++`)
//           une position/un beat (le tenir soi-même).
//   inv#2 — l'hôte ne DÉFINIT pas le pont t_audio↔t_scène. Appeler `clock.musicalNow(...)`
//           (le handle Kronos reçu) est OK ; IMPLÉMENTER `musicalNow`/`audioTimeFor` est interdit.
//   inv#6 — pas de DÉFAUT de tempo FABRIQUÉ (BPM en dur type 120/128 en fallback). Seul le
//           miroir du défaut MOTEUR BPx (60) est toléré (documenté, `effectiveTempoBpm`).
//   inv#7 — le tempo n'est JAMAIS restauré depuis localStorage (complète KAN-C17 par un garde
//           statique : aucun `setBpm` dans le chemin de persistance).
//
// PILOTE : prouve le PATTERN sur 4 invariants ; le bloc « non-vacuous » prouve que chaque
// détecteur MORD (rouge sur violation synthétique), donc le vert sur le vrai code a un sens.

import { describe, it, expect } from 'vitest';

// Corpus = TOUT le code de LOGIQUE de l'hôte (packages/ui/src), chargé en brut via le glob
// Vite (natif, pas de types Node → passe svelte-check). Exclut tests, `.d.ts` (déclarations de
// type, pas d'implémentation) et ce fichier. Portée du PILOTE = packages/ui (où vivent horloge/
// tempo/position) ; `packages/core` = extension ultérieure quand on scale.
const RAW = import.meta.glob('/src/**/*.{ts,svelte}', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

const FILES: string[] = Object.keys(RAW).filter(
  (p) =>
    !p.endsWith('.d.ts') &&
    !p.includes('.test.') &&
    !p.includes('.spec.') &&
    !p.endsWith('host-time-purity.test.ts')
);
const readFileSync = (p: string): string => RAW[p];

/** Retire les commentaires `//…` et `/* … *\/` pour ne scanner que le CODE (les commentaires
 *  citent souvent `musicalNow`, `128`, etc. en prose — ce ne sont pas des violations). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

interface Hit {
  readonly line: number;
  readonly text: string;
}

/** Applique une regex ligne par ligne au code décommenté et renvoie les lignes fautives. */
function scanLines(src: string, re: RegExp, keep: (m: RegExpMatchArray) => boolean = () => true): Hit[] {
  const hits: Hit[] = [];
  const lines = stripComments(src).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m && keep(m)) hits.push({ line: i + 1, text: lines[i].trim().slice(0, 120) });
  }
  return hits;
}

// ————————————————————————————————————————————————————————————————————————
// Les 4 détecteurs (purs, testables isolément → non-vacuité prouvable)
// ————————————————————————————————————————————————————————————————————————

/** inv#1 — ACCUMULATION d'une position/beat (interdit). Mémoriser une lecture (`x = read`)
 *  reste autorisé ; seul l'incrément/accumulation est fautif. */
export function detectPositionCounter(src: string): Hit[] {
  // `beat`/`position`/`playhead`/`loopoffset` N'IMPORTE OÙ dans l'identifiant (ex. `hostBeat`,
  // `playheadBeats`, `beatIndex`) suivi d'une accumulation. Une simple affectation `x = read`
  // (mémoire de crossing) n'a ni `++` ni `+=` → non flaguée.
  return scanLines(
    src,
    /\w*(beat|position|playhead|loopoffset)\w*\s*(\+\+|--|\+=|-=)|(\+\+|--)\s*\w*(beat|position|playhead|loopoffset)\w*/i
  );
}

/** inv#2 — IMPLÉMENTATION du pont (interdit). Un APPEL `.musicalNow(...)` sur le handle reçu
 *  est OK ; une DÉFINITION (corps `{`/`=>`, ou `= (…) =>`, ou `function`) est interdite. */
export function detectBridgeImpl(src: string): Hit[] {
  // Une DÉFINITION : `musicalNow(…)[: type] {`, `musicalNow(…) =>`, `= (`/`= function`.
  // Le `(:[^{};=]+)?` tolère une annotation de type de retour TypeScript entre `)` et `{`.
  // Une SIGNATURE de type (`musicalNow(x): number;`, finie par `;`) n'a pas de corps → échappe.
  // Un APPEL `.musicalNow(` (précédé d'un `.`) est exclu par `[^.\w]`.
  return scanLines(
    src,
    /(^|[^.\w])(musicalNow|audioTimeFor)\s*(\([^)]*\)\s*(:[^{};=]+)?(\{|=>)|=\s*(\(|function|async))/
  );
}

/** inv#6 — DÉFAUT de tempo FABRIQUÉ (interdit). Un littéral BPM en fallback/défaut, SAUF 60
 *  (miroir documenté du défaut moteur BPx). */
export function detectFabricatedTempo(src: string): Hit[] {
  const re =
    /\b(bpm|tempo)\w*\s*(?:\?\?|\|\||=)\s*(\d+(?:\.\d+)?)|(?:\?\?|\|\|)\s*(\d+(?:\.\d+)?)\s*\)?\s*(?:;|,|\)|as\b)?\s*(?:\/\/.*)?$|setBpm\(\s*(\d+(?:\.\d+)?)\s*\)/i;
  return scanLines(src, re, (m) => {
    const n = Number(m[2] ?? m[3] ?? m[4]);
    if (!Number.isFinite(n)) return false;
    // 60 = défaut MOTEUR BPx mirroré (documenté effectiveTempoBpm) → toléré.
    // Un tempo « inventé » (club/preset) est ≥ 90 ; on ne flague que le contexte bpm/tempo
    // ou un setBpm(littéral), donc une couleur CSS `rgba(…120…)` n'entre pas ici.
    return n !== 60 && n >= 40 && n <= 400;
  });
}

/** inv#7 — RESTAURATION du tempo depuis localStorage (interdit) : aucun `setBpm` dans le
 *  chemin de persistance. */
export function detectTempoRestore(path: string, src: string): Hit[] {
  if (!/[\\/]persistence[\\/]/.test(path)) return [];
  return scanLines(src, /\bsetBpm\s*\(/);
}

// ————————————————————————————————————————————————————————————————————————
// LE GARDE — scanne le vrai code, doit être VERT
// ————————————————————————————————————————————————————————————————————————

const rel = (p: string) => p.replace(/^\//, 'packages/ui/');
const fmt = (all: { path: string; hits: Hit[] }[]) =>
  all
    .filter((f) => f.hits.length)
    .map((f) => f.hits.map((h) => `  ${rel(f.path)}:${h.line}  ${h.text}`).join('\n'))
    .join('\n');

describe('pureté temporelle de l\'hôte — garde statique (contrat kronos-transport.md)', () => {
  it('a scanné un corpus non vide (garde non vacuant)', () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it('inv#1 — aucun compteur/intégrateur de position ou de beat côté hôte', () => {
    const all = FILES.map((p) => ({ path: p, hits: detectPositionCounter(readFileSync(p)) }));
    expect(fmt(all), `Position/beat ACCUMULÉ côté hôte (inv#1 : la position se LIT de Kronos).\n${fmt(all)}`).toBe('');
  });

  it('inv#2 — l\'hôte ne DÉFINIT pas le pont musicalNow/audioTimeFor', () => {
    const all = FILES.map((p) => ({ path: p, hits: detectBridgeImpl(readFileSync(p)) }));
    expect(fmt(all), `Pont t_audio↔t_scène IMPLÉMENTÉ côté hôte (inv#2 : le pont est l'InternalClock de Kronos).\n${fmt(all)}`).toBe('');
  });

  it('inv#6 — aucun défaut de tempo fabriqué (BPM en dur ≠ 60)', () => {
    const all = FILES.map((p) => ({ path: p, hits: detectFabricatedTempo(readFileSync(p)) }));
    expect(fmt(all), `Défaut de tempo FABRIQUÉ côté hôte (inv#6 : l'hôte n'invente aucun tempo ; seul le miroir moteur 60 est toléré).\n${fmt(all)}`).toBe('');
  });

  it('inv#7 — le tempo n\'est pas restauré depuis localStorage (garde statique, complète KAN-C17)', () => {
    const all = FILES.map((p) => ({ path: p, hits: detectTempoRestore(p, readFileSync(p)) }));
    expect(fmt(all), `setBpm dans le chemin de persistance (inv#7 : le tempo redécoule de la scène, jamais de localStorage).\n${fmt(all)}`).toBe('');
  });
});

// ————————————————————————————————————————————————————————————————————————
// NON-VACUITÉ — chaque détecteur DOIT mordre sur une violation synthétique
// (sinon un garde toujours-vert ne prouve rien).
// ————————————————————————————————————————————————————————————————————————

describe('les détecteurs mordent (non-vacuité prouvée)', () => {
  it('inv#1 mord sur un accumulateur, ignore une mémoire de lecture', () => {
    expect(detectPositionCounter('this.beatIndex += 1;').length).toBeGreaterThan(0);
    expect(detectPositionCounter('playheadBeats++;').length).toBeGreaterThan(0);
    expect(detectPositionCounter('hostBeat += 1;').length).toBeGreaterThan(0); // `beat` en milieu de mot
    // légitime : mémoriser une lecture Kronos pour détecter un crossing
    expect(detectPositionCounter('this.#lastBeatFloor = beatAbs;')).toEqual([]);
    expect(detectPositionCounter('const n = beatCount(dur, beatDur);')).toEqual([]);
  });

  it('inv#2 mord sur une définition, ignore un appel', () => {
    expect(detectBridgeImpl('function musicalNow(a) { return a; }').length).toBeGreaterThan(0);
    expect(detectBridgeImpl('function musicalNow(a: number): number { return a; }').length).toBeGreaterThan(0); // type de retour
    expect(detectBridgeImpl('const audioTimeFor = (s) => s * rate;').length).toBeGreaterThan(0);
    // légitime : appeler le handle Kronos reçu, ou une SIGNATURE de type (pas d'implémentation)
    expect(detectBridgeImpl('const t = clock.musicalNow(a);')).toEqual([]);
    expect(detectBridgeImpl('  musicalNow(audioTime: number): number;')).toEqual([]); // sig .d.ts-like
  });

  it('inv#6 mord sur un défaut fabriqué, tolère le miroir moteur 60', () => {
    expect(detectFabricatedTempo('const bpm = tempo ?? 128;').length).toBeGreaterThan(0);
    expect(detectFabricatedTempo('this.tempo = 120;').length).toBeGreaterThan(0);
    expect(detectFabricatedTempo('clock.setBpm(140);').length).toBeGreaterThan(0);
    // toléré : miroir du défaut moteur BPx (documenté)
    expect(detectFabricatedTempo('effectiveTempoBpm(derived, deriveTempo ?? 60);')).toEqual([]);
    // hors contexte tempo : une couleur CSS ne doit pas mordre
    expect(detectFabricatedTempo('background: rgba(80, 200, 120, 0.08);')).toEqual([]);
  });

  it('inv#7 mord sur un setBpm en persistance, ignore ailleurs', () => {
    expect(detectTempoRestore('src/lib/persistence/snapshot.svelte.ts', 'clock.setBpm(w.bpm);').length).toBeGreaterThan(0);
    expect(detectTempoRestore('src/stores/clock.svelte.ts', 'clock.setBpm(n);')).toEqual([]);
  });
});
