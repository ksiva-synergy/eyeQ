import { describe, expect, it } from "vitest";
import { moveDrill, moveModule, moveSession, nudge, sameOrder, type Order } from "./order";

const order: Order = [
  {
    id: "m1",
    sessions: [
      { id: "s1", drillIds: ["a", "b", "c"] },
      { id: "s2", drillIds: ["d"] },
    ],
  },
  { id: "m2", sessions: [{ id: "s3", drillIds: ["a", "e"] }] },
];

describe("builder order moves", () => {
  it("moves a module", () => {
    expect(moveModule(order, "m2", 0).map((m) => m.id)).toEqual(["m2", "m1"]);
  });

  it("moves a session within and across modules", () => {
    expect(moveSession(order, "s2", "m1", 0)[0]!.sessions.map((s) => s.id)).toEqual(["s2", "s1"]);
    const across = moveSession(order, "s1", "m2", 1);
    expect(across.map((m) => m.sessions.map((s) => s.id))).toEqual([["s2"], ["s3", "s1"]]);
  });

  it("moves a drill within and across sessions, never into a session that has it", () => {
    expect(moveDrill(order, "s1", "c", "s1", 0)[0]!.sessions[0]!.drillIds).toEqual(["c", "a", "b"]);
    const across = moveDrill(order, "s1", "b", "s2", 0);
    expect(across[0]!.sessions.map((s) => s.drillIds)).toEqual([
      ["a", "c"],
      ["b", "d"],
    ]);
    expect(sameOrder(moveDrill(order, "s1", "a", "s3", 0), order)).toBe(true);
  });

  it("nudges one step and stops at the ends", () => {
    expect(
      nudge(order, { kind: "drill", sessionId: "s1", id: "a" }, 1)[0]!.sessions[0]!.drillIds,
    ).toEqual(["b", "a", "c"]);
    expect(nudge(order, { kind: "session", id: "s1" }, -1)[0]!.sessions.map((s) => s.id)).toEqual([
      "s1",
      "s2",
    ]);
    expect(nudge(order, { kind: "module", id: "m1" }, 1).map((m) => m.id)).toEqual(["m2", "m1"]);
  });
});
