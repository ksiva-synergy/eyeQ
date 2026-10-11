"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BadgeAward,
  CompletionEvent,
  CompletionResult,
  CompletionsResponse,
  XpRow,
} from "@eyeq/api-contract";
import { formatNumber, t } from "@eyeq/i18n";
import {
  BadgeUnlock,
  Bar,
  Button,
  Card,
  Icon,
  LevelUpTakeover,
  RANK_TIERS,
  Skeleton,
  StreakFlame,
  XPCountUp,
  type RankTier,
} from "@eyeq/ui/web";
import { storedEvent } from "@/components/player/events";
import { v1 } from "@/lib/athlete-api";
import type { PlayData } from "./Player";

function tierOf(title: string): RankTier {
  const l = title.toLowerCase();
  return (RANK_TIERS as string[]).includes(l) ? (l as RankTier) : "rookie";
}

/**
 * Board 4: what the session paid, from the complete_drill result objects (plan 6.8). The
 * lines are the server's XP rows for this session's drills; results for drills finished
 * before this page loaded are read back by replaying their stored events, which writes
 * nothing. Then the moments of boards 5a and 5b, then Today.
 */
export function Summary({ data, known }: { data: PlayData; known: CompletionResult[] }) {
  // Events this browser kept for today's drills; read once, on the client (the summary is
  // only ever mounted after the player has run).
  const [events] = useState<CompletionEvent[]>(() =>
    data.drills
      .map((d) => storedEvent(data.localDate, data.sessionId, d.id))
      .filter((e): e is CompletionEvent => !!e),
  );
  const [replay] = useState(() => {
    const have = new Set(known.map((r) => r.drillId));
    return events.filter((e) => !have.has(e.drillId));
  });
  const [fetched, setFetched] = useState<CompletionResult[] | null>(replay.length ? null : []);
  const [moment, setMoment] = useState<"none" | "level" | number>("none");

  useEffect(() => {
    if (replay.length === 0) return;
    let cancelled = false;
    void v1<CompletionsResponse>("POST", "/completions", { events: replay }).then((r) => {
      if (!cancelled)
        setFetched(r.ok ? r.data.results.flatMap((x) => (x.ok ? [x.result] : [])) : []);
    });
    return () => {
      cancelled = true;
    };
  }, [replay]);

  const results = useMemo(() => (fetched ? [...known, ...fetched] : null), [fetched, known]);
  const view = useMemo(() => (results ? summarise(results, data) : null), [results, data]);

  function finish() {
    // A full load, so Today and the router start from the server's new state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
    window.location.assign("/app");
  }

  function next(from: "none" | "level" | number) {
    if (!view) return finish();
    if (from === "none" && view.final.level.leveledUp) return setMoment("level");
    const start = from === "none" || from === "level" ? 0 : from + 1;
    if (start < view.badges.length) return setMoment(start);
    finish();
  }

  if (!results || !view) {
    return (
      <div
        className="mx-auto flex w-full max-w-[40rem] flex-col gap-4 px-gutter pt-10"
        aria-busy="true"
      >
        <Skeleton className="mx-auto h-24 w-48" />
        <Skeleton className="h-36" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  const { final, lines, total, badges } = view;
  const weekly = final.challenges.find((c) => c.type === "weekly");
  const scored = events.filter((e) => e.score !== null);
  const level = final.level;

  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col">
      <div className="flex flex-col gap-4 px-gutter pt-12 pb-36 md:pb-10">
        {!final.session.complete && (
          <Card>
            <p className="type-body-s text-text-secondary">
              {t("summary.notComplete", {
                done: final.session.drillsDone,
                total: final.session.drillsTotal,
              })}
            </p>
          </Card>
        )}
        <div className="flex flex-col items-center gap-1.5 pt-2 text-center">
          <span className="type-label text-success-text">
            {t("summary.complete", { n: data.estMinutes })}
          </span>
          <XPCountUp total={total} />
          <span className="type-label text-[0.8125rem] text-xp-text">{t("summary.earned")}</span>
        </div>

        <Card className="flex flex-col gap-0.5">
          <dl>
            {lines.map((l) => (
              <div key={l.key} className="flex min-h-9 items-center justify-between gap-3 py-1">
                <dt className="type-body-s text-text-secondary">
                  {l.label}
                  {l.capped && (
                    <span className="ml-1.5 type-caption text-text-muted">
                      · {t("summary.capped")}
                    </span>
                  )}
                </dt>
                <dd className={`type-body-strong tabular-nums ${l.tone ?? ""}`}>
                  {t("xp.plus", { n: l.amount })}
                </dd>
              </div>
            ))}
            <div className="mt-1 flex min-h-9 items-center justify-between gap-3 border-t border-border pt-2">
              <dt className="type-body-strong">
                {t("summary.total", {
                  n: formatNumber(final.dailyTotal),
                  cap: formatNumber(final.dailyCap),
                })}
              </dt>
              <dd className="type-body-strong text-xp-text tabular-nums">
                {t("xp.plus", { n: total })}
              </dd>
            </div>
          </dl>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card className="flex items-center gap-2.5">
            <StreakFlame state={final.streak.extended ? "done" : "pending"} size={36} />
            <div className="flex flex-col">
              <span className="font-display text-[1.875rem] leading-none font-bold text-streak-text tabular-nums">
                {formatNumber(final.streak.after)}
              </span>
              <span className="type-label text-streak-text">
                {final.streak.extended ? t("summary.streak") : t("summary.streakKept")}
              </span>
            </div>
          </Card>
          {weekly ? (
            <Card className="flex items-center gap-2.5">
              <span className="font-display text-[1.875rem] leading-none font-bold tabular-nums">
                {formatNumber(Math.min(weekly.progress, weekly.target))}
                <span className="text-text-muted">/{formatNumber(weekly.target)}</span>
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="type-label text-primary-text">
                  {weekly.newlyCompleted
                    ? t("summary.challengeDone", { xp: weekly.reward.xp })
                    : t("summary.challenge")}
                </span>
                <div className="flex">
                  <Bar
                    value={Math.min(weekly.progress, weekly.target)}
                    max={weekly.target}
                    label={weekly.title}
                  />
                </div>
              </div>
            </Card>
          ) : (
            <span />
          )}
        </div>
        {final.late && (
          <p className="type-caption text-text-muted">
            {t("summary.lateNote", { hours: data.lateSyncHours })}
          </p>
        )}

        <Card className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="font-display text-xl leading-none font-bold uppercase">
              {t("summary.level", { level: level.level, title: level.title })}
            </span>
            <span className="type-caption font-extrabold text-primary-text tabular-nums">
              {t("summary.toNext", { xp: level.toNext, next: level.level + 1 })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t("level.progressLabel", { level: level.level, title: level.title })}
            aria-valuemin={0}
            aria-valuemax={level.xpForLevel}
            aria-valuenow={level.xpInLevel}
            className="h-2.5 overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="eyeq-bar-fill h-full origin-left rounded-full bg-primary"
              style={{
                transform: `scaleX(${level.xpForLevel > 0 ? Math.min(1, level.xpInLevel / level.xpForLevel) : 0})`,
              }}
            />
          </div>
          <span className="type-caption text-text-secondary tabular-nums">
            {t("summary.levelTotal", { xp: formatNumber(level.totalXp) })}
          </span>
        </Card>

        {badges.map((b, i) => (
          <Card key={b.id} className="flex items-center gap-3 border-xp-border">
            <span className="grid size-12 shrink-0 place-items-center rounded-control bg-xp-subtle text-xp-text">
              <Icon name="xp" size={24} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="type-label text-xp-text">{t("summary.badge")}</span>
              <span className="text-[0.9375rem] font-extrabold">{b.name}</span>
              {b.description && (
                <span className="type-caption text-text-secondary">{b.description}</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setMoment(i)}
              className="inline-flex min-h-11 items-center rounded-s px-2.5 type-caption font-bold text-primary-text"
            >
              {t("summary.view")}
            </button>
          </Card>
        ))}

        <p className="flex items-start gap-2.5 px-1 type-caption text-text-muted">
          <Icon name="alert" size={18} className="shrink-0" />
          <span>
            {scored.length > 0
              ? t("summary.scoreSaved", {
                  list: scored
                    .map((e) =>
                      t("summary.scoreItem", {
                        score: e.score ?? 0,
                        drill: data.drills.find((d) => d.id === e.drillId)?.title ?? "",
                      }),
                    )
                    .join(", "),
                })
              : t("player.disclaimer")}
          </span>
        </p>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-(--eyeq-z-dock) border-t border-border bg-ground px-gutter pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:static md:border-0 md:bg-transparent md:pb-10">
        <div className="mx-auto max-w-[40rem]">
          <Button variant="primary" fullWidth onClick={() => next("none")}>
            {t("summary.continue")}
          </Button>
        </div>
      </div>

      <LevelUpTakeover
        open={moment === "level"}
        onDone={() => next("level")}
        level={level.level}
        tier={tierOf(level.title)}
        title={level.title}
        body={t("moment.levelUpBody", {
          xp: formatNumber(level.totalXp),
          toNext: formatNumber(level.toNext),
          next: level.level + 1,
        })}
        chips={
          final.coinsEarned > 0 ? (
            <span className="type-body-strong text-xp-text">
              {t("coins.gain", { n: final.coinsEarned })}
            </span>
          ) : undefined
        }
      />
      {typeof moment === "number" && badges[moment] && (
        <BadgeUnlock
          open
          onDone={() => next(moment)}
          name={badges[moment].name}
          body={badges[moment].description ?? undefined}
          coins={badges[moment].coins}
        />
      )}
    </div>
  );
}

type Line = { key: string; label: string; amount: number; capped: boolean; tone?: string };

/** The summary's lines and total, from the server's XP rows only. */
export function summarise(
  results: CompletionResult[],
  data: Pick<PlayData, "drills">,
): { final: CompletionResult; lines: Line[]; total: number; badges: BadgeAward[] } {
  const final = results.find((r) => r.session.complete) ?? results[results.length - 1]!;
  const rows: XpRow[] = results.flatMap((r) => r.xp);
  const lines: Line[] = [];
  const drillRows = rows.filter((x) => x.reason === "drill" && x.amount > 0);
  if (drillRows.length > 0) {
    const same = drillRows.every((x) => x.requested === drillRows[0]!.requested);
    lines.push({
      key: "drills",
      label:
        drillRows.length === 1
          ? t("summary.drillOne")
          : same
            ? t("summary.drills", { n: drillRows.length, xp: drillRows[0]!.requested })
            : t("summary.drillsMixed", { n: drillRows.length }),
      amount: drillRows.reduce((a, x) => a + x.amount, 0),
      capped: drillRows.some((x) => x.truncated),
    });
  }
  for (const x of rows) {
    if (x.reason === "session_bonus" && x.amount > 0) {
      lines.push({
        key: "bonus",
        label: t("summary.bonus"),
        amount: x.amount,
        capped: x.truncated,
      });
    } else if (x.reason === "streak_multiplier" && x.amount > 0) {
      lines.push({
        key: "multiplier",
        label: t("summary.multiplier", { days: x.streak ?? 0, factor: (x.factor ?? 1).toFixed(1) }),
        amount: x.amount,
        capped: x.truncated,
        tone: "text-streak-text",
      });
    } else if (x.reason === "personal_best" && x.amount > 0) {
      lines.push({
        key: `pb-${x.drillId}`,
        label: t("summary.personalBest", {
          drill: data.drills.find((d) => d.id === x.drillId)?.title ?? "",
        }),
        amount: x.amount,
        capped: x.truncated,
      });
    } else if (x.reason === "program_complete" && x.amount > 0) {
      lines.push({
        key: "program",
        label: t("summary.programComplete"),
        amount: x.amount,
        capped: false,
      });
    }
  }
  const total = lines.reduce((a, l) => a + l.amount, 0);
  const seen = new Set<string>();
  const badges = results
    .flatMap((r) => r.badges)
    .filter((b) => !seen.has(b.id) && !!seen.add(b.id));
  return { final, lines, total, badges };
}
