// Bundled BP3 auxiliary settings for the showcase grammars.
//
// A BP3 `.gr` references its engine timing in a sibling `-se.<name>` file
// (parseBP3 surfaces it via `fileRefs`). Without it the derivation falls back to
// a 1000 ms beat instead of the native tempo (e.g. acceleration 750 ms). The
// adapter resolves the referenced settings here, parses them with the upstream
// `parseSeFile`, and hands the engine timing to `createBPx({ settings })`.
//
// Keyed by the `-se` reference name (the `name` in `fileRefs`). Bundled as raw
// text so the upstream parser does the interpretation — no values duplicated.

import seVisser2 from '../../../../library/bundled/se.Visser2.json?raw';
import seAmes from '../../../../library/bundled/se.Ames.json?raw';
import seNotReich from '../../../../library/bundled/se.NotReich.json?raw';
import seTryRotate from '../../../../library/bundled/se.tryRotate.json?raw';
import seTransposition3 from '../../../../library/bundled/se.transposition3.json?raw';
import seVisser5 from '../../../../library/bundled/se.Visser5.json?raw';

// reference name (as it appears in the .gr `-se.<name>` line) → raw -se text
export const BUNDLED_SE: Record<string, string> = {
  Visser2: seVisser2,
  Ames: seAmes,
  NotReich: seNotReich,
  tryRotate: seTryRotate,
  transposition3: seTransposition3,
  Visser5: seVisser5
};
