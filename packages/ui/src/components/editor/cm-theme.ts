import { EditorView } from '@codemirror/view';
import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const kanopiHighlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--amber)', fontWeight: '500' },
  { tag: t.comment, color: 'var(--text-faint)', fontStyle: 'italic' },
  { tag: t.string, color: 'var(--green)' },
  { tag: t.number, color: 'var(--cyan)' },
  { tag: t.atom, color: 'var(--tidal)' },
  { tag: t.operator, color: 'var(--text-muted)' },
  { tag: t.propertyName, color: 'var(--hydra)' },
  { tag: t.variableName, color: 'var(--text)' },
  { tag: t.definition(t.variableName), color: 'var(--amber-soft)', fontWeight: '500' },
  { tag: t.function(t.variableName), color: 'var(--sc)' },
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
      padding: '14px 18px',
      caretColor: 'var(--amber)'
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-code)',
      lineHeight: '1.55'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--panel)',
      color: 'var(--text-faint)',
      borderRight: '1px solid var(--border-dim)'
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
