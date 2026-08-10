import type { VirtualFile } from './types';
import { runtimeFromExt } from './types';
import mainRaw from '../../../../library/scenes/code-voices/starter-main.bps?raw';
import secondRaw from '../../../../library/scenes/code-voices/starter-second.bps?raw';

const raw: { path: string; contents: string }[] = [
  {
    path: 'main.bps',
    contents: mainRaw
  },
  {
    path: 'second.bps',
    contents: secondRaw
  }
];

// ⚠️ LE RUNTIME SE RÉSOUT À LA DEMANDE, PAS AU CHARGEMENT. `runtimeFromExt` dérive du registre, et
// le registre n'existe qu'après `initAdapters(bus)` (chantier bus 2026-08-10). Appelée depuis
// l'initialiseur d'un magasin de module, cette fonction lisait un registre pas encore construit.
// C'est la TROISIÈME valeur de cette famille trouvée aujourd'hui, après la table extension→runtime
// et la liste des extensions connues : on ne les trouve qu'une par une, et chacune coûte un rouge.
export function starterFiles(): VirtualFile[] {
  return raw.map((f, i) => ({
    id: `f${i + 1}`,
    path: f.path,
    name: f.path.split('/').pop() ?? f.path,
    contents: f.contents,
    get runtime() {
      return runtimeFromExt(f.path);
    }
  })) as VirtualFile[];
}
