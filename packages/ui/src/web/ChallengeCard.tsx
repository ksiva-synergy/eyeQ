import { t } from "@eyeq/i18n";
import { cx } from "./cx.ts";
import { Button } from "./Button.tsx";
import { Chip } from "./Chip.tsx";
import { Icon } from "./Icon.tsx";
import { Bar } from "./Progress.tsx";

export type ChallengeCardProps = {
  kind: "weekly" | "program" | "premium";
  title: string;
  progress: number;
  target: number;
  reward: { xp?: number; coins?: number; badge?: string };
  /** Preformatted reset, e.g. "Mon · 2d 6h". */
  resetsLabel?: string;
  /** Premium entry price, e.g. "₹[ENTRY]". */
  price?: string;
  joined?: number;
  state: "active" | "complete" | "missed" | "locked";
  /** Locked: the unlock condition in words. */
  lockedHint?: string;
  className?: string;
};

const KIND_LABEL = {
  weekly: "challenge.weekly",
  program: "challenge.program",
  premium: "challenge.premium",
} as const;

/** COMPONENTS 3.12. Missed is muted, never red. */
export function ChallengeCard({
  kind,
  title,
  progress,
  target,
  reward,
  resetsLabel,
  price,
  joined,
  state,
  lockedHint,
  className,
}: ChallengeCardProps) {
  const rewardText = [
    reward.xp ? t("xp.gain", { n: reward.xp }) : null,
    reward.coins ? t("coins.count", { n: reward.coins }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      className={cx(
        "flex flex-col gap-2.5 rounded-l border p-card-padding",
        state === "locked"
          ? "border-dashed border-border bg-transparent"
          : kind === "premium"
            ? "border-xp-border bg-surface-1"
            : state === "complete"
              ? "border-success-border bg-success-subtle"
              : "border-border bg-surface-1",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cx("type-label", kind === "premium" ? "text-xp-text" : "text-primary-text")}
        >
          {t(KIND_LABEL[kind])}
        </span>
        {state === "active" && resetsLabel && (
          <Chip compact>{t("challenge.resets", { when: resetsLabel })}</Chip>
        )}
        {state === "complete" && (
          <Chip kind="status" status="done" compact>
            {t("challenge.complete")}
          </Chip>
        )}
        {state === "missed" && (
          <Chip kind="status" status="ended" compact icon="cross">
            {t("challenge.missed")}
          </Chip>
        )}
        {state === "locked" && (
          <Chip kind="status" status="ended" compact icon="lock">
            {t("challenge.locked")}
          </Chip>
        )}
        {kind === "premium" && price && state === "active" && (
          <Chip kind="xp" icon="coin">
            {price}
          </Chip>
        )}
      </div>
      <div
        className={cx(
          "text-[1.0625rem] font-extrabold",
          (state === "missed" || state === "locked") && "text-text-secondary",
        )}
      >
        {title}
      </div>
      {state === "locked" ? (
        <div className="flex items-center gap-2 type-body-s text-text-muted">
          <Icon name="lock" size={16} />
          <span>{lockedHint}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <Bar
            value={progress}
            max={target}
            label={t("challenge.progressLabel", { progress, target })}
            className={state === "missed" ? "opacity-60" : undefined}
          />
          <span
            aria-hidden="true"
            className={cx(
              "type-display-s text-[1.375rem]",
              state === "missed" && "text-text-muted",
            )}
          >
            {progress}
            <span className="text-text-muted">{t("challenge.ofTarget", { target })}</span>
          </span>
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 type-caption text-text-secondary">
        <span>
          {state === "complete"
            ? t("challenge.earned")
            : state === "missed"
              ? t("challenge.oneShort", { progress, target })
              : t("challenge.reward")}{" "}
          {state !== "missed" && <strong className="text-xp-text">{rewardText}</strong>}
        </span>
        {reward.badge && <span>{t("challenge.badge", { badge: reward.badge })}</span>}
        {joined !== undefined && <span>{t("challenge.joined", { n: joined })}</span>}
      </div>
      {kind === "premium" && state === "active" && price && (
        <>
          <Button variant="cta" size="m" fullWidth>
            {t("challenge.enter", { price })}
          </Button>
          <span className="type-caption text-text-muted">{t("challenge.under18")}</span>
        </>
      )}
    </div>
  );
}
