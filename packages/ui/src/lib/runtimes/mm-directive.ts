// `@mm` metronome directive — read/write helpers that keep the transport BPM and
// the scene's `@mm:<n>` in sync (Romain: changing the top tempo must change the
// scene's @mm, and vice versa). Pure string ops so they're trivially testable and
// reused by both directions of the binding.
//
// The corpus writes `@mm:70` (integer); we match an optional decimal defensively
// but write back a rounded integer so the rewritten directive stays valid BPScript.

const MM_RE = /(@mm\s*:\s*)(\d+(?:\.\d+)?)/;

/** The `@mm` value declared in the source, or null when none is present. */
export function parseMmDirective(text: string): number | null {
  const m = MM_RE.exec(text);
  if (!m) return null;
  const n = Number.parseFloat(m[2]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rewrite the `@mm` value to `bpm` (rounded), preserving the rest of the line.
 * Returns the text UNCHANGED when there is no `@mm` directive — we never inject
 * one (a scene without a metronome isn't given a surprise tempo line).
 */
export function writeMmDirective(text: string, bpm: number): string {
  if (!MM_RE.test(text)) return text;
  return text.replace(MM_RE, `$1${Math.round(bpm)}`);
}
