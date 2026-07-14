import { LIBRARY_ITEMS } from '../lib/library/scenes';
import {
  EMPTY_FILTERS,
  matchesFilters,
  categoryCounts,
  type LibraryFilters,
  type LibraryItem,
  type LibraryCategory,
  type OutputKind,
  type Level
} from '../lib/library/catalog';

// Pure DISPLAY order for the rail (Romain 2026-07-13, category-real-folders
// recadrage): the existing pedagogical arc — tutorials first, code voices /
// orchestrator / bp3 last — is worth keeping on screen. It carries no data
// about any scene; a folder absent from this list just sorts after it by
// name, so adding a category directory needs no code change to appear.
const CATEGORY_ORDER = [
  'learn',
  'basics',
  'tuning',
  'world',
  'synthesis',
  'cv',
  'polymetric',
  'generative',
  'midi',
  'orchestrator',
  'code-voices',
  'strudel',
  'p5',
  'mercury',
  'csound',
  'bp3'
];

// A handful of folder names are abbreviations that read badly title-cased
// word-by-word ("Bp3", "Cv", "Midi") — spelled out for display only.
const ACRONYMS: Record<string, string> = { bp3: 'BP3', cv: 'CV', midi: 'MIDI' };

function prettifyCategory(id: string): string {
  return id
    .split('-')
    .map((w) => ACRONYMS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// State for the dedicated library space: the active filters + derived views
// (filtered list, per-category counts, the rail's category list). The item
// set is static (bundled, scanned off disk by scenes.ts); filtering is pure
// (catalog.ts), so this store is thin.
class LibraryStore {
  filters = $state<LibraryFilters>({ ...EMPTY_FILTERS });
  readonly items: LibraryItem[] = LIBRARY_ITEMS;

  get filtered(): LibraryItem[] {
    // Filter, then sort by `order` WITHIN each category (only tutorials carry an
    // order → the `learn` rail renders 1→10). Category groups keep their original
    // relative position; a stable index tie-break preserves order elsewhere.
    return this.items
      .filter((i) => matchesFilters(i, this.filters))
      .map((item, i) => ({ item, i }))
      .sort((a, b) => {
        if (a.item.category !== b.item.category) return a.i - b.i;
        return (a.item.order ?? 0) - (b.item.order ?? 0) || a.i - b.i;
      })
      .map((x) => x.item);
  }

  get counts(): Record<LibraryCategory | 'all', number> {
    return categoryCounts(this.items, this.filters);
  }

  /** Rail entries: one per REAL category folder present among the items,
   * ordered by CATEGORY_ORDER (unknown folders sort after, alphabetically). */
  get categories(): { id: string; label: string }[] {
    const seen = new Set(this.items.map((i) => i.category));
    return [...seen]
      .sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a);
        const ib = CATEGORY_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
      .map((id) => ({ id, label: prettifyCategory(id) }));
  }

  /** Distinct languages present, for the language filter dropdown. */
  get languages(): string[] {
    return [...new Set(this.items.map((i) => i.language))].sort();
  }

  setQuery(q: string) {
    this.filters = { ...this.filters, query: q };
  }
  setCategory(c: LibraryCategory | 'all') {
    this.filters = { ...this.filters, category: c };
  }
  setLanguage(l: string | 'all') {
    this.filters = { ...this.filters, language: l };
  }
  setOutput(o: OutputKind | 'all') {
    this.filters = { ...this.filters, output: o };
  }
  setLevel(l: Level | 'all') {
    this.filters = { ...this.filters, level: l };
  }
  toggleShowcase() {
    this.filters = { ...this.filters, showcaseOnly: !this.filters.showcaseOnly };
  }
  reset() {
    this.filters = { ...EMPTY_FILTERS };
  }
}

export const library = new LibraryStore();
