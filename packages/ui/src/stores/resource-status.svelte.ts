// Fail-loud RESOURCE-RESOLUTION status of the last eval attempt, per file — signal 2
// of the compile chip's 3-signal health voyant (decision 2026-07-15-voyant-sante-
// niveau3.md). A scene can PARSE and DERIVE cleanly yet declare a `@library.strudel`
// bank the host's catalog doesn't know (Romain's bug: console said "banque inconnue"
// while the chip stayed green) — this store makes that resolution outcome visible to
// the chip instead of console-only.
//
// Same PROJECTION contract as `derive-status.svelte.ts`: the host RECORDS the
// resolution outcome of one eval attempt (checked via `resolveStrudelLibrary`,
// bpx-adapter.ts — the SAME function the real loader uses, single source of truth
// against the `guestLibraries` registry). It never invents a resolution result.
//
// STALENESS GUARD: keyed by the exact content that was checked. An edit invalidates
// the recorded outcome (`for()` returns null) until the next produce/play reports a
// fresh one — never a stale red (or a stale green hiding a newly-broken declaration).

export interface ResourceError {
  message: string;
}

interface ResourceOutcome {
  /** The exact file content this outcome was checked against (staleness guard). */
  content: string;
  ok: boolean;
  errors: ResourceError[];
}

class ResourceStatusStore {
  #byFile = $state<Record<string, ResourceOutcome>>({});

  /** Record the resource-resolution outcome of one eval attempt of `fileId`'s `content`. */
  report(fileId: string, content: string, ok: boolean, errors: ResourceError[] = []) {
    this.#byFile = { ...this.#byFile, [fileId]: { content, ok, errors } };
  }

  /** The recorded outcome for `fileId` IFF it matches `content` (else null: stale
   *  or never attempted). Reactive — reads `#byFile`, so `$derived` consumers
   *  re-run when a new eval reports. */
  for(fileId: string | null | undefined, content: string | undefined): ResourceOutcome | null {
    if (!fileId || content === undefined) return null;
    const o = this.#byFile[fileId];
    if (!o || o.content !== content) return null;
    return o;
  }
}

export const resourceStatus = new ResourceStatusStore();
