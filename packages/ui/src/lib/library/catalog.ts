// Structured library — data model and filter axes (lot 1 of the UI library
// rework, brief hub/projets/kanopi-ui-aide-librairies.md). Defines a single
// item shape every library entry maps to, plus the filter axes the library
// space sorts/filters by. UI (the dedicated space) and content (the real
// packages/library/scenes/ tree, scanned by scenes.ts) build on this; this
// file holds NO UI and NO content.

// Recadrage Romain 2026-07-13: the category is no longer a closed enum
// invented in code — it is the REAL directory name a scene file lives in
// under packages/library/scenes/<category>/. `scenes.ts` reads it off the
// filesystem; this file only needs a string to filter/count on.
export type LibraryCategory = string;

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
  language: string; // 'bp3' | 'bpscript' | 'strudel' | 'hydra' | 'mercury' | 'p5' | 'csound'
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

/** Count items per category for the rail badges (respects every OTHER filter).
 * The category set is DERIVED from the items themselves (the real folders
 * present) — no fixed list to keep in sync. */
export function categoryCounts(
  items: LibraryItem[],
  f: LibraryFilters
): Record<LibraryCategory | 'all', number> {
  const base = { ...f, category: 'all' as const };
  const counts = { all: 0 } as Record<LibraryCategory | 'all', number>;
  for (const item of items) counts[item.category] = 0;
  for (const item of items) {
    if (!matchesFilters(item, base)) continue;
    counts.all++;
    counts[item.category]++;
  }
  return counts;
}
