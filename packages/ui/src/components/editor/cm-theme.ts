import { EditorView } from '@codemirror/view';

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
