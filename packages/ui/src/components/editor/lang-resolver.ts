import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { csoundMode } from '@hlolli/codemirror-lang-csound';
import type { Runtime } from '../../lib/core-mock';
import { kanopiLanguage } from './lang-kanopi';

export function languageFor(runtime: Runtime): Extension {
  switch (runtime) {
    case 'kanopi':
      return kanopiLanguage;
    case 'strudel':
    case 'tidal':
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
