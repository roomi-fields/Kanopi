import { ui } from '../../stores/ui.svelte';
import { playback } from '../../stores/playback.svelte';
import { core } from '../core';
import { flushPersist } from '../persistence/snapshot.svelte';

export function isMod(e: KeyboardEvent) {
  return e.metaKey || e.ctrlKey;
}

function inEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA';
}

export function handleGlobalKey(e: KeyboardEvent) {
  // Cmd/Ctrl + K (primary) or Cmd/Ctrl + Shift + P (alt) → open palette
  if (isMod(e) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    ui.togglePalette();
    return;
  }
  if (isMod(e) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    ui.togglePalette();
    return;
  }
  // Cmd/Ctrl + . → hush all (Tidal convention)
  if (isMod(e) && !e.shiftKey && !e.altKey && e.key === '.') {
    e.preventDefault();
    void core.hushAll();
    return;
  }
  // Cmd/Ctrl + S → force-save workspace. Autosave already persists on every
  // mutation, but the browser's default behavior (save HTML page) is jarring
  // and a user's finger-memory expects *something* to happen. We swallow the
  // event and flush synchronously; a debug log shows up in the console.
  if (isMod(e) && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    flushPersist();
    core.console.push({ runtime: 'kanopi', level: 'info', msg: 'workspace saved' });
    return;
  }
  // Cmd/Ctrl + 1..9 → toggle mute on the Nth actor (atom-tidalcycles).
  // Cmd/Ctrl + 0 → unmute every actor.
  if (isMod(e) && !e.shiftKey && !e.altKey && /^[0-9]$/.test(e.key)) {
    const n = Number(e.key);
    e.preventDefault();
    if (n === 0) {
      core.actors.unmuteAll();
    } else {
      const target = core.actors.list()[n - 1];
      if (target) core.actors.toggleMute(target.name);
    }
    return;
  }
  // Alt + 1..9 → activate scene N (Kanopi-specific; Tidal has no scene concept).
  if (!isMod(e) && !e.shiftKey && e.altKey && /^[1-9]$/.test(e.key)) {
    const n = Number(e.key);
    const target = core.scenes.list()[n - 1];
    if (target) {
      e.preventDefault();
      core.scenes.activate(target.name);
    }
    return;
  }
  // Space toggles play/stop only if not editing. Route through `playback` (not the
  // raw clock) so a Play-from-stopped runs the explicit armed-block eval — same
  // entry as the Play button and the `clock.toggle` command.
  if (e.code === 'Space' && !inEditableTarget(e) && !isMod(e) && !e.altKey) {
    e.preventDefault();
    // 'playing' → stop; 'stopped' OR 'paused' → play(). play() resumes a paused
    // transport in place (position kept), starts a stopped one — so Space resumes
    // from pause instead of dropping to stop and losing the playhead.
    if (playback.mode === 'playing') playback.stop();
    else playback.play();
  }
}

export function installGlobalKeybindings() {
  // Capture phase so we beat the browser's Ctrl+1..9 tab-switch accelerator.
  const opts: AddEventListenerOptions = { capture: true };
  window.addEventListener('keydown', handleGlobalKey, opts);
  return () => window.removeEventListener('keydown', handleGlobalKey, opts);
}
