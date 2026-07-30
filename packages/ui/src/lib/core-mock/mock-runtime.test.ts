import { describe, it, expect } from 'vitest';
import { createMockCore } from './mock-runtime';
import { MockActors } from './mock-runtime';

describe('mock core', () => {
  it('starts empty (populated via setActors)', () => {
    const core = createMockCore();
    expect(core.actors.list()).toEqual([]);
  });

  it('emits console entries', () => {
    const core = createMockCore();
    const before = core.console.entries().length;
    core.console.push({ runtime: 'system', level: 'info', msg: 'hello' });
    expect(core.console.entries().length).toBe(before + 1);
    core.console.clear();
    expect(core.console.entries().length).toBe(0);
  });

  it('MockActors setActors + toggle', () => {
    const a = new MockActors();
    a.setActors([{ name: 'x', file: 'x.strudel', runtime: 'strudel', active: false }]);
    a.toggle('x');
    expect(a.list()[0].active).toBe(true);
  });

  // (Le test « unmuteAll route par setMuted » a disparu AVEC la couche de mute
  //  d'armement, supprimée le 2026-07-24 : elle faisait double emploi avec le
  //  désarmement. Le seul mute restant est celui du mixer, couvert par
  //  `stores/mixer.svelte.test.ts` et l'e2e `mute-code-voice.spec.ts`.)

  // ⛔ LE VERROU DES SCÈNES EST RETOURNÉ, PAS SUPPRIMÉ. Il assertait « activate marque
  //    exactement une scène active ». Le sous-système scènes est parti d'un bloc (décision
  //    Romain 2026-07-30, `hub/decisions/2026-07-30-les-scenes-sortent-de-l-ui-alt-chiffres-vise-les-acteurs.md`) :
  //    le langage a supprimé `@scene`, qui en était l'UNIQUE producteur — `setScenes` n'avait
  //    qu'un seul appelant dans tout le dépôt. Ce qui restait n'était pas une capacité, c'était
  //    un ménage inachevé.
  //    Ce test verrouille donc désormais son ABSENCE : la surface `scenes` ne doit pas
  //    reparaître sur le noyau. Sans lui, une réintroduction silencieuse passerait au vert —
  //    et c'est précisément comme ça que ce code avait survécu à la suppression des scènes
  //    de l'interface.
  it('le noyau n’expose AUCUNE surface de scènes (le sous-système est parti)', () => {
    const core = createMockCore();
    expect('scenes' in core).toBe(false);
    expect('loadBpsFileScenes' in core).toBe(false);
  });
});
