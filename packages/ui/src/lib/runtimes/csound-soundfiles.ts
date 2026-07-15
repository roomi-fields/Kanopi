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

// MÉMOÏSATION par nom de fichier (chantier latence [786]) — sans garde, CHAQUE éval d'un CSD
// refetchait+réécrivait ses soundfiles, même si déjà chargés (course avec le fetch VPS à chaque
// note). `loaded` = fichiers CONFIRMÉS écrits (succès `writeCsoundFile` → `true`) : jamais re-fetch.
// `inflight` = fetch/écriture EN COURS par nom : un 2e appelant concurrent attend la MÊME promesse
// au lieu de dupliquer le fetch. Un échec n'entre PAS dans `loaded` et sort de `inflight` une fois
// réglé → un appel ultérieur retente (best-effort par fichier, jamais de poison permanent).
const loaded = new Set<string>();
const inflight = new Map<string, Promise<void>>();

/**
 * Avant l'éval d'un CSD, récupère chaque soundfile qu'il référence depuis le store auto-hébergé
 * (`ASSET_PATHS.csoundSamples()/<nom>`, même base VPS que les autres libs) et l'écrit dans le FS virtuel
 * Csound (`writeCsoundFile`). Best-effort PAR fichier : un échec de fetch/écriture est loggé, JAMAIS
 * jeté — un sample manquant dégrade cette voix, il ne doit pas casser l'éval. Mémoïsé par nom : un
 * fichier déjà chargé (ou en cours de chargement par un appel concurrent) n'est jamais re-fetch —
 * cette fonction devient un no-op mémoïsé quand le préchauffage à l'ouverture (`preload-on-open`)
 * l'a déjà tiré ; elle reste le filet de sécurité si l'ouverture n'a pas préchargé la scène.
 */
export async function ensureCsoundSoundfiles(code: string, log: LogPush): Promise<void> {
  const names = new Set<string>();
  for (const m of code.matchAll(SOUNDFILE_RE)) names.add(m[1]);
  if (names.size === 0) return;
  const base = ASSET_PATHS.csoundSamples();
  await Promise.all([...names].map((name) => loadOnce(name, base, log)));
}

function loadOnce(name: string, base: string, log: LogPush): Promise<void> {
  if (loaded.has(name)) return Promise.resolve();
  const existing = inflight.get(name);
  if (existing) return existing;

  const p = (async () => {
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
      const ok = await writeCsoundFile(name, bytes, log);
      if (ok) loaded.add(name);
    } catch (e) {
      log({
        runtime: 'csound',
        level: 'warn',
        msg: `soundfile "${name}" non chargé : ${String(e)}`
      });
    } finally {
      inflight.delete(name);
    }
  })();

  inflight.set(name, p);
  return p;
}
