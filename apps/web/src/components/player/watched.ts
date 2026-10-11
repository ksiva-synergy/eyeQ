/**
 * Distinct seconds watched, from samples of a player's playhead (plan phase 5: seeking must
 * not count). Between two samples taken while playing, every whole second the playhead
 * crossed counts once, if it moved like playback: forwards, and no more than 2.5x the wall
 * time between the samples (so 2x playback speed counts). A bigger or a backwards jump is a
 * seek: only the second it lands in counts. Seconds already counted never count again.
 */
export class WatchCounter {
  private seen = new Set<number>();
  private last: { t: number; wallMs: number } | null = null;

  sample(t: number, wallMs: number, playing: boolean): void {
    if (!playing) {
      this.last = null;
      return;
    }
    const prev = this.last;
    const natural =
      prev !== null && t >= prev.t && t - prev.t <= ((wallMs - prev.wallMs) / 1000) * 2.5 + 0.1;
    if (natural && prev) {
      for (let s = Math.floor(prev.t); s <= Math.floor(t); s++) this.seen.add(s);
    } else {
      this.seen.add(Math.floor(t));
    }
    this.last = { t, wallMs };
  }

  /** Share of a video of `durationS` seconds watched, 0 to 1. */
  fraction(durationS: number): number {
    const whole = Math.max(1, Math.ceil(durationS));
    return Math.min(1, this.seen.size / whole);
  }
}
