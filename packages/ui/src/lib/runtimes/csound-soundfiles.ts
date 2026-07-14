// PRÉ-CHARGEMENT des soundfiles Csound ([764](e)) — un CSD lit ses samples depuis un FS VIRTUEL
// (memfs Emscripten de @csound/browser) via `diskin`/`diskin2`/`loscil "nom.wav"`. L'hôte (Kanopi)
// FOURNIT les octets AVANT l'éval : ils sont auto-hébergés sur le VPS (décision Romain, comme les
// soundfonts/samples), chargés PARESSEUSEMENT à la demande, PAS d'upload utilisateur. La base suit
// `setAssetBaseUrl` (source unique) via `ASSET_PATHS.csoundSamples()`.

import { ASSET_PATHS, writeCsoundFile } from 'runtime-codevoices';
import type { LogPush } from './adapter';

// Noms de fichiers audio qu'un CSD référence entre guillemets (`diskin2 "beats.wav"`, `loscil … "x.wav"`).
// Le corpus ne référence que `beats.wav` ; le scan généralise à tout soundfile audio quoté.
const SOUNDFILE_RE = /"([^"]+\.(?:wav|aif|aiff|ogg|flac))"/gi;

/**
 * Avant l'éval d'un CSD, récupère chaque soundfile qu'il référence depuis le store auto-hébergé
 * (`ASSET_PATHS.csoundSamples()/<nom>`, même base VPS que les autres libs) et l'écrit dans le FS virtuel
 * Csound (`writeCsoundFile`). Best-effort PAR fichier : un échec de fetch/écriture est loggé, JAMAIS
 * jeté — un sample manquant dégrade cette voix, il ne doit pas casser l'éval.
 */
export async function ensureCsoundSoundfiles(code: string, log: LogPush): Promise<void> {
  const names = new Set<string>();
  for (const m of code.matchAll(SOUNDFILE_RE)) names.add(m[1]);
  if (names.size === 0) return;
  const base = ASSET_PATHS.csoundSamples();
  await Promise.all(
    [...names].map(async (name) => {
      try {
        const res = await fetch(`${base}/${name}`);
        if (!res.ok) {
          log({
            runtime: 'csound',
            level: 'warn',
            msg: `soundfile "${name}" : HTTP ${res.status} depuis ${base}`
          });
          return;
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        await writeCsoundFile(name, bytes, log);
      } catch (e) {
        log({
          runtime: 'csound',
          level: 'warn',
          msg: `soundfile "${name}" non chargé : ${String(e)}`
        });
      }
    })
  );
}
