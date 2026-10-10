# EyeQ component specs: hand-off for Expo + Next.js

Version 1.0. The design canvas ("EyeQ by Forge Your Peak") is the visual source of truth. `tokens.json` holds every value referenced here; names in backticks like `color.cta` or `duration.flame` are token paths. Where a spec and the canvas disagree, the spec wins and the canvas gets fixed.

**Apps covered:** the athlete app on Expo (iOS and Android, phone-first), the athlete web app and public program pages on Next.js, and the coach admin on Next.js.

---

## 1. Using the tokens

**Single package.** Put `tokens.json` in a shared workspace package (for example `packages/tokens`) and generate two outputs from it:

| Target  | Output                                                                                                         | Notes                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Next.js | CSS custom properties under `:root[data-theme="dark"]` and `[data-theme="light"]`, plus a TS object for JS use | Default theme is dark. Follow `prefers-color-scheme` until the user picks a theme in Profile.                                                                      |
| Expo    | A TS object per theme, served through a `ThemeProvider`                                                        | Use `useColorScheme()` for the default. Strip `px` and pass numbers. Use `lineHeightPx` from `$extensions.eyeq`, because React Native wants absolute line heights. |

Style Dictionary can do both transforms. The file uses `$value` / `$type`, and every value is resolved, with no `{alias}` references.

**Fonts.**

- **Expo:** load Barlow Condensed (700, 800) and Manrope (500, 600, 700, 800) with `expo-font` before the splash screen hides. Register each weight as its own family name, because Android won't synthesise weights.
- **Next.js:** use `next/font/google` with `display: swap` and the fallbacks listed in the tokens.
- **Numerals:** every number gets tabular figures. Use `fontVariant: ['tabular-nums']` in React Native and `font-variant-numeric: tabular-nums` on the web.

**Text scaling (200 % rule).**

- **Expo:** leave `allowFontScaling` on everywhere. On `hero` and `display-xl` numerals set `maxFontSizeMultiplier={1.5}` and let the container wrap. Never fix the height of a text row; use `minHeight`.
- **Next.js:** set type in `rem` (1rem = 16px). Layouts use min-height, never fixed height, on anything with text.

**Motion.**

- **Libraries:** Reanimated 3 in Expo; CSS transitions or Web Animations in Next.js.
- **Rule:** only animate `transform` and `opacity`. Animating layout properties drops frames on low-end Android.
- **Reduced motion:** when `AccessibilityInfo.isReduceMotionEnabled()` or `prefers-reduced-motion` is on, every animation collapses to a `duration.instant` cross-fade to its end state.
- **Ceiling:** no single moment runs longer than `duration.max`.

**Haptics (Expo only).** Map the `haptic.*` tokens to `expo-haptics`:

- `impact.light` → `impactAsync(Light)`
- `impact.medium` → `impactAsync(Medium)`
- `notification.success` → `notificationAsync(Success)`

**Icons.** Outline icons on a 24 grid with a 2px stroke and round caps and joins. Ship them as one SVG set: `react-native-svg` in Expo, inline SVG in Next.js. Icons take `currentColor`; only the reward glyphs (flame, bolt, coin) carry their own colour. Filled versions exist only for the active tab and a done streak flame.

---

## 2. Rules every component follows

1. **Touch targets.** At least `size.touch-min` (44) in both dimensions. A smaller visual uses `hitSlop` (RN) or padding (web) to reach 44.
2. **One red per screen.** `color.cta` marks the single most important action. Everything else is primary (violet), ghost, or text.
3. **Never colour alone.** Every state that matters (selected, done, locked, at risk, frozen, ended, error) also changes shape, icon or text.
4. **Loss is never red.** Ended streaks, missed challenges and rank-down use `text-muted` or `rank-text`. Red text is for destructive actions only.
5. **Disabled explains itself.** A disabled control shows why, inline: "Mark done · after 80 % watched", not a bare grey button.
6. **Flat, fast surfaces.** No blur, no glass, no photo backgrounds. Exactly one shadow token (`elevation.e1`), for sheets, modals, toasts and docks.
7. **Every list has three extra states:** empty, loading and locked. See §5.
8. **Training, not diagnosis.** Any score, rating or measured value is labelled as training. Never show population percentiles or medical language.

