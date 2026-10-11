import type { HomeResponse, Today as TodaySession } from "@eyeq/api-contract";
import {
  formatNumber,
  formatShortWeekday,
  formatShortWeekdayIn,
  formatWeekdayDate,
  hourIn,
  t,
  type MessageKey,
} from "@eyeq/i18n";
import {
  Avatar,
  Bar,
  Button,
  Card,
  CoinChip,
  Icon,
  LevelBadge,
  RANK_TIERS,
  StreakCounter,
  StreakFlame,
  cx,
  type RankTier,
  type StreakState,
} from "@eyeq/ui/web";
import { NextLink } from "@/components/shell/NextLink";
import { sportKey } from "@/app/onboarding/options";
import { Countdown } from "./Countdown";
import { FrozenToast } from "./FrozenToast";

/** The server's streak state in the component's words. */
const STATE: Record<HomeResponse["streak"]["state"], StreakState> = {
  done: "done",
  pending: "pending",
  at_risk: "atRisk",
  frozen: "frozen",
  ended: "ended",
};

function tierOf(title: string): RankTier {
  const t = title.toLowerCase();
  return (RANK_TIERS as string[]).includes(t) ? (t as RankTier) : "rookie";
}

function greeting(home: HomeResponse): string {
  const h = hourIn(home.now, home.timezone);
  const key: MessageKey =
    h < 12
      ? "today.greeting.morning"
      : h < 17
        ? "today.greeting.afternoon"
        : "today.greeting.evening";
  const first = home.profile.displayName.split(/\s+/)[0] ?? "";
  return t(key, { name: first });
}

/** Where Start goes: the session's player, which resolves "today" for the free drill too. */
function playerHref(today: TodaySession): string {
  return today.kind === "program" ? `/app/session/${today.sessionId}` : "/app/session/today";
}

export function Today({
  home,
  multiplierDays,
  freezePrice,
  unread = 0,
}: {
  home: HomeResponse;
  multiplierDays: number;
  freezePrice: number;
  /** Unread items in the in-app feed (D29); the bell shows only when there are some. */
  unread?: number;
}) {
  const state = STATE[home.streak.state];
  const dayLine =
    home.today.kind === "program"
      ? t("today.dayOf", { n: home.today.dayNumber, total: home.today.durationDays })
      : null;
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="type-label text-text-muted">
            {[formatWeekdayDate(home.localDate), dayLine].filter(Boolean).join(" · ")}
          </span>
          <h1 className="font-display text-[1.875rem] leading-[0.95] font-bold break-words uppercase md:text-[2.5rem]">
            {greeting(home)}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {unread > 0 && (
            <NextLink
              href="/app/notifications"
              aria-label={t("feed.linkUnread", { n: unread })}
              className="relative inline-flex size-11 items-center justify-center rounded-full text-text-primary"
            >
              <Icon name="bell" size={22} />
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 min-w-4 rounded-full bg-cta px-1 text-center text-[0.625rem] leading-4 font-extrabold text-on-cta tabular-nums"
              >
                {unread > 9 ? "9+" : unread}
              </span>
            </NextLink>
          )}
          <NextLink
            href="/app/rewards"
            aria-label={t("today.coinsLink", { n: home.coins })}
            className="inline-flex min-h-11 items-center rounded-full no-underline"
          >
            <CoinChip coins={home.coins} />
          </NextLink>
          <NextLink
            href="/app/account"
            aria-label={t("today.profile")}
            className="inline-flex size-11 items-center justify-center rounded-full md:hidden"
          >
            <Avatar initials={home.profile.initials} size={32} me className="size-10" />
          </NextLink>
        </div>
      </header>

      {state === "atRisk" && <AtRiskBanner home={home} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:items-start md:gap-5">
        <div className="flex flex-col gap-4 md:order-2">
          <StreakArea home={home} state={state} multiplierDays={multiplierDays} />
        </div>
        <div className="flex flex-col gap-4 md:order-1 md:row-span-3">
          <SessionCard home={home} state={state} />
          {state === "ended" && <FreezeTip coins={freezePrice} />}
        </div>
        <div className="flex flex-col gap-4 md:order-3">
          <LevelCard home={home} />
          <div className="grid grid-cols-2 gap-3">
            <ChallengeTile home={home} />
            <RankTile home={home} />
          </div>
          {home.program && <ProgramRow program={home.program} />}
        </div>
      </div>
      {state === "frozen" && home.streak.frozenDay && (
        <FrozenToast
          message={t("today.frozen.toast", { day: formatShortWeekday(home.streak.frozenDay) })}
        />
      )}
    </div>
  );
}

