import type { Pos, Range, Token } from './ast';

/** Walk a source string into per-line token arrays + line ranges. */
export interface LineToks {
  line: number; // 1-based
  startOffset: number;
  text: string; // raw line (without trailing \n)
  tokens: Token[]; // tokens with positions
  comment?: Token; // trailing # comment if any
}

const TOKEN_RE = /\S+/g;

export function lex(source: string): LineToks[] {
  const out: LineToks[] = [];
  let line = 1;
  let offset = 0;

  for (const raw of source.split('\n')) {
    const startOffset = offset;
    const text = raw;
    let body = raw;

    // Strip trailing inline comment.
    let comment: Token | undefined;
    const commentIdx = indexOfUnquoted(raw, '#');
    if (commentIdx >= 0) {
      const cText = raw.slice(commentIdx);
      const start: Pos = { line, col: commentIdx + 1, offset: startOffset + commentIdx };
      const end: Pos = { line, col: commentIdx + 1 + cText.length, offset: startOffset + commentIdx + cText.length };
      comment = { text: cText, range: { start, end } };
      body = raw.slice(0, commentIdx);
    }

    const tokens: Token[] = [];
    TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_RE.exec(body)) !== null) {
      const t = m[0];
      const col = m.index + 1;
      const start: Pos = { line, col, offset: startOffset + m.index };
      const end: Pos = { line, col: col + t.length, offset: startOffset + m.index + t.length };
      tokens.push({ text: t, range: { start, end } });
    }

    out.push({ line, startOffset, text, tokens, comment });
    offset = startOffset + raw.length + 1; // +1 for the \n
    line++;
  }
  return out;
}

/** Build a Range that spans from the first to the last of a list of tokens (or a fallback). */
export function spanOf(tokens: Token[], fallback: Range): Range {
  if (!tokens.length) return fallback;
  return { start: tokens[0].range.start, end: tokens[tokens.length - 1].range.end };
}

/** Range covering an entire line. */
export function lineRange(l: LineToks): Range {
  return {
    start: { line: l.line, col: 1, offset: l.startOffset },
    end: { line: l.line, col: l.text.length + 1, offset: l.startOffset + l.text.length }
  };
}

function indexOfUnquoted(s: string, ch: string): number {
  // Simple implementation: no quoting in v0.1, so just indexOf.
  return s.indexOf(ch);
}
