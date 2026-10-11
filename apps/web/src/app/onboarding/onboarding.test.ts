import type { ProgramCard } from "@eyeq/api-contract";
import { describe, expect, it } from "vitest";
import { parseDob } from "./options";
import { pickStarter } from "./starter/pick";

describe("parseDob", () => {
  const today = new Date("2026-10-11T12:00:00Z");
  it.each([
    ["14 / 03 / 2007", "2007-03-14"],
    ["14/3/2007", "2007-03-14"],
    ["14032007", "2007-03-14"],
    ["1-1-2000", "2000-01-01"],
  ])("reads %s", (input, iso) => expect(parseDob(input, today)).toBe(iso));
  it.each(["31 / 02 / 2001", "14 / 13 / 2001", "01 / 01 / 1900", "12 / 10 / 2026", "2007", ""])(
    "refuses %s",
    (input) => expect(parseDob(input, today)).toBeNull(),
  );
});

const card = (o: Partial<ProgramCard> & Pick<ProgramCard, "slug">): ProgramCard => ({
  id: crypto.randomUUID(),
  title: o.slug,
  description: null,
  coverUrl: null,
  sportTags: [],
  level: null,
  durationDays: 21,
  minLevel: 1,
  coachLine: null,
  isFree: false,
  inSubscription: true,
  product: null,
  moduleCount: 1,
  sessionCount: 1,
  drillCount: 4,
  measurementTags: [],
  measurementGroups: [],
  hasAccess: false,
  enrollment: null,
  ...o,
});

describe("pickStarter", () => {
  const reset = card({
    slug: "reset",
    isFree: true,
    hasAccess: true,
    durationDays: 3,
    measurementGroups: ["vision"],
  });
  const cricket = card({
    slug: "cricket",
    sportTags: ["cricket"],
    measurementGroups: ["vision", "reaction"],
  });
  const multi = card({
    slug: "multi",
    sportTags: ["cricket", "tennis", "badminton"],
    measurementGroups: ["reaction"],
  });

  it("a free athlete starts on the free program and sees the sport's program as when-ready", () => {
    expect(pickStarter([reset, multi, cricket], "cricket", "reaction")).toMatchObject({
      starter: { slug: "reset" },
      other: { slug: "cricket" },
      otherKind: "whenReady",
    });
  });

  it("an athlete with access starts on the sport's program and sees the free one as lighter", () => {
    const open = { ...cricket, hasAccess: true };
    expect(pickStarter([reset, multi, open], "cricket", "reaction")).toMatchObject({
      starter: { slug: "cricket" },
      other: { slug: "reset" },
      otherKind: "lighter",
    });
  });

  it("nothing open: no starter, the recommendation as when-ready", () => {
    expect(pickStarter([multi, cricket], "cricket", null)).toMatchObject({
      starter: null,
      other: { slug: "cricket" },
    });
  });
});
