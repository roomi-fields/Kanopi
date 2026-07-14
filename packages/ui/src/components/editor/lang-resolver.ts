import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { csoundMode } from '@hlolli/codemirror-lang-csound';
import type { Runtime } from '../../lib/core-mock';
// BPScript's own CodeMirror 6 language modes (Lezer parser + highlighting),
// consumed AS-IS from the dep — the same modes its web editor uses. `.bps` also
// gets autocompletion sourced from BPScript's `reference.json` (see lang-bpscript).
import { bpscriptLanguage, bp3Language } from 'bpscript/public/editor/bpscript-lang.js';
import { lintGutter } from '@codemirror/lint';
import { bpscriptCompletion, bpscriptExtras } from './lang-bpscript';
import { bpsLibwordHighlight } from './bps-libword-highlight';

export function languageFor(runtime: Runtime): Extension {
  switch (runtime) {
    case 'bpscript':
      // BPScript: upstream CM6 highlighting + autocompletion from its reference,
      // plus the transpiler linter (underlines errors) and reference hover
      // tooltips — the features its old web editor shipped, ported AS-IS.
      return [
        bpscriptLanguage,
        bpscriptLanguage.language.data.of({ autocomplete: bpscriptCompletion }),
        // Overlay that re-colours library-vocabulary words (from the same
        // `describeVocabulary()` authority) distinctly from note terminals.
        bpsLibwordHighlight,
        ...bpscriptExtras,
        lintGutter()
      ];
    case 'bp3':
      // `.gr` native grammar: upstream CM6 highlighting (autocomplete is bps-only).
      return bp3Language;
    case 'strudel':
    case 'hydra':
    case 'js':
      return javascript();
    case 'python':
      return python();
    case 'csound':
      // First Niveau-2 language with official CM6 upstream (cf CSOUND.md §B).
      // enableDefaultTheme:false keeps the Kanopi `kanopiHighlight` in charge
      // of colours (principe 5 — colorimétrie uniforme); enableCompletion +
      // enableSynopsis give us opcode autocomplete + tooltips for free.
      return csoundMode({
        fileType: 'csd',
        enableCompletion: true,
        enableSynopsis: true,
        enableDefaultTheme: false
      });
    case 'sc':
      // SuperCollider has no first-party CM6 mode; fall back to JS-ish highlighting.
      return javascript();
    default:
      return [];
  }
}
