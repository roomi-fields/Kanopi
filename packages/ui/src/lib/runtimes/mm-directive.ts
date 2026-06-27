// Tempo directive — write helper that pushes the transport BPM back into the scene's
// metronome line (Romain: changing the top tempo must change the scene's directive).
// Recognises BOTH the v0.8 canon `@tempo:<n>` AND the legacy `@mm:<n>` (decision Romain
// 2026-06-26: « tout migrer en @tempo »); the matched keyword is preserved on rewrite,
// so a `@tempo` scene stays `@tempo` and a `@mm` scene stays `@mm` — we change only the
// number, never the directive name. The read direction lives in the compiled AST
// (`mmFromAst` in bpx-adapter); this is the write-back only. Pure string op, trivially testable.
//
// The corpus writes integers; we match an optional decimal defensively but write back a
// rounded integer so the rewritten directive stays valid BPScript.

const MM_RE = /(@(?:mm|tempo)\s*:\s*)(\d+(?:\.\d+)?)/;

/**
 * Rewrite the `@tempo`/`@mm` value to `bpm` (rounded), preserving the rest of the line
 * (including which keyword was used). Returns the text UNCHANGED when there is no tempo
 * directive — we never inject one (a scene without a metronome isn't given a surprise line).
 */
export function writeMmDirective(text: string, bpm: number): string {
  if (!MM_RE.test(text)) return text;
  return text.replace(MM_RE, `$1${Math.round(bpm)}`);
}
