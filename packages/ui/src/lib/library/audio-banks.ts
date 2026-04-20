import catalogJson from './audio-banks/catalog.json';

export interface AudioBank {
  id: string;
  name: string;
  description: string;
  /**
   * Source as accepted by Strudel's `samples(source)`:
   *  - `github:user/repo` (canonical, auto-fetches the repo's strudel.json)
   *  - `github:user/repo/branch`
   *  - `https://.../strudel.json` (explicit manifest URL)
   */
  source: string;
  tags?: string[];
}

export interface AudioBankCatalog {
  schemaVersion: number;
  banks: AudioBank[];
}

/** Parsed catalog, loaded at build-time from catalog.json. Source of truth. */
export const catalog: AudioBankCatalog = catalogJson as AudioBankCatalog;

/** Look up a bank by id. */
export function findBank(id: string): AudioBank | undefined {
  return catalog.banks.find((b) => b.id === id);
}

/** Every bank id in the catalog (for diagnostics / autocomplete). */
export function bankIds(): string[] {
  return catalog.banks.map((b) => b.id);
}
