import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupAudioCapture, evalBlockAt, expectNoConsoleErrors } from '../helpers';

// REGRESSION GUARD (archi mandate, keystone lesson) — prove `cv-adsr.bps` actually
// RENDERS the CV at runtime, so an upstream commit can NEVER again silence the CV
// without a RED test. What happened: a Kronos commit made cv-adsr MUTE on pushed main,
// and it slipped through because NO test exercised CV RENDERING (e2e green, sound gone).
//
// This test taps the real Web Audio graph BEFORE Play and asserts the three things that
// together prove CV is rendered, not just "a token was scheduled":
//   1. oscillators created > 0          → the notes sound at all.
//   2. BiquadFilter.frequency automations > 0  → the ADSR envelope drives the cutoff
//      (`*:cutoff:Env` / `cutoff:env1` in the scene). This IS the CV: an envelope
//      writing `frequency` via setValueCurveAtTime / setValueAtTime / *RampToValueAtTime.
//   3. peak RMS > 0                      → audible output over a continuous window.
//
// RÉSOLU 2026-06-25 : Kronos 1531b28 (KAI-8, StructureSource.auBord()) N'ÉTAIT PAS la
// cause — diagnostic écarté par l'architecte (courrier/kanopi.md 2026-06-25T02:31), 1531b28
// porte le re-roll mode:rnd, sans rapport avec le rendu CV. La vraie racine était côté
// Kairos : composerModulations indexait les bindings par leaf.nodeId (undefined) au lieu de
// leaf.id, donc content.modulations restait vide — corrigé en 07a1f2e (+ e2f2eb0 pour le
// PAN-NaN). Le test est vert depuis. Les assertions/seuils ne sont pas assouplis et le test
// n'est pas skip.

interface CvProbe {
  oscillators: number;
  cutoffAutomations: number;
}

/** Install Web Audio graph probes BEFORE any AudioContext exists: count oscillators and
 *  count automations written to a BiquadFilter's `frequency` AudioParam (the cutoff CV). */
async function installCvProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
      __cvProbe?: { oscillators: number; cutoffAutomations: number };
    };
    const probe = { oscillators: 0, cutoffAutomations: 0 };
    w.__cvProbe = probe;

    const Native = (w.AudioContext ?? w.webkitAudioContext) as
      | (typeof AudioContext & { prototype: AudioContext })
      | undefined;
    if (!Native) return;
    const proto = Native.prototype as AudioContext & {
      createOscillator: AudioContext['createOscillator'];
      createBiquadFilter: AudioContext['createBiquadFilter'];
    };

    // Count every oscillator the scene creates (the note voices).
    const origOsc = proto.createOscillator;
    proto.createOscillator = function (this: AudioContext) {
      probe.oscillators++;
      return origOsc.call(this);
    };

    // Count automations written to a BiquadFilter's `frequency` param. The ADSR
    // envelope renders the cutoff CV by scheduling values onto that param — so a
    // non-zero count means the envelope is actually MODULATING the filter (CV rendered),
    // not just a static cutoff set once. We wrap the param's scheduling methods on the
    // instance returned by createBiquadFilter.
    const origFilter = proto.createBiquadFilter;
    proto.createBiquadFilter = function (this: AudioContext) {
      const node = origFilter.call(this);
      try {
        const freq = node.frequency as AudioParam;
        const methods: Array<keyof AudioParam> = [
          'setValueAtTime',
          'setValueCurveAtTime',
          'linearRampToValueAtTime',
          'exponentialRampToValueAtTime'
        ];
        for (const m of methods) {
          const orig = (freq[m] as (...a: unknown[]) => unknown).bind(freq);
          (freq as unknown as Record<string, unknown>)[m] = (...args: unknown[]) => {
            probe.cutoffAutomations++;
            return orig(...args);
          };
        }
      } catch {
        /* best-effort probe */
      }
      return node;
    };
  });
}

