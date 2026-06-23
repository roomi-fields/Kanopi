// Only the dispatcher STRUCTURE (transport/resolver/_actors map Kronos reads) +
// `coerceControlValues` survive in core. Pitch resolution + scale ratios moved to
// `@kronos/core/pitch` (RA-6) ; audio output + CV rendering to `runtime-audio`.
// resolver.js / scale.js / ratios.js / webaudio.js / cv-curve.js are DELETED.
export { Dispatcher, coerceControlValues } from './dispatcher/dispatcher.js';
