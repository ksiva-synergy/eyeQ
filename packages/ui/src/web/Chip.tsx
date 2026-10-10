import type React from "react";
import { cx } from "./cx.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { formatNumber, t } from "@eyeq/i18n";

export type ChipKind = "neutral" | "selected" | "area" | "xp" | "coin" | "status";
export type ChipStatus = "done" | "pending" | "atRisk" | "frozen" | "ended" | "new";

const STATUS: Record<ChipStatus, string> = {
  done: "bg-success-subtle border-success-border text-success-text",
  pending: "bg-streak-subtle border-streak-border text-streak-text",
  atRisk: "bg-streak-subtle border-streak-border text-streak-text",
  frozen: "bg-rank-subtle border-rank text-rank-text",
  // Transparent so muted text keeps 4.5:1 on any surface in both themes.
  ended: "bg-transparent border-border text-text-muted",
  new: "bg-xp-subtle border-xp-border text-xp-text",
};

const STATUS_ICON: Partial<Record<ChipStatus, IconName>> = { done: "check", frozen: "freeze" };

const KIND: Record<Exclude<ChipKind, "status">, string> = {
  neutral: "bg-surface-2 border-border text-text-primary",
  selected: "bg-primary-subtle border-primary text-primary-on-subtle",
  area: "bg-surface-2 border-border text-primary-text",
  xp: "bg-xp-subtle border-xp-border text-xp-text",
  coin: "bg-xp-subtle border-xp-border text-xp-text",
};

const KIND_ICON: Partial<Record<ChipKind, IconName>> = {
  selected: "check",
  area: "eye",
  xp: "xp",
  coin: "coin",
};

export type ChipProps = {
  kind?: ChipKind;
  status?: ChipStatus;
  /** null hides the kind's default glyph. */
  icon?: IconName | null;
  /** 26 px instead of 28. */
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
};

/** Display-only label (COMPONENTS 3.4). A tappable chip is a Pill. */
export function Chip({ kind = "neutral", status, icon, compact, className, children }: ChipProps) {
  const tone = kind === "status" ? STATUS[status ?? "pending"] : KIND[kind];
  const glyph =
    icon === null
      ? undefined
      : (icon ?? (kind === "status" ? STATUS_ICON[status ?? "pending"] : KIND_ICON[kind]));
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-1.5 rounded-s border px-2.5 py-0.5 type-caption font-bold tabular-nums",
        compact ? "min-h-[1.625rem]" : "min-h-7",
        tone,
        className,
      )}
    >
      {glyph && (
        <Icon
          name={glyph}
          size={14}
          filled={glyph === "xp"}
          strokeWidth={glyph === "coin" ? 2.5 : 2}
        />
      )}
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/** Gold coin balance, top right of Home and the paywall. */
export function CoinChip({ coins }: { coins: number }) {
  return (
    <Chip kind="coin">
      <span className="sr-only">{t("coins.balanceLabel")} </span>
      {formatNumber(coins)}
    </Chip>
  );
}

/** "+72 XP" gold chip. */
export function XPChip({ xp }: { xp: number }) {
  return <Chip kind="xp">{t("xp.gain", { n: xp })}</Chip>;
}
