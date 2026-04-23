import { EditorView } from '@codemirror/view';
import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// A Strudel `.s("sine")` and a Hydra `.modulate(...)` are both method calls in
// JS-parser terms, tagged `propertyName` — not `function(variableName)` (that's
// only for standalone calls like `note(...)` / `osc(...)`). Tying propertyName
// and function to the same color keeps every callable one visual class, which
// matters in Strudel/Hydra where 90% of code is chained methods. The cost is
// that non-callable properties (rare in live-coding code) also land on this
// color — acceptable tradeoff for the vision principle 5 ("a function is the
// same color everywhere").
export const kanopiHighlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--amber)', fontWeight: '500' },
  { tag: t.comment, color: 'var(--text-faint)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--green)' },
  { tag: t.number, color: 'var(--cyan)' },
  { tag: t.atom, color: 'var(--tidal)' },
  { tag: t.operator, color: 'var(--text-muted)' },
  { tag: [t.propertyName, t.function(t.variableName)], color: 'var(--sc)' },
  { tag: t.variableName, color: 'var(--text)' },
  { tag: t.definition(t.variableName), color: 'var(--amber-soft)', fontWeight: '500' },
  { tag: t.bool, color: 'var(--cyan)' },
  { tag: t.invalid, color: 'var(--red)' },
  { tag: t.bracket, color: 'var(--text-dim)' },
  { tag: t.punctuation, color: 'var(--text-dim)' }
]);

export const kanopiTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font-code)',
      fontSize: '13px'
    },
    '.cm-content': {
      // padding-left = 0 is intentional: anything > 0 becomes a
      // zone where CM6 draws a thin selection rectangle for every
      // line break, visually bleeding into the next line on
      // full-line selections (triple-click). The breathing room
      // between gutter and code is moved onto the gutter itself
      // via `padding-right` below.
      padding: '14px 8px 14px 0',
      caretColor: 'var(--amber)'
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-code)',
      lineHeight: '1.55'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--panel)',
      color: 'var(--text-faint)',
      borderRight: '1px solid var(--border-dim)',
      // Breathing room on the gutter side so digits don't touch the
      // code. Lives here (not on .cm-content) to avoid the selection
      // bleed described above.
      paddingRight: '6px'
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.025)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(232, 156, 62, 0.05)', color: 'var(--amber)' },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(232, 156, 62, 0.18) !important'
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--amber)' },
    '.cm-tooltip': {
      backgroundColor: 'var(--elevated)',
      border: '1px solid var(--border)',
      color: 'var(--text)'
    },
    '.cm-searchMatch': { backgroundColor: 'rgba(232, 156, 62, 0.15)' }
  },
  { dark: true }
);

// Unscoped rules — these target DOM that CM6 places outside the editor scope
// (completion tooltips) or tokens injected by our mini-notation overlay.
export const kanopiGlobalStyles = EditorView.baseTheme({
  '.cm-completionInfo': {
    padding: '0 !important',
    maxWidth: '420px',
    background: 'var(--elevated)',
    border: '1px solid var(--border)',
    color: 'var(--text)'
  },
  '.autocomplete-info-container': {
    padding: '0',
    margin: '0',
    whiteSpace: 'normal !important'
  },
  '.autocomplete-info-tooltip': {
    padding: '10px 12px',
    lineHeight: '1.5',
    whiteSpace: 'normal !important',
    // Collapse whitespace text nodes that sit between block sections.
    fontSize: '0'
  },
  '.autocomplete-info-tooltip > *, .autocomplete-info-tooltip > * *': {
    fontSize: '11.5px'
  },
  '.autocomplete-info-function-name': {
    margin: '0 0 2px',
    fontSize: '13px',
    color: 'var(--amber)',
    fontWeight: '600',
    letterSpacing: '0.04em'
  },
  '.autocomplete-info-function-synonyms': {
    margin: '0 0 6px',
    color: 'var(--text-muted)',
    fontSize: '10.5px',
    fontStyle: 'italic'
  },
  '.autocomplete-info-function-description': { margin: '0 0 6px' },
  '.autocomplete-info-function-description p': { margin: '0' },
  '.autocomplete-info-section-title': {
    margin: '8px 0 3px',
    fontSize: '10px',
    color: 'var(--amber-soft)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontWeight: '500'
  },
  '.autocomplete-info-params-list': {
    margin: '0',
    padding: '0',
    listStyle: 'none'
  },
  '.autocomplete-info-param-item': {
    margin: '0 0 4px',
    padding: '0'
  },
  '.autocomplete-info-param-name': {
    color: 'var(--cyan)',
    fontWeight: '500',
    marginRight: '6px'
  },
  '.autocomplete-info-param-type': {
    color: 'var(--text-muted)',
    fontSize: '10.5px'
  },
  '.autocomplete-info-param-desc': {
    color: 'var(--text-dim)',
    fontSize: '10.5px',
    marginTop: '1px'
  },
  '.autocomplete-info-example-code': {
    margin: '3px 0 0',
    padding: '5px 7px',
    background: 'var(--bg)',
    borderRadius: '2px',
    fontFamily: 'var(--font-code)',
    fontSize: '11px',
    whiteSpace: 'pre-wrap',
    color: 'var(--text)'
  },
  '.autocomplete-info-examples-section, .autocomplete-info-params-section': {
    margin: '0'
  },
  '.cm-mini-op, .cm-mini-op > *': { color: 'var(--amber) !important', fontWeight: '500' },
  '.cm-mini-rest, .cm-mini-rest > *': { color: 'var(--text-faint) !important' },
  '.cm-mini-num, .cm-mini-num > *': { color: 'var(--cyan) !important' },
  '.cm-mini-bracket, .cm-mini-bracket > *': { color: 'var(--text-muted) !important' },
  '.cm-lintRange-error': {
    backgroundImage: 'linear-gradient(135deg, transparent 40%, rgba(200, 50, 50, 0.9) 40%, rgba(200, 50, 50, 0.9) 60%, transparent 60%)',
    backgroundRepeat: 'repeat-x',
    backgroundSize: '6px 2px',
    backgroundPosition: 'left bottom',
    paddingBottom: '1px'
  },
  '.cm-lintRange-warning': {
    backgroundImage: 'linear-gradient(135deg, transparent 40%, rgba(232, 156, 62, 0.8) 40%, rgba(232, 156, 62, 0.8) 60%, transparent 60%)',
    backgroundRepeat: 'repeat-x',
    backgroundSize: '6px 2px',
    backgroundPosition: 'left bottom',
    paddingBottom: '1px'
  },
  '.cm-diagnostic': {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    padding: '6px 10px',
    background: 'var(--elevated)',
    borderLeft: '3px solid var(--red)',
    color: 'var(--text)'
  },
  '.cm-diagnostic-warning': { borderLeftColor: 'var(--amber)' },
  '.cm-diagnostic-error': { borderLeftColor: 'var(--red)' },
  '.cm-lint-marker': { width: '10px', height: '10px' },
  '.cm-lint-marker-error': { color: 'var(--red)' },
  '.cm-lint-marker-warning': { color: 'var(--amber)' }
});
