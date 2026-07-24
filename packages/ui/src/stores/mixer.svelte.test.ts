// KAN-UX3 — mixer store: the MUTE intent is APPLIED through the unified Kronos
// mute channel (`setOrchestratedActorMuted`, notes AND code voices alike, [673]);
// VOLUMES + the MASTER mute also route through runtime-audio's gain API
// (`applyMixerGains`, contract [651]). The heavy adapter graph is mocked.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setOrchestratedActorMuted = vi.fn((_n: string, _muted: boolean) => {});
const isOrchestratedActor = vi.fn((_n: string) => true);
const applyMixerGains = vi.fn(() => {});

vi.mock('../lib/runtimes/bpx-adapter', () => ({
  setOrchestratedActorMuted: (n: string, muted: boolean) => setOrchestratedActorMuted(n, muted),
  isOrchestratedActor: (n: string) => isOrchestratedActor(n)
}));
vi.mock('../lib/mixer/mixer-gain', () => ({
  applyMixerGains: () => applyMixerGains()
}));

const actorList: Array<{ name: string; active: boolean; muted?: boolean; runtime: string }> = [];
vi.mock('./actors.svelte', () => ({
  actors: {
    get list() {
      return actorList;
    }
  }
}));

// The store and its intent singleton are module state: import once, reset between tests.
const { mixer } = await import('./mixer.svelte');

function resetMix() {
  // Clear any mute/volume left by a previous test (the intent singleton persists).
  mixer.setMasterMuted(false);
  mixer.setMasterVolume(1);
  for (const name of ['groove', 'viz']) {
    mixer.setActorMuted(name, false);
    mixer.setActorVolume(name, 1);
  }
  vi.clearAllMocks();
}

describe('mixer store application (KAN-UX3)', () => {
  beforeEach(() => {
    actorList.length = 0;
    actorList.push(
      { name: 'groove', active: true, runtime: 'bpscript' },
      { name: 'viz', active: true, runtime: 'hydra' }
    );
    isOrchestratedActor.mockReturnValue(true);
    resetMix();
  });

  it('muting a strip mutes the live voice through Kronos; un-muting clears it', () => {
    mixer.setActorMuted('groove', true);
    expect(setOrchestratedActorMuted).toHaveBeenCalledWith('groove', true);
    mixer.setActorMuted('groove', false);
    expect(setOrchestratedActorMuted).toHaveBeenCalledWith('groove', false);
  });

  it('un-muting the mixer never re-arms an actor the ARMING layer holds silent (DÉSARMÉ)', () => {
    // La couche d'armement n'a plus qu'un état — `active` (le mute d'armement, doublon
    // du désarmement, a été supprimé le 2026-07-24). L'invariant lui survit : démuter le
    // mixer ne doit JAMAIS rallumer une voix que l'utilisateur a désarmée.
    actorList[0].active = false; // désarmé
    mixer.setActorMuted('groove', true);
    mixer.setActorMuted('groove', false);
    expect(setOrchestratedActorMuted).not.toHaveBeenCalledWith('groove', false);
  });

  it('master mute rides the runtime gain API (setMasterMuted, mono scenes covered)', () => {
    mixer.setMasterMuted(true);
    // The primitive is runtime-audio's setMasterMuted (applied via applyMixerGains,
    // which projects the whole snapshot — master.muted included).
    expect(applyMixerGains).toHaveBeenCalled();
    vi.clearAllMocks();
    mixer.setMasterMuted(false);
    expect(applyMixerGains).toHaveBeenCalled();
  });

  // VERROU DE NON-RETOUR (arbitrage architecte 2026-07-24, [896]) — remplace le test qui
  // exigeait l'essaimage par acteur, supprimé le même jour. Le mute maître est un geste de
  // CONSOLE (hote-runtimes-sortie.md:51, « réglage de console, pas état de rendu ») ; il ne
  // doit JAMAIS écrire un mute d'ACTEUR, qui appartient à la résolution transport
  // (decisions/2026-07-02-clarification-5-points-archi.md:10 : Kairos met en file, Kronos
  // draine et résout). `setOrchestratedActorMuted` est l'UNIQUE porte de ce second canal
  // côté hôte (bpx-adapter.ts:1426 → la poignée de voix :2447 → kronos-audio.ts:693-697
  // `kairos.demande({type:'mute', …})`) : ne pas l'appeler = rien dans la file Kairos.
  it("couper le maître n'écrit AUCUN mute d'acteur dans la file Kairos", () => {
    mixer.setMasterMuted(true);
    expect(setOrchestratedActorMuted).not.toHaveBeenCalled();
    mixer.setMasterMuted(false);
    expect(setOrchestratedActorMuted).not.toHaveBeenCalled();
    // Et le geste passe bien par le canal console.
    expect(applyMixerGains).toHaveBeenCalled();
  });

  it('scène MONO (aucun acteur publié) : couper le maître emprunte quand même le canal console', () => {
    // Le cas qui avait motivé l'essaimage supprimé : sans acteur publié, une boucle par
    // acteur ne coupe RIEN. Le canal console agit par SORTIE, donc il couvre ce cas — la
    // preuve que `setMasterMuted` atteint bien les quatre sorties est dans
    // `lib/mixer/mixer-gain.test.ts` (« coupe le maître sur CHAQUE sortie vivante »).
    actorList.length = 0;
    mixer.setMasterMuted(true);
    expect(applyMixerGains).toHaveBeenCalled();
    expect(setOrchestratedActorMuted).not.toHaveBeenCalled();
  });

  it('un mute de strip reste, lui, sur le canal transport (les deux canaux ne se confondent pas)', () => {
    mixer.setActorMuted('viz', true);
    expect(setOrchestratedActorMuted).toHaveBeenCalledWith('viz', true);
    vi.clearAllMocks();
    // Couper puis rétablir le maître ne touche NI l'intention du strip NI le canal transport.
    mixer.setMasterMuted(true);
    mixer.setMasterMuted(false);
    expect(setOrchestratedActorMuted).not.toHaveBeenCalled();
    expect(mixer.isActorMuted('viz')).toBe(true);
  });

  it('volume changes update the intent and route through the gain API — never arm/disarm', () => {
    mixer.setMasterVolume(0.5);
    expect(mixer.master.volume).toBe(0.5);
    expect(applyMixerGains).toHaveBeenCalledTimes(1);
    mixer.setActorVolume('groove', 0.25);
    expect(mixer.actorEntry('groove').volume).toBe(0.25);
    expect(applyMixerGains).toHaveBeenCalledTimes(2);
    // Volume is INDEPENDENT of mute (gain 0 = armed but inaudible ≠ disarmed).
    expect(setOrchestratedActorMuted).not.toHaveBeenCalled();
    expect(mixer.isActorMuted('groove')).toBe(false);
  });

  it('non-orchestrated names are a no-op (no live voice to gate)', () => {
    isOrchestratedActor.mockReturnValue(false);
    mixer.setActorMuted('groove', true);
    expect(setOrchestratedActorMuted).not.toHaveBeenCalled();
  });

  it('reflects the intent reactively (muted state readable by the UI)', () => {
    mixer.setActorMuted('groove', true);
    expect(mixer.isActorMuted('groove')).toBe(true);
    mixer.toggleActorMuted('groove');
    expect(mixer.isActorMuted('groove')).toBe(false);
    mixer.toggleMasterMuted();
    expect(mixer.master.muted).toBe(true);
  });
});
