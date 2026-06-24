// `@mm` metronome directive — write helper that pushes the transport BPM back into
// the scene's `@mm:<n>` (Romain: changing the top tempo must change the scene's @mm).
// The read direction lives in the compiled AST (`mmFromAst` in bpx-adapter); this is
// the write-back only. Pure string op so it's trivially testable.
//
// The corpus writes `@mm:70` (integer); we match an optional decimal defensively
// but write back a rounded integer so the rewritten directive stays valid BPScript.

const MM_RE = /(@mm\s*:\s*)(\d+(?:\.\d+)?)/;

/**
 * Rewrite the `@mm` value to `bpm` (rounded), preserving the rest of the line.
 * Returns the text UNCHANGED when there is no `@mm` directive — we never inject
 * one (a scene without a metronome isn't given a surprise tempo line).
 */
export function writeMmDirective(text: string, bpm: number): string {
  if (!MM_RE.test(text)) return text;
  return text.replace(MM_RE, `$1${Math.round(bpm)}`);
}
