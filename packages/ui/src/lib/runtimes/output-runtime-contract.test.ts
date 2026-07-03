import { describe, it, expect } from 'vitest';
import type { OutputRuntimeAdapter, ScheduledEvent } from './output-runtime-contract';

// PHASE 1 — verrou type-only de la forme cible (contrat hôte↔runtimes de sortie). Ce test ne teste
// AUCUN comportement runtime : il PROUVE, à la compilation (tsc), que la forme uniforme est
// atteignable et cohérente. Si un jour la forme dérive, ce fichier cesse de compiler.

describe('OutputRuntimeAdapter — forme uniforme du contrat de frontière', () => {
  it('une implémentation témoin (les 5 méthodes) satisfait la cible', () => {
    const witness = {
      send(_ev: ScheduledEvent) {
        /* la runtime met en forme ; l'hôte ne touche pas */
      },
      bindClock() {
        /* s'abonne à l'horloge LS + bus de cycle de vie */
      },
      async evaluate() {
        /* voix de capture */
      },
      attach(_el: HTMLElement) {
        /* rend DANS l'élément */
      },
      dispose() {
        /* libère tout */
      }
    } satisfies OutputRuntimeAdapter;

    expect(typeof witness.send).toBe('function');
  });

  it('un sink discret (send seul, sans les optionnels) satisfait la cible', () => {
    const noteSink = {
      send(_ev: ScheduledEvent) {
        /* un synthé note n'a besoin ni de bindClock, ni d'evaluate/attach/dispose */
      }
    } satisfies OutputRuntimeAdapter;

    expect(typeof noteSink.send).toBe('function');
  });
});
