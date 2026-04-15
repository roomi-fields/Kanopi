import { describe, it, expect } from 'vitest';
import { extractBlock } from './extract-block';

describe('extractBlock', () => {
  it('returns selection verbatim when from !== to', () => {
    const doc = 'one\ntwo\nthree';
    expect(extractBlock(doc, 0, 7)).toBe('one\ntwo');
  });

  it('extracts paragraph around cursor', () => {
    const doc = 'block A\nline 2\n\nblock B\nline 4\n\nblock C';
    // cursor in block B (offset on "block B")
    const cursor = doc.indexOf('block B') + 2;
    expect(extractBlock(doc, cursor, cursor)).toBe('block B\nline 4');
  });

  it('returns first block at start of doc', () => {
    const doc = 'a\nb\n\nc';
    expect(extractBlock(doc, 0, 0)).toBe('a\nb');
  });

  it('returns last block at end of doc', () => {
    const doc = 'a\n\nlast';
    expect(extractBlock(doc, doc.length, doc.length)).toBe('last');
  });

  it('returns empty when cursor on blank line', () => {
    const doc = 'a\n\nb';
    expect(extractBlock(doc, 2, 2)).toBe('');
  });

  it('handles single-line doc', () => {
    expect(extractBlock('hello', 2, 2)).toBe('hello');
  });

  it('handles empty doc', () => {
    expect(extractBlock('', 0, 0)).toBe('');
  });
});