function AtRiskBanner({ home }: { home: HomeResponse }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-card-s border border-streak-border bg-streak-subtle px-3.5 py-3"
    >
      <StreakFlame state="atRisk" size={28} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-body-strong text-xp-text">
          {t("today.atRisk.title", { n: home.streak.current })}
        </span>
        <span className="type-caption text-text-primary">{t("today.atRisk.body")}</span>
      </div>
      <Countdown to={home.streak.endsAt} label={t("today.atRisk.timeLeft")} />
    </div>
  );
}

function StreakArea({
  home,
  state,
  multiplierDays,
}: {
  home: HomeResponse;
  state: StreakState;
  multiplierDays: number;
}) {
  const s = home.streak;
  if (state === "frozen") {
    const day = s.frozenDay ? formatShortWeekday(s.frozenDay) : "";
    return (
      <section
        className="flex flex-col gap-3 rounded-l border border-rank bg-rank-subtle p-4"
        aria-label={t("streak.frozen")}
      >
        <div className="flex items-center gap-3.5">
          <StreakFlame state="frozen" size={40} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-display text-[2.25rem] leading-none font-bold text-rank-text tabular-nums">
              {formatNumber(s.current)}
              <span className="ml-1.5 font-body text-base font-extrabold text-text-secondary">
                {t("today.frozen.kept")}
              </span>
            </span>
            <span className="type-caption text-text-secondary">
              {s.freezesHeld === 1
                ? t("today.frozen.leftOne", { best: s.best })
                : t("today.frozen.left", { best: s.best, n: s.freezesHeld })}
            </span>
          </div>
        </div>
        <WeekDots week={s.week} />
        <span className="type-caption font-bold text-rank-text">
          {t("today.frozen.dayLabel", { day })}
        </span>
        <p className="type-caption text-text-secondary">
          {t("today.frozen.body", { day, multiplier: s.multiplier.toFixed(1) })}
        </p>
      </section>
    );
  }
  if (state === "ended") {
    return (
      <>
        <section
          className="flex flex-col gap-3.5 rounded-l border border-border bg-surface-1 p-4"
          aria-label={t("streak.state.ended")}
        >
          <div className="flex items-center gap-3.5">
            <StreakFlame state="ended" size={40} />
            <div className="flex min-w-0 flex-col">
              <span className="font-display text-[2.25rem] leading-none font-bold text-text-secondary tabular-nums">
                {formatNumber(s.current)}
                <span className="ml-1.5 font-body text-base font-extrabold text-text-muted">
                  {t("streak.dayStreak")}
                </span>
              </span>
              <span className="type-caption text-text-muted">
                {t("today.lost.line", {
                  n: s.lastRun,
                  day: s.lastTrained ? formatShortWeekday(s.lastTrained) : "",
                })}
              </span>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-2">
            <Stat
              label={t("today.lost.best")}
              value={formatNumber(s.best)}
              tone="text-streak-text"
            />
            <Stat label={t("today.lost.last")} value={formatNumber(s.lastRun)} />
            <Stat
              label={t("today.lost.kept")}
              value={formatNumber(home.level.totalXp)}
              tone="text-xp-text"
            />
          </dl>
          <p className="type-body-s text-text-secondary">
            {t("today.lost.body", { best: s.best, days: multiplierDays })}
          </p>
        </section>
      </>
    );
  }
  return (
    <StreakCounter
      days={s.current}
      best={s.best}
      state={state}
      freezesHeld={s.freezesHeld}
      multiplier={s.multiplier}
      className={state === "atRisk" ? "border-streak-border" : undefined}
    />
  );
}

function FreezeTip({ coins }: { coins: number }) {
  return (
    <Card className="flex items-center gap-3 border-rank">
      <Icon name="freeze" size={24} className="shrink-0 text-rank-text" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="type-body-strong">{t("today.lost.freezeTitle")}</span>
        <span className="type-caption text-text-secondary">
          {t("today.lost.freezeBody", { coins })}
        </span>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-control bg-surface-2 p-2.5">
      <dt className={cx("type-label", tone ?? "text-text-muted")}>{label}</dt>
      <dd className={cx("font-display text-[1.625rem] leading-none font-bold tabular-nums", tone)}>
        {value}
      </dd>
    </div>
  );
}

