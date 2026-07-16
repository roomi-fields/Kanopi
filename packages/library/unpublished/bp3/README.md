# BP3 grammars — unpublished (out of the UI library)

Decision `hub/decisions/2026-07-16-ui-seulement-grammaires-iso-prouvees.md` [827]:
the UI's BP3 library shows ONLY grammars that are (a) proven iso-native on the
bp3-frontend iso-100 scoreboard (verdict = iso-natif) AND (b) actually play in
Kanopi (RMS > 0 / non-null projection). The showcase grows with the proof, never
ahead of it.

The `.gr` files here were previously visible but are NOT on the iso-proven list
(bp3-frontend baseline 7c5f498). They stay in the repo untouched — headers,
provenance and structure intact — and move back to
`packages/library/scenes/bp3/` the day the scoreboard proves them iso-native
(and they pass the "plays for real" gate).

Their `-se` auxiliary files remain bundled in `scenes/bp3/` (consumed by
`bp3-aux.ts`; auxiliaries-in-libraries ruling [821]).
