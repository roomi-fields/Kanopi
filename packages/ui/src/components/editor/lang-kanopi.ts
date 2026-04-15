import { StreamLanguage, type StringStream } from '@codemirror/language';

interface State {
  inDirective: boolean;
  tokenIdx: number;
}

const DIRECTIVES = new Set(['@actor', '@scene', '@map', '@expose', '@tempo', '@quantize']);

export const kanopiLanguage = StreamLanguage.define<State>({
  name: 'kanopi',
  startState: () => ({ inDirective: false, tokenIdx: 0 }),
  token(stream: StringStream, state: State) {
    if (stream.sol()) {
      state.inDirective = false;
      state.tokenIdx = 0;
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/#.*/)) return 'comment';

    if (state.tokenIdx === 0 && stream.match(/@[a-zA-Z]+/)) {
      const word = stream.current();
      state.inDirective = DIRECTIVES.has(word);
      state.tokenIdx = 1;
      return state.inDirective ? 'keyword' : 'invalid';
    }

    if (state.inDirective) {
      // colon-prefixed selectors (cc:1, scene:foo, pad:36)
      if (stream.match(/[a-zA-Z][a-zA-Z0-9_]*:[a-zA-Z0-9_/.]+/)) {
        state.tokenIdx++;
        return 'atom';
      }
      // number
      if (stream.match(/-?\d+(\.\d+)?/)) {
        state.tokenIdx++;
        return 'number';
      }
      // dotted target like drums.toggle, drums.gain
      if (stream.match(/[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*/)) {
        state.tokenIdx++;
        return 'propertyName';
      }
      // bare identifier — name (idx 1) or actor refs
      if (stream.match(/[a-zA-Z_][a-zA-Z0-9_]*/)) {
        const role = state.tokenIdx === 1 ? 'def' : 'variableName';
        state.tokenIdx++;
        return role;
      }
      // file paths with dots (drums.tidal etc.) — caught after dotted target above, fallback
      if (stream.match(/[\w./-]+/)) {
        state.tokenIdx++;
        return 'string';
      }
    }

    stream.next();
    return null;
  }
});
