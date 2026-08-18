// Tempo directive — write helper that pushes the transport BPM back into the scene's
// metronome line (Romain: changing the top tempo must change the scene's directive).
// UN SEUL NOM depuis le 2026-08-09 : `tempo:<n>`. La branche qui reconnaissait aussi `mm:<n>`
// est partie le jour où bpscript a fermé cette surface (fa037e8) — code voué au retrait à zéro
// appelant légitime, donc retiré dans le même mouvement.
// ⚠️ CE QU'ELLE NE FAISAIT PAS, ET QU'IL FAUT SAVOIR AVANT DE CROIRE À UNE RÉGRESSION : cette
// fonction n'INJECTE jamais de directive, elle réécrit le NOMBRE d'une directive déjà présente.
// Elle n'a donc jamais pu écrire `mm` dans une scène qui ne l'avait pas. Mesuré avant de le dire
// — j'allais signaler une régression de production qui n'existait pas.
// The read direction lives in the compiled AST (`mmFromAst` in bpx-adapter); this is the
// write-back only. Pure string op, trivially testable.
//
// The corpus writes integers; we match an optional decimal defensively but write back a
// rounded integer so the rewritten directive stays valid BPScript.

// ⛔ SANS AROBASE — elle est sortie du langage (décision Romain 2026-08-17), donc la scène écrit
// `tempo:104` en tête de ligne. Le `^` avec le drapeau multiligne est ce qui remplace le préfixe :
// sans lui, ce motif attraperait un `tempo:` écrit en milieu de règle ou dans un commentaire.
const MM_RE = /^(\s*tempo\s*:\s*)(\d+(?:\.\d+)?)/m;

/**
 * Rewrite the `tempo` value to `bpm` (rounded), preserving the rest of the line
 * (including which keyword was used). Returns the text UNCHANGED when there is no tempo
 * directive — we never inject one (a scene without a metronome isn't given a surprise line).
 */
export function writeMmDirective(text: string, bpm: number): string {
  if (!MM_RE.test(text)) return text;
  return text.replace(MM_RE, `$1${Math.round(bpm)}`);
}
