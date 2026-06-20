/**
 * BPscript Clock — Web Audio lookahead scheduler
 *
 * Uses AudioContext.currentTime for sample-accurate timing.
 * Lookahead: schedules events 100ms ahead, checks every 25ms.
 */

export class Clock {
  constructor(audioCtx) {
    this.audioCtx = audioCtx;
    this.lookahead = 0.1;    // seconds ahead to schedule
    this.interval = 25;       // ms between checks
    this._timer = null;
    this._startTime = 0;
    this._callback = null;
    this._running = false;

    // Beat/bar tracking
    this.tempo = 120;         // BPM — the LIVE (heard) tempo
    this.beatsPerBar = 4;
    this._beatCount = 0;
    this._barCount = 0;
    this._nextBeatTime = 0;   // absolute time of next beat
    this._onBeat = null;      // (beatCount, barCount) => void

    // ---- Anchored tempo map (live retune without re-derivation) ----
    // Events carry MUSICAL-timeline seconds (BPx derived them at `_derivedTempo`).
    // A musical second maps to an audio second through an anchor pair, so a
    // mid-playback tempo change stays continuous (no position jump):
    //   audioTimeFor(m) = _anchorAudio + (m - _anchorMusical) * rate
    //   rate = _derivedTempo / tempo   (audio-seconds per derived-second)
    // `_derivedTempo === 0` ⇒ rate 1 (audio seconds == musical seconds): a clock
    // never told a derive tempo behaves exactly as before.
    this._derivedTempo = 0;
    this._anchorAudio = 0;
    this._anchorMusical = 0;
  }

  /** Current playback time in seconds (relative to start) */
  get now() {
    if (!this._running) return 0;
    return this.audioCtx.currentTime - this._startTime;
  }

  /** Audio-seconds per derived-second. 1 when no derive tempo is known. */
  get rate() {
    if (!this._derivedTempo || this.tempo <= 0) return 1;
    return this._derivedTempo / this.tempo;
  }

  /** Audio time for a musical-timeline second (anchored tempo map). */
  audioTimeFor(musicalSec) {
    return this._anchorAudio + (musicalSec - this._anchorMusical) * this.rate;
  }

  /** Inverse of audioTimeFor: the musical-timeline second at an audio time. */
  musicalNow(audioTime) {
    return this._anchorMusical + (audioTime - this._anchorAudio) / this.rate;
  }

  /** Absolute audio time for a relative event time. Identical to audioTimeFor
   *  under the anchored map (kept for callers using the older name). */
  absTime(relSec) {
    return this.audioTimeFor(relSec);
  }

  /**
   * Record the tempo BPx derived the loaded events at, and reset the live tempo
   * to match (rate 1 — a fresh derivation starts unscaled). Call before start().
   * @param {number} bpm
   */
  setDerivedTempo(bpm) {
    if (bpm > 0) {
      this._derivedTempo = bpm;
      this.tempo = bpm;
    }
  }

  /**
   * Live tempo change WITHOUT re-derivation. Re-anchors at the current audio
   * time so the musical position is continuous (no jump), then future audio
   * times scale by the new rate. Beat emission adopts the new tempo too.
   * @param {number} bpm
   */
  retune(bpm) {
    if (!(bpm > 0)) return;
    if (this._running) {
      const tNow = this.audioCtx.currentTime;
      this._anchorMusical = this.musicalNow(tNow); // measured at the OLD rate
      this._anchorAudio = tNow;
    }
    this.tempo = bpm;
  }

  /**
   * Set beat callback — called on each beat with (beatCount, barCount).
   * @param {Function} onBeat - (beatCount, barCount) => void
   */
  setOnBeat(onBeat) {
    this._onBeat = onBeat;
  }

  /**
   * Start the clock.
   * @param {Function} callback - called with (scheduleUntil) on each tick.
   *   scheduleUntil is the absolute audio time up to which events should be scheduled.
   */
  start(callback, startMusicalSec = 0) {
    if (this._running) return;
    this._callback = callback;
    this._startTime = this.audioCtx.currentTime;
    this._running = true;
    this._beatCount = 0;
    this._barCount = 0;
    this._nextBeatTime = this._startTime;
    // Anchor the tempo map at start: musical `startMusicalSec` ↔ audio _startTime.
    // Non-zero when resuming from a stepped position (STEP → Play), so playback +
    // the beat display begin at that musical offset instead of the top.
    this._anchorAudio = this._startTime;
    this._anchorMusical = startMusicalSec;
    this._tick();
    this._timer = setInterval(() => this._tick(), this.interval);
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _tick() {
    if (!this._running || !this._callback) return;
    const scheduleUntil = this.audioCtx.currentTime + this.lookahead;
    this._callback(scheduleUntil);

    // Beat/bar emission
    if (this._onBeat && this.tempo > 0) {
      const beatDur = 60 / this.tempo;
      while (this._nextBeatTime <= scheduleUntil) {
        this._beatCount++;
        const isBar = (this._beatCount % this.beatsPerBar) === 1;
        if (isBar) this._barCount++;
        this._onBeat(this._beatCount, this._barCount);
        this._nextBeatTime += beatDur;
      }
    }
  }
}
