import { t } from "@eyeq/i18n";
import { cx } from "./cx.ts";
import { Button } from "./Button.tsx";
import { Icon } from "./Icon.tsx";

export type DrillCardState = "pending" | "current" | "done" | "locked";

export type DrillCardProps = {
  title: string;
  /** Measurement area display name. */
  area: string;
  minutes: number;
  target?: string;
  xp: number;
  state: DrillCardState;
  /** Done line, e.g. "self-rated 4/5". */
  score?: string;
  /** Locked: how to unlock, e.g. "unlock for 30 coins or go Pro". */
  unlockHint?: string;
  href?: string;
  onUnlock?: () => void;
  className?: string;
};

/** COMPONENTS 3.13: pending, current, done (struck, green), locked (dashed, lock, how to unlock). */
export function DrillCard({
  title,
  area,
  minutes,
  target,
  xp,
  state,
  score,
  unlockHint,
  href,
  onUnlock,
  className,
}: DrillCardProps) {
  const meta = [area, t("drill.minutes", { n: minutes }), target].filter(Boolean).join(" · ");
  const Wrapper = href && state !== "locked" ? "a" : "div";
  return (
    <Wrapper
      {...(Wrapper === "a" ? { href } : {})}
      className={cx(
        "flex items-center gap-3 rounded-l border p-3.5 no-underline text-text-primary",
        state === "pending" && "border-border bg-surface-1",
        state === "current" && "border-primary bg-surface-1",
        state === "done" && "border-success-border bg-surface-1",
        state === "locked" && "border-dashed border-border bg-surface-1",
        Wrapper === "a" && "eyeq-press",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "grid size-12 shrink-0 place-items-center rounded-control",
          state === "done"
            ? "bg-success-subtle text-success-text"
            : state === "locked"
              ? "bg-surface-2 text-text-muted"
              : "bg-primary-subtle text-primary-text",
        )}
      >
        <Icon name={state === "done" ? "check" : state === "locked" ? "lock" : "eye"} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cx(
            "text-[0.9375rem] font-extrabold break-words",
            state === "done" && "text-text-secondary line-through",
            state === "locked" && "text-text-secondary",
          )}
        >
          {state === "done" && <span className="sr-only">{t("drill.doneA11y")} </span>}
          {state === "locked" && <span className="sr-only">{t("drill.lockedA11y")} </span>}
          {title}
        </span>
        <span
          className={cx(
            "type-caption",
            state === "done"
              ? "text-success-text"
              : state === "locked"
                ? "text-text-muted"
                : "text-text-secondary",
          )}
        >
          {state === "done"
            ? t("drill.doneLine", { score: score ?? "" }).replace(/ · $/, "")
            : state === "locked"
              ? t("drill.lockedLine", { hint: unlockHint ?? "" })
              : meta}
        </span>
      </span>
      {state === "locked" ? (
        <Button variant="ghost" size="s" onClick={onUnlock}>
          {t("drill.unlock")}
        </Button>
      ) : (
        <span className="flex flex-col items-end gap-1">
          <span
            className={cx(
              "type-body-s font-extrabold tabular-nums",
              state === "done" ? "text-success-text" : "text-xp-text",
            )}
          >
            {t("xp.gain", { n: xp })}
          </span>
          {state !== "done" && <Icon name="chevron" size={20} className="text-text-muted" />}
        </span>
      )}
    </Wrapper>
  );
}
