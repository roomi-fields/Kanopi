import { describe, it, expect } from 'vitest';
import { writeMmDirective } from './mm-directive';

describe('mm-directive — transport BPM → scene @mm write-back', () => {
  it('rewrites the @mm value (rounded) and preserves the rest', () => {
    const src = '@core\n@mm:70\n\nSayr -> rast dukah';
    expect(writeMmDirective(src, 92)).toBe('@core\n@mm:92\n\nSayr -> rast dukah');
    // fractional BPM (TAP) → rounded integer so the directive stays valid
    expect(writeMmDirective(src, 91.6)).toContain('@mm:92');
  });

  it('never injects an @mm when the scene declares none', () => {
    const src = '@core\nS -> a';
    expect(writeMmDirective(src, 120)).toBe(src);
  });

  it('rounds a fractional BPM when writing back', () => {
    expect(writeMmDirective('@mm:70', 133.4)).toBe('@mm:133');
  });
});
