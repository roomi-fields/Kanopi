import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Runtime } from '../../lib/core-mock';

/**
 * Each runtime has a "signature" color (matching the file-tree dot + tab dot)
 * and a coherent palette around it.
 */

const kanopi = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--amber)', fontWeight: '500' },
  { tag: t.comment, color: 'var(--text-faint)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--green)' },
  { tag: t.number, color: 'var(--cyan)' },
  { tag: t.atom, color: 'var(--tidal)' },
  { tag: t.propertyName, color: 'var(--hydra)' },
  { tag: t.variableName, color: 'var(--text)' },
  { tag: t.definition(t.variableName), color: 'var(--amber-soft)', fontWeight: '500' },
  { tag: t.bracket, color: 'var(--text-dim)' },
  { tag: t.invalid, color: 'var(--red)' }
]);

const tidalStrudel = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--tidal)', fontWeight: '500' },
  { tag: t.comment, color: 'var(--text-faint)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--green)' },
  { tag: t.number, color: 'var(--amber-soft)' },
  { tag: t.operator, color: 'var(--tidal)' },
  { tag: t.function(t.variableName), color: 'var(--tidal)' },
  { tag: t.propertyName, color: 'var(--hydra)' },
  { tag: t.variableName, color: 'var(--text)' },
  { tag: t.definition(t.variableName), color: 'var(--amber-soft)' },
  { tag: t.bool, color: 'var(--cyan)' },
  { tag: t.bracket, color: 'var(--text-dim)' },
  { tag: t.punctuation, color: 'var(--text-dim)' },
  { tag: t.invalid, color: 'var(--red)' }
]);

const hydra = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--hydra)', fontWeight: '500' },
  { tag: t.comment, color: 'var(--text-faint)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--green)' },
  { tag: t.number, color: 'var(--cyan)' },
  { tag: t.operator, color: 'var(--hydra)' },
  { tag: t.function(t.variableName), color: 'var(--hydra)' },
  { tag: t.propertyName, color: 'var(--amber)' },
  { tag: t.variableName, color: 'var(--text)' },
  { tag: t.definition(t.variableName), color: 'var(--amber-soft)' },
  { tag: t.bool, color: 'var(--cyan)' },
  { tag: t.bracket, color: 'var(--text-dim)' },
  { tag: t.invalid, color: 'var(--red)' }
]);

const jsStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--cyan)', fontWeight: '500' },
  { tag: t.comment, color: 'var(--text-faint)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--green)' },
  { tag: t.number, color: 'var(--amber-soft)' },
  { tag: t.operator, color: 'var(--text-muted)' },
  { tag: t.function(t.variableName), color: 'var(--cyan)' },
  { tag: t.propertyName, color: 'var(--text)' },
  { tag: t.variableName, color: 'var(--text)' },
  { tag: t.definition(t.variableName), color: 'var(--amber)' },
  { tag: t.bool, color: 'var(--amber-soft)' },
  { tag: t.bracket, color: 'var(--text-dim)' },
  { tag: t.invalid, color: 'var(--red)' }
]);

const py = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--python)', fontWeight: '500' },
  { tag: t.comment, color: 'var(--text-faint)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--green)' },
  { tag: t.number, color: 'var(--amber-soft)' },
  { tag: t.operator, color: 'var(--text-muted)' },
  { tag: t.function(t.variableName), color: 'var(--python)' },
  { tag: t.propertyName, color: 'var(--text)' },
  { tag: t.variableName, color: 'var(--text)' },
  { tag: t.definition(t.variableName), color: 'var(--amber)' },
  { tag: t.bool, color: 'var(--cyan)' },
  { tag: t.bracket, color: 'var(--text-dim)' },
  { tag: t.invalid, color: 'var(--red)' }
]);

const sc = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--sc)', fontWeight: '500' },
  { tag: t.comment, color: 'var(--text-faint)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--green)' },
  { tag: t.number, color: 'var(--amber-soft)' },
  { tag: t.operator, color: 'var(--text-muted)' },
  { tag: t.function(t.variableName), color: 'var(--sc)' },
  { tag: t.propertyName, color: 'var(--text)' },
  { tag: t.variableName, color: 'var(--text)' },
  { tag: t.definition(t.variableName), color: 'var(--amber)' },
  { tag: t.bool, color: 'var(--cyan)' },
  { tag: t.bracket, color: 'var(--text-dim)' },
  { tag: t.invalid, color: 'var(--red)' }
]);

export function highlightFor(runtime: Runtime): HighlightStyle {
  switch (runtime) {
    case 'kanopi': return kanopi;
    case 'tidal':
    case 'strudel': return tidalStrudel;
    case 'hydra': return hydra;
    case 'js': return jsStyle;
    case 'python': return py;
    case 'sc': return sc;
    default: return kanopi;
  }
}
