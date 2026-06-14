import { LIBRARY_ITEMS } from '../lib/library/items';
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

// State for the dedicated library space: the active filters + derived views
// (filtered list, per-category counts, the language options). The item set is
// static (bundled); filtering is pure (catalog.ts), so this store is thin.
class LibraryStore {
  filters = $state<LibraryFilters>({ ...EMPTY_FILTERS });
  readonly items: LibraryItem[] = LIBRARY_ITEMS;

  get filtered(): LibraryItem[] {
    return this.items.filter((i) => matchesFilters(i, this.filters));
  }

  get counts(): Record<LibraryCategory | 'all', number> {
    return categoryCounts(this.items, this.filters);
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
