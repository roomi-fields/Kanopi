import { describe, it, expect } from 'vitest';
import { parseMmDirective, writeMmDirective } from './mm-directive';

describe('mm-directive — transport BPM ⇆ scene @mm', () => {
  it('parses the declared @mm value', () => {
    expect(parseMmDirective('@core\n@mm:70\n\nS -> a')).toBe(70);
    expect(parseMmDirective('@mm : 128')).toBe(128);
  });

  it('returns null when no @mm is declared', () => {
    expect(parseMmDirective('@core\nS -> a')).toBeNull();
  });

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

  it('round-trips: write then parse returns the rounded value', () => {
    const out = writeMmDirective('@mm:70', 133.4);
    expect(parseMmDirective(out)).toBe(133);
  });
});
