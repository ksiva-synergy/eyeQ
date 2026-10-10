import { formatNumber, t, type MessageKey } from "@eyeq/i18n";
import { cx } from "./cx.ts";
import { Chip, type ChipStatus } from "./Chip.tsx";
import { Icon } from "./Icon.tsx";

export type StreakState = "done" | "pending" | "atRisk" | "frozen" | "ended";

export type StreakCounterProps = {
  days: number;
  best: number;
  state: StreakState;
  freezesHeld: number;
  /** Display value from the server's result object, e.g. 1.1. */
  multiplier: number;
  /** Preformatted end time or countdown, e.g. "11:59 pm" or "4 h left". */
  endsLabel?: string;
  layout?: "card" | "compact";
  className?: string;
};

const CHIP: Record<StreakState, { status: ChipStatus; key: MessageKey }> = {
  done: { status: "done", key: "streak.todayDone" },
  pending: { status: "pending", key: "streak.todayPending" },
  atRisk: { status: "atRisk", key: "streak.atRisk" },
  frozen: { status: "frozen", key: "streak.frozen" },
  ended: { status: "pending", key: "streak.dayOneToday" },
};

const STATE_WORD: Record<StreakState, MessageKey> = {
  done: "streak.state.done",
  pending: "streak.state.pending",
  atRisk: "streak.state.atRisk",
  frozen: "streak.state.frozen",
  ended: "streak.state.ended",
};

/** The flame in its five looks: filled, outline, dashed, frozen (sky + snowflake), ended (muted). */
export function StreakFlame({ state, size = 34 }: { state: StreakState; size?: number }) {
  const colour =
    state === "frozen" ? "text-rank-text" : state === "ended" ? "text-text-muted" : "text-streak";
  return (
    <span
      className={cx("relative inline-flex shrink-0", colour, state === "atRisk" && "eyeq-pulse")}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill={state === "done" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={state === "atRisk" ? "3 2.5" : undefined}
      >
        <path d="M12 3c.5 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2.5-4.5C9.5 12 11 13 12 13c-.5-3-1.5-6 0-10z" />
      </svg>
      {state === "frozen" && (
        <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-full border border-rank bg-rank-subtle">
          <Icon name="freeze" size={10} strokeWidth={2.5} />
        </span>
      )}
    </span>
  );
}

/** COMPONENTS 3.7. One accessible label for the whole counter; the flame is decorative. */
export function StreakCounter({
  days,
  best,
  state,
  freezesHeld,
  multiplier,
  endsLabel,
  layout = "card",
  className,
}: StreakCounterProps) {
  const chip = CHIP[state];
  const numberColour =
    state === "frozen"
      ? "text-rank-text"
      : state === "ended"
        ? "text-text-muted line-through"
        : "text-streak-text";
  const a11y = [
    t("streak.a11y.days", { n: days }),
    t(STATE_WORD[state]),
    endsLabel ? t("streak.a11y.ends", { when: endsLabel }) : null,
    t("streak.a11y.freezes", { n: freezesHeld }),
    t("streak.a11y.best", { n: best }),
  ]
    .filter(Boolean)
    .join(", ");

  if (layout === "compact") {
    return (
      <span className={cx("inline-flex items-center gap-1.5", className)}>
        <span className="sr-only">{a11y}</span>
        <span aria-hidden="true" className="inline-flex items-center gap-1.5">
          <StreakFlame state={state} size={16} />
          <span className={cx("type-body-strong tabular-nums", numberColour)}>
            {t("streak.compact", { n: days })}
          </span>
          <Chip kind="status" status={chip.status} compact>
            {t(chip.key)}
          </Chip>
        </span>
      </span>
    );
  }

  return (
    <div
      className={cx(
        "rounded-l border p-3.5",
        state === "atRisk" ? "border-streak-border bg-surface-1" : "border-border bg-surface-1",
        className,
      )}
    >
      <span className="sr-only">{a11y}</span>
      <div aria-hidden="true" className="flex flex-wrap items-center gap-3">
        <StreakFlame state={state} />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={cx("type-display-l text-[2.125rem]", numberColour)}>
              {formatNumber(days)}
            </span>
            <span
              className={cx(
                "type-label",
                state === "ended"
                  ? "text-text-muted"
                  : state === "frozen"
                    ? "text-rank-text"
                    : "text-streak-text",
              )}
            >
              {t("streak.dayStreak")}
            </span>
          </div>
          <span className="type-caption text-text-secondary">
            {state === "ended"
              ? t("streak.endedLine", { best })
              : t("streak.detailLine", {
                  best,
                  freezes: freezesHeld,
                  multiplier: multiplier.toFixed(1),
                })}
          </span>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <Chip kind="status" status={chip.status} compact>
            {t(chip.key)}
          </Chip>
          {endsLabel && state !== "ended" && state !== "done" && (
            <span className="type-caption text-text-secondary tabular-nums">
              {t("streak.ends", { when: endsLabel })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
