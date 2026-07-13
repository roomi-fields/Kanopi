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

import seVisser2 from '../../../../library/scenes/bp3/se.Visser2.json?raw';
import seAmes from '../../../../library/scenes/bp3/se.Ames.json?raw';
import seNotReich from '../../../../library/scenes/bp3/se.NotReich.json?raw';
import seTryRotate from '../../../../library/scenes/bp3/se.tryRotate.json?raw';
import seTransposition3 from '../../../../library/scenes/bp3/se.transposition3.json?raw';
import seVisser5 from '../../../../library/scenes/bp3/se.Visser5.json?raw';
import se765432 from '../../../../library/scenes/bp3/se.765432.json?raw';
import seAlan from '../../../../library/scenes/bp3/se.Alan.json?raw';
import seBeatrix from '../../../../library/scenes/bp3/se.Beatrix.json?raw';
import seDjinns from '../../../../library/scenes/bp3/se.Djinns.json?raw';
import seDoeslittle from '../../../../library/scenes/bp3/se.doeslittle.json?raw';
import seKss from '../../../../library/scenes/bp3/se.kss.json?raw';
import seLivecode1 from '../../../../library/scenes/bp3/se.livecode1.json?raw';
import seLivecode2 from '../../../../library/scenes/bp3/se.livecode2.json?raw';
import seMozart from '../../../../library/scenes/bp3/se.Mozart.json?raw';
import seMyMelody from '../../../../library/scenes/bp3/se.MyMelody.json?raw';
import seRajeev from '../../../../library/scenes/bp3/se.Rajeev.json?raw';
import seRuwet from '../../../../library/scenes/bp3/se.Ruwet.json?raw';
import seVisser3 from '../../../../library/scenes/bp3/se.Visser3.json?raw';

// reference name (as it appears in the .gr `-se.<name>` line) → raw -se text
export const BUNDLED_SE: Record<string, string> = {
  Visser2: seVisser2,
  Ames: seAmes,
  NotReich: seNotReich,
  tryRotate: seTryRotate,
  transposition3: seTransposition3,
  Visser5: seVisser5,
  '765432': se765432,
  Alan: seAlan,
  Beatrix: seBeatrix,
  Djinns: seDjinns,
  doeslittle: seDoeslittle,
  kss: seKss,
  livecode1: seLivecode1,
  livecode2: seLivecode2,
  Mozart: seMozart,
  MyMelody: seMyMelody,
  Rajeev: seRajeev,
  Ruwet: seRuwet,
  Visser3: seVisser3
};

// Sound-object aux files (-so/-mi/-cs) → which alphabet symbols carry a sound,
// for per-symbol routing (decision routage-texte-son-par-symbole). Keyed by the
// reference name in the grammar's `-so.<name>` line, raw text for parseSoundObjects.
// Empty for now: every bundled grammar is all-notes (notes sound by default) or
// all-text (bols with no prototype). Add an entry when a mixed grammar ships.
export const BUNDLED_SOUND: Record<string, string> = {};

// Alphabet aux files (-al). A sound-bearing grammar reaches its prototype through
// the alphabet (-gr → -al → -so/-mi/-cs), so the adapter loads the -al to follow
// the chain. Keyed by the `-al.<name>` reference, raw text for parseAlFile /
// alphabetSoundRef. Empty until a sound-object grammar is bundled.
export const BUNDLED_AL: Record<string, string> = {};
