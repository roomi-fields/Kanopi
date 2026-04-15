import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
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
    case 'sc':
      // SuperCollider has no first-party CM6 mode; fall back to JS-ish highlighting.
      return javascript();
    default:
      return [];
  }
}
