"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProgressResponse } from "@eyeq/api-contract";
import { formatDate, formatNumber, t } from "@eyeq/i18n";
import { Button, Card, Chip, Icon, Pill, RatingInput, Sheet, cx } from "@eyeq/ui/web";
import { v1 } from "@/lib/athlete-api";
import { AREAS, Heatmap, Radar, Trend, WeekBars } from "./charts";

/**
 * Board 8 (and board 16's Progress from 768 px): totals, sessions per week against the
 * target, the streak calendar by minutes, score trend per drill, and baseline vs now with
 * the day-14 and day-21 re-rate prompts. Every number comes from GET /progress.
 */
export function Progress({ data }: { data: ProgressResponse }) {
  const weeks = data.weeks;
  const recent = weeks.slice(-4).reduce((a, w) => a + w.sessions, 0);
  const before = weeks.slice(-8, -4).reduce((a, w) => a + w.sessions, 0);
  const delta = recent - before;
  const avg = data.sessionsTotal > 0 ? Math.round(data.minutesTotal / data.sessionsTotal) : 0;
  const [drillId, setDrillId] = useState(data.drills[0]?.drillId ?? null);
  const drill = data.drills.find((d) => d.drillId === drillId) ?? data.drills[0];

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[2.25rem] leading-none font-bold uppercase">
          {t("progress.title")}
        </h1>
        <Chip>{t("progress.lastWeeks", { n: weeks.length })}</Chip>
      </header>

      {data.sessionsTotal === 0 && (
        <Card>
          <p className="type-body-s text-text-secondary">{t("progress.empty")}</p>
        </Card>
      )}

      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,6.5rem),1fr))] gap-3">
        <Tile label={t("progress.sessions")} value={formatNumber(data.sessionsTotal)}>
          {delta === 0 ? (
            t("progress.sessionsDeltaSame")
          ) : (
            <>
              <span
                aria-hidden="true"
                className={delta > 0 ? "text-success-text" : "text-text-muted"}
              >
                {delta > 0
                  ? t("progress.sessionsDeltaUp", { n: delta })
                  : t("progress.sessionsDeltaDown", { n: -delta })}
              </span>
              <span className="sr-only">
                {delta > 0
                  ? t("progress.sessionsDeltaUpLabel", { n: delta })
                  : t("progress.sessionsDeltaDownLabel", { n: -delta })}
              </span>
            </>
          )}
        </Tile>
        <Tile label={t("progress.minutes")} value={formatNumber(data.minutesTotal)}>
          {t("progress.minutesAvg", { n: avg })}
        </Tile>
        <Tile
          label={t("progress.bestStreak")}
          value={formatNumber(data.streak.best)}
          tone="text-streak-text"
        >
          {t("progress.currentStreak", { n: data.streak.current })}
        </Tile>
        <Tile
          label={t("progress.xpTotal")}
          value={formatNumber(data.level.totalXp)}
          tone="text-xp-text"
          className="hidden md:flex"
        >
          {t("progress.xpLine", {
            level: data.level.level,
            toNext: data.level.toNext,
            next: data.level.level + 1,
          })}
        </Tile>
      </dl>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <Section
          title={t("progress.perWeek")}
          meta={t("progress.target", { n: data.weeklyTarget })}
        >
          <WeekBars weeks={weeks} target={data.weeklyTarget} />
        </Section>

        <RadarCard data={data} />

        <Section title={t("progress.calendarTitle")} meta={t("progress.minutesPerDay")}>
          <Heatmap calendar={data.calendar} />
        </Section>

        <Section title={t("progress.trend")} meta={drill?.unit ?? undefined}>
          {drill ? (
            <>
              {data.drills.length > 1 && (
                <div
                  role="group"
                  aria-label={t("progress.trendDrills")}
                  className="flex flex-wrap gap-2"
                >
                  {data.drills.map((d) => (
                    <Pill
                      key={d.drillId}
                      pressed={d.drillId === drill.drillId}
                      onClick={() => setDrillId(d.drillId)}
                    >
                      {d.title}
                    </Pill>
                  ))}
                </div>
              )}
              <Trend drill={drill} />
              {drill.best !== null && (
                <span className="type-caption text-text-secondary tabular-nums">
                  {t("progress.trendBest", { n: formatNumber(drill.best) })}
                </span>
              )}
            </>
          ) : (
            <p className="type-body-s text-text-secondary">{t("progress.trendEmpty")}</p>
          )}
        </Section>
      </div>

      <p className="text-center type-caption text-text-muted">{t("progress.disclaimer")}</p>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  className,
  children,
}: {
  label: string;
  value: string;
  tone?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex min-w-0 flex-col gap-0.5 rounded-l border border-border bg-surface-1 p-3.5",
        className,
      )}
    >
      <dt className="type-label break-words text-text-muted">{label}</dt>
      <dd className={cx("font-display text-[2rem] leading-none font-bold tabular-nums", tone)}>
        {value}
      </dd>
      <dd className="type-caption text-text-secondary">{children}</dd>
    </div>
  );
}

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="type-body-strong">{title}</h2>
        {meta && <span className="type-label text-text-muted">{meta}</span>}
      </div>
      {children}
    </Card>
  );
}