---

## 3. Athlete app components

Each block lists props (TS-style, shared between platforms where possible), variants, a state table, accessibility, and platform notes. Sizes are px at 1×.

### 3.1 Button

```ts
type ButtonProps = {
  variant: "cta" | "primary" | "ghost" | "text";
  size?: "l" | "m" | "s"; // 52 / 44 / 36 (s is admin and desktop only)
  label: string;
  icon?: IconName; // leading, 20px
  disabledReason?: string; // when set, the button is disabled and shows the reason
  loading?: boolean;
  onPress: () => void;
  fullWidth?: boolean;
};
```

Variants:

| Variant | Fill        | Label          | Border   |
| ------- | ----------- | -------------- | -------- |
| cta     | `cta`       | `on-cta`       | none     |
| primary | `primary`   | `on-primary`   | none     |
| ghost   | `surface-2` | `text-primary` | `border` |
| text    | none        | `primary-text` | none     |

Layout: radius `radius.m`, horizontal padding 20, label `typography.button`.

| State                   | Visual                                                                                           | Behaviour                                |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| default                 | as above                                                                                         |                                          |
| pressed                 | overlay `opacity.pressed-overlay` white (dark) or black (light); scale 0.98 over `duration.fast` |                                          |
| focused (web, keyboard) | 2px `focus-ring` outline, offset 2                                                               |                                          |
| disabled                | fill `surface-2`, label `text-disabled`, `disabledReason` shown after the label in semibold      | not pressable                            |
| loading                 | label kept, spinner replaces the icon, width locked                                              | not pressable; `accessibilityState.busy` |

**Accessibility:** `accessibilityRole="button"`. Icon-only buttons require `accessibilityLabel`.

### 3.2 IconButton

44×44, radius `radius.control`, `surface-1` fill with a `border` hairline, 24px icon. It has the same states as Button. Used for close, back, settings and share. `accessibilityLabel` is required.

### 3.3 Card

```ts
type CardProps = {
  tone?: "default" | "raised" | "primary" | "streak" | "xp" | "success" | "rank" | "dashed";
  padding?: "m" | "s";
  onPress?: () => void;
};
```

| Tone    | Fill / border                                           |
| ------- | ------------------------------------------------------- |
| default | `surface-1` / `border`                                  |
| raised  | `surface-2` / `border-strong`                           |
| primary | `primary-subtle` / `primary-subtle-border`              |
| streak  | `streak-subtle` / `streak-border`                       |
| xp      | `xp-subtle` / `xp-border`                               |
| success | `success-subtle` / `success-border`                     |
| rank    | `rank-subtle` / `rank`                                  |
| dashed  | transparent / dashed `border` (locked and empty states) |

Radius `radius.l`, padding `space.card-padding`. A pressable card gets the pressed overlay and `accessibilityRole="button"` (or a link on the web).

### 3.4 Chip

```ts
type ChipProps = {
  kind: "neutral" | "selected" | "area" | "xp" | "coin" | "status";
  label: string;
  icon?: IconName;
  status?: "done" | "pending" | "atRisk" | "frozen" | "ended" | "new";
};
```

Height 28 (26 compact), radius `radius.s`, label `caption` weight 700.

- **area** uses `primary-text` with the eye icon.
- **xp** and **coin** use the `xp` family with the bolt or coin glyph.
- **status** maps: done → success; pending and atRisk → streak; frozen → rank; ended → muted; new → xp.

Chips are display-only. A tappable chip becomes a Pill (§3.20).

### 3.5 ProgressRing

```ts
type ProgressRingProps = {
  value: number;
  max: number;
  size?: 96 | 64;
  label: string;
  sublabel?: string;
};
```

