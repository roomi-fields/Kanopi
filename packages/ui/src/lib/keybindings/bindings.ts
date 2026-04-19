import { ui } from '../../stores/ui.svelte';
import { clock } from '../../stores/clock.svelte';
import { core } from '../core';

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
  // Space toggles play/stop only if not editing
  if (e.code === 'Space' && !inEditableTarget(e) && !isMod(e) && !e.altKey) {
    e.preventDefault();
    clock.toggle();
  }
}

export function installGlobalKeybindings() {
  // Capture phase so we beat the browser's Ctrl+1..9 tab-switch accelerator.
  const opts: AddEventListenerOptions = { capture: true };
  window.addEventListener('keydown', handleGlobalKey, opts);
  return () => window.removeEventListener('keydown', handleGlobalKey, opts);
}
