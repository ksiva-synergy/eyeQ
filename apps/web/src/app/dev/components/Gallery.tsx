"use client";
import type React from "react";
import { useState } from "react";
import { tokens, type TypographyToken } from "@eyeq/ui";
import {
  Avatar,
  BadgeUnlock,
  BOARD_ICONS,
  BottomTabBar,
  Button,
  Card,
  ChallengeCard,
  Chip,
  CoinChip,
  DrillCard,
  EmptyState,
  ErrorCard,
  Icon,
  ICON_NAMES,
  IconButton,
  LevelBadge,
  LevelUpTakeover,
  OTPInput,
  PhoneInput,
  Pill,
  PlanGroup,
  ProgressRing,
  RANK_TIERS,
  RankRow,
  RankSwap,
  RatingInput,
  SegmentedControl,
  Sheet,
  SheetPreview,
  SkeletonRow,
  StreakCounter,
  StreakPlusOne,
  TextInput,
  TextLink,
  Toast,
  Toggle,
  VideoFrame,
  XPBar,
  XPChip,
  XPCountUp,
  cx,
} from "@eyeq/ui/web";
import { copy } from "./fixtures";

const s = copy.sample;
type SectionKey = keyof typeof copy.sections;

function Spec({
  id,
  children,
  className,
}: {
  id: SectionKey;
  children: React.ReactNode;
  className?: string;
}) {
  const [title, meta] = copy.sections[id];
  const note = (copy.notes as Partial<Record<SectionKey, string>>)[id];
  return (
    <section
      aria-labelledby={`spec-${id}`}
      data-spec={id}
      className={cx(
        "flex min-w-0 flex-col gap-3.5 rounded-l border border-border bg-surface-1 p-5",
        className,
      )}
    >
      <h3
        id={`spec-${id}`}
        className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.8125rem] font-extrabold"
      >
        {title}
        <span className="text-[0.6875rem] font-bold text-text-muted">{meta}</span>
      </h3>
      {children}
      {note && <p className="text-xs leading-normal text-text-secondary">{note}</p>}
    </section>
  );
}

const nav = [
  { href: "#home", label: "Home", icon: "home" as const },
  { href: "#train", label: "Train", icon: "train" as const },
  { href: "#compete", label: "Compete", icon: "compete" as const },
  { href: "#progress", label: "Progress", icon: "progress" as const },
  { href: "#profile", label: "Profile", icon: "profile" as const },
];

const xpInLevel = 2040 - 1852;
const xpForLevel = 2263 - 1852;

const plans = [
  { id: "annual", ...s.annual },
  { id: "quarterly", ...s.quarterly },
  { id: "monthly", ...s.monthly },
];