Track `surface-2`, arc `primary`, stroke `size.ring-stroke`, round caps, starting at 12 o'clock. The centre label uses `display-m`. It animates over `duration.bar` with `easing.settle` when the value changes.

| State     | Visual                                                  |
| --------- | ------------------------------------------------------- |
| empty (0) | track only, label "0/4"                                 |
| partial   | arc                                                     |
| complete  | arc full, centre switches to a check and `success-text` |

**Accessibility:** `accessibilityRole="progressbar"` with min, max and now values. The label is read as, for example, "3 of 4 drills done".

### 3.6 XPBar

```ts
type XPBarProps = {
  level: number;
  title: RankTitle;
  xpInLevel: number;
  xpForLevel: number;
  totalXp: number;
  gain?: number;
  onLevelUp?: () => void;
};
```

Height `size.xp-bar-height`, track `surface-2`, fill `primary`, radius full. The header row shows "LEVEL 7 · PROSPECT" in `display-s` on the left and "223 to Lvl 8" in `primary-text` on the right.

| State            | Visual                                          | Motion                                                                                                                             |
| ---------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| rest             | fill at the current percentage                  |                                                                                                                                    |
| gaining          | fill animates from old to new                   | `duration.bar`, `easing.settle`                                                                                                    |
| crossing a level | fill reaches 100 %, white flash (opacity 0→1→0) | flash 150ms, then `onLevelUp()`; the takeover (§3.16) plays, then the bar restarts at 0 on the new level and fills to the overflow |
| reduced motion   | jumps straight to the final state               |                                                                                                                                    |

**Accessibility:** progressbar semantics. After a level-up, announce "Level 8 reached" as a polite live region.

### 3.7 StreakCounter

```ts
type StreakState = "done" | "pending" | "atRisk" | "frozen" | "ended";
type StreakCounterProps = {
  days: number;
  best: number;
  state: StreakState;
  freezesHeld: number;
  multiplier: number;
  endsAt?: Date;
  layout: "card" | "hero" | "compact";
};
```

| State                                  | Flame                                    | Number colour                | Right side                             | Extra                                                                                                                                      |
| -------------------------------------- | ---------------------------------------- | ---------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| done                                   | filled `streak`                          | `streak`                     | chip "Today done", success tone        |                                                                                                                                            |
| pending                                | outline `streak`                         | `streak`                     | chip "Today pending" + "ends 11:59 pm" |                                                                                                                                            |
| atRisk (from `game.streak-nudge-time`) | outline, dashed stroke                   | `streak`                     | chip "At risk", streak tone            | Home shows the amber banner with a live countdown (mm:ss in `display-m`); flame pulses (opacity 1→0.55, 2s loop, off under reduced motion) |
| frozen                                 | `rank-text` outline with snowflake badge | `rank-text`                  | chip "Frozen", rank tone               | 7-day strip with the frozen day marked by a snowflake as well as colour                                                                    |
| ended                                  | outline `text-muted`                     | `text-muted`, struck through | chip "Day 1 today", streak tone        | shows best streak, last run and XP kept next to it; motion `duration.loss` fade only                                                       |

**Streak +1 motion** (`duration.flame`): the flame scales 0.6 → 1.15 → 1 with `easing.spring`; the glow blooms to `opacity.glow-rest`; the new number slides up at +250ms; haptic `streak-plus` at +480ms.

**Accessibility:** one accessible label for the whole counter, for example "12-day streak, at risk, ends at midnight, 1 freeze held". The flame is decorative.

### 3.8 LevelBadge

```ts
type RankTitle = "Rookie" | "Prospect" | "Contender" | "Elite" | "Peak";
type LevelBadgeProps = { level: number; size: 24 | 36 | 44 | 88 | 176; locked?: boolean };
```

A hexagon, outer fill per tier and inner `surface-1`, with the level number in `display` 800.

