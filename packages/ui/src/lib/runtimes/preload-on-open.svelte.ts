// PRÉCHAUFFAGE À L'OUVERTURE ([762]/#755.1, direction archi [762]) — dès qu'une scène qui embarque
// un moteur voix-de-code devient le fichier ACTIF, on lance le préchauffage du/des moteur(s) EN FOND,
// SANS attendre le produce/play. Ainsi, quand l'utilisateur joue, le moteur est DÉJÀ chargé ; le seul
// résiduel est l'unlock du contexte audio (règle autoplay navigateur), qui reste au 1er geste Play.
//
// L'hôte NE fait que TRANSPORTER la liste d'interprètes (lus sur l'AST compilé par `interpsForScene`,
// mêmes extracteurs que le produce — aucune re-dérivation texte) vers l'entrée paquet `preload` de
// runtime-codevoices, idempotente (optional-chained : no-op tant que le pair ne l'exporte pas).

import { workspace } from '../../stores/workspace.svelte';
import { runtimeFromExt } from '../workspace/types';
import { interpsForScene } from './bpx-adapter';
import { preload } from 'runtime-codevoices';

/**
 * Installe le watcher réactif (appelé une fois au boot, `main.ts`). À chaque changement de fichier
 * ACTIF vers une scène bp3/bpscript, énumère ses interprètes voix-de-code et les préchauffe en fond.
 * Garde par ID de fichier : préchauffe UNE fois par ouverture (les ré-évals/edits repassent par le
 * warmup du produce). Best-effort : un échec de préchauffage n'a aucun effet visible.
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
      if (interps.length > 0) void preload?.(interps);
    });
  });
}
