import { test, expect } from '@playwright/test';

// LE POINT D'ATTENTE, DE BOUT EN BOUT — la pièce gèle, une touche la relance.
//
// C'est le verrou de la chaîne complète, et il traverse CINQ dépôts : BPScript écrit `<!rôle.adresse`
// → BPx porte le point jusqu'à l'arbre ET résout quel point une touche lève (`entrees/routeur.ts`)
// → Kairos tient l'état armé et sa porte → Kronos gèle EXACTEMENT sur le point → et l'hôte tient
// les deux fils que personne d'autre ne peut tenir : il REMET la porte de Kairos à BPx et POUSSE
// l'événement du bus vers le routeur (`bpx-adapter.brancherAttente` / `real-core` fil 'input').
//
// POURQUOI CE BANC EXISTE, ET CE QU'IL VERROUILLE VRAIMENT. Le raccord d'entrée a vécu une journée
// entière en pièces séparées, chacune verte chez elle, sans que la pièce s'arrête une seule fois :
// le seul verrou qui vaut est celui qui mesure le SON et l'ÉTAT de la lecture, pas la présence des
// morceaux. Trois choses ici, dans l'ordre où on les entend :
//   1. la lecture GÈLE au point d'attente, et RESTE gelée (une pièce qui repart toute seule n'a pas
//      d'attente, elle a un blanc) ;
//   2. la touche frappée pendant le gel la fait REPARTIR, et le son revient ;
//   3. la touche TENUE à travers le point annule le gel : la musique passe sans jamais s'arrêter —
//      c'est le cas du jeu réel, et sans lui on verrouillerait une pièce qui ne pardonne rien.
//
// ⚠️ TENUE, PAS FRAPPÉE — et ce banc a d'abord rougi pour l'avoir confondu. Une touche a un
// RELÂCHEMENT, donc elle se lit en ÉTAT : l'appui baisse la barrière, le relâchement la REMONTE
// (`BPx entrees/routeur.ts`, branche `front === 'montant'` / relâchement). Une touche frappée en
// avance baisse donc la barrière puis la relève aussitôt, et la pièce gèle quand même quand elle
// arrive au point — c'est VOULU : sans ce ré-armement, une barrière ouverte une fois le resterait
// pour toujours et la pièce ne s'arrêterait plus au tour suivant. Ce qui traverse sans gel, c'est
// le doigt POSÉ quand la lecture atteint le point, comme une pédale tenue.
//
// La touche part par de VRAIS événements clavier (`keyboard.down`/`up`), à travers le focus de jeu
// — jamais par un appel qui court-circuiterait le périphérique.

const SCENE = `@core
@alphabet.western:audio
@tempo:90

@in touches transport.keyboard

S -> Montee Repart

Montee -> C4 E4 G4 <!touches.Space
Repart -> C5 G4 E4 C4 _
`;

type Page = import('@playwright/test').Page;

type Facade = {
  kanopi: {
    produce: () => Promise<unknown>;
    play: () => void;
    stop: () => void;
    hush: () => void;
    setPlayFocus: (on: boolean) => void;
    inspect: {
      transportState: () => string;
      audio: { enableMeter: () => void; measure: () => { rms: number } | null };
    };
  };
  __kanopi: {
    workspace: {
      openBundle: (f: { path: string; contents: string }[], focus?: string) => string | null;
    };
  };
};

async function etatTransport(page: Page) {
  return page.evaluate(() => (window as unknown as Facade).kanopi.inspect.transportState());
}

/** Attend un état de transport, en interrogeant la façade — jamais un délai fixe. */
async function attendreEtat(page: Page, etat: string, timeout = 12_000) {
  await expect.poll(async () => etatTransport(page), { timeout, intervals: [80] }).toBe(etat);
}

/** Le SON, sur une fenêtre : un instantané peut tomber entre deux notes et mentir. */
async function sonSur(page: Page, ms: number) {
  return page.evaluate(async (duree) => {
    const k = (window as unknown as Facade).kanopi;
    k.inspect.audio.enableMeter();
    let pic = 0;
    const fin = performance.now() + duree;
    while (performance.now() < fin) {
      await new Promise((r) => setTimeout(r, 40));
      pic = Math.max(pic, k.inspect.audio.measure()?.rms ?? 0);
    }
    return pic;
  }, ms);
}

/** PRODUIRE — et c'est un temps SÉPARÉ de la lecture, exprès : une dérivation neuve RE-POSE ses
 *  barrières (`kairos.charger` : « l'état repart ARMÉ »). Un doigt déjà posé avant la production
 *  serait donc oublié — le geste tenu ne vaut qu'APRÈS elle. */
async function produire(page: Page) {
  await page.evaluate(async () => {
    const k = (window as unknown as Facade).kanopi;
    k.stop();
    await k.produce();
  });
  await page.waitForTimeout(500);
}

