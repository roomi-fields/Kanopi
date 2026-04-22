import { Compartment, type Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Runtime } from '../../lib/core-mock';

/**
 * Strudel-only extensions loaded lazily so a regression in
 * `@strudel/codemirror` (AudioContext assumptions, side-effectful imports)
 * never blanks the whole editor. The compartment holds an empty array at
 * mount; the import resolves and reconfigures the view asynchronously.
 */
export function strudelExtras(runtime: Runtime): {
  ext: Extension;
  install: (view: EditorView) => Promise<void>;
} {
  const c = new Compartment();
  const ext = c.of([]);
  const needs = runtime === 'strudel' || runtime === 'tidal';
  const install = async (view: EditorView) => {
    if (!needs) return;
    try {
      const mod = await import('../../lib/runtimes/strudel-cm');
      // Strudel exposes togglable extensions through a single `extensions` map
      // rather than named exports (names are mangled in the dist bundle).
      const toggles = mod.extensions;
      view.dispatch({
        effects: c.reconfigure([
          toggles.isAutoCompletionEnabled?.(true) ?? [],
          toggles.isTooltipEnabled?.(true) ?? [],
          // `isPatternHighlightingEnabled(true)` already returns
          // `Prec.highest(highlightExtension)` (highlight.mjs:137). Adding
          // `mod.highlightExtension` a second time registered the same three
          // StateFields twice and prevented upstream highlighting from
          // working — fixed in phase 2.1 task 1.4.
          toggles.isPatternHighlightingEnabled?.(true) ?? []
        ])
      });
    } catch (err) {
      console.warn('[strudel-extras] load failed; plain CM6 fallback', err);
    }
  };
  return { ext, install };
}
