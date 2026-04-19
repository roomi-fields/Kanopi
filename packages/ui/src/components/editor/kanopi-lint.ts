import { linter, type Diagnostic as CMDiagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import { parseToAST, resolve } from '../../lib/session';

/**
 * CM6 linter for .kanopi files: runs the session lexer/parser/resolver on the
 * current doc and surfaces every AST + resolver diagnostic as a CM6 Diagnostic
 * positioned on the exact range from the source. Squiggles appear inline and
 * hover shows the message.
 */
export const kanopiLinter = linter((view: EditorView): CMDiagnostic[] => {
  const src = view.state.doc.toString();
  const ast = parseToAST(src);
  const r = resolve(ast);
  return r.diagnostics.map((d) => ({
    from: d.range.start.offset,
    to: Math.max(d.range.end.offset, d.range.start.offset + 1),
    severity: d.severity,
    message: d.message
  }));
});