async function jouer(page: Page) {
  await page.evaluate(() => (window as unknown as Facade).kanopi.play());
}

async function produireEtJouer(page: Page) {
  await produire(page);
  await jouer(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await page.evaluate((c) => {
    (window as unknown as Facade).__kanopi.workspace.openBundle(
      [{ path: 'point-attente.bps', contents: c }],
      'point-attente.bps'
    );
  }, SCENE);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  // Sortir du focus d'ÉDITION : le curseur est dans l'éditeur après l'ouverture, et une touche
  // y taperait du texte au lieu d'aller à la pièce.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
});

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    const k = (window as unknown as Facade).kanopi;
    k.stop();
    k.hush();
    k.setPlayFocus(false);
  });
});

test("la lecture GÈLE au point d'attente et la touche la fait repartir", async ({ page }) => {
  await produireEtJouer(page);

  // 1. LE GEL. `waiting` est un état PROPRE, distinct de `paused` : c'est la pièce qui attend,
  //    pas l'utilisateur qui a suspendu.
  await attendreEtat(page, 'waiting');

  // 2. ET IL TIENT. Une pièce qui repart toute seule après une seconde n'attend rien.
  await page.waitForTimeout(1_500);
  expect(await etatTransport(page)).toBe('waiting');

  // 3. LA TOUCHE. Focus de jeu pris (les touches nues vont à la pièce), puis une VRAIE frappe.
  await page.evaluate(() => (window as unknown as Facade).kanopi.setPlayFocus(true));
  await page.keyboard.press('Space');

  await attendreEtat(page, 'running', 5_000);
  // 4. ET ÇA SONNE. La reprise doit produire du son, pas seulement avancer un compteur.
  expect(await sonSur(page, 1_500)).toBeGreaterThan(0.01);
});

test('elle attend ENCORE au tour de boucle suivant — la barrière se repose', async ({ page }) => {
  // LE VERROU DU RÉ-ARMEMENT. Pendant une soirée, cette pièce n'a attendu qu'UNE FOIS : la touche
  // levait la barrière et personne ne la refermait, donc au deuxième tour elle traversait son
  // propre point sans s'arrêter. Une pièce qui n'attend qu'au premier tour n'est pas jouable en
  // boucle — et rien ne l'aurait signalé, puisque le premier tour, lui, était parfait.
  await page.evaluate(() => (window as unknown as Facade).kanopi.setPlayFocus(true));
  await produireEtJouer(page);

  await attendreEtat(page, 'waiting');
  await page.keyboard.press('Space'); // frappée : lève PUIS repose la barrière
  await attendreEtat(page, 'running', 5_000);

  // La pièce dure ~5,3 s : elle doit revenir buter sur le même point au tour suivant. On laisse la
  // marge d'un tour entier, sans jamais supposer l'instant exact (c'est Kronos qui tient le temps).
  await attendreEtat(page, 'waiting', 15_000);
});

test('la touche TENUE à travers le point annule le gel — la musique passe sans trou', async ({
  page
}) => {
  // Le focus est pris AVANT la lecture : le geste du musicien qui sait ce qui vient.
  await page.evaluate(() => (window as unknown as Facade).kanopi.setPlayFocus(true));
  // Le doigt se POSE APRÈS la production (qui re-pose les barrières) et NE SE LÈVE PAS : c'est la
  // pédale tenue. Un `press` (appui + relâchement instantanés) remonterait la barrière avant que la
  // lecture n'arrive au point.
  await produire(page);
  await page.keyboard.down('Space');
  await jouer(page);

  // Le point est à deux temps du début (90 bpm ⇒ ~1,3 s) : on observe bien au-delà, et la lecture
  // ne doit JAMAIS passer par `waiting`.
  const etats = new Set<string>();
  for (let i = 0; i < 28; i++) {
    etats.add(await etatTransport(page));
    await page.waitForTimeout(100);
  }
  await page.keyboard.up('Space');
  expect([...etats]).not.toContain('waiting');
  expect(await sonSur(page, 800)).toBeGreaterThan(0.01);
});

test('la touche FRAPPÉE en avance ne désarme pas le point — la barrière se repose', async ({
  page
}) => {
  // Le pendant du test précédent, et le verrou qui compte vraiment : sans lui, quelqu'un
  // « corrigerait » un jour le ré-armement au relâchement pour faire passer le cas d'au-dessus, et
  // la pièce cesserait de s'arrêter au deuxième tour sans qu'un seul test ne rougisse.
  await page.evaluate(() => (window as unknown as Facade).kanopi.setPlayFocus(true));
  await produireEtJouer(page);
  await page.keyboard.press('Space'); // appui + relâchement, bien avant le point

  await attendreEtat(page, 'waiting');
});
