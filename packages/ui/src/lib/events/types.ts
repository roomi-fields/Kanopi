// KanopiEvent — unified runtime event bus types.
// See docs/design/EVENTS.md for the full specification.

import type { Runtime } from '../core-mock/types';
// La charge de l'événement de production vient de son PROPRIÉTAIRE, jamais d'une copie locale.
import type { ScheduledEvent } from '@kronos/core';

// 'clock' = le temps (Kronos) ; 'in' = le runtime d'ENTRÉE (`runtime-in`), symétrique des
// runtimes de sortie. Ce n'est pas un langage de voix, d'où l'ajout ici et non dans `Runtime`.
export type EventSourceTag = Runtime | 'clock' | 'in';

interface KanopiEventBase {
  readonly schemaVersion: 1;
  readonly t: number; // wall-clock ms via performance.now()
  readonly runtime: EventSourceTag;
  readonly source?: string;
}

export interface BeatEvent extends KanopiEventBase {
  readonly type: 'beat';
  readonly runtime: 'clock';
  readonly count: number;
  readonly bpm: number;
  readonly phase: number;
}

export interface BarEvent extends KanopiEventBase {
  readonly type: 'bar';
  readonly runtime: 'clock';
  readonly count: number;
}

export interface TransportEvent extends KanopiEventBase {
  readonly type: 'transport';
  readonly runtime: 'clock';
  readonly playing: boolean;
  readonly bpm: number;
}

export interface TriggerEvent extends KanopiEventBase {
  readonly type: 'trigger';
  readonly name: string;
}

export type TokenLocation = readonly [from: number, to: number, fileId: string];

export interface TokenEvent extends KanopiEventBase {
  readonly type: 'token';
  readonly name: string;
  readonly pitch?: number;
  readonly gain?: number;
  readonly duration: number;
  readonly locations?: ReadonlyArray<TokenLocation>;
}

export interface FlagEvent extends KanopiEventBase {
  readonly type: 'flag';
  readonly name: string;
  readonly value: number | string | boolean;
}

// L'ÉVÉNEMENT DE PRODUCTION — ce que Kronos PUBLIE au lieu de l'appeler sur un adaptateur.
// Forme arrêtée entre Kronos et Kanopi le 2026-08-10, validée par Romain ; référence
// `atlas/architecture/05-interfaces.md` §5.7.
//
// ⚠️ LA CHARGE EST LE `ScheduledEvent` DE KRONOS, IMPORTÉ — PAS RECOPIÉ. Une copie iso-champs
// entretenue ici dériverait de la sienne sans que rien ne rougisse. Ce n'est pas une précaution
// théorique : le 2026-08-10 au matin, runtime-OSC portait une copie À LA MAIN des types du bus,
// restée à trois phases de transport quand Kronos en publiait quatre — et l'écart était INVISIBLE,
// absorbé par une conversion à cette frontière. Il a fallu retirer la conversion pour qu'il se
// nomme. On importe.
//
// ⚠️ DEUX CHAMPS PORTENT LE MOT `runtime`, ET CE NE SONT PAS LA MÊME CHOSE :
//   · `runtime` de la base — la SOURCE, ici toujours `'clock'` : QUI a émis ;
//   · `output.runtime` dans la charge — la DESTINATION : POUR QUI.
// Un lecteur qui les confond route un événement audio vers le MIDI en croyant lire la source.
// Kronos a vu cette collision avant nous ; elle est nommée ici pour qu'elle ne se redécouvre pas.
//
// ⚠️ DEUX INSTANTS, DEUX USAGES, ET S'EN TROMPER NE SE VOIT PAS :
//   · `t` (base, millisecondes murales) sert à AFFICHER. Il n'est JAMAIS la référence à
//     l'échantillon — l'horloge audio dérive de `performance.now()`, et c'est voulu ;
//   · `payload.onset` (secondes de l'horloge audio) sert à ORDONNANCER. C'est lui qui est exact.
// Un lecteur qui se trompe de champ ne verra jamais son erreur autrement que comme un
// désalignement inexplicable.
//
// `audioTime` N'EST PAS POSÉ sur cette variante, et §5.7 le permet — le champ y est OPTIONNEL,
// « pour les consommateurs audio-critiques ». Or ces consommateurs sont les quatre sorties, et
// elles lisent `onset` sous son nom contractuel. Poser les deux mettrait une MÊME GRANDEUR sous
// DEUX NOMS dont l'un n'aurait aucun lecteur : deux copies dérivent, et rien ne rougit quand elles
// dérivent. Le critère pour revenir dessus est nommé : qu'un consommateur doive lire l'instant
// audio SANS ouvrir la charge, uniformément sur toutes les variantes. Il n'en existe aucun
// aujourd'hui — Kronos a refusé d'en inventer un pour justifier le champ.
export interface OutputEvent extends KanopiEventBase {
  readonly type: 'output';
  readonly runtime: 'clock';
  /** L'événement ordonnancé ENTIER, tel que Kronos le publie et tel que les quatre sorties le
   *  lisent déjà : leur forme de lecture ne change pas, seul l'appel devient un abonnement. */
  readonly payload: ScheduledEvent;
}