| Tier      | Levels | Fill                      |
| --------- | ------ | ------------------------- |
| Rookie    | 1–3    | `#3A3A4A`                 |
| Prospect  | 4–8    | `primary`                 |
| Contender | 9–14   | `rank` (light: `#1B6FB8`) |
| Elite     | 15–20  | `cta`                     |
| Peak      | 21+    | `xp`, number in `xp`      |

Locked state: outer `border`, inner `surface-1`, lock glyph in the tier's text colour, title below in that colour. The tier label always shows with the badge, so colour is never the only cue.

### 3.9 RankRow

```ts
type RankRowProps = {
  rank: number;
  name: string;
  initials: string;
  sport: Sport;
  level: number;
  value: number;
  unit: "XP";
  delta?: { dir: "up" | "down" | "new"; n?: number };
  trainedToday?: boolean;
  isMe?: boolean;
  gapAbove?: { xp: number; name: string; line: string }; // only rendered on the "me" row
};
```

Minimum height 52, radius `radius.m`. Columns: rank (`display-s`), avatar 32 with initials, name + "Sport · Lvl n", flame if trained today, delta, value (`display-s`, `xp` colour).

| State                                 | Visual                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| default                               | `surface-1` / `border`                                                                 |
| me                                    | `primary-subtle` fill, `primary` border, name prefixed "You ·"                         |
| gap connector (me with someone above) | dashed up-arrow line above the row: "56 XP to Meera D. · today's session passes Meera" |
| delta up / down / new                 | ▲n `success-text` / ▼n `rank-text` (never red) / "new" `xp`                            |
| trained today                         | 16px filled flame with label "Trained today"                                           |
| hidden from boards                    | not rendered; the user sees "Hidden from boards · Show me" in their dock               |
| loading                               | skeleton row, same height                                                              |

**Rank-swap motion** (`duration.rank`): the two rows translate 48px past each other with `easing.settle` and a 4px overshoot; the delta stamps in 400ms later.

**Accessibility:** one row, one label, for example "Rank 4, you, Arjun R., cricket, level 7, 412 XP, up 1, 56 XP behind Meera D."

### 3.10 Podium

```ts
type PodiumProps = { places: [Place | null, Place | null, Place | null] }; // null = open slot
```

Three columns in the visual order 2-1-3, with heights 100, 122 and 88. Avatar rings use `podium-silver`, `podium-gold` and `podium-bronze`; the crown appears on #1 only.

| State                  | Visual                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| filled                 | as above                                                                                                                                                             |
| open slot (early week) | transparent, 2px dashed `primary-subtle-border`, "+" avatar, "Open · your session"; tappable, opens today's session; border pulses slowly (off under reduced motion) |
| me on the podium       | name reads "You", and the gap dock (§3.21) switches to "Hold #2" copy                                                                                                |

### 3.11 LiveStrip (activity)

A card with a live dot, "11 of 20 trained today" and a stack of up to 5 avatars plus "+n". Below it, one activity line rotates every 3.5s with a 350ms slide-up.

- **Accessibility:** `accessibilityLiveRegion="polite"` / `aria-live="polite"`.
- **Pausing:** rotation pauses under reduced motion and while a screen reader is on (show the latest line only).
- **Content rule:** activity lines never mention a streak ending or a rank drop for anyone.

### 3.12 ChallengeCard

```ts
type ChallengeCardProps = {
  kind: "weekly" | "program" | "premium";
  title: string;
  progress: number;
  target: number;
  reward: { xp?: number; coins?: number; badge?: string };
  resetsAt?: Date;
  price?: string;
  joined?: number;
  state: "active" | "complete" | "missed" | "locked";
};
```

| State    | Visual                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| active   | progress bar (`bar-height-s`, `primary`) + "3/5" in `display-m` + reset chip  |
| complete | check icon, `success` tone, reward stamped "+150 XP · 40 coins"               |
| missed   | × icon, muted text, "4/5 · one short", no red                                 |
| locked   | dashed card, lock icon, unlock condition in words                             |
| premium  | `xp-border`, entry price + prize panel; CTA "Enter · ₹[ENTRY]"; under-18 note |

