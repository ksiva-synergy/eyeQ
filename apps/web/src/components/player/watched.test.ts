import { describe, expect, it } from "vitest";
import { WatchCounter } from "./watched";

/** Samples every 250 ms of wall time, the playhead at `rate` times real time from `from`. */
function play(c: WatchCounter, from: number, seconds: number, rate = 1, startWall = 0): number {
  let wall = startWall;
  for (let i = 0; i <= seconds * 4; i++) {
    c.sample(from + (i / 4) * rate, wall, true);
    wall += 250;
  }
  return wall;
}

describe("WatchCounter", () => {
  it("counts every second of a video played through", () => {
    const c = new WatchCounter();
    play(c, 0, 10);
    expect(c.fraction(10)).toBe(1);
  });

  it("does not count a seek ahead", () => {
    const c = new WatchCounter();
    const wall = play(c, 0, 2); // 0..2 s watched
    c.sample(9, wall + 250, true); // jump to 9 s
    play(c, 9, 1, 1, wall + 500); // 9..10
    expect(c.fraction(10)).toBeCloseTo(5 / 10); // seconds 0, 1, 2, 9, 10
  });

  it("counts 2x playback speed", () => {
    const c = new WatchCounter();
    play(c, 0, 5, 2);
    expect(c.fraction(10)).toBe(1);
  });

  it("counts a replayed part once", () => {
    const c = new WatchCounter();
    const wall = play(c, 0, 4);
    c.sample(0, wall + 250, true); // back to the start
    play(c, 0, 4, 1, wall + 500);
    expect(c.fraction(10)).toBeCloseTo(5 / 10); // 0..4
  });

  it("does not count while paused", () => {
    const c = new WatchCounter();
    c.sample(0, 0, true);
    c.sample(5, 5000, false);
    c.sample(5, 5250, true);
    expect(c.fraction(10)).toBeCloseTo(2 / 10); // 0 and 5
  });
});
