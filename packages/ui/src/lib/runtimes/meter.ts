// Meter (time signature) READ from BPx's derivation authority — never invented here.
//
// BPx resolves the scene's meter and exposes it on the derivation root as
// `DeriveResult.meter` (`{ numerators, denom }`, commit a60f031). The host READS it
// and PROJECTS a beats-per-bar onto the transport readout + the beat LEDs; it does
// not fabricate one (CLAUDE.md: anything the host invents is a bug). When no
// `[meter:…]` is declared the field is ABSENT and the documented default 4 stands
// (4/4 unchanged) — a fallback, not an authority.

/** Resolved meter signature as graven on `DeriveResult.meter` (structural — avoids
 *  coupling to BPx's exported type at the import site). `numerators` are the per-bar
 *  beat lengths (additive, e.g. `3+2/8` → `[3, 2]`); `denom` is the `/M` unit. */
export interface MeterLike {
  readonly numerators: readonly number[];
  readonly denom: number;
}

/** The documented fallback beats-per-bar when no meter is declared (4/4 unchanged).
 *  The SINGLE source of this default — the former triplicated `BEATS_PER_BAR = 4`. */
export const DEFAULT_BEATS_PER_BAR = 4;

/**
 * Beats-per-bar PROJECTED from the resolved meter for the transport's single-integer
 * bar fold (Kronos `beatPosition`/`absoluteBeatPosition` take one `beatsPerBar`).
 *
 *   • absent / empty  → `DEFAULT_BEATS_PER_BAR` (no meter declared → 4/4 unchanged).
 *   • uniform `[N]` / `[N, N, …]` → `N` (a repeating bar of N beats: `7/8`→7, `4+4+4`→4).
 *   • additive `[a, b, …]` (differing) → the cycle length `sum(a, b, …)`.
 *
 * LIMIT (additive): a single integer cannot express the per-bar cumsum subdivision of
 * an additive group (`3+2` as a 3-bar then a 2-bar). The cycle DOWNBEAT is correct;
 * the inner secondary bar line is not projected — Kronos folds bar/beat on one integer.
 */
export function beatsPerBarFromMeter(meter?: MeterLike | null): number {
  const nums = meter?.numerators;
  if (!nums || nums.length === 0) return DEFAULT_BEATS_PER_BAR;
  const first = nums[0];
  if (nums.every((n) => n === first)) return first > 0 ? first : DEFAULT_BEATS_PER_BAR;
  const sum = nums.reduce((a, b) => a + b, 0);
  return sum > 0 ? sum : DEFAULT_BEATS_PER_BAR;
}
