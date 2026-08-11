import { test, expect } from '@playwright/test';
import { evalBlockAt, expectNoConsoleErrors } from '../../helpers';

// LE RÉGIME DE GRAINE SE DÉCLARE — mandat architecte [1290], sur le défaut que j'avais mesuré.
//
// ⛔ CE QU'IL FERME : sur le refus précis d'une grammaire à re-semence, la chaîne OUBLIE la graine
// et rejoue SANS elle. Le rattrapage est JUSTE — sans lui la scène ne jouerait pas — mais il était
// MUET. Deux dérivations de la MÊME scène, l'une reproductible et l'autre tirée sur l'horloge,
// étaient donc INDISTINGUABLES après coup.
// C'est le défaut qui invalide une référence sans qu'on le voie : on compare deux productions,
// elles diffèrent, et rien ne dit que l'une n'a jamais été reproductible. Le nombre est là,
// l'écart est réel, et la conclusion est fausse.
//
// ⚠️ IL MESURE LA VALEUR, PAS SEULEMENT LA PRÉSENCE : la graine lue doit être CELLE qu'on a posée.
// Un régime qui rendrait toujours la même constante passerait un banc qui vérifie « il y a bien
// une graine », et ne dirait rien.
//
// ⚠️ ET IL PASSE PAR L'API PILOTE, jamais par un import de store : un store importé dans la page
// donne une instance DUPLIQUÉE, et le régime lu ne serait pas celui de l'application.
const SCENE = '@core\n@alphabet.western\n@tempo:120\n\nS -> C4 D4 E4 F4\n';

async function chargerEtEvaluer(page: import('@playwright/test').Page) {
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });
  await page.evaluate((contents) => {
    const w = window as unknown as {
      __kanopi: {
        workspace: {
          openBundle: (f: { path: string; contents: string }[], focus?: string) => unknown;
          files: { id: string; path: string }[];
          openFile: (id: string) => void;
          setActive: (id: string) => void;
        };
      };
    };
    const ws = w.__kanopi.workspace;
    ws.openBundle([{ path: 'regime.bps', contents }], 'regime.bps');
    const c = ws.files.find((f) => f.path === 'regime.bps')!;
    ws.openFile(c.id);
    ws.setActive(c.id);
  }, SCENE);
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });
  await evalBlockAt(page, 1);
}

function lireRegime(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const w = window as unknown as {
      kanopi?: { inspect?: { seedRegime?: () => unknown } };
    };
    return (w.kanopi?.inspect?.seedRegime?.() ?? null) as {
      regime?: string;
      graine?: number | null;
      cause?: string;
    } | null;
  });
}

test('une dérivation déclare son régime, et la graine LUE est celle qui a été POSÉE', async ({
  page
}) => {
  const noErrors = expectNoConsoleErrors(page);
  // Graine figée par l'URL (mode test [921]) : on connaît donc la valeur ATTENDUE, et le banc
  // peut la comparer au lieu de constater qu'il y en a une.
  await page.goto('?seed=4242');
  await chargerEtEvaluer(page);

  await expect
    .poll(async () => (await lireRegime(page))?.regime, { timeout: 15_000 })
    .toBe('graine-figee');

  const r = await lireRegime(page);
  expect(
    r?.graine,
    'la graine déclarée n’est pas celle qui a été posée — un régime qui ne rend pas la vraie valeur ne permet pas de rejouer une capture'
  ).toBe(4242);

  await page.keyboard.press('ControlOrMeta+Period');
  noErrors();
});

test('une SECONDE graine — pour qu’une constante ne passe pas', async ({ page }) => {
  const noErrors = expectNoConsoleErrors(page);
  await page.goto('?seed=77');
  await chargerEtEvaluer(page);

  await expect.poll(async () => (await lireRegime(page))?.graine, { timeout: 15_000 }).toBe(77);

  await page.keyboard.press('ControlOrMeta+Period');
  noErrors();
});

// ⚠️ LA BRANCHE QUI RESTE NON COUVERTE, ET JE L'ÉCRIS PLUTÔT QUE DE LA LAISSER CROIRE COUVERTE :
// `cause: 'grammaire-a-re-semence'` — le régime posé APRÈS un rattrapage — n'est exercé par aucune
// scène du corpus aujourd'hui. La seule qui exigeait une graine d'horloge (`trySrand.bps`)
// n'analyse plus, et sa suspension est déjà nommée dans `corpus-compile.test.ts`. Sous `?seed=N`
// le rattrapage ne s'arme même pas, par construction ([921]).
// Écrire un banc qui « exerce » cette branche demanderait de fabriquer une scène pour elle : ce
// serait mesurer ma propre fabrication, pas le chemin. La branche se couvrira le jour où une vraie
// grammaire à re-semence redevient dérivable — c'est la MÊME condition de levée que la suspension.
