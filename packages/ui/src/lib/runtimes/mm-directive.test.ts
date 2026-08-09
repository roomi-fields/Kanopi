import { describe, it, expect } from 'vitest';
import { writeMmDirective } from './mm-directive';

describe('mm-directive — transport BPM → scene tempo write-back', () => {
  // ⛔ VERROU RETOURNÉ LE 2026-08-09 — ce cas vérifiait que `@mm` était RÉÉCRIT ; il vérifie
  // maintenant qu'il ne l'est PLUS. `@mm` est sorti du langage (bpscript fa037e8) et la branche
  // qui le reconnaissait est partie avec.
  // POURQUOI RETOURNÉ ET NON SUPPRIMÉ : si quelqu'un ré-ajoutait la branche « pour être
  // tolérant », plus rien ne le dirait — une tolérance se ré-installe toujours par gentillesse.
  // Ce cas rougit si elle revient.
  // ET LA SCÈNE RESTE INTACTE, c'est le point : on ne réécrit pas une directive qu'on ne
  // reconnaît plus, on n'y touche pas du tout. Une scène périmée n'est pas silencieusement
  // « réparée » à moitié par un write-back.
  it('NE réécrit PLUS @mm, sorti du langage — et laisse la scène intacte', () => {
    const src = '@core\n@mm:70\n\nSayr -> rast dukah';
    expect(writeMmDirective(src, 92)).toBe(src);
    expect(writeMmDirective(src, 91.6)).not.toContain('@mm:92');
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
    expect(writeMmDirective('@tempo:70', 133.4)).toBe('@tempo:133');
  });
});
