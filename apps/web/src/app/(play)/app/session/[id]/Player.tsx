"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CompletionEvent,
  CompletionResult,
  CompletionsResponse,
  DrillMedia,
  SessionDrill,
} from "@eyeq/api-contract";
import { formatTimeIn, t } from "@eyeq/i18n";
import { Button, Card, Chip, Icon, RatingInput, cx } from "@eyeq/ui/web";
import { DrillVideo } from "@/components/player/DrillVideo";
import { keepEvent } from "@/components/player/events";
import type { WatchProgress } from "@/components/player/provider";
import { retryable, v1 } from "@/lib/athlete-api";
import { Summary } from "./Summary";
import { clientId } from "@/lib/client-id";

export type PlayData = {
  kind: "program" | "free";
  sessionId: string | null;
  title: string;
  dayNumber: number | null;
  estMinutes: number;
  locked: boolean;
  programSlug: string | null;
  drills: SessionDrill[];
  /** The end of the athlete's streak day; null in a coach's preview. */
  streakEndsAt: string | null;
  timezone: string;
  localDate: string;
  lateSyncHours: number;
};

type Saving =
  { state: "idle" } | { state: "saving"; retrying: boolean } | { state: "failed"; reason: string };

const DEFAULT_THRESHOLD = 0.8;

/**
 * Board 3: one drill at a time. Mark done unlocks once the share watched reaches the done
 * threshold from GET /drills/:id/media (game_config video.done_threshold) and says why
 * while it is locked. Each completion goes to POST /completions; the summary (board 4)
 * shows what the server answered, never a sum of its own (ground rule 1).
 */
export type PlayerPreview = {
  /** Media built from the builder's own links (the coach can see them anyway). */
  media: Record<string, DrillMedia>;
  backHref: string;
};

