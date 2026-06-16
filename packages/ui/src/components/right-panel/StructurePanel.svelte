<script lang="ts">
  import { production } from '../../stores/production.svelte';
  import { isNoteName } from 'bp3-frontend';

  // GRAPHICAL structure of the FULL derived production (Romain: "comme l'ancien
  // BPscript — même principe"): a piano-roll / timeline of what was produced.
  //   X = time (0 → durationSec). Each token is a rectangle at its onset/dur.
  //   Y = pitch for resolvable note tokens (higher pitch = higher row); tokens
  //       that aren't a pitch (bols, words, backtick refs) sit in a "text" lane
  //       under the staff. Non-sounding tokens render dimmed.
  //   Sections (head-rule macro structure) draw as labelled vertical bands; the
  //   STEP-selected section is highlighted.
  // Reads `production.current` reactively; empty state for runtimes (Strudel,
  // Hydra) that produce no symbolic structure.

  const set = $derived(production.current);

  // --- pitch mapping ---------------------------------------------------------
  // Self-contained note-name → MIDI for the height axis. Covers the three naming
  // systems the BP3 front-end recognises (English `C#4`, French solfège `do4`/
  // `re3`, sargam `sa4`), each with an octave digit. Returns null for anything
  // that isn't a resolvable pitch (→ text lane). Kept local + pure: the runtime
  // Resolver is heavyweight and not exported; the height only needs a relative
  // semitone, not a frequency.
  const SEMI: Record<string, number> = {
    c: 0,
    'c#': 1,
    db: 1,
    d: 2,
    'd#': 3,
    eb: 3,
    e: 4,
    f: 5,
    'f#': 6,
    gb: 6,
    g: 7,
    'g#': 8,
    ab: 8,
    a: 9,
    'a#': 10,
    bb: 10,
    b: 11,
    // French solfège
    do: 0,
    re: 2,
    mi: 4,
    fa: 5,
    sol: 7,
    la: 9,
    si: 11,
    ut: 0,
    // sargam (just-degree shorthand, mapped onto the 12-TET grid for display)
    sa: 0,
    ga: 4,
    ma: 5,
    pa: 7,
    dha: 9,
    ni: 11
  };

  function noteToMidi(tok: string): number | null {
    // Strip accents (the accented solfège "re" with an acute accent) so the
    // lookup table can stay ASCII — the Svelte JS parser dislikes non-ASCII keys.
    const ascii = tok.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const m = ascii.match(/^([a-zA-Z]+)(#|b|d|k)?(-?\d+)$/);
    if (!m) return null;
    const base = m[1].toLowerCase();
    const accidental = m[2] === '#' || m[2] === 'k' ? '#' : m[2] === 'b' ? 'b' : '';
    const octave = parseInt(m[3], 10);
    let semi = SEMI[base + accidental];
    if (semi === undefined) semi = SEMI[base];
    if (semi === undefined) return null;
    return (octave + 1) * 12 + semi; // MIDI: C-1 = 0, so C4 = 60
  }

  type Note = {
    token: string;
    startSec: number;
    durSec: number;
    sounding: boolean;
    midi: number | null;
  };

  const notes = $derived<Note[]>(
    (set?.tokens ?? []).map((t) => ({
      token: t.token,
      startSec: t.startSec,
      durSec: t.durSec,
      sounding: t.sounding,
      midi: isNoteName(t.token) ? noteToMidi(t.token) : null
    }))
  );

  const pitched = $derived(notes.filter((n) => n.midi !== null));
  const textLane = $derived(notes.filter((n) => n.midi === null));

  // --- geometry --------------------------------------------------------------
  const W = 1000; // viewBox width (SVG scales to the container)
  const PAD_L = 8;
  const PAD_R = 8;
  const STAFF_TOP = 22; // room for section labels
  const STAFF_H = 150;
  const TEXT_LANE_H = 28;
  const H = $derived(STAFF_TOP + STAFF_H + (textLane.length > 0 ? TEXT_LANE_H + 8 : 0));

  const dur = $derived(Math.max(set?.durationSec ?? 0, 0.001));
  const innerW = W - PAD_L - PAD_R;

  function x(sec: number) {
    return PAD_L + (sec / dur) * innerW;
  }
  function w(durSec: number) {
    return Math.max((durSec / dur) * innerW, 1.5);
  }

  // Pitch range → staff rows. One row per occupied MIDI value, padded by a
  // semitone each side so the top/bottom notes don't touch the edges.
  const midiVals = $derived(pitched.map((n) => n.midi as number));
  const minMidi = $derived(midiVals.length ? Math.min(...midiVals) - 1 : 60);
  const maxMidi = $derived(midiVals.length ? Math.max(...midiVals) + 1 : 72);
  const span = $derived(Math.max(maxMidi - minMidi, 1));
  const rowH = $derived(STAFF_H / (span + 1));

  function y(midi: number) {
    // Higher MIDI → smaller y (top of staff).
    return STAFF_TOP + (maxMidi - midi) * rowH;
  }

  // --- sections --------------------------------------------------------------
  // Section bands. The STEP cursor (production.stepIndex) highlights the section
  // currently being played; -1 = whole structure, no highlight.
  const sections = $derived(set?.sections ?? []);
  const activeStep = $derived(production.stepIndex);
</script>

<div class="structure">
  {#if !set || set.tokens.length === 0}
    <div class="empty">
      No symbolic structure for this runtime. Evaluate a BP3/BPScript grammar to see its produced
      structure as a piano-roll.
    </div>
  {:else}
    <header class="hdr">
      <span class="label">
        {set.source} · {pitched.length} pitched · {textLane.length} text · {dur.toFixed(2)}s
      </span>
    </header>
    <div class="roll">
      <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" class="svg">
        <!-- section bands -->
        {#each sections as sec, i (i)}
          <g>
            <rect
              class="band"
              class:active={i === activeStep}
              x={x(sec.startSec)}
              y={STAFF_TOP}
              width={Math.max(x(sec.endSec) - x(sec.startSec), 0)}
              height={STAFF_H}
            />
            <line
              class="band-edge"
              x1={x(sec.startSec)}
              y1={STAFF_TOP}
              x2={x(sec.startSec)}
              y2={STAFF_TOP + STAFF_H}
            />
            <text class="band-label" class:active={i === activeStep} x={x(sec.startSec) + 4} y={14}>
              {sec.name}
            </text>
          </g>
        {/each}

        <!-- pitched note rectangles -->
        {#each pitched as n, i (i)}
          <rect
            class="note"
            class:mute={!n.sounding}
            x={x(n.startSec)}
            y={y(n.midi as number)}
            width={w(n.durSec)}
            height={Math.max(rowH - 1.5, 2)}
            rx="1"
          >
            <title>{n.token} · {n.startSec.toFixed(2)}s</title>
          </rect>
        {/each}

        <!-- text-lane tokens (non-pitched) -->
        {#if textLane.length > 0}
          <line
            class="lane-sep"
            x1={PAD_L}
            y1={STAFF_TOP + STAFF_H + 4}
            x2={W - PAD_R}
            y2={STAFF_TOP + STAFF_H + 4}
          />
          {#each textLane as n, i (i)}
            <rect
              class="text-tok"
              class:mute={!n.sounding}
              x={x(n.startSec)}
              y={STAFF_TOP + STAFF_H + 8}
              width={w(n.durSec)}
              height={TEXT_LANE_H}
              rx="1"
            >
              <title>{n.token} · {n.startSec.toFixed(2)}s</title>
            </rect>
          {/each}
        {/if}
      </svg>
      {#if textLane.length > 0}
        <div class="lane-tag">text / non-pitched</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .structure {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .hdr {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border-dim);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .empty {
    padding: 18px 16px;
    color: var(--text-faint);
    font-size: 11.5px;
    line-height: 1.6;
  }
  .roll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px 12px;
  }
  .svg {
    width: 100%;
    height: auto;
    display: block;
  }

  /* sections */
  .band {
    fill: rgba(255, 255, 255, 0.015);
  }
  .band.active {
    fill: rgba(232, 156, 62, 0.1);
  }
  .band-edge {
    stroke: var(--border);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .band-label {
    fill: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.04em;
  }
  .band-label.active {
    fill: var(--amber);
  }

  /* notes */
  .note {
    fill: var(--amber);
  }
  .note.mute {
    fill: var(--text-dim);
    opacity: 0.55;
  }

  .lane-sep {
    stroke: var(--border-dim);
    stroke-width: 1;
  }
  .text-tok {
    fill: var(--cyan);
    opacity: 0.65;
  }
  .text-tok.mute {
    fill: var(--text-dim);
    opacity: 0.45;
  }
  .lane-tag {
    position: absolute;
    right: 16px;
    bottom: 10px;
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: 0.1em;
    color: var(--text-faint);
    text-transform: uppercase;
    pointer-events: none;
  }
</style>
