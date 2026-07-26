// [745] PREUVES du câblage de la trace de dérivation (interrupteur `traceEnabled()`
// façade `runtime-ui` → `createSession(ast, { trace: true })` côté BPx → poignée
// `PoigneeTrace` lue via `Kairos.traceCourante()` → portée verbatim par
// `productionFeed.trace()` / `ProductionViewHost`). Le câblage lui-même n'est PAS
// modifié ici (bpx-adapter.ts / production-feed.svelte.ts / bp3-deps.d.ts /
// ProductionViewHost.svelte) — ce fichier prouve seulement qu'il fait ce qu'il dit :
//
//  PREUVE 1 — espion sur les CLÉS : l'objet options passé à `createSession` (site
//  d'éval, bpx-adapter.ts ~L1774) n'a PAS la propriété `trace` quand l'interrupteur
//  est ÉTEINT (coût nul de la DEMANDE), et l'a (`=== true`) quand ALLUMÉ.
//
//  PREUVE 2 — valeur PIÉGÉE : l'hôte (`productionFeed.trace()`) PORTE la poignée
//  verbatim (identité de référence) sans jamais l'abonner — une poignée dont
//  `onStep` EXPLOSE au moindre appel ne lève jamais — et rend `null` quand
//  `Kairos.traceCourante()` rend `null` (interrupteur éteint / rien chargé).
//
//  PREUVE 3 — RELAIS ([745], contrat [97]) : espion sur le 3e argument de
//  `Kairos.prototype.charger` (site d'éval, bpx-adapter.ts). ALLUMÉ ⇒ `charger`
//  reçoit un 3e argument `{ entrees: <DeriveResult.trace>, rendreChaine: <BPx
//  renderChain> }` (non-undefined) ; ÉTEINT ⇒ 3e argument `undefined`. C'est CE
//  relais qui manquait (BPx produisait `DeriveResult.trace`, l'hôte ne le remettait
//  jamais à Kairos) — cette preuve mord si le relais est retiré. Le contrat
//  CompagnonTrace a évolué avec le lot graphie : `pas`→`entrees` + `rendreChaine`
//  obligatoire (kairos.ts:90) ; cette preuve verrouille la forme À JOUR.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Kairos } from '@kairos/core';
import { setTraceEnabled } from 'runtime-ui';
import type { PoigneeTrace } from 'runtime-ui';

// Capture des options réellement passées à `createSession` (côté module `bpx`) — le
// tableau doit être créé via `vi.hoisted` : la factory `vi.mock` est hissée AVANT les
// imports, elle ne peut fermer sur une variable top-level ordinaire.
const { capturedOptions, traceState } = vi.hoisted(() => ({
  capturedOptions: [] as Array<Record<string, unknown> | undefined>,
  traceState: { enabled: false }
}));

vi.mock('bpx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bpx')>();
  return {
    ...actual,
    // Espion transparent : capture l'objet options puis DÉLÈGUE au vrai `createSession`
    // (la dérivation réelle continue de tourner — on n'invente pas de fausse Session).
    // L'espion ne RE-DECLARE pas le type de l'arbre : il le prend a la source
    // (`Parameters<…>[0]`). Le typer `unknown` ici effaçait `SceneAST` pour tout
    // l'appel en aval — c'est ce qui avait fait imputer l'erreur a BPx a tort ([951]).
    createSession: (
      ast: Parameters<typeof actual.createSession>[0],
      options?: Record<string, unknown>
    ) => {
      capturedOptions.push(options);
      return actual.createSession(ast, options as Parameters<typeof actual.createSession>[1]);
    }
  };
});

// [BUG DÉCOUVERT, NON CORRIGÉ ICI — voir rapport] Le barrel `runtime-ui` (`src/index.ts`)
// réexporte des composants `.svelte` (TextStreamPanel, TimelinePanel). `runtime-ui` est un
// symlink vers un dépôt frère qui a SON PROPRE `node_modules` (vite 6.4.3 / svelte 5.56.4,
// contre 6.4.2 / 5.55.3 chez Kanopi) ; la résolution Node par CHEMIN RÉEL charge ces copies
// divergentes quand Vite prétraite les `.svelte` du barrel, et ÇA CRASHE sous vitest
// (`Cannot create proxy with a non-object as target or handler`, vite dep-*.js:13082,
// `preprocessCSS`). Un import DE VALEUR (pas `import type`) depuis `runtime-ui` — exactement
// ce que `bpx-adapter.ts:51` ajoute (`import { traceEnabled } from 'runtime-ui'`) — force ce
// chemin et CASSE 26/60 fichiers de test existants (tout ce qui importe `bpx-adapter.ts`,
// transitivement). Confirmé en isolant l'import (`import { traceEnabled } from 'runtime-ui'`
// seul, sans bpx-adapter) : même crash. On mocke donc le module ICI (comme demandé) pour
// contourner le barrel réel et écrire la preuve — le bug lui-même reste entier et DOIT être
// réparé en amont (bpx-adapter.ts ne doit pas être touché par ce mandat).
vi.mock('runtime-ui', () => ({
  traceEnabled: () => traceState.enabled,
  setTraceEnabled: (v: boolean) => {
    traceState.enabled = v;
  }
}));