function RadarCard({ data }: { data: ProgressResponse }) {
  const r = data.ratings;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ratings, setRatings] = useState<Record<(typeof AREAS)[number], number | null>>({
    focus: null,
    reaction: null,
    tracking: null,
  });
  const key = useRef(crypto.randomUUID());
  const dueDay = r.due ? Number(r.due.slice(3)) : null;
  const nextDay = r.day < 14 ? 14 : r.day < 21 ? 21 : null;

  async function save() {
    if (!r.due || AREAS.some((a) => ratings[a] === null)) return;
    setBusy(true);
    setFailed(false);
    const res = await v1(
      "POST",
      "/me/self-ratings",
      { kind: r.due, ratings },
      { idempotencyKey: key.current },
    );
    setBusy(false);
    if (!res.ok) {
      setFailed(true);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Section title={t("progress.radar")} meta={t("progress.selfRated")}>
      {r.baseline ? (
        <div className="flex flex-wrap items-center gap-4">
          <Radar baseline={r.baseline} latest={r.latest} />
          <div className="flex min-w-[10rem] flex-1 flex-col gap-2">
            <span className="flex items-center gap-2 type-caption text-text-secondary">
              <span
                aria-hidden="true"
                className="h-0 w-5 border-t-2 border-dashed border-text-muted"
              />
              {t("progress.baselineOn", { date: r.baselineAt ? formatDate(r.baselineAt) : "" })}
            </span>
            <span className="flex items-center gap-2 type-caption text-text-secondary">
              <span
                aria-hidden="true"
                className="h-2.5 w-5 rounded-xs border-2 border-primary-text bg-primary/30"
              />
              {t("progress.nowOn", { n: r.day })}
            </span>
            <span className="flex flex-col gap-0.5 type-body-s tabular-nums" aria-hidden="true">
              {AREAS.map((a) => (
                <span key={a}>
                  {t("progress.change", {
                    area: t(`area.${a}`),
                    from: r.baseline?.[a] ?? 0,
                    to: r.latest?.[a] ?? 0,
                  })}
                </span>
              ))}
            </span>
            {!dueDay && nextDay && (
              <span className="type-caption text-text-muted">
                {t("progress.rerateOn", { n: nextDay })}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="type-body-s text-text-secondary">{t("progress.noBaseline")}</p>
      )}
      {dueDay && (
        <div className="flex flex-col gap-2 rounded-m border border-primary-subtle-border bg-primary-subtle p-3.5">
          <span className="type-body-strong text-primary-on-subtle">
            {t("progress.rerateDue", { n: dueDay })}
          </span>
          <span className="type-caption text-primary-on-subtle">{t("progress.rerateBody")}</span>
          <Button variant="primary" size="m" onClick={() => setOpen(true)}>
            {t("progress.rerate")}
          </Button>
        </div>
      )}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("progress.rerateTitle")}
        actions={
          <Button variant="cta" fullWidth loading={busy} onClick={() => void save()}>
            {t("progress.rerateSave")}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {failed && (
            <p role="alert" className="flex items-center gap-2 type-body-s text-cta-text">
              <Icon name="alert" size={16} />
              {t("onb.error")}
            </p>
          )}
          {AREAS.map((a) => (
            <div key={a} className="flex flex-col gap-1.5">
              <span className="type-body-strong">{t(`area.${a}`)}</span>
              <RatingInput
                label={t("onb.baseline.rating", { area: t(`area.${a}`) })}
                value={ratings[a]}
                onChange={(v) => setRatings((m) => ({ ...m, [a]: v }))}
              />
            </div>
          ))}
          <p className="type-caption text-text-muted">{t("onb.baseline.disclaimer")}</p>
        </div>
      </Sheet>
    </Section>
  );
}
