// PRÉCHAUFFAGE À L'OUVERTURE ([762]/#755.1, direction archi [762]) — dès qu'une scène qui embarque
// un moteur voix-de-code devient le fichier ACTIF, on lance le préchauffage du/des moteur(s) EN FOND,
// SANS attendre le produce/play. Ainsi, quand l'utilisateur joue, le moteur est DÉJÀ chargé ; le seul
// résiduel est l'unlock du contexte audio (règle autoplay navigateur), qui reste au 1er geste Play.
//
// L'hôte NE fait que TRANSPORTER la liste d'interprètes (lus sur l'AST compilé par `interpsForScene`,
// mêmes extracteurs que le produce — aucune re-dérivation texte) + les assets qu'elle déclare
// (`assetsForScene` : banques `@library.strudel` + instruments `gm_*` utilisés) vers l'entrée paquet
// `preload` de runtime-codevoices, idempotente (optional-chained : no-op tant que le pair ne l'exporte
// pas). [788] — le préfetch d'assets (fetch+décode GM, ~1s) est ainsi payé à l'ouverture, hors du
// chemin play.
//
// [786] — le lancement reste fire-and-forget ICI (l'ouverture ne doit pas geler l'UI), mais la
// promesse est désormais MÉMOÏSÉE par interprète via `warmUp` (code-voice-warmup.ts) : le play
// (real-core.ts) attend cette MÊME promesse avant d'évaluer une voix autonome — gate déterministe,
// plus de course entre le warmup de fond et un play immédiat.

import { workspace } from '../../stores/workspace.svelte';
import { runtimeFromExt } from '../workspace/types';
import { interpsForScene, assetsForScene } from './bpx-adapter';
import { warmUp } from './code-voice-warmup';
import { ensureCsoundSoundfiles } from './csound-soundfiles';
import { core } from '../core';

/**
 * Installe le watcher réactif (appelé une fois au boot, `main.ts`). À chaque changement de fichier
 * ACTIF vers une scène bp3/bpscript, énumère ses interprètes voix-de-code et les préchauffe en fond.
 * Garde par ID de fichier : préchauffe UNE fois par ouverture (les ré-évals/edits repassent par le
 * warmup du produce). Best-effort : un échec de préchauffage n'a aucun effet visible.
 *
 * [786] — pour une scène csound, précharge AUSSI ses soundfiles (mémoïsés par nom dans
 * `csound-soundfiles.ts`) en fond, à l'ouverture : au play, `ensureCsoundSoundfiles` retombe sur
 * le memo (no-op), le son ne paie plus le fetch VPS au 1er eval. Log : même sink que le reste de
 * l'hôte (`core.console.push`, le canal derrière `this.log` de real-core) — ce module n'a pas
 * d'instance `RealCore` propre, il consomme le singleton `core` déjà utilisé par les stores UI.
 */
export function installPreloadOnOpen(): void {
  let lastFileId: string | null = null;
  $effect.root(() => {
    $effect(() => {
      const id = workspace.activeTabId;
      if (!id || id === lastFileId) return;
      const f = workspace.fileById(id);
      if (!f) return;
      lastFileId = id;
      const runtime = runtimeFromExt(f.name);
      if (runtime !== 'bpscript' && runtime !== 'bp3') return;
      const interps = interpsForScene(f.contents);
      if (interps.length === 0) return;
      const assets = assetsForScene(f.contents);
      void warmUp(interps, assets);
      if (interps.includes('csound')) {
        void ensureCsoundSoundfiles(f.contents, (e) => core.console.push(e));
      }
    });
  });
}