// Import APRÈS le vi.mock (hissé de toute façon, mais on respecte l'ordre de lecture) :
// bpscriptAdapter ferme sur le `createSession` importé de 'bpx', donc sur l'espion ci-dessus.
import { bpscriptAdapter, setActorsSink } from './bpx-adapter';
import { kronosCursor } from '../../stores/kronos-cursor.svelte';
import { productionFeed } from '../../stores/production-feed.svelte';

// --- Harnais audio minimal (repris de model-c-replay.test.ts : le chemin d'éval réel
// construit un handle Kronos-audio, qui a besoin d'un AudioContext factice sous jsdom). ---
const fakeParam = () => ({
  value: 0,
  setValueAtTime() {},
  setValueCurveAtTime() {},
  linearRampToValueAtTime() {},
  exponentialRampToValueAtTime() {},
  cancelScheduledValues() {}
});
class FakeGain {
  gain = fakeParam();
  connect() {
    return this;
  }
  disconnect() {}
}
class FakeOsc {
  frequency = fakeParam();
  detune = fakeParam();
  type = 'sine';
  connect() {
    return this;
  }
  start() {}
  stop() {}
  disconnect() {}
}
class FakeFilter {
  frequency = fakeParam();
  Q = fakeParam();
  type = 'lowpass';
  connect() {
    return this;
  }
  disconnect() {}
}
class FakePanner {
  pan = fakeParam();
  connect() {
    return this;
  }
  disconnect() {}
}

function installFakeAudio() {
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = class {
    currentTime = 0;
    state = 'running';
    destination = {};
    resume() {
      return Promise.resolve();
    }
    createGain() {
      return new FakeGain();
    }
    createOscillator() {
      return new FakeOsc();
    }
    createBiquadFilter() {
      return new FakeFilter();
    }
    createStereoPanner() {
      return new FakePanner();
    }
  };
  (globalThis as unknown as { requestAnimationFrame: () => number }).requestAnimationFrame = () =>
    0;
}

// Scène minimale, plain mono (pas d'@actor) : suffit à atteindre le site d'éval
// (bpx-adapter.ts ~L1774) qui construit `createSession(ast, opts)`.
const SCENE = `@core
S -> C4 E4 G4 C5
`;

describe('PREUVE 1 — espion sur les clés : coût nul de la DEMANDE (createSession opts)', () => {
  beforeEach(() => {
    installFakeAudio();
    setActorsSink(() => {});
    capturedOptions.length = 0;
  });
  afterEach(async () => {
    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'trace-cablage.bps' }, () => {});
    kronosCursor.set(null);
    setTraceEnabled(false);
  });

  it('interrupteur ÉTEINT ⇒ la clé `trace` est ABSENTE de l’objet options (pas `trace:false`)', async () => {
    setTraceEnabled(false);
    await bpscriptAdapter.evaluate(
      SCENE,
      { actorId: 'trace-cablage.bps', fileId: 'trace-cablage.bps' },
      () => {}
    );

    expect(capturedOptions.length).toBeGreaterThan(0);
    const opts = capturedOptions[capturedOptions.length - 1];
    expect(opts).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(opts, 'trace')).toBe(false);
  });

  it('interrupteur ALLUMÉ ⇒ `opts.trace === true`', async () => {
    setTraceEnabled(true);
    await bpscriptAdapter.evaluate(
      SCENE,
      { actorId: 'trace-cablage.bps', fileId: 'trace-cablage.bps' },
      () => {}
    );

    expect(capturedOptions.length).toBeGreaterThan(0);
    const opts = capturedOptions[capturedOptions.length - 1];
    expect(opts?.trace).toBe(true);
  });
});