export function Gallery() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [plan, setPlan] = useState("annual");
  const [otp, setOtp] = useState("48");
  const [length, setLength] = useState("15");
  const [boards, setBoards] = useState(true);
  const [rating, setRating] = useState<number | null>(4);
  const [sport, setSport] = useState<string>("Cricket");
  const [sheet, setSheet] = useState<"sheet" | "modal" | null>(null);
  const [toast, setToast] = useState(false);
  const [replay, setReplay] = useState(0);
  const [levelUp, setLevelUp] = useState(false);
  const [badge, setBadge] = useState(false);

  return (
    <div data-theme={theme} data-testid="gallery" className="min-h-dvh bg-ground text-text-primary">
      <div className="mx-auto flex max-w-[242.5rem] flex-col gap-6 px-gutter py-10 md:px-12">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="type-label text-primary-text">{copy.eyebrow}</span>
            <h1 className="font-display text-[3.5rem] leading-[0.95] font-bold break-words">
              {copy.title}
            </h1>
          </div>
          <p className="max-w-[45rem] text-xs leading-normal text-text-secondary">{copy.intro}</p>
          <SegmentedControl
            label={copy.themeLabel}
            value={theme}
            onChange={(v) => setTheme(v as "dark" | "light")}
            options={[
              { value: "dark", label: copy.themeDark },
              { value: "light", label: copy.themeLight },
            ]}
            className="w-full max-w-xs"
          />
        </header>

        <h2 className="type-label text-text-muted">{copy.boardHeading}</h2>
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,36rem),1fr))] items-start gap-5"
          data-testid="board"
        >
          <Spec id="buttons">
            <Button variant="cta" fullWidth href="#start">
              {s.startSession}
            </Button>
            <Button variant="primary" fullWidth>
              {s.continue}
            </Button>
            <Button variant="ghost" fullWidth>
              {s.maybeLater}
            </Button>
            <Button variant="primary" fullWidth disabledReason={s.markDoneReason}>
              {s.markDone}
            </Button>
            <div className="flex flex-wrap items-center gap-2.5">
              <IconButton icon="back" label="Back" />
              <IconButton icon="settings" label="Settings" />
              <Button size="s">{s.small}</Button>
              <TextLink href="#text-link">{s.textLink}</TextLink>
            </div>
          </Spec>

          <Spec id="cards">
            {s.cardCaps.map((cap, i) => (
              <Card
                key={cap}
                tone={i === 0 ? "default" : i === 1 ? "raised" : "primary"}
                className="flex flex-col gap-1.5"
              >
                <span
                  className={cx(
                    "type-label",
                    i === 2
                      ? "text-primary-text"
                      : i === 1
                        ? "text-text-secondary"
                        : "text-text-muted",
                  )}
                >
                  {cap}
                </span>
                <span className="text-[0.9375rem] font-bold">{s.cardTexts[i]}</span>
              </Card>
            ))}
            <div className="flex flex-wrap gap-2">
              <Chip>{s.cricket}</Chip>
              <Chip kind="selected">{s.selected}</Chip>
              <Chip kind="area">{s.area}</Chip>
              <CoinChip coins={140} />
              <XPChip xp={72} />
            </div>
          </Spec>

          <Spec id="heroes">
            <div className="flex flex-wrap items-center gap-5">
              <ProgressRing value={3} max={4} sublabel={s.drills} label={s.ringLabel} />
              <XPBar
                level={7}
                title={s.prospect}
                xpInLevel={xpInLevel}
                xpForLevel={xpForLevel}
                totalXp={2040}
                className="min-w-[min(100%,12rem)] flex-1"
              />
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
              <StreakCounter days={12} best={19} state="done" freezesHeld={1} multiplier={1.1} />
              <StreakCounter
                days={12}
                best={19}
                state="pending"
                freezesHeld={1}
                multiplier={1.1}
                endsLabel={s.fourHoursLeft}
              />
            </div>
          </Spec>

          <Spec id="level">
            <div className="flex flex-wrap items-end justify-between gap-2.5">
              {RANK_TIERS.map((tier, i) => (
                <LevelBadge key={tier} tier={tier} level={[1, 7, 10, 16, 21][i] ?? 1} />
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <RankRow rank={5} {...s.priya} level={6} xp={388} />
              <RankRow rank={4} {...s.arjun} level={7} xp={412} isMe delta={{ dir: "up", n: 1 }} />
            </div>
          </Spec>

          <Spec id="lists">
            <DrillCard
              title={s.drill1.title}
              area={s.area}
              minutes={4}
              target={s.drill1.target}
              xp={10}
              state="pending"
            />
            <DrillCard
              title={s.drill2.title}
              area={s.areaSimple}
              minutes={3}
              xp={10}
              state="done"
              score={s.drill2.score}
            />
            <ChallengeCard
              kind="weekly"
              title={s.weekly.title}
              progress={3}
              target={5}
              reward={{ xp: 150, coins: 40, badge: s.weekly.badge }}
              resetsLabel={s.weekly.resets}
              state="active"
            />
          </Spec>

          <Spec id="video">
            <VideoFrame
              state="playing"
              setLabel={s.set}
              elapsedLabel={s.elapsed}
              totalLabel={s.total}
              progress={0.72}
            />
          </Spec>

          <Spec id="plans">
            <PlanGroup
              name="plan-board"
              label={s.planLabel}
              plans={plans.filter((p) => p.id !== "quarterly")}
              value={plan}
              onChange={setPlan}
            />
          </Spec>

          <Spec id="tabbar">
            <div className="overflow-hidden rounded-m border border-border">
              <BottomTabBar items={nav} activeHref="#home" />
            </div>
            <h3 className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[0.8125rem] font-extrabold">
              {copy.sections.toast[0]}
              <span className="text-[0.6875rem] font-bold text-text-muted">
                {copy.sections.toast[1]}
              </span>
            </h3>
            <Toast
              message={s.toast}
              autoDismiss={false}
              action={{ label: "Undo", onAction: () => undefined }}
            />
          </Spec>

          <Spec id="sheet">
            <div className="flex min-h-[14.375rem] items-end rounded-card-s bg-black px-4 pt-10">
              <SheetPreview
                title={s.sheetTitle}
                className="w-full"
                actions={
                  <>
                    <Button variant="ghost">{"Not now"}</Button>
                    <Button variant="primary">{s.useFreeze}</Button>
                  </>
                }
              >
                {s.sheetBody}
              </SheetPreview>
            </div>
          </Spec>

          <Spec id="empty">
            <EmptyState
              title={s.noBadges}
              body={
                <>
                  {s.noBadgesBody} <strong className="text-text-primary">{s.firstRep}</strong>.
                </>
              }
              action={
                <Button size="m" className="px-[1.125rem]">
                  {s.startSessionShort}
                </Button>
              }
            />
            <SkeletonRow />
            <DrillCard
              title={s.drill3.title}
              area={s.areaScan}
              minutes={4}
              xp={10}
              state="locked"
              unlockHint={s.drill3.unlock}
            />
          </Spec>

          <Spec id="inputs">
            <PhoneInput label={s.phone} defaultValue={s.phoneValue} />
            <OTPInput label={s.otp} value={otp} onChange={setOtp} />
            <SegmentedControl
              label={s.sessionLength}
              value={length}
              onChange={setLength}
              options={s.lengths.map((l) => ({ value: l.split(" ")[0] ?? l, label: l }))}
            />
            <Toggle label={s.showOnBoards} checked={boards} onChange={setBoards} />
          </Spec>

          <div data-theme="light" className="min-w-0">
            <Spec id="light">
              <Button variant="cta" fullWidth href="#light-start">
                {s.startSession}
              </Button>
              <Button variant="primary" fullWidth>
                {s.continue}
              </Button>
              <Button variant="ghost" fullWidth>
                {s.maybeLater}
              </Button>
              <StreakCounter days={12} best={19} state="done" freezesHeld={1} multiplier={1.1} />
              <RankRow rank={4} {...s.arjun} level={7} xp={412} isMe />
            </Spec>
          </div>
        </div>

        <h2 className="mt-6 type-label text-text-muted">{copy.statesHeading}</h2>
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,36rem),1fr))] items-start gap-5"
          data-testid="states"
        >
          <Spec id="buttonStates">
            {(["cta", "primary", "ghost", "text"] as const).map((v) => (
              <div key={v} className="flex flex-wrap items-center gap-2">
                <Button variant={v}>{s.continue}</Button>
                <Button variant={v} size="m">
                  {s.continue}
                </Button>
                <Button variant={v} size="s">
                  {s.continue}
                </Button>
                <Button variant={v} size="m" loading>
                  {s.saving}
                </Button>
              </div>
            ))}
            <Button variant="cta" icon="play" fullWidth>
              {s.startSessionShort}
            </Button>
            <Button variant="cta" fullWidth disabledReason={s.markDoneReason}>
              {s.markDone}
            </Button>
            <div className="flex gap-2">
              <IconButton icon="share" label="Share" />
              <IconButton icon="close" label="Close" disabled />
            </div>
          </Spec>

          <Spec id="chipStates">
            <div className="flex flex-wrap gap-2">
              <Chip kind="status" status="done">
                {"Today done"}
              </Chip>
              <Chip kind="status" status="pending">
                {"Today pending"}
              </Chip>
              <Chip kind="status" status="atRisk">
                {"At risk"}
              </Chip>
              <Chip kind="status" status="frozen">
                {"Frozen"}
              </Chip>
              <Chip kind="status" status="ended">
                {"Ended"}
              </Chip>
              <Chip kind="status" status="new">
                {"New"}
              </Chip>
              <Chip compact>{s.cricket}</Chip>
            </div>
            <div className="flex flex-wrap gap-2">
              {s.sports.map((sp) => (
                <Pill key={sp} pressed={sport === sp} onClick={() => setSport(sp)}>
                  {sp}
                </Pill>
              ))}
            </div>
          </Spec>

          <Spec id="streakStates">
            <StreakCounter days={12} best={19} state="done" freezesHeld={1} multiplier={1.1} />
            <StreakCounter
              days={12}
              best={19}
              state="pending"
              freezesHeld={1}
              multiplier={1.1}
              endsLabel={s.midnight}
            />
            <StreakCounter
              days={12}
              best={19}
              state="atRisk"
              freezesHeld={0}
              multiplier={1.1}
              endsLabel={s.countdown}
            />
            <StreakCounter days={12} best={19} state="frozen" freezesHeld={0} multiplier={1.1} />
            <StreakCounter days={0} best={19} state="ended" freezesHeld={0} multiplier={1} />
            <StreakCounter
              days={12}
              best={19}
              state="atRisk"
              freezesHeld={1}
              multiplier={1.1}
              endsLabel={s.countdown}
              layout="compact"
            />
          </Spec>

          <Spec id="drillStates">
            <DrillCard
              title={s.drill1.title}
              area={s.area}
              minutes={4}
              target={s.drill1.target}
              xp={10}
              state="current"
            />
            <DrillCard
              title={s.drill4.title}
              area={s.areaDigit}
              minutes={3}
              target={s.drill4.target}
              xp={10}
              state="pending"
              href="#drill"
            />
            <DrillCard
              title={s.drill2.title}
              area={s.areaSimple}
              minutes={3}
              xp={10}
              state="done"
              score={s.drill2.score}
            />
            <DrillCard
              title={s.drill3.title}
              area={s.areaScan}
              minutes={4}
              xp={10}
              state="locked"
              unlockHint={s.drill3.unlock}
            />
            <SkeletonRow />
            <ErrorCard message={s.errorCard} onRetry={() => undefined} />
          </Spec>

          <Spec id="challengeStates">
            <ChallengeCard
              kind="weekly"
              title={s.weekly.title}
              progress={5}
              target={5}
              reward={{ xp: 150, coins: 40 }}
              state="complete"
            />
            <ChallengeCard
              kind="weekly"
              title={s.weekly.title}
              progress={4}
              target={5}
              reward={{ xp: 150, coins: 40 }}
              state="missed"
            />
            <ChallengeCard
              kind="program"
              title={s.programChallenge.title}
              progress={2}
              target={7}
              reward={{ xp: 60 }}
              resetsLabel={s.weekly.resets}
              joined={11}
              state="active"
            />
            <ChallengeCard
              kind="program"
              title={s.lockedChallenge.title}
              progress={0}
              target={25}
              reward={{ xp: 40 }}
              state="locked"
              lockedHint={s.lockedChallenge.hint}
            />
            <ChallengeCard
              kind="premium"
              title={s.premium.title}
              progress={1}
              target={5}
              reward={{ xp: 200, coins: 100 }}
              price={s.premium.price}
              resetsLabel={s.weekly.resets}
              state="active"
            />
          </Spec>

          <Spec id="videoStates">
            <VideoFrame state="idle" setLabel={s.set} />
            <VideoFrame
              state="watched"
              setLabel={s.set}
              elapsedLabel={s.elapsed}
              totalLabel={s.total}
              progress={0.85}
            />
            <VideoFrame state="buffering" />
            <VideoFrame state="error" />
          </Spec>

          <Spec id="ringStates">
            <div className="flex flex-wrap items-center gap-4">
              <ProgressRing value={0} max={4} sublabel={s.drills} label="0 of 4 drills done" />
              <ProgressRing value={2} max={4} size={64} label="2 of 4 drills done" />
              <ProgressRing value={4} max={4} sublabel={s.drills} label="4 of 4 drills done" />
              <LevelBadge tier="contender" level={10} locked />
              <LevelBadge tier="peak" level={21} size={88} />
              <Avatar initials="AR" me size="l" />
              <Avatar initials="PM" size="s" />
            </div>
            <XPBar
              level={7}
              title={s.prospect}
              xpInLevel={xpInLevel + 72}
              xpForLevel={xpForLevel}
              totalXp={2112}
              gain={72}
              key={`bar-${replay}`}
            />
          </Spec>

          <Spec id="formStates">
            <TextInput label={s.displayName} defaultValue={s.displayNameValue} />
            <TextInput label={s.displayName} defaultValue="A" error={s.nameError} />
            <TextInput label={s.disabledField} defaultValue={s.disabledValue} disabled />
            <TextInput label={s.displayName} defaultValue={s.displayNameValue} dense />
            <RatingInput label={s.rate} value={rating} onChange={setRating} />
            <Toggle label={s.showOnBoards} checked={false} onChange={() => undefined} />
            <PlanGroup
              name="plan-states"
              label={s.planLabel}
              plans={plans}
              value={plan}
              onChange={setPlan}
            />
          </Spec>

          <Spec id="feedback">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="m" onClick={() => setSheet("sheet")}>
                {s.openSheet}
              </Button>
              <Button variant="ghost" size="m" onClick={() => setSheet("modal")}>
                {s.openModal}
              </Button>
              <Button variant="ghost" size="m" onClick={() => setToast(true)}>
                {s.showToast}
              </Button>
            </div>
            {toast && (
              <Toast
                message={s.toast}
                onDismiss={() => setToast(false)}
                action={{ label: "Undo", onAction: () => undefined }}
              />
            )}
          </Spec>

          <Spec id="moments" className="[&_.moment]:min-h-[9rem]">
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="m" onClick={() => setReplay((r) => r + 1)}>
                {s.replay}
              </Button>
              <Button
                variant="primary"
                size="m"
                onClick={() => setLevelUp(true)}
                data-testid="play-level-up"
              >
                {s.playLevelUp}
              </Button>
              <Button variant="primary" size="m" onClick={() => setBadge(true)}>
                {s.playBadge}
              </Button>
            </div>
            <div key={replay} className="flex flex-col gap-5" data-testid="moments">
              <div className="moment flex items-center justify-center rounded-card-s border border-border bg-ground p-4">
                <XPCountUp total={72} />
              </div>
              <div className="moment flex items-center justify-center rounded-card-s border border-border bg-ground p-6">
                <StreakPlusOne days={13} />
              </div>
              <div className="moment rounded-card-s border border-border bg-ground p-4">
                <RankSwap
                  above={{ rank: 4, ...s.sneha, level: 6, xp: 396 }}
                  me={{
                    rank: 3,
                    ...s.arjun,
                    level: 7,
                    xp: 412,
                    isMe: true,
                    delta: { dir: "up", n: 1 },
                  }}
                />
              </div>
            </div>
          </Spec>

          <Spec id="icons">
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-3">
              {ICON_NAMES.map((name) => (
                <li
                  key={name}
                  className={cx(
                    "flex flex-col items-center gap-1.5 rounded-control border bg-surface-2 p-2.5",
                    BOARD_ICONS.includes(name)
                      ? "border-border"
                      : "border-dashed border-border-strong",
                  )}
                >
                  <Icon
                    name={name}
                    className={
                      name === "streak"
                        ? "text-streak"
                        : name === "xp" || name === "coin"
                          ? "text-xp-text"
                          : name === "freeze"
                            ? "text-rank-text"
                            : name === "eye"
                              ? "text-primary-text"
                              : undefined
                    }
                  />
                  <span className="type-caption text-text-secondary">{name}</span>
                </li>
              ))}
            </ul>
          </Spec>

          <Spec id="type">
            {(Object.keys(tokens.typography) as TypographyToken[]).map((k) => (
              <div key={k} className="flex flex-col gap-1 border-b border-border pb-2">
                <span className="type-caption text-text-muted">{k}</span>
                <span className={`type-${k}`}>{s.typeSample}</span>
              </div>
            ))}
          </Spec>
        </div>
      </div>

      <Sheet
        open={sheet !== null}
        variant={sheet === "modal" ? "modal" : "sheet"}
        onClose={() => setSheet(null)}
        title={sheet === "modal" ? s.modalTitle : s.sheetTitle}
        actions={
          sheet === "modal" ? (
            <Button variant="primary" onClick={() => setSheet(null)}>
              {"Retry"}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setSheet(null)}>
                {"Not now"}
              </Button>
              <Button variant="primary" onClick={() => setSheet(null)}>
                {s.useFreeze}
              </Button>
            </>
          )
        }
      >
        {sheet === "modal" ? s.modalBody : s.sheetBody}
      </Sheet>
      <LevelUpTakeover
        open={levelUp}
        onDone={() => setLevelUp(false)}
        level={8}
        tier="prospect"
        title={s.prospect}
        body={s.levelUpBody}
        holdMs={null}
        chips={
          <>
            <Chip>{s.unlocked}</Chip>
            <Chip kind="coin">{"+20 coins"}</Chip>
          </>
        }
      />
      <BadgeUnlock
        open={badge}
        onDone={() => setBadge(false)}
        name={s.badgeName}
        body={s.badgeBody}
        coins={30}
        holdMs={null}
      />
    </div>
  );
}