// L'ÉVÉNEMENT D'ENTRÉE — charge OPAQUE. Contrat `hub/contrats/hote-runtime-in.md`
// § « L'événement d'entrée » (RATIFIÉ 2026-07-27), forme reprise à l'identique.
//
// L'HÔTE L'ACCUEILLE, IL NE L'INTERPRÈTE PAS. Il tient le bus ; c'est tout. Un nom de note se
// résout par l'alphabet déclaré, EN AVAL — `runtime-in` n'émet que des NUMÉROS, et l'hôte n'en
// fait pas davantage un nom. Aucun routage non plus (`@map` route), aucun état de scène (armer un
// point d'attente est le mandat de Kairos).
//
// PAS DE SECOND BUS : le contrat l'interdit explicitement, parce qu'un bus séparé dupliquerait la
// règle de temps. `t` est TOUJOURS du temps mural, converti à l'émission par le périphérique
// depuis `sink.now()` — un time tag natif (estampille MIDI, time tag OSC) est une donnée à
// convertir, jamais une autorité. C'est cette règle, et elle seule, qui rend une note MIDI et un
// message OSC comparables sur ce bus.
//
// IDENTITÉ STRUCTURELLE, pas import mutuel : chaque dépôt garde sa copie de la forme (même
// principe que `hote-runtimes-sortie.md`). Toute évolution se propose à l'architecte avant d'être
// figée des deux côtés.
export type InputSignal =
  | {
      readonly kind: 'note';
      readonly number: number;
      readonly channel: number;
      readonly velocity: number;
      readonly on: boolean;
    }
  | {
      readonly kind: 'control';
      readonly number: number;
      readonly channel: number;
      readonly value: number;
      /** AMENDEMENT 2026-07-28 (hub adc1bd7, runtime-in 7735417) — TOUJOURS PRÉSENT.
       *  « Aucune valeur ne se lit par une absence » : le champ DIT que ceci est un interrupteur,
       *  au lieu de laisser chacun deviner. `pressed`/`released` pour les six contrôleurs que la
       *  norme MIDI définit à deux états, au seuil qu'elle écrit ; `not-a-switch` pour tous les
       *  autres — et pour un contrôle venu du CLAVIER quel que soit son numéro (une touche
       *  d'ordinateur n'est pas un contrôleur MIDI : elle porte un numéro parce qu'une table le lui
       *  a donné). Les TROIS valeurs sont figées maintenant : en ajouter une plus tard serait une
       *  seconde traversée de l'union, propagée à toutes les copies. L'hôte ne LIT pas ce champ, il
       *  le PORTE. */
      readonly switchReading: 'pressed' | 'released' | 'not-a-switch';
    }
  | { readonly kind: 'address'; readonly path: string; readonly args: readonly unknown[] } // OSC
  | { readonly kind: 'key'; readonly code: string; readonly down: boolean }; // clavier, code PHYSIQUE

