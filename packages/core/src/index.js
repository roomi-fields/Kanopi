// `packages/core` is now EMPTY of live exports. The Dispatcher (per-name transport
// registry + `coerceControlValues`) was the last resident — an inert post-Kronos-
// migration husk with zero live callers (verified exhaustively) — and was deleted
// outright. Pitch resolution + scale ratios live in `@kronos/core/pitch` (RA-6);
// audio output + CV rendering + control-value coercion live in `runtime-audio`.
// resolver.js / scale.js / ratios.js / webaudio.js / cv-curve.js / dispatcher.js
// are all DELETED. Kept as a package boundary in case a future host-side glue
// concern needs a home here.
export {};
