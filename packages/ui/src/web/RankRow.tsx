import { formatNumber, t } from "@eyeq/i18n";
import { cx } from "./cx.ts";
import { Avatar } from "./Avatar.tsx";
import { StreakFlame } from "./Streak.tsx";

export type RankDelta = { dir: "up" | "down" | "new"; n?: number };

export type RankRowProps = {
  rank: number;
  name: string;
  initials: string;
  /** Display name of the sport; omitted on boards that do not show it (D25). */
  sport?: string;
  /** XP level; omitted where it is not known (the athlete passed, in the rank moment). */
  level?: number;
  xp: number;
  delta?: RankDelta;
  trainedToday?: boolean;
  isMe?: boolean;
  /**
   * Only rendered on the "me" row: the connector to the row above. `passesToday` adds
   * "today's session passes them", only where the caller knows it is true.
   */
  gapAbove?: { xp: number; name: string; passesToday?: boolean };
  className?: string;
};

/** COMPONENTS 3.9: min 52 px, display-face rank, initials avatar, weekly XP right-aligned. */
export function RankRow({
  rank,
  name,
  initials,
  sport,
  level,
  xp,
  delta,
  trainedToday,
  isMe,
  gapAbove,
  className,
}: RankRowProps) {
  const shownName = isMe ? t("rank.youName", { name }) : name;
  const sub =
    level === undefined
      ? (sport ?? null)
      : sport
        ? t("rank.sportLevel", { sport, level })
        : t("rank.levelOnly", { level });
  const deltaText =
    delta?.dir === "up"
      ? t("rank.a11y.up", { n: delta.n ?? 1 })
      : delta?.dir === "down"
        ? t("rank.a11y.down", { n: delta.n ?? 1 })
        : delta?.dir === "new"
          ? t("rank.a11y.new")
          : null;
  const a11y = [
    t("rank.a11y.rank", { rank }),
    isMe ? t("rank.a11y.you") : null,
    name,
    sport ?? null,
    level === undefined ? null : t("rank.a11y.level", { level }),
    t("rank.a11y.xp", { xp }),
    deltaText,
    trainedToday ? t("rank.trainedToday") : null,
    isMe && gapAbove ? t("rank.a11y.behind", { xp: gapAbove.xp, name: gapAbove.name }) : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={cx("flex flex-col gap-1", className)}>
      {isMe && gapAbove && (
        <div
          aria-hidden="true"
          className="flex items-center gap-2 pl-4 type-caption text-primary-text"
        >
          <svg
            width="12"
            height="20"
            viewBox="0 0 12 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 3"
            strokeLinecap="round"
          >
            <path d="M6 19V2M2 6l4-4 4 4" />
          </svg>
          <span>
            {t(gapAbove.passesToday ? "rank.gap" : "rank.gapTo", {
              xp: gapAbove.xp,
              name: gapAbove.name,
            })}
          </span>
        </div>
      )}
      <div
        className={cx(
          // Wraps the XP onto its own line at large text sizes rather than overflowing.
          "flex min-h-[3.25rem] flex-wrap items-center gap-3 rounded-m border px-3.5 py-2",
          isMe ? "border-primary bg-primary-subtle" : "border-border bg-surface-1",
        )}
      >
        <span className="sr-only">{a11y}</span>
        <span
          aria-hidden="true"
          className={cx(
            "w-7 shrink-0 type-display-s",
            isMe ? "text-primary-text" : "text-text-muted",
          )}
        >
          {rank}
        </span>
        <Avatar initials={initials} size={32} me={isMe} />
        <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
          <span className="type-body-strong break-words">{shownName}</span>
          {sub && (
            <span
              className={cx(
                "type-caption",
                isMe ? "text-primary-on-subtle" : "text-text-secondary",
              )}
            >
              {sub}
            </span>
          )}
        </span>
        {trainedToday && (
          <span className="text-streak" title={t("rank.trainedToday")} aria-hidden="true">
            <StreakFlame state="done" size={16} />
          </span>
        )}
        {delta && (
          <span
            aria-hidden="true"
            className={cx(
              "type-caption font-extrabold tabular-nums",
              delta.dir === "up" && "text-success-text",
              delta.dir === "down" && "text-rank-text",
              delta.dir === "new" && "text-xp-text",
            )}
          >
            {delta.dir === "up"
              ? `▲${delta.n ?? 1}`
              : delta.dir === "down"
                ? `▼${delta.n ?? 1}`
                : t("rank.new")}
          </span>
        )}
        <span
          aria-hidden="true"
          className="ml-auto flex items-baseline gap-1 type-display-s text-xp-text"
        >
          {formatNumber(xp)}
          <span className="type-caption font-bold text-text-secondary">{t("xp.unit")}</span>
        </span>
      </div>
    </div>
  );
}