### 3.13 DrillCard (list row)

```ts
type DrillCardProps = {
  title: string;
  area: MeasurementArea;
  minutes: number;
  target: string;
  xp: number;
  state: "pending" | "current" | "done" | "locked";
  score?: string;
};
```

| State   | Visual                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------- |
| pending | 48px area tile (`primary-subtle`, eye icon), "+10 XP", chevron                                        |
| current | as pending, `primary` border                                                                          |
| done    | green check tile, title struck through in `text-secondary`, "Done · self-rated 4/5" in `success-text` |
| locked  | dashed border, lock tile, muted title, "Unlock for 30 coins or go Pro" + Unlock ghost button          |

### 3.14 DrillPlayer and Stage

The player is a fixed frame around a swappable **stage**. Build the stage as a slot now, even though only video ships in phase 1.

```ts
type StageProps =
  | {
      type: "video";
      source: { kind: "youtube" | "drive"; id: string };
      durationS: number;
      onProgress: (fraction: number) => void;
    }
  | {
      type: "test";
      test: "simpleReaction";
      trials: number;
      onResult: (r: { medianMs: number; bestMs: number; device: string }) => void;
    } // phase 2
  | { type: "timer"; sets: number; workS: number; restS: number }; // later

type DrillPlayerProps = {
  index: number;
  total: number;
  drill: {
    title: string;
    area: MeasurementArea;
    xp: number;
    target: string;
    minutes: number;
    instructions: string[];
    scoreType: "number" | "rating5" | "ms" | "none";
    doneRule: "watched80" | "cleanTrials" | "manual";
  };
  next?: { title: string; area: MeasurementArea; minutes: number };
  onDone: (score?: number) => void;
};
```

**Fixed frame, top to bottom:** exit button + "Drill 1 of 4" + progress dots (done `success`, current `primary`, upcoming `border`), then the stage, the area and XP chips, the title (`display-l`), the target / rest / time row, the instructions card, the score card and the up-next card. A bottom bar holds Mark done and the skip link. The frame never moves when the stage changes size; content below the stage scrolls.

**Stage aspect:** 16:9 for video, 4:5 for tests. Radius `radius.card-s`.

Video stage states:

| State                                   | Visual                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| idle                                    | flat vector drill diagram as the poster, red 64px play button, "Set 1 of 3" and "CC on" chips      |
| playing                                 | violet progress track with elapsed / total                                                         |
| watched (≥ `game.video-done-threshold`) | "Watched" success chip; Mark done enables                                                          |
| buffering                               | spinner on the poster, play hidden                                                                 |
| offline / error                         | "Can't load this video. Check your connection." + Retry; Mark done stays disabled with that reason |

Test stage states (phase 2): ready → wait (random 1.2–3.2s) → go (size, shape and brightness jump to a gold disc labelled TAP) → hit (ms shown) or too soon (not counted, no penalty) → done after `game.test-clean-trials` clean taps, median saved.

**Score card:**

| State    | Visual                                                              |
| -------- | ------------------------------------------------------------------- |
| empty    | optional input: a number or a 1–5 segmented rating                  |
| typed    | value shown                                                         |
| measured | locked, "measured" label, median ms, "lower is better · this phone" |

**Mark done:** disabled with a reason until the drill's `doneRule` is met. When enabled it is the screen's `cta`.

**Platform notes:**

- **Expo:** `react-native-youtube-iframe` (or a WebView) for YouTube; `expo-video` for Drive files proxied through your backend. Report progress at least every 1s.
- **Next.js:** the YouTube IFrame API; Drive through the same proxy.
- **Tests (phase 2):** measure with `performance.now()` on pointer-down, never on click. Store the device model with every result.

**Accessibility:** captions on by default. Instructions are real text, not baked into the video. The test stage is one big button with live announcements ("Wait", "Tap now", "284 milliseconds").

