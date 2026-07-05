// Structured library — data model and taxonomy (lot 1 of the UI library rework,
// brief hub/projets/kanopi-ui-aide-librairies.md). Defines a single item shape
// every library entry maps to, plus the fixed categories and the filter axes the
// library space sorts/filters by. UI (the dedicated space) and content (the
// owner-filled catalogue) build on this; this file holds NO UI and NO content.

// THEME-primary taxonomy (decision Romain 2026-07-04): the primary rail is the
// MUSICAL theme, not the runtime/language. Runtime/language stays SECONDARY —
// the `language` field drives the card badge and its own independent filter.
// Order here is the display order in the rail.
export type LibraryCategory =
  | 'learn' // guided tutorials, in order 1→10
  | 'basics' // core sequencing gestures (scales, arps, rests, ties)
  | 'tuning' // temperaments & references (12-TET, just, A=442…)
  | 'world' // living traditions (maqam, gamelan, raga, shakuhachi…)
  | 'synthesis' // waveform/timbre/filter/envelope studies
  | 'cv' // control-voltage modulation (envelopes, LFOs, curves)
  | 'polymetric' // polymeter & polyrhythm
  | 'generative' // rule rewriting, random selection, flags
  | 'midi' // MIDI output scenes
  | 'orchestrator' // multi-actor `.bps` (cross-runtime, multi-voice)
  | 'codevoice' // single-language code voices (Strudel, Hydra, Tidal, JS…)
  | 'bp3'; // BP3 `.gr` grammars that play

// What a scene emits — drives the "output" filter. A scene can have several
// (an orchestrator session mixes audio + visuals + text).
export type OutputKind = 'audio' | 'midi' | 'text' | 'visual';

// Difficulty / teaching arc — drives the "level" filter (didactic → advanced).
export type Level = 'didactic' | 'intermediate' | 'advanced';

export interface LibraryFile {
  path: string;
  contents: string;
}

export interface LibraryItem {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: LibraryCategory;
  /** the primary language/runtime, for the language filter and the card badge */
  language: string; // 'bp3' | 'bpscript' | 'strudel' | 'hydra' | 'tidal' | 'mercury' | 'p5' | 'csound'
  outputs: OutputKind[];
  level: Level;
  /** free style/genre tags (e.g. 'minimalism', 'generative', 'drums') */
  tags: string[];
  /** the "⭐ vitrine / percutante" flag — surfaces in the showcase filter */
  showcase?: boolean;
  /** intra-category display order (only tutorials need it; sorted ascending) */
  order?: number;
  /** the file to open/focus once loaded (a `.bps`, `.gr`, …) */
  sessionFile: string;
  /** every file the scene drops into the workspace */
  files: LibraryFile[];
}

// Category display metadata — label (fr) + one-line hint for the category rail.
export const CATEGORIES: { id: LibraryCategory; label: string; hint: string }[] = [
  { id: 'learn', label: 'Apprendre', hint: 'Tutoriels guidés, dans l’ordre 1→10' },
  {
    id: 'basics',
    label: 'Bases',
    hint: 'Gestes fondamentaux : gammes, arpèges, silences, liaisons'
  },
  { id: 'tuning', label: 'Accordages', hint: 'Tempéraments et références (12-TET, juste, A=442…)' },
  { id: 'world', label: 'Traditions du monde', hint: 'Maqâm, gamelan, râga, shakuhachi, solfège…' },
  {
    id: 'synthesis',
    label: 'Synthèse & timbre',
    hint: 'Formes d’onde, filtres, enveloppes, panoramique'
  },
  { id: 'cv', label: 'Modulation (CV)', hint: 'Enveloppes, LFO et courbes de modulation' },
  { id: 'polymetric', label: 'Polymétrie & rythme', hint: 'Polymètre et polyrythmie superposés' },
  {
    id: 'generative',
    label: 'Génératif',
    hint: 'Réécriture, choix aléatoire, drapeaux et compteurs'
  },
  { id: 'midi', label: 'MIDI', hint: 'Scènes routées vers une sortie MIDI' },
  {
    id: 'orchestrator',
    label: 'Orchestrateur',
    hint: 'Sessions multi-acteurs à travers les runtimes'
  },
  {
    id: 'codevoice',
    label: 'Voix de code',
    hint: 'Strudel, Hydra, Tidal, Mercury, p5, Csound, JS…'
  },
  { id: 'bp3', label: 'BP3', hint: 'Grammaires Bol Processor (.gr) qui jouent' }
];

// Filter axes the library space exposes. Each is independent; an item matches a
// filter value if it carries it (outputs/tags are multi-valued, the rest single).
export interface LibraryFilters {
  query: string; // free-text search over name/tagline/description/tags
  category: LibraryCategory | 'all';
  language: string | 'all';
  output: OutputKind | 'all';
  level: Level | 'all';
  showcaseOnly: boolean;
}

export const EMPTY_FILTERS: LibraryFilters = {
  query: '',
  category: 'all',
  language: 'all',
  output: 'all',
  level: 'all',
  showcaseOnly: false
};

/** Does an item pass the active filters? Pure — the UI and tests share it. */
export function matchesFilters(item: LibraryItem, f: LibraryFilters): boolean {
  if (f.category !== 'all' && item.category !== f.category) return false;
  if (f.language !== 'all' && item.language !== f.language) return false;
  if (f.output !== 'all' && !item.outputs.includes(f.output)) return false;
  if (f.level !== 'all' && item.level !== f.level) return false;
  if (f.showcaseOnly && !item.showcase) return false;
  if (f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    const hay = [item.name, item.tagline, item.description, ...item.tags].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** Count items per category for the rail badges (respects every OTHER filter). */
export function categoryCounts(
  items: LibraryItem[],
  f: LibraryFilters
): Record<LibraryCategory | 'all', number> {
  const base = { ...f, category: 'all' as const };
  const counts = { all: 0 } as Record<LibraryCategory | 'all', number>;
  for (const c of CATEGORIES) counts[c.id] = 0;
  for (const item of items) {
    if (!matchesFilters(item, base)) continue;
    counts.all++;
    counts[item.category]++;
  }
  return counts;
}
