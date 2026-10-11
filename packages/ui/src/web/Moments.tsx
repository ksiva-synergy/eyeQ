"use client";
import type React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { formatNumber, t } from "@eyeq/i18n";
import { tokens } from "../tokens.ts";
import { cx } from "./cx.ts";
import { Button } from "./Button.tsx";
import { LevelBadge, type RankTier } from "./LevelBadge.tsx";
import { RankRow, type RankRowProps } from "./RankRow.tsx";
import { StreakFlame } from "./Streak.tsx";

/**
 * The five reward moments (DS · Motion moments). CSS keyframes live in
 * styles.css; under prefers-reduced-motion every one of them is replaced by a
 * duration.instant cross-fade to the end state. Every moment is under
 * duration.max, skippable, and never blocks the next action.
 */

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

const outQuart = (x: number) => 1 - Math.pow(1 - x, 4);

/** 01 · XP count-up: whole numbers 0 → total over duration.count, ease-out-quart. */
export function XPCountUp({ total, className }: { total: number; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduced) {
      setShown(total);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / tokens.duration.count);
      setShown(Math.round(total * outQuart(p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [total, reduced]);
  return (
    <span
      className={cx(
        "eyeq-moment-xp inline-flex flex-wrap items-baseline justify-center gap-1 type-hero text-xp-text",
        className,
      )}
    >
      <span className="sr-only">{t("xp.gain", { n: total })}</span>
      <span aria-hidden="true">{t("xp.plus", { n: shown })}</span>
      <span aria-hidden="true" className="type-body-strong">
        {t("xp.unit")}
      </span>
    </span>
  );
}

/** 02 · Streak flame grows: spring 60 → 115 → 100 %, ember glow, count slides up. */
export function StreakPlusOne({ days, className }: { days: number; className?: string }) {
  return (
    <div
      className={cx("relative inline-flex flex-wrap items-center justify-center gap-3", className)}
    >
      <span className="relative grid place-items-center">
        {/* Glow sits behind the flame only, so it never lowers the label's contrast. */}
        <span
          aria-hidden="true"
          className="eyeq-moment-glow absolute -inset-5 rounded-full bg-streak"
        />
        <span className="eyeq-moment-flame relative">
          <StreakFlame state="done" size={56} />
        </span>
      </span>
      <span className="eyeq-moment-count relative flex flex-col">
        <span className="type-hero text-[min(4.5rem,108px)] text-streak-text">
          {formatNumber(days)}
        </span>
        <span className="type-label text-streak-text">{t("streak.dayStreak")}</span>
      </span>
    </div>
  );
}

/** 05 · Rank change: own row swaps with the one it overtook, delta stamps in after. */
export function RankSwap({
  above,
  me,
  className,
}: {
  above: RankRowProps;
  me: RankRowProps;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <RankRow {...me} className="eyeq-moment-rank-up" />
      <RankRow {...above} className="eyeq-moment-rank-down" />
    </div>
  );
}

type TakeoverProps = {
  open: boolean;
  onDone: () => void;
  /** Hold after the entrance before auto-continuing; null keeps it open. */
  holdMs?: number | null;
  children: React.ReactNode;
  titleId: string;
};

/** Full-screen at z.takeover on primary-subtle; tap anywhere or Continue ends it. */
function Takeover({ open, onDone, holdMs = 1000, children, titleId }: TakeoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    document.getElementById(titleId)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    const timer =
      holdMs === null ? undefined : setTimeout(onDone, tokens.duration.celebrate + holdMs);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
    };
  }, [open, onDone, holdMs, titleId]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onDone}
      className="eyeq-moment-takeover fixed inset-0 z-(--eyeq-z-takeover) flex flex-col overflow-y-auto bg-primary-subtle px-gutter pt-6 pb-8 text-text-primary"
    >
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDone();
            }}
            className="min-h-11 rounded-control px-2.5"
          >
            <span className="rounded-s border border-border bg-surface-1 px-3 py-1.5 type-caption font-bold">
              {t("moment.tapToSkip")}
            </span>
          </button>
        </div>
        {children}
        {holdMs !== null && (
          <div
            aria-hidden="true"
            className="eyeq-moment-hold mt-4 h-0.5 origin-left rounded-full bg-primary-text"
            style={{ animationDuration: `${tokens.duration.celebrate + holdMs}ms` }}
          />
        )}
      </div>
    </div>
  );
}