### 3.15 SessionSummary

Order of beats (exact timing in the canvas board "Game feel — session-complete sequence"):

1. XP count-up, 0 → total over `duration.count` with `easing.out-quart`.
2. Breakdown lines stamp in `duration.stagger` apart.
3. Streak +1.
4. XP bar fills. If it crosses a level, the bar flashes and the LevelUpTakeover runs.
5. Badge tile flips in inline. Never a second takeover.

Continue is live from the first frame. Tapping it jumps every beat to its end state.

Variants by streak context:

| Variant                  | Hero                                                                               | Extra card                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| normal                   | "+72 XP"                                                                           | breakdown, streak, level, badge                                       |
| saved late (after nudge) | the streak number becomes the hero: "13 · Streak saved · with 1 h 18 min to spare" | reminder-time chooser                                                 |
| after freeze             | "13 · the freeze bridged Friday"                                                   | 7-day strip with the frozen day, freeze-slot refill card (shown once) |
| restart                  | "DAY 1"                                                                            | last run / best / "beat it on" date, "Everything you kept" list       |

### 3.16 LevelUpTakeover / BadgeUnlock

Full-screen at `z.takeover` on `primary-subtle`.

- **Level-up entrance** (`duration.celebrate`): the badge springs in from scale 0.3 with a −12° twist, rays burst out, and the title lines slide up 120ms apart.
- **Hold:** 1.0s by default, then auto-continue. A thin progress line shows the hold. Tapping anywhere, "Tap to skip" or Continue ends it.
- **Haptic:** `level-up` at +500ms.
- **BadgeUnlock (standalone page):** the tile flips on the Y axis with one gold sheen sweep (`duration.badge`).
- **Reduced motion:** a static end state with a 10ms fade.

**Accessibility:** move focus to the title on open. Announce "Level 8, Prospect". Continue is the first focusable control after the title.

### 3.17 PaywallPlanCard and paywall shell

```ts
type PlanCardProps = {
  plan: "annual" | "quarterly" | "monthly" | "program" | "credits";
  title: string;
  sub: string;
  price: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
};
```

Radio-group semantics. Unselected: `surface-1` with a 2px `border`. Selected: `primary-subtle` with a 2px `primary` border and a filled radio dot. The badge is a success chip.

**Shell (all three variants on the canvas):**

- Close (continue free) on the left, Restore purchases on the right.
- Bottom bar: the cta label always repeats the selected plan and price, then the "Continue free" link and one line on what free includes.
- Under-18 line: a parent or guardian completes the purchase.
- Prices come from config, never hard-coded.

**Platform notes:** in Expo the store purchase flow (RevenueCat or `expo-iap`) sits behind the cta. On the web, UPI, card and net banking go through your payment provider. Restore purchases must work on both.

### 3.18 BottomTabBar

5 tabs: Home, Train, Compete, Progress, Profile. Height `size.tabbar-height`, background `surface-tabbar`, top hairline.

- **Active tab:** `primary-text` icon and label, filled icon, plus a 3px × 24px `primary` bar above the icon. The bar is the non-colour cue.
- **Labels:** always visible.
- **Accessibility:** `accessibilityRole="tab"` with selected state; badge counts are read in the label.

### 3.19 Toast

Bottom of the screen, above the tab bar. Raised surface with `elevation.e1`. One line, an optional icon and an optional action (Undo, Get another). Auto-dismiss after `duration.toast`; it stays while focused or hovered. One toast at a time; newer replaces older.

**Accessibility:** `accessibilityLiveRegion="polite"`. The action is a real button, at least 44 tall.

### 3.20 Form controls

