// Fail-loud DERIVATION status of the last eval attempt, per file. The compile
// chip (TabBar) folds this INTO its parse status so a scene that PARSES but fails
// to DERIVE (e.g. a pitch that cannot resolve — mohanam.bps, msg [598]) reads red
// instead of a misleading green "compiles".
//
// This is a PROJECTION of the eval pipeline's outcome: the host RECORDS what BPx's
// `derive()` threw at eval/produce/play time (blocks.svelte.ts). It does NOT
// re-derive to compute the status — deriving is BPx's job, triggered ONCE by the
// eval path, never by the host for display. A word the pipeline never attempted is
// simply unknown (null), never invented.
//
// STALENESS GUARD: the outcome is keyed by the exact content that was derived. When
// the user edits, the current content no longer matches the recorded snapshot, so
// `for()` returns null and the chip falls back to parse-only — honest ("parses;
// derivation not re-checked since the edit"), never a stale red. The next
// produce/play refreshes it.

export interface DeriveError {
  message: string;
  line?: number;
}

interface DeriveOutcome {
  /** The exact file content this outcome was derived from (staleness guard). */
  content: string;
  ok: boolean;
  error?: DeriveError;
}

class DeriveStatusStore {
  #byFile = $state<Record<string, DeriveOutcome>>({});

  /** Record the derivation outcome of one eval attempt of `fileId`'s `content`. */
  report(fileId: string, content: string, ok: boolean, error?: DeriveError) {
    this.#byFile = { ...this.#byFile, [fileId]: { content, ok, error } };
  }

  /** The recorded outcome for `fileId` IFF it matches `content` (else null: stale
   *  or never attempted). Reactive — reads `#byFile`, so `$derived` consumers
   *  re-run when a new eval reports. */
  for(fileId: string | null | undefined, content: string | undefined): DeriveOutcome | null {
    if (!fileId || content === undefined) return null;
    const o = this.#byFile[fileId];
    if (!o || o.content !== content) return null;
    return o;
  }
}

export const deriveStatus = new DeriveStatusStore();