describe('PREUVE 2 — valeur piégée : l’hôte PORTE sans consommer, null quand éteint', () => {
  afterEach(() => {
    productionFeed.set(null);
    setTraceEnabled(false);
  });

  it('la poignée traverse productionFeed.trace() par IDENTITÉ, `onStep` jamais appelé', () => {
    setTraceEnabled(true);

    const trappedOnStep = vi.fn(() => {
      throw new Error("VIOLATION PORTER≠RÉSOUDRE : l'hôte a abonné la trace");
    });
    const trappedHandle: PoigneeTrace = {
      productionId: 42,
      grammaire: 'trace-cablage-test',
      onStep: trappedOnStep as unknown as PoigneeTrace['onStep']
    };

    const fakeKairos = {
      structureCourante: () => null,
      arbreCourant: () => {
        throw new Error('non pertinent pour cette preuve');
      },
      traceCourante: () => trappedHandle
    } as unknown as Kairos;

    productionFeed.set(fakeKairos);

    const got = productionFeed.trace();
    // Identité de référence : preuve du PORTAGE verbatim (pas une recopie/reconstruction).
    expect(got).toBe(trappedHandle);
    // Le piège n'a jamais levé : l'hôte n'a JAMAIS appelé `onStep` (PORTER ≠ RÉSOUDRE).
    expect(trappedOnStep).not.toHaveBeenCalled();
  });

  it('`Kairos.traceCourante()` rend null (éteint) ⇒ `productionFeed.trace()` rend null', () => {
    setTraceEnabled(false);

    const fakeKairosOff = {
      structureCourante: () => null,
      arbreCourant: () => {
        throw new Error('non pertinent pour cette preuve');
      },
      traceCourante: () => null
    } as unknown as Kairos;

    productionFeed.set(fakeKairosOff);
    expect(productionFeed.trace()).toBeNull();
  });

  it('aucun Kairos chargé (set(null)) ⇒ `productionFeed.trace()` rend null', () => {
    productionFeed.set(null);
    expect(productionFeed.trace()).toBeNull();
  });
});

describe('PREUVE 3 — RELAIS : le 3e argument de kairos.charger() porte la trace', () => {
  beforeEach(() => {
    installFakeAudio();
    setActorsSink(() => {});
  });
  afterEach(async () => {
    await bpscriptAdapter.stop({ actorId: '__hush__', fileId: 'trace-cablage.bps' }, () => {});
    kronosCursor.set(null);
    setTraceEnabled(false);
  });

  it('ALLUMÉ ⇒ `charger` reçoit un 3e argument `{ entrees, rendreChaine }` NON-undefined (la trace BPx relayée)', async () => {
    // Espion sur la VRAIE classe (call-through, pas de mock d'implémentation) : la
    // dérivation + le flattening tournent réellement, on capture seulement l'appel.
    // [97] Contrat CompagnonTrace mis à jour (kairos.ts:90) : le journal brut voyage sous
    // `entrees` (ex-`pas`) ET la fonction d'assemblage `rendreChaine` (= BPx `renderChain`,
    // OBLIGATOIRE) l'accompagne — la même que la chaîne d'items. On vérifie les DEUX.
    const chargerSpy = vi.spyOn(Kairos.prototype, 'charger');
    setTraceEnabled(true);

    await bpscriptAdapter.evaluate(
      SCENE,
      { actorId: 'trace-cablage.bps', fileId: 'trace-cablage.bps' },
      () => {}
    );

    expect(chargerSpy).toHaveBeenCalled();
    const [, , traceArg] = chargerSpy.mock.calls[chargerSpy.mock.calls.length - 1];
    expect(traceArg).toBeDefined();
    expect((traceArg as { entrees?: unknown })?.entrees).toBeDefined();
    expect(typeof (traceArg as { rendreChaine?: unknown })?.rendreChaine).toBe('function');

    chargerSpy.mockRestore();
  });

  it('ÉTEINT ⇒ `charger` reçoit un 3e argument `undefined` (rien à relayer)', async () => {
    const chargerSpy = vi.spyOn(Kairos.prototype, 'charger');
    setTraceEnabled(false);

    await bpscriptAdapter.evaluate(
      SCENE,
      { actorId: 'trace-cablage.bps', fileId: 'trace-cablage.bps' },
      () => {}
    );

    expect(chargerSpy).toHaveBeenCalled();
    const [, , traceArg] = chargerSpy.mock.calls[chargerSpy.mock.calls.length - 1];
    expect(traceArg).toBeUndefined();

    chargerSpy.mockRestore();
  });
});
