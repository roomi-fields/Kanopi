import { test, expect } from '@playwright/test';
import { setupFakeMidiInput, expectNoConsoleErrors } from '../../helpers';

// L'ENTRÉE MIDI PASSE PAR runtime-in — banc permanent du BRANCHEMENT, à l'écran.
//
// Décision Romain 2026-07-27 : les périphériques d'entrée ne vivent PAS chez l'hôte. Contrat
// `hub/contrats/hote-runtime-in.md` : l'hôte tient le bus, capte le GESTE de connexion, arbitre le
// focus — rien d'autre. `src/lib/midi/midi-input.ts` (le pilote) est SUPPRIMÉ.
//
// CE QUE CE BANC PROUVE, dans l'ordre où l'utilisateur le vit :
//   1. le GESTE (clic « Enable MIDI input ») ouvre le périphérique — c'est bien un geste utilisateur
//      qui porte l'autorisation, pas un appel au chargement ;
//   2. les ports s'affichent par leur NOM. Ce n'est pas cosmétique : `ports()` rend désormais des
//      OBJETS ({ id, name, manufacturer? }) là où l'ancien `listPorts()` rendait des chaînes —
//      rendre l'objet tel quel afficherait « [object Object] ». On mesure donc ce que la donnée
//      DEVIENT à l'arrivée, pas seulement qu'elle arrive (mise en garde de runtime-in [969]) ;
//   3. une note émise par le port TRAVERSE jusqu'au bus de l'hôte et s'affiche : `input` /
//      `runtime: 'in'` / `midi note 60 ch1 v100 on`, une charge OPAQUE (des numéros, jamais un nom
//      de note — la résolution est en aval, chez Kairos) ;
//   4. deux gestes ne rebranchent PAS deux périphériques : l'instance est TENUE. C'est l'incident
//      [96] du côté sortie (« root cause du silence : l'hôte créait un MidiRuntime FRAIS ») ; la
//      même faute sur l'entrée ferait taire le périphérique SANS UNE SEULE ERREUR.
//
// CE QU'IL NE PROUVE PAS, dit explicitement : qu'une vraie note d'un vrai clavier arrive. L'accès
// Web MIDI est simulé (`setupFakeMidiInput` — autorisation injectable, l'idée est de runtime-in) ;
// le chemin mesuré est le vrai, seule la source d'octets ne l'est pas. La vraie note reste à Romain.
//
// Sélecteurs, pris dans les composants : `.hw` + le bouton « Enable MIDI input »
// (HardwareView.svelte), `.overlay li` (EventsOverlay.svelte, monté par `?events=1` — App.svelte:26).

test('le geste branche runtime-in, les ports s’affichent par leur nom, et une note traverse le bus', async ({
  page
}) => {
  const noErrors = expectNoConsoleErrors(page);
  const midi = await setupFakeMidiInput(page);

  // `?events=1` monte la lucarne d'événements : c'est par elle qu'on VOIT l'événement d'entrée
  // arriver sur le bus, sans importer le moindre store dans la page (banc = API/écran seulement).
  await page.goto('?events=1');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Le panneau Matériel vit dans la barre d'activité (vue 'hardware'). Sélecteur pris dans le
  // composant (`ActivityItem.svelte:26` pose `title`), PAS par nom accessible : le badge du bouton
  // (« 2 ») lui SERT de nom accessible et masque son titre — mesuré sur l'instantané d'un échec.
  // C'est un vrai défaut d'accessibilité de la barre d'activité, signalé à l'architecte ; le
  // corriger n'est pas dans ce mouvement, et un banc ne se contorsionne pas pour un bug d'à-côté.
  await page.locator('.activity-bar button[title="Hardware"]').click();
  const enable = page.getByRole('button', { name: 'Enable MIDI input' });
  await expect(enable).toBeVisible({ timeout: 5_000 });

  // 1 + 2. LE GESTE, et ce qu'il affiche.
  await enable.click();
  const ports = page.locator('.hw .ports li');
  await expect(ports).toHaveCount(1, { timeout: 5_000 });
  await expect(ports.first()).toHaveText(/Kanopi Fake MIDI In/);
  // Le piège nommé : jamais la représentation par défaut d'un objet.
  await expect(ports.first()).not.toHaveText(/\[object Object\]/);

  // 3. LA TRAVERSÉE. Note-on 60 vélocité 100 canal 1 → 0x90 0x3C 0x64.
  await midi.sendNote([0x90, 0x3c, 0x64]);
  const ligneEntree = page.locator('.overlay li', { hasText: 'input' });
  await expect(ligneEntree.first()).toBeVisible({ timeout: 5_000 });
  // La charge est OPAQUE : device + numéros, dans l'ordre que l'hôte affiche sans les traduire.
  await expect(ligneEntree.first()).toContainText('midi note 60');
  await expect(ligneEntree.first()).toContainText('ch1');
  await expect(ligneEntree.first()).toContainText('on');
  // Et elle porte bien le runtime d'entrée, pas un runtime de voix.
  await expect(ligneEntree.first().locator('.rt')).toHaveText('in');

  // 4. L'INSTANCE EST TENUE, éprouvée par le SECOND POINT D'ENTRÉE. Le geste existe à deux
  // endroits — ce bouton et la palette de commandes (`commands/registry.ts`, « Enable MIDI
  // input ») — et c'est précisément le risque : deux points d'entrée qui fabriqueraient deux
  // périphériques. On rejoue donc le geste par la PALETTE, puis on renvoie une note : elle doit
  // encore traverser. Si un périphérique neuf avait été fabriqué, l'écoute serait posée sur un
  // objet que plus personne ne tient et cette note serait perdue EN SILENCE, sans une erreur.
  const avant = await page.locator('.overlay li', { hasText: 'input' }).count();
  await page.keyboard.press('ControlOrMeta+KeyK');
  await expect(page.locator('.palette[role="dialog"]')).toBeVisible({ timeout: 2_000 });
  await page.keyboard.type('Enable MIDI');
  await page.keyboard.press('Enter');
  await expect(page.locator('.palette[role="dialog"]')).toHaveCount(0, { timeout: 2_000 });

  await midi.sendNote([0x90, 0x3e, 0x64]);
  await expect
    .poll(async () => page.locator('.overlay li', { hasText: 'input' }).count(), {
      timeout: 5_000,
      intervals: [100, 250, 500]
    })
    .toBeGreaterThan(avant);

  noErrors();
});
