// Meter (time signature) READ from BPx's derivation authority — never invented here.
//
// BPx resolves the scene's meter and exposes it on the derivation root as
// `DeriveResult.meter` (`{ numerators, denom, cycleBeats }`, commits a60f031 + fe33ab0).
// The host READS the ALREADY-RESOLVED `cycleBeats` (the folded cycle length) and hands it
// straight to Kronos's single-integer bar fold — it no longer SUMS the numerators itself
// (that resolution moved UP to BPx, décision archi 2026-07-01 option b : « BPx expose la
// longueur de cycle repliée en facette »). When no `[meter:…]` is declared the field is
// ABSENT and the documented default 4 stands (4/4 unchanged) — a fallback, not an authority.

/** Resolved meter facette as graven on `DeriveResult.meter` (structural — avoids coupling to
 *  BPx's exported type at the import site). `cycleBeats` = the folded cycle length in beats,
 *  RÉSOLU par BPx (uniforme `7/8`→7 ; additif `3+2/8`→5). C'est le seul champ que l'hôte lit. */
export interface MeterLike {
  readonly cycleBeats: number;
}

/** The documented fallback beats-per-bar when no meter is declared (4/4 unchanged).
 *  The SINGLE source of this default — the former triplicated `BEATS_PER_BAR = 4`. */
export const DEFAULT_BEATS_PER_BAR = 4;