export type LevelUpTakeoverProps = {
  open: boolean;
  onDone: () => void;
  level: number;
  tier: RankTier;
  title: string;
  /** Body line from the result object, e.g. "2,112 XP. One more level…". */
  body?: React.ReactNode;
  /** Unlock and coin chips. */
  chips?: React.ReactNode;
  holdMs?: number | null;
};

/** 03 · Level-up (board 5a): badge springs from 30 % with a −12° twist, rays burst, title slides up. */
export function LevelUpTakeover({
  open,
  onDone,
  level,
  tier,
  title,
  body,
  chips,
  holdMs,
}: LevelUpTakeoverProps) {
  const titleId = useId();
  return (
    <Takeover open={open} onDone={onDone} holdMs={holdMs ?? 1000} titleId={titleId}>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <div className="relative grid place-items-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 240 240"
            className="eyeq-moment-rays absolute size-60 text-primary-text"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <line
                key={i}
                x1="120"
                y1="18"
                x2="120"
                y2="40"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                transform={`rotate(${i * 30} 120 120)`}
              />
            ))}
          </svg>
          <span className="eyeq-moment-badge relative">
            <LevelBadge level={level} tier={tier} size={176} showTitle={false} />
          </span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="eyeq-moment-line type-label text-primary-text">
            {t("moment.levelUp")}
          </span>
          <h2
            id={titleId}
            tabIndex={-1}
            className="eyeq-moment-line type-display-xl outline-none"
            style={{ animationDelay: "120ms" }}
          >
            {t("level.long", { level })}
            <br />
            <span className="text-primary-text">{title}</span>
          </h2>
          {body && (
            <p
              className="eyeq-moment-line max-w-xs type-body text-text-secondary"
              style={{ animationDelay: "240ms" }}
            >
              {body}
            </p>
          )}
          {chips && <div className="mt-2 flex flex-wrap justify-center gap-2">{chips}</div>}
        </div>
      </div>
      <Button
        variant="primary"
        fullWidth
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
      >
        {t("common.continue")}
      </Button>
    </Takeover>
  );
}

export type BadgeUnlockProps = {
  open: boolean;
  onDone: () => void;
  name: string;
  /** How it was earned, e.g. "14 days in a row". */
  body?: React.ReactNode;
  coins?: number;
  holdMs?: number | null;
};

/** 04 · Badge unlock (board 5b): tile flips in on Y with a 4 % overshoot, one gold sheen sweep. */
export function BadgeUnlock({ open, onDone, name, body, coins, holdMs }: BadgeUnlockProps) {
  const titleId = useId();
  return (
    <Takeover open={open} onDone={onDone} holdMs={holdMs ?? 1000} titleId={titleId}>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <BadgeTile name={name} className="eyeq-moment-flip" />
        <div className="flex flex-col items-center gap-2">
          <span className="type-label text-xp-text">{t("moment.badgeUnlocked")}</span>
          <h2 id={titleId} tabIndex={-1} className="type-display-l outline-none">
            {name}
          </h2>
          {body && <p className="max-w-xs type-body text-text-secondary">{body}</p>}
          {coins ? (
            <span className="type-body-strong text-xp-text">{t("coins.gain", { n: coins })}</span>
          ) : null}
        </div>
      </div>
      <Button
        variant="primary"
        fullWidth
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
      >
        {t("common.continue")}
      </Button>
    </Takeover>
  );
}

/** Badge tile used by the unlock moment and, later, the trophy case. */
export function BadgeTile({
  name,
  locked,
  className,
}: {
  name: string;
  locked?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "relative flex size-[8.25rem] flex-col items-center justify-center gap-2 overflow-hidden rounded-l border p-3 text-center",
        locked
          ? "border-dashed border-border bg-transparent text-text-muted"
          : "border-border-strong bg-surface-2",
        className,
      )}
    >
      {locked ? (
        <span className="text-text-muted" aria-hidden="true">
          <StreakFlame state="ended" size={36} />
        </span>
      ) : (
        <span className="text-streak" aria-hidden="true">
          <StreakFlame state="pending" size={36} />
        </span>
      )}
      <span className="font-display text-xl leading-none font-bold uppercase">{name}</span>
      {!locked && (
        <span
          aria-hidden="true"
          className="eyeq-moment-sheen pointer-events-none absolute inset-0"
        />
      )}
    </div>
  );
}