- **Pill (toggleable chip):** min height 44, radius `radius.control`. Off: `surface-2` / `border` / `text-secondary`. On: `primary-subtle` / `primary` border / `primary-on-subtle`. `accessibilityState.selected` / `aria-pressed`.
- **SegmentedControl:** track `surface-2` with 4px padding. The selected segment has a `primary` fill with white text. Radiogroup semantics.
- **Toggle:** 52×32 switch with an "On" / "Off" word beside it (the non-colour cue). On is `primary`.
- **TextInput:** height `size.input`, radius `radius.m`.

  | State    | Visual                                                                      |
  | -------- | --------------------------------------------------------------------------- |
  | default  | `surface-2` / `border`                                                      |
  | focused  | `primary` border                                                            |
  | error    | `cta-text` border + icon + message below (this is a real error, not a loss) |
  | disabled | `text-disabled`                                                             |

  Labels sit above as `label` style; placeholders are never the only label.

- **OTPInput:** 6 boxes 56 tall, the active box has a `primary` border, auto-advance, paste fills all six, SMS autofill (`textContentType="oneTimeCode"` / `autoComplete="one-time-code"`).
- **RatingInput (1–5):** 5 segmented 44px buttons. Values below the selection get `primary-subtle`; the selection gets `primary`. End labels read "Struggling" and "Sharp".

### 3.21 GapDock (leaderboard)

Docked above the tab bar at `z.dock`, with `elevation.e1-up`.

- **Content:** "#4", "You · 412 XP this week", "56 behind Meera D. Today's session passes Meera.", and a cta "Close it · 14 min". A mini bar shows your XP and the slice today's session would add (`primary-text` at 55 %). "Priya M. is 24 XP behind you" sits below.
- **Copy rules:** if you lead, "You lead the board. Hold it." If you're not on the board yet, "One session puts you on the podium." The dock never names someone who has hidden themselves.

### 3.22 StreakBanner and push copy

The in-app banner uses the `streak-subtle` card with a flame, the title "Your 12-day streak ends at midnight", one line of body and a live countdown.

Push notifications follow the rules on the "Streak states · rules of pressure" board:

- Title ≤ 40 characters, body ≤ 90.
- At most two streak pushes a day, none after `game.streak-last-call`.
- Freezes apply automatically at 00:00.
- The ending is pushed once, the next day.

---

## 4. Coach admin components (Next.js, light theme)

### 4.1 BulkLinkPaste

```ts
type ParsedLine = {
  status: "ok" | "duplicate" | "invalid";
  source?: "youtube" | "drive";
  id?: string;
  title?: string;
  durationS?: number;
  area?: MeasurementArea;
};
```

- **Input:** a mono textarea, one link per line. Accepts `youtu.be/ID`, `youtube.com/watch?v=ID` (ignores `&t=`), `youtube.com/shorts/ID` and `drive.google.com/file/d/ID`.
- **Parsing:** runs on every change, debounced 150ms. Fetches titles and durations server-side (YouTube Data API; Drive needs a manual title).
- **Results list:** ok = check + fetched title + "YouTube · 3 min"; ok without a title = warning icon + "No title found · add one after"; duplicate = warning + "skipped"; invalid = × + the raw line + "not a YouTube or Drive link".
- **Summary chips:** ready / duplicate / invalid / need a title.
- **Defaults row:** start day, drills per day (3/4/5), XP each, target, score type. Shows the distribution preview "Fills Days 9–16, 4 a day · Day 16 gets 2".
- **Commit:** "Add 30 drills" (disabled when 0 are ready) runs one transaction and offers Undo in a toast.
- **Paste-anywhere:** pasting links anywhere on the builder page opens this panel pre-filled.

### 4.2 DrillGridRow

Grid columns: select · drag handle · # · title · area · target · XP · score type · video · actions (duplicate, delete). Inputs 40 tall.

| State                    | Visual                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| default                  | white                                                                                       |
| new (added this session) | `primary-subtle` tint until the next save                                                   |
| selected                 | `primary-subtle` + checkbox on; the selection bar appears (set area, set XP, delete, clear) |
| invalid field            | `warning-border` + `warning-subtle` on that input; the day header shows a count chip        |
| dragging                 | raised surface + `elevation.e1`, drop line in `primary`                                     |

