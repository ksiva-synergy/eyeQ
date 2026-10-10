import { formatNumber, t } from "@eyeq/i18n";
import { cx } from "./cx.ts";
import { Icon } from "./Icon.tsx";

export type ProgressRingProps = {
  value: number;
  max: number;
  size?: 96 | 64;
  /** Centre caption under the fraction, e.g. "DRILLS". */
  sublabel?: string;
  /** Read by screen readers, e.g. "3 of 4 drills done". */
  label: string;
  className?: string;
};

/**
 * Track surface-2, arc primary, round caps from 12 o'clock (COMPONENTS 3.5).
 * Sized in rem so the centre label still fits at 200 % text.
 */
export function ProgressRing({
  value,
  max,
  size = 96,
  sublabel,
  label,
  className,
}: ProgressRingProps) {
  const complete = max > 0 && value >= max;
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
      className={cx("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}
    >
      <svg viewBox="0 0 96 96" className="absolute inset-0 size-full" aria-hidden="true">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--eyeq-surface-2)" strokeWidth="10" />
        {fraction > 0 && (
          <circle
            className="eyeq-ring-arc"
            cx="48"
            cy="48"
            r={r}
            fill="none"
            stroke={complete ? "var(--eyeq-success)" : "var(--eyeq-primary)"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - fraction)}
            transform="rotate(-90 48 48)"
          />
        )}
      </svg>
      <div className="relative flex flex-col items-center leading-none" aria-hidden="true">
        {complete ? (
          <Icon
            name="check"
            size={size === 96 ? 32 : 24}
            className="text-success-text"
            strokeWidth={3}
          />
        ) : (
          <span
            className={cx(
              size === 96 ? "type-display-m text-[1.875rem]" : "type-display-s",
              "font-extrabold",
            )}
          >
            {t("progress.fraction", { value, max })}
          </span>
        )}
        {sublabel && size === 96 && (
          <span className="mt-0.5 text-[0.625rem] font-bold text-text-secondary uppercase">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

export type XPBarProps = {
  level: number;
  /** Rank title from the server (bands live in game_config). */
  title: string;
  xpInLevel: number;
  xpForLevel: number;
  totalXp: number;
  /** XP just earned: the fill animates from (xpInLevel - gain) to xpInLevel. */
  gain?: number;
  className?: string;
};

/** 10 px track, violet fill, ticks at 25 % (COMPONENTS 3.6). */
export function XPBar({
  level,
  title,
  xpInLevel,
  xpForLevel,
  totalXp,
  gain,
  className,
}: XPBarProps) {
  const to = xpForLevel > 0 ? Math.min(1, xpInLevel / xpForLevel) : 0;
  const from = gain ? Math.max(0, (xpInLevel - gain) / xpForLevel) : to;
  const remaining = Math.max(0, xpForLevel - xpInLevel);
  return (
    <div className={cx("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-1.5">
          <span className="type-display-m">{t("level.short", { level })}</span>
          <span className="type-label text-primary-text">{title}</span>
        </div>
        <span className="type-caption text-text-secondary tabular-nums">
          {t("level.toNext", { xp: remaining, next: level + 1 })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t("level.progressLabel", { level, title })}
        aria-valuemin={0}
        aria-valuemax={xpForLevel}
        aria-valuenow={xpInLevel}
        aria-valuetext={t("level.progressValue", { xp: xpInLevel, max: xpForLevel, remaining })}
        className="relative h-2.5 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={cx(
            "eyeq-bar-fill h-full origin-left rounded-full bg-primary",
            gain ? "eyeq-bar-gain" : undefined,
          )}
          style={{ transform: `scaleX(${to})`, ["--from" as string]: from, ["--to" as string]: to }}
        />
        {[25, 50, 75].map((p) => (
          <span
            key={p}
            className="absolute top-0 h-full w-0.5 bg-ground opacity-60"
            style={{ left: `${p}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="type-caption text-text-muted tabular-nums">
        {t("xp.total", { xp: formatNumber(totalXp) })}
      </div>
    </div>
  );
}

/** Thin track used by challenge cards and program progress (size.bar-height-s). */
export function Bar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  const f = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cx("h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div
        className="h-full origin-left rounded-full bg-primary"
        style={{ transform: `scaleX(${f})` }}
      />
    </div>
  );
}
