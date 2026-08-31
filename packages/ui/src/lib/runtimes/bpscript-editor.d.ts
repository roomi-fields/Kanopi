// BPScript ships a CodeMirror 6 language mode (Lezer parser + styleTags
// highlighting) for its web editor; we consume it AS-IS rather than writing our
// own .bps/.gr grammar. The package has no `exports` map, so we import the file
// by path from the `bpscript` dep. No types ship with it → declare the surface.
declare module 'bpscript/editor-lang' {
  import type { LanguageSupport } from '@codemirror/language';
  /** `.bps` (BPScript) language support — highlighting via the Lezer parser. */
  export const bpscriptLanguage: LanguageSupport;
  /** `.gr` (BP3 native grammar) language support. */
  export const bp3Language: LanguageSupport;
}
