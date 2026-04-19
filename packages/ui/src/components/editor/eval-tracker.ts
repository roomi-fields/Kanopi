import type { EditorView } from '@codemirror/view';
import { flash } from './eval-flash';

/**
 * Some runtimes (Strudel, Hydra) swallow runtime errors and only log them
 * asynchronously through their own logger. To upgrade such errors into a red
 * flash, we remember the last evaluated range for a short window; if the
 * Console bus emits an error within that window, we re-flash over the same
 * range.
 */
type Evald = { view: EditorView; from: number; to: number; ts: number; failed: boolean };

const TTL_MS = 1200;
let last: Evald | undefined;

export function rememberEval(view: EditorView, from: number, to: number) {
  last = { view, from, to, ts: performance.now(), failed: false };
}

export function markLastEvalError() {
  if (!last) return;
  if (last.failed) return;
  if (performance.now() - last.ts > TTL_MS) return;
  last.failed = true;
  try {
    flash(last.view, last.from, last.to, 'err');
  } catch {
    /* view disposed */
  }
}
