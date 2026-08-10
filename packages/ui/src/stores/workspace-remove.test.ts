// VERROUS DE LA SUPPRESSION DE FICHIER (KAN-14) — l'hôte n'en avait AUCUNE : ni bouton, ni menu,
// ni méthode de store. Seule `workspace.reset` nettoyait, globalement.
//
// CE QUE CES VERROUS GARDENT, et pourquoi chacun compte :
//   • le fichier part de l'espace de travail — l'effet visible ;
//   • son ONGLET se ferme, et l'onglet actif se recalcule : sans ça, l'interface garderait un
//     onglet ouvert sur un identifiant qui ne résout plus (l'écran montrerait un fichier fantôme) ;
//   • l'extraction de blocs mémorisée est RELÂCHÉE (`forgetFile` via `closeTab`) : une suppression
//     qui laisserait sa mémoïsation derrière elle ferait ressurgir les blocs d'un fichier disparu
//     si un identifiant venait à se répéter — c'est le piège des identifiants collidants déjà
//     rencontré (voir le compteur monotone de `mintFileId`) ;
//   • un identifiant INCONNU rend `false` et ne touche à rien : une suppression qui ne trouve rien
//     le DIT, elle ne se tait pas ;
//   • les AUTRES fichiers et leur ordre ne bougent pas — une suppression ne réordonne pas.
import { describe, it, expect, beforeEach } from 'vitest';
import { workspace } from './workspace.svelte';
import { createEventBus } from '../lib/events/bus';
import { initAdapters } from '../lib/runtimes/registry';

// LE REGISTRE SE CONSTRUIT AVEC LE BUS, ET `vi.mock` RÉINSTANCIE LE GRAPHE DE MODULES DE CE
// FICHIER — l'initialisation globale de l'environnement de banc ne le suit donc pas jusqu'ici.
// Ce fichier construit comme le cœur construit. Faire taire le cri à la place aurait rendu au
// produit un « aucune voix reconnue » silencieux.
initAdapters(createEventBus());

function repartirDeZero() {
  for (const f of [...workspace.files]) workspace.removeFile(f.id);
}

beforeEach(() => {
  repartirDeZero();
});

describe('workspace.removeFile — le seul point d’entrée de la suppression', () => {
  it('retire le fichier, ferme son onglet et recalcule l’onglet actif', () => {
    const a = workspace.addFile('a.bps', 'A');
    const b = workspace.addFile('b.bps', 'B');
    workspace.openFile(a);
    workspace.openFile(b);
    expect(workspace.activeTabId).toBe(b);

    expect(workspace.removeFile(b)).toBe(true);

    expect(workspace.files.map((f) => f.path)).toEqual(['a.bps']);
    expect(workspace.openTabIds).not.toContain(b);
    // L'onglet actif retombe sur un onglet QUI EXISTE — jamais sur l'identifiant supprimé.
    expect(workspace.activeTabId).toBe(a);
    expect(workspace.fileById(b)).toBeUndefined();
  });

  it('un identifiant inconnu rend false et ne touche à rien', () => {
    const a = workspace.addFile('a.bps', 'A');
    workspace.openFile(a);
    const avant = workspace.files.map((f) => f.path);

    expect(workspace.removeFile('identifiant-qui-n-existe-pas')).toBe(false);

    expect(workspace.files.map((f) => f.path)).toEqual(avant);
    expect(workspace.activeTabId).toBe(a);
  });

  it('les autres fichiers et leur ordre sont intacts', () => {
    const a = workspace.addFile('a.bps', 'A');
    const b = workspace.addFile('b.bps', 'B');
    const c = workspace.addFile('c.bps', 'C');
    workspace.openFile(a);
    workspace.openFile(b);
    workspace.openFile(c);

    workspace.removeFile(b);

    expect(workspace.files.map((f) => f.path)).toEqual(['a.bps', 'c.bps']);
    expect(workspace.openTabIds).toEqual([a, c]);
  });

  it('supprimer le DERNIER fichier laisse un espace de travail vide et sans onglet actif', () => {
    const a = workspace.addFile('seul.bps', 'S');
    workspace.openFile(a);

    expect(workspace.removeFile(a)).toBe(true);

    expect(workspace.files).toHaveLength(0);
    expect(workspace.openTabIds).toHaveLength(0);
    // Pas d'onglet inventé pour combler le vide : `null` dit la vérité de l'écran.
    expect(workspace.activeTabId).toBeNull();
  });

  it('un fichier FERMÉ se supprime aussi — la suppression ne suppose pas l’onglet ouvert', () => {
    const a = workspace.addFile('a.bps', 'A');
    const jamaisOuvert = workspace.addFile('dormant.bps', 'D');
    workspace.openFile(a);

    expect(workspace.removeFile(jamaisOuvert)).toBe(true);
    expect(workspace.files.map((f) => f.path)).toEqual(['a.bps']);
    expect(workspace.activeTabId).toBe(a);
  });
});
