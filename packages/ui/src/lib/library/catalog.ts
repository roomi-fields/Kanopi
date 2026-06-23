// Structured library — data model and taxonomy (lot 1 of the UI library rework,
// brief hub/projets/kanopi-ui-aide-librairies.md). Defines a single item shape
// every library entry maps to, plus the fixed categories and the filter axes the
// library space sorts/filters by. UI (the dedicated space) and content (the
// owner-filled catalogue) build on this; this file holds NO UI and NO content.

// The five fixed categories (brief, lot 2). Order here is the display order.
export type LibraryCategory =
  | 'bp3' // BP3 `.gr` grammars that play
  | 'bpscript' // BPScript on its own
  | 'bpscript-backticks' // BPScript with embedded code in backticks
  | 'orchestrator' // multi-actor `.bps` (cross-runtime, multi-voice)
  | 'other-langs'; // Tidal, Hydra, Strudel, Mercury, p5, Csound…

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
  /** the file to open/focus once loaded (a `.bps`, `.gr`, …) */
  sessionFile: string;
  /** every file the scene drops into the workspace */
  files: LibraryFile[];
}

// Category display metadata — label + one-line hint for the category rail.
export const CATEGORIES: { id: LibraryCategory; label: string; hint: string }[] = [
  { id: 'bp3', label: 'BP3', hint: 'Bol Processor grammars (.gr) that play' },
  { id: 'bpscript', label: 'BPScript', hint: 'The native sequencer language, on its own' },
  { id: 'bpscript-backticks', label: '+ code', hint: 'BPScript with embedded code (backticks)' },
  { id: 'orchestrator', label: 'Orchestrator', hint: 'Multi-actor sessions across runtimes' },
  { id: 'other-langs', label: 'Tidal & others', hint: 'Strudel, Hydra, Mercury, p5, Csound…' }
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
  const counts = {
    all: 0,
    bp3: 0,
    bpscript: 0,
    'bpscript-backticks': 0,
    orchestrator: 0,
    'other-langs': 0
  } as Record<LibraryCategory | 'all', number>;
  for (const item of items) {
    if (!matchesFilters(item, base)) continue;
    counts.all++;
    counts[item.category]++;
  }
  return counts;
}
