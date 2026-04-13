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
    this.tempo = 120;         // BPM
    this.beatsPerBar = 4;
    this._beatCount = 0;
    this._barCount = 0;
    this._nextBeatTime = 0;   // absolute time of next beat
    this._onBeat = null;      // (beatCount, barCount) => void
  }

  /** Current playback time in seconds (relative to start) */
  get now() {
    if (!this._running) return 0;
    return this.audioCtx.currentTime - this._startTime;
  }

  /** Absolute audio time for a relative event time */
  absTime(relSec) {
    return this._startTime + relSec;
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
  start(callback) {
    if (this._running) return;
    this._callback = callback;
    this._startTime = this.audioCtx.currentTime;
    this._running = true;
    this._beatCount = 0;
    this._barCount = 0;
    this._nextBeatTime = this._startTime;
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
