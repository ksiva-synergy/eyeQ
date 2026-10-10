import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, IconButton } from "./Button.tsx";
import { Chip } from "./Chip.tsx";
import { BOARD_ICONS, Icon } from "./Icon.tsx";
import { LevelBadge } from "./LevelBadge.tsx";
import { BottomTabBar } from "./Nav.tsx";
import { ProgressRing, XPBar } from "./Progress.tsx";
import { RankRow } from "./RankRow.tsx";
import { StreakCounter } from "./Streak.tsx";
import { DrillCard } from "./DrillCard.tsx";

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("web components", () => {
  it("draws the 16 board icons, decorative unless labelled", () => {
    expect(BOARD_ICONS).toHaveLength(16);
    expect(html(<Icon name="home" />)).toContain('aria-hidden="true"');
    expect(html(<Icon name="lock" label="Locked" />)).toContain('aria-label="Locked"');
  });

  it("a disabled button says why, inline", () => {
    const out = html(<Button disabledReason="watch 80 % first">Mark done</Button>);
    expect(out).toContain("disabled");
    expect(out).toContain("watch 80 % first");
  });

  it("a loading button is busy and not pressable", () => {
    const out = html(<Button loading>Saving</Button>);
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("disabled");
  });

  it("icon buttons need an accessible name", () => {
    expect(html(<IconButton icon="back" label="Back" />)).toContain('aria-label="Back"');
  });

  it("status chips pair colour with a glyph or word", () => {
    expect(
      html(
        <Chip kind="status" status="done">
          Today done
        </Chip>,
      ),
    ).toContain("<svg");
    expect(
      html(
        <Chip kind="status" status="frozen">
          Frozen
        </Chip>,
      ),
    ).toContain("<svg");
  });

  it("the progress ring exposes progressbar values and a spoken label", () => {
    const out = html(<ProgressRing value={3} max={4} label="3 of 4 drills done" />);
    expect(out).toContain('role="progressbar"');
    expect(out).toContain('aria-valuenow="3"');
    expect(out).toContain('aria-label="3 of 4 drills done"');
  });

  it("the XP bar shows level, title and the gap to the next level", () => {
    const out = html(
      <XPBar level={7} title="Prospect" xpInLevel={188} xpForLevel={411} totalXp={2040} />,
    );
    expect(out).toContain("LVL 7");
    expect(out).toContain("223 XP to 8");
    expect(out).toContain("2,040 XP total");
  });

  it("the streak counter has one label for the whole counter", () => {
    const out = html(
      <StreakCounter
        days={12}
        best={19}
        state="atRisk"
        freezesHeld={1}
        multiplier={1.1}
        endsLabel="11:59 pm"
      />,
    );
    expect(out).toContain("12-day streak, at risk, ends at 11:59 pm, 1 freeze held, best 19");
  });

  it("an ended streak is muted and struck, never red", () => {
    const out = html(
      <StreakCounter days={0} best={19} state="ended" freezesHeld={0} multiplier={1} />,
    );
    expect(out).toContain("line-through");
    expect(out).not.toMatch(/text-cta/);
  });

  it("the level badge always carries its title", () => {
    const out = html(<LevelBadge level={7} tier="prospect" />);
    expect(out).toContain("Prospect");
    expect(out).toContain('aria-label="Level 7, Prospect"');
  });

  it("a rank row reads as one sentence; rank-down is never red", () => {
    const out = html(
      <RankRow
        rank={4}
        name="Arjun R."
        initials="AR"
        sport="Cricket"
        level={7}
        xp={412}
        isMe
        delta={{ dir: "down", n: 2 }}
        gapAbove={{ xp: 56, name: "Meera D." }}
      />,
    );
    expect(out).toContain(
      "Rank 4, you, Arjun R., Cricket, level 7, 412 XP, down 2, 56 XP behind Meera D.",
    );
    expect(out).toContain("text-rank-text");
    expect(out).not.toMatch(/text-cta/);
  });

  it("a locked drill says how to unlock", () => {
    const out = html(
      <DrillCard
        title="Saccade Ladder"
        area="Executive Scan"
        minutes={4}
        xp={10}
        state="locked"
        unlockHint="unlock for 30 coins or go Pro"
      />,
    );
    expect(out).toContain("border-dashed");
    expect(out).toContain("Locked · unlock for 30 coins or go Pro");
  });

  it("the tab bar marks the active tab with aria-current and the 3 px bar", () => {
    const out = html(
      <BottomTabBar
        activeHref="/app"
        items={[
          { href: "/app", label: "Home", icon: "home" },
          { href: "/app/programs", label: "Train", icon: "train" },
        ]}
      />,
    );
    expect(out).toContain('aria-current="page"');
    expect(out).toContain("h-[3px]");
  });
});