// SKIPPÉ (décision Romain 2026-08-08, KAN-40) : joue cv/cv-adsr.bps, déclarée rouge par la
// garde de statut du corpus. La scène déclare son ADSR (attack:5, decay:150, sustain:0.2,
// release:400 sur env1) avec des mots supprimés du langage ; la forme qui préserverait ces
// réglages n'existe pas encore dans le parseur et sera revue avec FaustX. Revient avec la scène.
test.skip('cv-adsr renders the CV: oscillators + cutoff automations + audible output', async ({
  page
}) => {
  // Scene loops at tempo:138; we sample a continuous RMS window and a few cycles of graph
  // activity. Generous budget for prod load + audio warm-up.
  test.setTimeout(60_000);

  // Probe MUST be installed before the audio-capture init script runs the ctor wrap, and
  // both before page.goto so they are in place before any AudioContext is constructed.
  await installCvProbe(page);
  const audio = await setupAudioCapture(page);
  const noErrors = expectNoConsoleErrors(page);

  const bundledDir = fileURLToPath(new URL('../../../library/scenes/cv', import.meta.url));
  const program = readFileSync(join(bundledDir, 'cv-adsr.bps'), 'utf8');
  // Sanity: the fixture is the ADSR→cutoff CV scene we mean to guard.
  expect(program).toContain('mod.adsr');
  expect(program).toContain('cutoff');

  await page.goto('');
  await expect(page.getByText('KANOPI').first()).toBeVisible({ timeout: 10_000 });

  // Load cv-adsr.bps and focus its editor.
  await page.evaluate(
    ({ contents }) => {
      const w = window as unknown as {
        __kanopi: {
          workspace: {
            openBundle: (
              f: { path: string; contents: string }[],
              focusPath?: string
            ) => string | null;
          };
        };
      };
      w.__kanopi.workspace.openBundle([{ path: 'cv-adsr.bps', contents }], 'cv-adsr.bps');
    },
    { contents: program }
  );
  await page.waitForFunction(() => {
    const w = window as unknown as { __kanopi?: { workspace: { files: { path: string }[] } } };
    return !!w.__kanopi?.workspace.files.find((f) => f.path === 'cv-adsr.bps');
  });
  await page.evaluate(() => {
    const w = window as unknown as {
      __kanopi: {
        workspace: {
          files: { id: string; path: string }[];
          openFile: (id: string) => void;
          setActive: (id: string) => void;
        };
      };
    };
    const target = w.__kanopi.workspace.files.find((f) => f.path === 'cv-adsr.bps');
    if (target) {
      w.__kanopi.workspace.openFile(target.id);
      w.__kanopi.workspace.setActive(target.id);
    }
  });
  await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 5_000 });

  // Evaluate (Ctrl+Enter) → derives + starts looping playback.
  await evalBlockAt(page, 1);

  // Sample peak RMS over a continuous window (≥1.5 s) to catch the loudest moment past any
  // inter-note silence (the envelope dips to its sustain between hits).
  const rms = await audio.getMaxRMS(2500);

  // Give the look-ahead scheduler a couple of cycles to build the voices + schedule the
  // envelope automations onto the filters.
  await page.waitForTimeout(1500);
  const probe = await page.evaluate(() => {
    const w = window as unknown as { __cvProbe?: CvProbe };
    return w.__cvProbe ?? { oscillators: 0, cutoffAutomations: 0 };
  });

  // Hush BEFORE the assertions so audio never lingers if one fails.
  await page.keyboard.press('ControlOrMeta+Period');
  await page.waitForTimeout(300);

  // 1. The notes sound at all.
  expect(
    probe.oscillators,
    'expected the scene to create oscillators (notes sounding)'
  ).toBeGreaterThan(0);
  // 2. THE CV: the ADSR envelope drives the BiquadFilter cutoff (frequency automations).
  expect(
    probe.cutoffAutomations,
    'expected the ADSR envelope to automate the filter cutoff (BiquadFilter.frequency) — CV rendered'
  ).toBeGreaterThan(0);
  // 3. Audible output.
  expect(rms, 'expected audible output (peak RMS over the window)').toBeGreaterThan(0.001);

  noErrors();
});
