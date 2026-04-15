/**
 * Extract the "current block" around a cursor offset.
 * A block = consecutive non-empty lines, separated by blank-line boundaries.
 * If `from !== to`, returns the selection verbatim.
 */
export function extractBlock(doc: string, from: number, to: number): string {
  if (from !== to) return doc.slice(from, to);

  const lines = doc.split('\n');
  // find which line the cursor is on
  let pos = 0;
  let line = 0;
  for (; line < lines.length; line++) {
    const lineEnd = pos + lines[line].length;
    if (from <= lineEnd) break;
    pos = lineEnd + 1; // +1 for \n
  }
  if (line >= lines.length) line = lines.length - 1;

  // If cursor is on a blank line, fall back to the nearest non-blank line above.
  if (lines[line].trim() === '') {
    let probe = line - 1;
    while (probe >= 0 && lines[probe].trim() === '') probe--;
    if (probe < 0) return '';
    line = probe;
  }

  // walk up + down
  let start = line;
  while (start > 0 && lines[start - 1].trim() !== '') start--;
  let end = line;
  while (end < lines.length - 1 && lines[end + 1].trim() !== '') end++;

  return lines.slice(start, end + 1).join('\n');
}