/** The last seven days as dots; status is in each dot's label, not only its colour. */
function WeekDots({ week }: { week: HomeResponse["streak"]["week"] }) {
  const look: Record<string, string> = {
    done: "bg-streak",
    frozen: "bg-rank outline-2 -outline-offset-2 outline-rank-text",
    today: "border border-dashed border-rank-text",
    missed: "bg-surface-2",
    future: "bg-surface-2",
    before: "bg-surface-2",
  };
  return (
    <ul className="flex items-center gap-1.5" aria-label={t("progress.calendar")}>
      {week.map((d) => (
        <li key={d.date} className={cx("size-3.5 rounded-full", look[d.status])}>
          <span className="sr-only">
            {formatShortWeekday(d.date)} {t(`progress.day.${d.status}` as MessageKey)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SessionCard({ home, state }: { home: HomeResponse; state: StreakState }) {
  const today = home.today;
  if (today.kind === "none") {
    return (
      <Card className="flex flex-col gap-3">
        <p className="type-body text-text-secondary">{t("today.none")}</p>
        <Button variant="primary" href="/app/programs">
          {t("today.browse")}
        </Button>
      </Card>
    );
  }
  const minutes = today.estMinutes;
  const shape =
    today.drills.length === 1
      ? t("today.sessionShapeOne", { min: minutes })
      : t("today.sessionShape", { n: today.drills.length, min: minutes });
  const started = today.drills.some((d) => d.done);
  const startLabel = started
    ? t("today.resume")
    : state === "frozen"
      ? t("today.startMakeIt", { n: home.streak.current + 1 })
      : state === "ended"
        ? t("today.startNewStreak")
        : t("today.start");
  return (
    <section
      aria-labelledby="today-session"
      className="flex flex-col gap-3.5 rounded-l border border-primary-subtle-border bg-primary-subtle p-4 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span id="today-session" className="type-label text-primary-text">
            {today.kind === "free" ? t("today.freeDrill") : t("today.session")}
          </span>
          <span className="font-display text-[1.75rem] leading-none font-bold uppercase">
            {shape}
          </span>
        </div>
        {!today.completed && (
          <span className="font-display text-[1.75rem] leading-none font-bold text-xp-text tabular-nums">
            {t("xp.plus", { n: today.xpPreview.total })}
            <span className="ml-0.5 font-body text-xs font-extrabold">{t("xp.unit")}</span>
          </span>
        )}
      </div>
      <ol className="flex flex-col gap-1.5">
        {today.drills.map((d) => (
          <li key={d.drillId} className="flex min-h-11 items-center gap-2.5 py-1">
            <span
              className={cx(
                "grid size-[1.375rem] shrink-0 place-items-center rounded-full border text-[0.6875rem] font-extrabold",
                d.done
                  ? "border-success bg-success text-on-primary"
                  : "border-border bg-surface-2 text-text-secondary",
              )}
            >
              {d.done ? <Icon name="check" size={14} label={t("today.drillDone")} /> : d.order}
            </span>
            <span className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:justify-between md:gap-3">
              <span className="type-body-strong">{d.title}</span>
              <span className="type-caption text-primary-on-subtle">
                {d.measurementName
                  ? t("today.drillMeta", { area: d.measurementName, min: d.durationMinutes })
                  : t("today.drillMinutes", { min: d.durationMinutes })}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {today.kind === "free" && today.programLocked === "paywall" && home.program && (
        <p className="type-caption text-primary-on-subtle">
          {t("today.lockedPaywall", { program: home.program.title })}
        </p>
      )}
      {today.kind === "free" && today.programLocked === "module" && (
        <p className="type-caption text-primary-on-subtle">{t("today.lockedModule")}</p>
      )}
      {today.completed ? (
        <div className="flex items-start gap-2.5 rounded-control bg-surface-1/60 p-3">
          <Icon name="check" size={20} className="shrink-0 text-success-text" />
          <div className="flex flex-col gap-0.5">
            <span className="type-body-strong">{t("today.doneTitle")}</span>
            <span className="type-caption text-text-secondary">{t("today.doneBody")}</span>
          </div>
        </div>
      ) : (
        <Button variant="cta" icon="play" href={playerHref(today)} fullWidth>
          {startLabel}
        </Button>
      )}
      {state === "atRisk" && home.streak.freezesHeld > 0 && (
        <p className="text-center type-caption text-primary-on-subtle">
          {t("today.atRisk.freeze")}
        </p>
      )}
    </section>
  );
}

// Board 13a fades this card to 70 % at risk; that takes its caption under AA contrast, so
// it stays at full strength (ground rule 13 over the board).
function LevelCard({ home }: { home: HomeResponse }) {
  const l = home.level;
  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2.5">
          <LevelBadge
            level={l.level}
            tier={tierOf(l.title)}
            title={l.title}
            size={36}
            showTitle={false}
          />
          <div className="flex min-w-0 flex-col">
            <span className="font-display text-[1.375rem] leading-none font-bold uppercase">
              {t("today.level", { level: l.level, title: l.title })}
            </span>
            <span className="type-caption text-text-secondary tabular-nums">
              {t("xp.total", { xp: formatNumber(l.totalXp) })}
            </span>
          </div>
        </div>
        <span className="shrink-0 type-caption font-extrabold text-primary-text tabular-nums">
          {t("today.toNext", { xp: l.toNext, next: l.level + 1 })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t("level.progressLabel", { level: l.level, title: l.title })}
        aria-valuemin={0}
        aria-valuemax={l.xpForLevel}
        aria-valuenow={l.xpInLevel}
        aria-valuetext={t("level.progressValue", {
          xp: l.xpInLevel,
          max: l.xpForLevel,
          remaining: l.toNext,
        })}
        className="h-2.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full origin-left rounded-full bg-primary"
          style={{
            transform: `scaleX(${l.xpForLevel > 0 ? Math.min(1, l.xpInLevel / l.xpForLevel) : 0})`,
          }}
        />
      </div>
      {home.streak.multiplier > 1 && (
        <span className="hidden type-caption text-text-secondary md:block">
          {t("today.multiplierActive", { multiplier: home.streak.multiplier.toFixed(1) })}
        </span>
      )}
    </Card>
  );
}

function ChallengeTile({ home }: { home: HomeResponse }) {
  const c = home.weeklyChallenge;
  if (!c) return <span />;
  const resets = c.resetsAt ?? c.windowEnd;
  // A finished challenge can count past its target (6 sessions of 5); the tile shows 5/5.
  const shown = Math.min(c.progress, c.target);
  return (
    <NextLink
      href="/app/compete?tab=challenges"
      className="flex min-h-11 flex-col gap-2 rounded-l border border-border bg-surface-1 p-3.5 text-text-primary no-underline"
    >
      <span className="type-label text-primary-text">{t("today.challenge")}</span>
      <span className="type-body-strong leading-tight">{c.title}</span>
      <span className="flex items-center gap-2">
        <Bar value={shown} max={c.target} label={c.title} />
        <span className="font-display text-[1.375rem] leading-none font-bold tabular-nums">
          {formatNumber(shown)}
          <span className="text-text-muted">/{formatNumber(c.target)}</span>
        </span>
      </span>
      <span className="type-caption text-text-muted">
        {t("today.resets", { when: formatShortWeekdayIn(resets, home.timezone) })}
      </span>
    </NextLink>
  );
}

function RankTile({ home }: { home: HomeResponse }) {
  const r = home.weeklyRank;
  return (
    <NextLink
      href="/app/compete"
      className="flex min-h-11 flex-col gap-2 rounded-l border border-border bg-surface-1 p-3.5 text-text-primary no-underline"
    >
      <span className="type-label text-rank-text">{t("today.rank")}</span>
      {r ? (
        <>
          <span className="flex items-baseline gap-1">
            <span className="font-display text-[2.5rem] leading-none font-bold text-rank-text tabular-nums">
              {t("today.rankNumber", { n: r.rank })}
            </span>
            <span className="type-body-s text-text-secondary tabular-nums">
              {t("today.rankOf", { n: r.of })}
            </span>
          </span>
          <span className="type-caption text-text-muted">
            {t("today.rankLine", {
              scope: r.scope === "sport" ? t(sportKey(r.scopeValue)) : t("today.rankGlobal"),
              xp: formatNumber(r.xp),
            })}
            {r.delta !== 0 && (
              <>
                {" · "}
                <span
                  className={cx(
                    "font-extrabold",
                    r.delta > 0 ? "text-success-text" : "text-rank-text",
                  )}
                >
                  <span aria-hidden="true">
                    {r.delta > 0
                      ? t("today.rankUp", { n: r.delta })
                      : t("today.rankDown", { n: -r.delta })}
                  </span>
                  <span className="sr-only">
                    {r.delta > 0
                      ? t("today.rankUpLabel", { n: r.delta })
                      : t("today.rankDownLabel", { n: -r.delta })}
                  </span>
                </span>
              </>
            )}
          </span>
        </>
      ) : (
        <span className="type-caption text-text-secondary">{t("today.unranked")}</span>
      )}
    </NextLink>
  );
}

function ProgramRow({ program }: { program: NonNullable<HomeResponse["program"]> }) {
  const day = Math.min(program.currentDay, program.durationDays);
  return (
    <NextLink
      href={`/app/programs/${program.slug}`}
      className="flex min-h-11 items-center gap-3 rounded-l border border-border bg-surface-1 p-3.5 text-text-primary no-underline"
    >
      <span className="grid size-14 shrink-0 place-items-center rounded-control bg-primary-subtle">
        <Icon name="eye" size={24} className="text-primary-text" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="type-label text-text-muted">{t("today.continue")}</span>
        <span className="text-[0.9375rem] font-extrabold">{program.title}</span>
        <span className="flex items-center gap-2">
          <Bar value={day} max={program.durationDays} label={program.title} />
          <span className="type-caption text-text-secondary tabular-nums">
            {program.completed
              ? t("today.programDone")
              : t("today.programDay", { n: day, total: program.durationDays })}
          </span>
        </span>
      </span>
      <Icon name="chevron" size={20} className="shrink-0 text-text-muted" />
    </NextLink>
  );
}
