import { csdLanguage } from '@hlolli/codemirror-lang-csound';
import type { Runtime } from '../core-mock';

/**
 * Extract the "current block" around a cursor offset.
 *
 * Runtime-aware:
 * - `csound` uses the upstream Lezer AST (ADAPTER_SPEC §5.3 case (a))
 *   to find the enclosing `InstrumentDeclaration` / `UdoDeclaration`,
 *   or isolates a single score event line inside `<CsScore>…</CsScore>`.
 * - All other runtimes fall back to paragraph-based extraction (blank-
 *   line delimiters), which is the v1 convention shared by Strudel,
 *   Tidal, Hydra, SC, JS.
 *
 * If `from !== to`, the user has an explicit selection — it wins over
 * any block detection.
 */
export function extractBlock(
  doc: string,
  from: number,
  to: number,
  runtime?: Runtime
): string {
  if (from !== to) return doc.slice(from, to);

  if (runtime === 'csound') {
    const hit = extractCsoundAtCursor(doc, from);
    if (hit !== null) return hit;
    // Cursor is outside any known Csound structure (preamble tag,
    // `<CsInstruments>` header, blank area between blocks). Interpret
    // as "eval whole file" — the first Ctrl+Enter boots the engine
    // from anywhere on the file, and a re-eval from non-block area
    // recompiles the CSD in its entirety (idempotent).
    return doc;
  }

  return extractByParagraph(doc, from);
}

function extractByParagraph(doc: string, cursor: number): string {
  const lines = doc.split('\n');
  let pos = 0;
  let line = 0;
  for (; line < lines.length; line++) {
    const lineEnd = pos + lines[line].length;
    if (cursor <= lineEnd) break;
    pos = lineEnd + 1;
  }
  if (line >= lines.length) line = lines.length - 1;

  if (lines[line].trim() === '') {
    let probe = line - 1;
    while (probe >= 0 && lines[probe].trim() === '') probe--;
    if (probe < 0) return '';
    line = probe;
  }

  let start = line;
  while (start > 0 && lines[start - 1].trim() !== '') start--;
  let end = line;
  while (end < lines.length - 1 && lines[end + 1].trim() !== '') end++;

  return lines.slice(start, end + 1).join('\n');
}

/**
 * Walk the Csound AST to find the innermost structural block containing
 * the cursor. Returns null when the cursor is outside any recognized
 * block (preamble, between sections, etc.) so the caller can fall
 * back to paragraph extraction.
 */
function extractCsoundAtCursor(doc: string, cursor: number): string | null {
  const tree = csdLanguage.parser.parse(doc);
  let hit: { from: number; to: number } | null = null;
  let scoreRegion: { from: number; to: number } | null = null;

  tree.iterate({
    enter(node) {
      if (node.from <= cursor && cursor <= node.to) {
        if (
          node.name === 'InstrumentDeclaration' ||
          node.name === 'UdoDeclaration'
        ) {
          hit = { from: node.from, to: node.to };
          return false;
        }
      }
      if (node.name === 'XmlCsScoreOpen') {
        scoreRegion = { from: node.to, to: doc.length };
      }
      if (node.name === 'XmlCsScoreClose' && scoreRegion) {
        scoreRegion = { from: scoreRegion.from, to: node.from };
      }
    }
  });

  if (hit) {
    const h = hit as { from: number; to: number };
    return doc.slice(h.from, h.to);
  }

  // Cursor might be inside <CsScore>. If so, extract the single line
  // under the cursor — each score event is meant to be fired independently.
  if (scoreRegion) {
    const region: { from: number; to: number } = scoreRegion;
    if (cursor >= region.from && cursor <= region.to) {
      // Find the line start/end around the cursor
      let lineStart = cursor;
      while (lineStart > region.from && doc[lineStart - 1] !== '\n') lineStart--;
      let lineEnd = cursor;
      while (lineEnd < region.to && doc[lineEnd] !== '\n') lineEnd++;
      const line = doc.slice(lineStart, lineEnd).trim();
      // Ignore blank lines and comments — caller will fall back to paragraph.
      if (line && !line.startsWith(';') && !line.startsWith('/*')) {
        return doc.slice(lineStart, lineEnd);
      }
    }
  }

  return null;
}
