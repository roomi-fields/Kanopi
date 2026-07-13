// Scene catalogue — sourced ENTIRELY from the real filesystem (Romain
// 2026-07-13: no invented classification in code). Two facts, both read off
// disk, never authored in TypeScript:
//   - category = the REAL directory a scene file lives in, under
//     packages/library/scenes/<category>/<file>.{bps,gr}.
//   - card metadata (name, tagline, description, language, outputs, level,
//     tags, showcase, order) = a `// @key: value` header parsed from the
//     TOP of the file itself (decision: metadata lives IN the file, visible
//     to whoever opens it — not a parallel table).
// This replaces the former starters.ts (hand-authored STARTER array) +
// items.ts (STARTER_AXES table) + demos.ts (manifest/CURATED merge table).
import type { LibraryItem, OutputKind, Level } from './catalog';

const raw = import.meta.glob('../../../../library/scenes/**/*.{bps,gr}', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>;

function categoryFromPath(p: string): string {
  const parts = p.split('/');
  const idx = parts.lastIndexOf('scenes');
  return parts[idx + 1];
}

interface ParsedHeader {
  name?: string;
  tagline?: string;
  description?: string;
  language?: string;
  outputs?: string;
  level?: string;
  tags?: string;
  showcase?: boolean;
  order?: string;
}

const HEADER_LINE = /^\/\/\s*@([a-zA-Z]+):?\s*(.*)$/;

/** Reads the leading `//` comment run at the top of a scene file and pulls out
 * any `@key: value` pairs it carries. Stops at the first non-comment,
 * non-blank line — comments deeper in the file (e.g. a `.gr`'s `COMMENT:`
 * section) are never scanned. */
function parseHeader(text: string): ParsedHeader {
  const out: ParsedHeader = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (!trimmed.startsWith('//')) break;
    const m = HEADER_LINE.exec(trimmed);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    const KNOWN = [
      'name',
      'tagline',
      'description',
      'language',
      'outputs',
      'level',
      'tags',
      'order'
    ];
    if (key === 'showcase') {
      out.showcase = true;
    } else if (KNOWN.includes(key)) {
      (out as Record<string, string>)[key] = value;
    }
  }
  return out;
}

// Defensive fallback ONLY — every bundled scene ships a complete header, this
// covers a scene added by hand without one rather than crashing the browser.
const FALLBACK = {
  language: 'bpscript',
  outputs: ['audio'] as OutputKind[],
  level: 'intermediate' as Level
};

export const LIBRARY_ITEMS: LibraryItem[] = Object.entries(raw).map(([p, contents]) => {
  const category = categoryFromPath(p);
  const file = p.split('/').pop()!;
  const h = parseHeader(contents);
  const outputs = (
    h.outputs ? h.outputs.split(',').map((s) => s.trim()) : FALLBACK.outputs
  ) as OutputKind[];
  const tags = h.tags
    ? h.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return {
    id: `${category}/${file}`,
    name: h.name ?? file,
    tagline: h.tagline ?? '',
    description: h.description ?? '',
    category,
    language: h.language ?? FALLBACK.language,
    outputs,
    level: (h.level as Level) ?? FALLBACK.level,
    tags,
    showcase: h.showcase,
    order: h.order !== undefined ? Number(h.order) : undefined,
    sessionFile: file,
    files: [{ path: file, contents }]
  };
});