export function Player({ data, preview }: { data: PlayData; preview?: PlayerPreview }) {
  const drills = data.drills;
  const [done, setDone] = useState<Set<string>>(
    () => new Set(drills.filter((d) => d.doneToday).map((d) => d.id)),
  );
  const firstOpen = drills.findIndex((d) => !d.doneToday && !d.locked);
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [progress, setProgress] = useState<Record<string, WatchProgress>>({});
  const [threshold, setThreshold] = useState<Record<string, number>>({});
  const [scores, setScores] = useState<Record<string, string>>({});
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [saving, setSaving] = useState<Saving>({ state: "idle" });
  const [results, setResults] = useState<CompletionResult[]>([]);
  // Opened after the session was finished (a reload, or from another device): the summary.
  const [summary, setSummary] = useState(
    () => drills.some((d) => d.doneToday) && drills.every((d) => d.doneToday || d.locked),
  );
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const drill = drills[index];

  const loadMedia = useCallback(
    async (d: SessionDrill): Promise<DrillMedia | null> => {
      if (preview) {
        const m = preview.media[d.id] ?? null;
        if (m) setThreshold((x) => ({ ...x, [d.id]: m.doneThreshold }));
        return m;
      }
      const q = data.sessionId ? `?session=${data.sessionId}` : "";
      const r = await v1<DrillMedia>("GET", `/drills/${d.id}/media${q}`);
      if (!r.ok) return null;
      setThreshold((m) => ({ ...m, [d.id]: r.data.doneThreshold }));
      return r.data;
    },
    [data.sessionId, preview],
  );

  if (data.locked) return <Locked data={data} />;
  if (summary && preview) return <PreviewEnd backHref={preview.backHref} />;
  if (summary) return <Summary data={data} known={results} />;
  if (!drill) return <Locked data={data} />;

  const need = threshold[drill.id] ?? DEFAULT_THRESHOLD;
  const watched = (progress[drill.id]?.fraction ?? 0) >= need;
  const isDone = done.has(drill.id);
  const nextDrill = drills.slice(index + 1).find((d) => !done.has(d.id) && !d.locked);

  async function markDone() {
    if (!drill) return;
    if (preview) {
      // Preview: nothing is sent; the player just moves on.
      const nowDone = new Set(done).add(drill.id);
      setDone(nowDone);
      const next = drills.findIndex((d) => !nowDone.has(d.id) && !d.locked);
      if (next === -1) setSummary(true);
      else setIndex(next);
      return;
    }
    const raw = scores[drill.id];
    const score =
      drill.scoreType === "number" && raw && raw.trim() !== ""
        ? Number(raw)
        : drill.scoreType === "rating"
          ? (ratings[drill.id] ?? null)
          : null;
    const event = keepEvent(data.localDate, {
      clientEventId: clientId(),
      drillId: drill.id,
      sessionId: data.sessionId,
      completedAt: new Date().toISOString(),
      score: score !== null && Number.isFinite(score) ? score : null,
      watchPct: Math.min(1, progress[drill.id]?.fraction ?? 0),
    } satisfies CompletionEvent);

    setSaving({ state: "saving", retrying: false });
    for (let attempt = 0; alive.current; attempt++) {
      const r = await v1<CompletionsResponse>("POST", "/completions", { events: [event] });
      if (r.ok) {
        const first = r.data.results[0];
        if (!first) break;
        if (!first.ok) {
          setSaving({ state: "failed", reason: first.error.message });
          return;
        }
        const result = first.result;
        setResults((rs) => [...rs.filter((x) => x.drillId !== result.drillId), result]);
        const nowDone = new Set(done).add(drill.id);
        setDone(nowDone);
        setSaving({ state: "idle" });
        const next = drills.findIndex((d) => !nowDone.has(d.id) && !d.locked);
        if (result.session.complete || next === -1) setSummary(true);
        else setIndex(next);
        return;
      }
      if (!retryable(r)) {
        setSaving({ state: "failed", reason: r.code });
        return;
      }
      // Offline or a server hiccup: the same event again, backing off to 30 s.
      setSaving({ state: "saving", retrying: true });
      await new Promise((res) => setTimeout(res, Math.min(30_000, 1000 * 2 ** attempt)));
    }
  }

  const disabledReason =
    !watched && !isDone
      ? t(drill.videoProvider === "drive" ? "player.unlocksAtTime" : "player.unlocksAt", {
          pct: Math.round(need * 100),
        })
      : undefined;
  const actionLabel =
    saving.state === "saving"
      ? saving.retrying
        ? t("player.retrying")
        : t("player.saving")
      : isDone
        ? t("player.done")
        : t("player.markDone", { n: drill.xp });

  const streakLine = data.streakEndsAt
    ? t("player.streakSafe", {
        time: formatTimeIn(new Date(new Date(data.streakEndsAt).getTime() - 60_000), data.timezone),
      })
    : null;

  const actions = (
    <div className="flex flex-col gap-2">
      {saving.state === "failed" && (
        <p role="alert" className="flex items-center gap-2 type-body-s text-cta-text">
          <Icon name="alert" size={16} className="shrink-0" />
          {t("player.saveFailed", { reason: saving.reason })}
        </p>
      )}
      <Button
        variant="cta"
        fullWidth
        icon={isDone ? "check" : saving.state === "saving" ? undefined : "check"}
        loading={saving.state === "saving"}
        onClick={() => void markDone()}
        {...(isDone || disabledReason
          ? { disabledReason: isDone ? t("player.done") : disabledReason }
          : {})}
      >
        {isDone || disabledReason ? t("player.markDoneRepeat") : actionLabel}
      </Button>
      {streakLine && (
        <p className="flex min-h-6 items-center justify-end type-caption font-bold text-text-muted tabular-nums">
          {streakLine}
        </p>
      )}
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-[73.75rem] flex-1 flex-col">
      <div className="flex flex-col gap-4 px-gutter pt-6 pb-44 md:px-8 md:pb-10">
        {preview && (
          <p
            role="note"
            className="flex items-center gap-2 rounded-m border border-primary-subtle-border bg-primary-subtle px-3.5 py-2.5 type-body-s text-primary-on-subtle"
          >
            <Icon name="eye" size={18} className="shrink-0" />
            {t("preview.banner")}
          </p>
        )}
        <header className="flex items-center gap-3">
          <a
            href={preview?.backHref ?? "/app"}
            aria-label={t("player.exit")}
            className="eyeq-press inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-border bg-surface-1 text-text-primary"
          >
            <Icon name="close" size={24} />
          </a>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap justify-between gap-x-3">
              <span className="type-label text-text-muted">
                {t("player.drillOf", { n: index + 1, total: drills.length })}
              </span>
              <span className="type-label text-text-muted tabular-nums">
                {t("player.sessionMinutes", { n: data.estMinutes })}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={t("player.progress", { n: index + 1, total: drills.length })}
              aria-valuemin={0}
              aria-valuemax={drills.length}
              aria-valuenow={done.size}
              className="flex gap-1"
            >
              {drills.map((d, i) => (
                <span
                  key={d.id}
                  className={cx(
                    "h-1.5 flex-1 rounded-full",
                    done.has(d.id) ? "bg-success" : i === index ? "bg-primary" : "bg-surface-2",
                  )}
                />
              ))}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:gap-6">
          <div className="flex flex-col gap-4">
            <DrillVideo
              key={drill.id}
              title={drill.title}
              drillSeconds={drill.durationMinutes * 60}
              loadMedia={() => loadMedia(drill)}
              progress={progress[drill.id] ?? null}
              onProgress={(p) => setProgress((m) => ({ ...m, [drill.id]: p }))}
              watched={watched}
            />
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {drill.measurement && <Chip kind="area">{drill.measurement.name}</Chip>}
                <Chip kind="xp">{t("xp.gain", { n: drill.xp })}</Chip>
              </div>
              <h1 className="font-display text-[2.125rem] leading-[0.95] font-bold break-words uppercase">
                {drill.title}
              </h1>
              <dl className="flex flex-wrap gap-x-5 gap-y-2">
                <Fact label={t("player.target")} value={drill.targetLabel ?? t("player.none")} />
                <Fact
                  label={t("player.rest")}
                  value={
                    drill.restSeconds
                      ? t("player.restSeconds", { n: drill.restSeconds })
                      : t("player.none")
                  }
                />
                <Fact
                  label={t("player.time")}
                  value={t("player.minutes", { n: drill.durationMinutes })}
                />
              </dl>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {drill.instructions.length > 0 && (
              <Card className="flex flex-col gap-2">
                <h2 className="type-label text-text-muted">{t("player.howTo")}</h2>
                <ol className="flex list-decimal flex-col gap-1 pl-4.5 type-body-s text-text-secondary">
                  {drill.instructions.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ol>
              </Card>
            )}
            {drill.scoreType !== "none" && !isDone && (
              <Card className="flex flex-col gap-2.5">
                <h2 className="type-label text-text-muted">{t("player.score")}</h2>
                {drill.scoreType === "number" ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="type-caption text-text-secondary">
                      {capitalise(
                        t("player.scoreNumberLabel", {
                          unit: drill.scoreUnit ?? drill.targetLabel ?? "",
                        }),
                      )}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={scores[drill.id] ?? ""}
                      onChange={(e) => setScores((m) => ({ ...m, [drill.id]: e.target.value }))}
                      placeholder={t("player.scoreNumberPlaceholder")}
                      className="min-h-12 w-full rounded-control border border-border bg-surface-2 px-3.5 font-display text-xl font-extrabold text-text-primary focus:border-primary focus:outline-none"
                    />
                  </label>
                ) : (
                  <RatingInput
                    label={t("player.scoreRating")}
                    value={ratings[drill.id] ?? null}
                    onChange={(v) => setRatings((m) => ({ ...m, [drill.id]: v }))}
                  />
                )}
              </Card>
            )}
            {nextDrill && (
              <div className="flex items-center gap-3 rounded-m border border-dashed border-border bg-surface-1 px-3.5 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-surface-2 text-text-muted">
                  <Icon name="xp" size={20} />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="type-label text-text-muted">{t("player.upNext")}</span>
                  <span className="type-body-strong">{nextDrill.title}</span>
                  <span className="type-caption text-text-secondary">
                    {[
                      nextDrill.measurement?.name,
                      t("player.minutes", { n: nextDrill.durationMinutes }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
            )}
            <p className="type-caption text-text-muted">{t("player.disclaimer")}</p>
            <div className="hidden md:block">{actions}</div>
          </div>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-(--eyeq-z-dock) border-t border-border bg-ground px-gutter pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:hidden">
        {actions}
      </div>
    </div>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function PreviewEnd({ backHref }: { backHref: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[28rem] flex-col gap-4 px-gutter pt-10">
      <Card className="flex flex-col gap-3">
        <span className="flex items-center gap-2 type-body-strong">
          <Icon name="check" size={20} className="text-success-text" />
          {t("preview.doneTitle")}
        </span>
        <p className="type-body-s text-text-secondary">{t("preview.doneBody")}</p>
        <Button variant="primary" href={backHref}>
          {t("preview.back")}
        </Button>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="type-label text-text-muted">{label}</dt>
      <dd className="font-display text-[1.375rem] leading-tight font-bold uppercase tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function Locked({ data }: { data: PlayData }) {
  return (
    <div className="mx-auto flex w-full max-w-[28rem] flex-col gap-4 px-gutter pt-10">
      <Card className="flex flex-col gap-3">
        <span className="flex items-center gap-2 type-body-strong">
          <Icon name="lock" size={20} />
          {t("player.locked")}
        </span>
        <p className="type-body-s text-text-secondary">{t("pay.locked.session")}</p>
        <Button
          variant="cta"
          href={`/app/upgrade?from=program${data.programSlug ? `&program=${data.programSlug}` : ""}`}
        >
          {t("pay.locked.seePro")}
        </Button>
        <Button
          variant="ghost"
          href={data.programSlug ? `/app/programs/${data.programSlug}` : "/app"}
        >
          {t("common.back")}
        </Button>
      </Card>
    </div>
  );
}
