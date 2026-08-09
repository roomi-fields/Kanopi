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
  // `samples` — les scènes d'exemple du LANGAGE (décision Romain 2026-08-09 : « un exemple est une
  // vraie scène », au moins une par famille de formes). Placée juste après l'arc d'entrée : on
  // apprend (`learn`), on prend les bases (`basics`), puis on voit une forme du langage à l'œuvre.
  // ⚠️ LE RANG NE FAIT PAS EXISTER LA CATÉGORIE : le rail dérive ses entrées des DOSSIERS RÉELS,
  // donc `samples` n'apparaîtra qu'avec sa première scène — les scènes viennent de bpscript, à qui
  // Romain a confié leur écriture. Ce rang est la PLACE qui les attend, pas la catégorie elle-même.
  'samples',
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

/** Rank of a category folder in the curated arc; folders absent from
 * CATEGORY_ORDER rank last (and tie-break alphabetically among themselves).
 * ONE definition, used by BOTH the rail and the grid — before, the rail
 * followed the arc while the grid followed the glob's alphabetical order, so
 * a folder starting with a capital letter (`BP3-tests/`, arrived with the
 * conformance corpus [873]) sorted its 208 test files AHEAD of every curated
 * scene in the default "All" view. Ranking both views the same way is what
 * keeps the curated scenes in front, whatever a folder is named. */
function categoryRank(id: string): number {
  const i = CATEGORY_ORDER.indexOf(id);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

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
    // Filter, then order category GROUPS by the curated arc (same ranking as the
    // rail — see categoryRank), and sort by `order` WITHIN each category (only
    // tutorials carry an order → the `learn` rail renders 1→10). A stable index
    // tie-break preserves the on-disk order everywhere else.
    return this.items
      .filter((i) => matchesFilters(i, this.filters))
      .map((item, i) => ({ item, i }))
      .sort((a, b) => {
        if (a.item.category !== b.item.category) {
          const ra = categoryRank(a.item.category);
          const rb = categoryRank(b.item.category);
          if (ra !== rb) return ra - rb;
          return a.item.category.localeCompare(b.item.category) || a.i - b.i;
        }
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
      .sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b))
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
