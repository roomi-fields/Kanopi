// COMMANDE PRODUCE — le geste « produire la scène active », point d'entrée UNIQUE partagé par le
// bouton PRODUCE de la barre et la façade de pilotage (`window.kanopi.produce`).
//
// POURQUOI ce module existe (même classe de défaut que `commands/tempo`, [927]/[929]) : PRODUCE
// n'est PAS `openBlocks.produceLoadedProgram`. C'est un geste de BASCULE — produire un autre
// onglet que la scène vivante coupe d'abord la sortante (règle « une seule scène sonne ») ;
// re-produire la scène vivante l'arrête en place avant de re-dériver. Ce prélude vivait dans le
// composant Svelte : un banc qui appelait `produceLoadedProgram` directement le SAUTAIT et
// mesurait donc un enchaînement que l'utilisateur ne produit jamais (deux scènes superposées, ou
// une re-dérivation par-dessus un transport encore vivant).
//
// `produceLoadedProgram` garde ses appelants légitimes de plus BAS niveau — le chargement d'une
// scène au boot (App.svelte) et le rebranchement MIDI — qui ne sont PAS le geste du bouton. Ce
// module ne les remplace pas : il nomme le geste UTILISATEUR, celui qui doit être identique
// partout.

import { workspace } from '../../stores/workspace.svelte';
import { openBlocks } from '../../stores/blocks.svelte';
import { playback } from '../../stores/playback.svelte';
import { core } from '../core';

/** Produire la scène de l'onglet actif, bascule comprise. Sans onglet actif : ne fait rien
 *  (le bouton est désactivé dans cet état — ceci est le filet). */
export async function produceActiveScene(): Promise<void> {
  const activeFile = workspace.activeTabId ? workspace.fileById(workspace.activeTabId) : undefined;
  if (!activeFile) return;
  if (activeFile.id !== openBlocks.liveFileId) {
    await core.silenceRuntimes();
    openBlocks.disarmAll();
  } else {
    playback.stop();
  }
  await openBlocks.produceLoadedProgram(activeFile.id);
}
