import catalogJson from './visuals/catalog.json';
import type { Runtime } from '../core-mock';

export interface VisualItem {
  id: string;
  name: string;
  description: string;
  /** Inline snippet pasted into the editor on load. */
  content: string;
  /** Runtimes the snippet targets (today only `hydra`). */
  runtimes: Runtime[];
  tags?: string[];
}

export interface VisualsCatalog {
  schemaVersion: number;
  items: VisualItem[];
}

/** Parsed visuals catalog, loaded at build-time from catalog.json. */
export const visualsCatalog: VisualsCatalog = catalogJson as VisualsCatalog;

/** Look up a visual item by id. */
export function findVisual(id: string): VisualItem | undefined {
  return visualsCatalog.items.find((v) => v.id === id);
}

/** Every visual id in the catalog (for diagnostics / autocomplete). */
export function visualIds(): string[] {
  return visualsCatalog.items.map((v) => v.id);
}
