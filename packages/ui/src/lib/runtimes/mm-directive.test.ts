import { describe, it, expect } from 'vitest';
import { writeMmDirective } from './mm-directive';

describe('mm-directive — transport BPM → scene tempo write-back', () => {
  it('rewrites the @mm value (rounded) and preserves the rest', () => {
    const src = '@core\n@mm:70\n\nSayr -> rast dukah';
    expect(writeMmDirective(src, 92)).toBe('@core\n@mm:92\n\nSayr -> rast dukah');
    // fractional BPM (TAP) → rounded integer so the directive stays valid
    expect(writeMmDirective(src, 91.6)).toContain('@mm:92');
  });

  it('rewrites the v0.8 canon @tempo value and preserves the keyword', () => {
    const src = '@core\n@tempo:120\n\nlead -> `note("a4")`';
    // @tempo is rewritten (F13), and stays @tempo — the keyword is never converted to @mm
    expect(writeMmDirective(src, 90)).toBe('@core\n@tempo:90\n\nlead -> `note("a4")`');
    expect(writeMmDirective(src, 90)).not.toContain('@mm');
    // fractional BPM rounds
    expect(writeMmDirective('@tempo:120', 133.4)).toBe('@tempo:133');
  });

  it('never injects a tempo directive when the scene declares none', () => {
    const src = '@core\nS -> a';
    expect(writeMmDirective(src, 120)).toBe(src);
  });

  it('rounds a fractional BPM when writing back', () => {
    expect(writeMmDirective('@mm:70', 133.4)).toBe('@mm:133');
  });
});
