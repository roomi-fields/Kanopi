// output-runtime-contract — copie HÔTE de la forme partagée du contrat de frontière
// `hub/contrats/hote-runtimes-sortie.md` (RATIFIÉ 2026-07-03). Généralise
// `kanopi-runtime-codevoices.md` aux QUATRE familles de sortie (audio / midi / osc / voix de code).
//
// Conformité par IDENTITÉ STRUCTURELLE : aucun import mutuel de types d'un paquet runtime. Seul
// `ScheduledEvent` est re-exporté VERBATIM depuis `@kronos/core` — Kronos en est l'autorité (il le
// produit et le route sur `output.runtime`). L'hôte le forwarde ENTIER et INCHANGÉ ; toute lecture
// de facette (`content.pitch.hz`, `controls.vel`, `output.channel`…) se fait DANS la runtime.
//
// PHASE 1 (additif) : ce fichier POSE la forme cible. Rien ne le consomme encore — les wrappers
// hôte actuels (`kronos-audio.ts`) restent en place ; la Phase 2 migre chaque runtime vers cette
// forme, une à la fois, en lockstep avec son propriétaire. Aucun retrait de logique ici.

import type { ScheduledEvent, ClockProvider } from '@kronos/core';
import type { EvalSource, LogPush } from './adapter';

// L'événement ordonnancé, passé VERBATIM (l'hôte ne le remodèle jamais).
export type { ScheduledEvent } from '@kronos/core';

/**
 * L'interface UNIFORME qu'expose TOUTE runtime de sortie (§Interface du contrat). L'hôte n'appelle
 * QUE ces méthodes, identiquement, quelle que soit la sortie ; l'adaptateur est FOURNI par le
 * paquet de la runtime — l'hôte n'en écrit aucun.
 *
 * Répartition des appelants (contrat §Interface) :
 * - `send` / `bindClock` : appelés par **Kronos** (il possède le registre + le temps + le bus de
 *   cycle de vie). `bindClock` livre la vue horloge LECTURE SEULE *et* le bus de cycle de vie
 *   (pause/resume/stop) porté par le `clock` — la runtime s'y abonne, l'hôte ne relaie jamais
 *   l'état transport (ce serait de l'état d'autorité hôte, interdit).
 * - `evaluate` / `attach` / `dispose` : appelés par l'**hôte** (porter le geste ≠ résoudre l'état).
 */
export interface OutputRuntimeAdapter {
  /** Kronos→rt : émet l'événement ordonnancé VERBATIM. La runtime met en forme ; l'hôte ne touche pas. */
  send(event: ScheduledEvent): void;

  /**
   * Kronos→rt : vue horloge LECTURE SEULE + bus de cycle de vie. La runtime LIT le temps
   * (`musicalNow`/`audioTimeFor`/`rate`) et s'abonne aux transitions transport ; elle ne reconstruit
   * NI la position NI l'état. Optionnel : un sink discret (note one-shot) n'en a pas besoin.
   */
  bindClock?(clock: ClockProvider): void;

  /** hôte→rt : point de capture d'une voix de code, tiré à l'onset par Kronos (voix de capture seulement). */
  evaluate?(code: string, src: EvalSource, log: LogPush): Promise<void>;

  /** hôte→rt : ancrage DOM (canvas/conteneur). La runtime rend DANS l'élément ; l'hôte ne rend pas. */
  attach?(el: HTMLElement): void;

  /** hôte→rt : libère tout (contexte audio, nœuds, écouteurs). */
  dispose?(): void;

  /**
   * hôte→rt : pré-init IDEMPOTENTE + réveil du contexte, appelée au chargement de scène dans la
   * chaîne de geste (resume audio honoré) ; no-op si déjà chaud, best-effort hors geste. Optionnel
   * — sorties sœurs seulement (les voix de code sont réchauffées via `preload()` de paquet, hors
   * interface uniforme, cf. asymétrie ratifiée).
   */
  warmup?(): void | Promise<void>;

  /**
   * hôte→rt : intention de MIXAGE (gains 0..1 linéaires, multiplicatifs acteur×maître). Les nœuds
   * de gain appartiennent à la runtime (créés par elle, à la demande) — l'hôte n'en crée aucun et
   * ne porte que l'intention ; rampe anti-clic (~20 ms) à chaque écriture, côté runtime ; niveaux +
   * mute maître survivent au stop→play ET à reset() (réglage de console, pas état de rendu) ; borne
   * 0..1, valeur non-numérique → défaut sûr 1. `setActorGain(a, 0)` ≠ `setActorMuted(a, true)` :
   * gain 0 = voix armée mais inaudible, mute = la voix ne sonne pas — indépendants et composables.
   * Optionnel. (Amendement 2026-07-09, runtime-audio `7348674`, ratifié architecte.)
   */
  setMasterGain?(v: number): void;
  setActorGain?(actor: string, v: number): void;
  setMasterMuted?(m: boolean): void;
}