export interface InputEvent extends KanopiEventBase {
  readonly type: 'input';
  readonly runtime: 'in';
  /** ÉTIQUETTE lisible — provenance, JAMAIS un routage. L'interdiction ne bouge pas avec
   *  l'amendement : on n'a pas fait mentir un champ existant, on en a ajouté un dont c'est le rôle. */
  readonly source?: string;
  /** IDENTITÉ stable, TOUJOURS présente — la SEULE sur laquelle l'aval a le droit de router.
   *  Mesuré en amont : deux appareils du même modèle portent la MÊME étiquette, donc un aiguillage
   *  bâti sur `source` lève les attentes de l'un avec les gestes de l'autre, et le consommateur ne
   *  peut PAS le détecter (deux étiquettes identiques sont indiscernables). */
  readonly sourceId: string;
  readonly device: 'midi' | 'osc' | 'keyboard';
  readonly signal: InputSignal;
}

/**
 * UN ÉTAT DE PÉRIPHÉRIQUE — type d'événement DISTINCT, jamais une cinquième nature de signal :
 * personne n'a joué quoi que ce soit. `runtime-in` PORTE le fait, et il ne commande aucun geste.
 * Forme du bus : décision `2026-07-27-forme-du-bus-etat-de-commutateur-identite-de-port-fermeture.md`.
 *
 * ⛔ CE COMMENTAIRE AFFIRMAIT « c'est le CONSOMMATEUR qui tient l'état des barrières ouvertes »,
 * sur une décision supprimée le 2026-08-14. L'affirmation tombe, et je garde sa réfutation plutôt
 * que de l'effacer. LE MODÈLE ARRÊTÉ PAR ROMAIN EST CELUI DU PATCH : quand on retire un câble, la
 * SOURCE DU SIGNAL CESSE — personne ne rattrape en aval, rien ne se referme, ce qui en dépendait
 * retombe de soi-même. Un état de périphérique porte donc le FAIT qu'une source a cessé, jamais un
 * ordre. Qui devrait porter ce geste n'est tranché nulle part, et ce commentaire ne le dit pas.
 *
 * POURQUOI IL EST ICI ALORS QUE L'HÔTE N'EN LIT AUCUN : un type nouveau se propage MÊME chez ceux
 * qui ne le liront jamais. Ce n'est pas un excès de zèle, c'est le type qui l'exige — une copie
 * plus étroite ne peut plus S'ABONNER au bus (la contravariance rougit sur le paramètre de `on`,
 * pas sur `emit`), et c'est exactement le mur sur lequel la livraison des entrées s'est arrêtée le
 * 2026-07-27.
 *
 * Les QUATRE états sont figés maintenant alors que seule la fermeture était demandée : en ajouter
 * un plus tard serait une SECONDE traversée de l'union, propagée à toutes les copies.
 */
export interface InputDeviceEvent extends KanopiEventBase {
  readonly type: 'input-device';
  readonly runtime: 'in';
  readonly source?: string;
  readonly sourceId: string;
  readonly device: 'midi' | 'osc' | 'keyboard';
  readonly state: 'opened' | 'closed' | 'connected' | 'disconnected';
}

export type KanopiEvent =
  | BeatEvent
  | BarEvent
  | TransportEvent
  | TriggerEvent
  | TokenEvent
  | FlagEvent
  | OutputEvent
  | InputEvent
  | InputDeviceEvent;

export type EventType = KanopiEvent['type'];
export type EventOf<T extends EventType> = Extract<KanopiEvent, { type: T }>;
export type Listener<T extends EventType> = (e: EventOf<T>) => void;
export type AnyListener = (e: KanopiEvent) => void;
export type Unsubscribe = () => void;

export interface EventBus {
  on<T extends EventType>(type: T, cb: Listener<T>): Unsubscribe;
  onAny(cb: AnyListener): Unsubscribe;
  emit(e: KanopiEvent): void;
}