**Keyboard:**

- Tab moves across cells; Enter in the last cell adds a row.
- ⌘/Ctrl+D duplicates the row.
- Alt+↑/↓ moves the row, as the keyboard alternative to dragging.
- Delete on a selected row removes it, with Undo.

### 4.3 SessionDayCard

The header holds a collapse chevron, "DAY 9", an optional name input, the summary "4 drills · 14 min · +65 XP", an issue chip (untitled, missing target, over 15 min), Preview and "Duplicate day".

| State      | Visual                             |
| ---------- | ---------------------------------- |
| collapsed  | header only                        |
| expanded   | grid + "Add drill"                 |
| empty      | dashed "No drills yet" + Add drill |
| previewing | `primary` border on the card       |

Duplicate day inserts the copy as the next day, moves later days back by one and offers Undo. Module headers sit between days at the module boundaries.

### 4.4 AthletePreview

A phone frame (dark theme) mirroring Today's session for the selected day, updating live as fields change. Untitled drills show as "Untitled drill" in `streak`. An empty day shows as REST DAY. A checks list sits below: video present, untitled count, missing targets, minutes vs the 15-minute promise.

### 4.5 Admin table (athletes)

Sticky header row and horizontal scroll inside its box on narrow screens. Plan chips: Pro (primary-subtle), Program (xp-subtle), Free (surface-2). Streak column: 0 shows "0 · ended" in `text-secondary`, not red. CSV export.

---

## 5. State coverage: every list

| Component                | Empty                                                       | Loading                  | Locked                                |
| ------------------------ | ----------------------------------------------------------- | ------------------------ | ------------------------------------- |
| Today's session          | "Rest day" card + next session date                         | skeleton card            | —                                     |
| Program catalog          | "No programs for this sport yet · see all"                  | 3 skeleton rows          | dashed row + unlock condition         |
| Drill list               | "Paste links or add a drill" (admin)                        | skeleton rows            | DrillCard locked                      |
| Leaderboard              | Monday state: podium with open slots + "yet to train" group | skeleton podium + 6 rows | hidden-from-boards notice             |
| Challenges               | "No active challenge · next starts Monday"                  | skeleton cards           | dashed card + condition               |
| Trophy case              | "No badges yet · finish a session to earn First Rep"        | skeleton grid            | each locked badge says how to earn it |
| Progress charts          | "Train 3 days to see your trend" with ghost axes            | skeleton chart           | —                                     |
| Rewards                  | "Earn coins from badges and challenges"                     | skeleton rows            | greyed price + "not enough coins yet" |
| Notifications / activity | "Quiet so far today"                                        | —                        | —                                     |

**Loading:** skeletons match the real row shape and shimmer at 1.4s. Never put a spinner inside a list. **Errors:** inline card with a retry action, never a blocking modal.

---

## 6. Content and data contracts the UI relies on

- `MeasurementArea` is one of the 12: binocular visual acuity, dynamic visual acuity, contrast sensitivity, colour perception, stereopsis, simple reaction speed, complex reaction speed, hand-eye coordination, executive scan, digit span, short-term visual memory, anticipation.
- `Drill.type`: `'video' | 'test'`. `Drill.scoreType`: `'number' | 'rating5' | 'ms' | 'none'`. `ms` means lower is better, and charts read the direction from it.
- **Streak day** is the athlete's local calendar day. A session started before 23:59 counts.
- **Freeze:** auto-applied at 00:00 when one is held. A frozen day holds the streak but doesn't add to it, and keeps the multiplier.
- **Weekly board** resets Monday 00:00 IST. Each athlete has `showOnBoards: boolean`, default true.
- **Measured results** store `deviceModel` and are compared only within the same device.
- **Prices** are config-driven placeholders (`₹[PRICE]`, `₹[MONTHLY]`, `₹[QUARTERLY]`, `₹[ANNUAL]`, `₹[ENTRY]`) until set in the coach admin.
