export { Dispatcher, coerceControlValues } from './dispatcher/dispatcher.js';
export { Resolver } from './dispatcher/resolver.js';
export { resolveScaleRatios } from './dispatcher/scale.js';
// Audio output + CV rendering moved OUT of core to the `runtime-audio` package
// (RA-6): `WebAudioTransport`/`renderCVCurve` (webaudio.js + cv-curve.js) deleted.
