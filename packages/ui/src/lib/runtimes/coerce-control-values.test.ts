import { describe, it, expect } from 'vitest';
import { coerceControlValues } from '../../../../core/src/dispatcher/dispatcher.js';

// C8 — `coerceControlValues` must coerce numeric-looking control strings to
// numbers (plain decimals AND scientific notation, incl. negative exponents
// computed by CV), while leaving non-numeric / special-word / empty strings as
// strings so the runtime never silently retypes e.g. `wave:'sawtooth'`.
describe('coerceControlValues', () => {
  it('coerces plain decimal strings to numbers', () => {
    expect(coerceControlValues({ vel: '80' })).toEqual({ vel: 80 });
    expect(coerceControlValues({ q: '2.5' })).toEqual({ q: 2.5 });
    expect(coerceControlValues({ pan: '-0.3' })).toEqual({ pan: -0.3 });
    expect(coerceControlValues({ a: '.5' })).toEqual({ a: 0.5 });
  });

  it('coerces scientific-notation strings to numbers', () => {
    expect(coerceControlValues({ cutoff: '1e3' })).toEqual({ cutoff: 1000 });
    expect(coerceControlValues({ g: '2.5e-1' })).toEqual({ g: 0.25 });
    expect(coerceControlValues({ h: '1E2' })).toEqual({ h: 100 });
    expect(coerceControlValues({ i: '+3e+2' })).toEqual({ i: 300 });
  });

  it('leaves non-numeric / special / empty strings as strings', () => {
    expect(coerceControlValues({ wave: 'sawtooth' })).toEqual({ wave: 'sawtooth' });
    expect(coerceControlValues({ x: '' })).toEqual({ x: '' });
    expect(coerceControlValues({ x: '   ' })).toEqual({ x: '   ' });
    expect(coerceControlValues({ x: 'NaN' })).toEqual({ x: 'NaN' });
    expect(coerceControlValues({ x: 'Infinity' })).toEqual({ x: 'Infinity' });
    expect(coerceControlValues({ x: '0x10' })).toEqual({ x: '0x10' });
    expect(coerceControlValues({ x: '1e' })).toEqual({ x: '1e' });
  });

  it('passes through non-string values and handles null/undefined', () => {
    expect(coerceControlValues({ n: 42 })).toEqual({ n: 42 });
    expect(coerceControlValues(null)).toEqual({});
    expect(coerceControlValues(undefined)).toEqual({});
  });
});
