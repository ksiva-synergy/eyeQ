import type React from "react";
import { cx } from "./cx.ts";

export type CardTone =
  "default" | "raised" | "primary" | "streak" | "xp" | "success" | "rank" | "dashed";

const TONE: Record<CardTone, string> = {
  default: "bg-surface-1 border-border",
  raised: "bg-surface-2 border-border-strong",
  primary: "bg-primary-subtle border-primary-subtle-border",
  streak: "bg-streak-subtle border-streak-border",
  xp: "bg-xp-subtle border-xp-border",
  success: "bg-success-subtle border-success-border",
  rank: "bg-rank-subtle border-rank",
  dashed: "bg-transparent border-border border-dashed",
};

export function cardClass(tone: CardTone = "default", padding: "m" | "s" | "none" = "m"): string {
  return cx(
    "rounded-l border",
    TONE[tone],
    padding === "m" && "p-card-padding",
    padding === "s" && "p-3.5",
  );
}

export type CardProps = React.HTMLAttributes<HTMLElement> & {
  tone?: CardTone;
  padding?: "m" | "s" | "none";
  /** Render as a section, article, li or div. */
  as?: "div" | "section" | "article" | "li";
  /** A pressable card is a link on the web. */
  href?: string;
};

/** Flat surface with a hairline; radius l, padding card-padding (COMPONENTS 3.3). */
export function Card({
  tone = "default",
  padding = "m",
  as = "div",
  href,
  className,
  children,
  ...rest
}: CardProps) {
  const cls = cx(cardClass(tone, padding), className);
  if (href) {
    return (
      <a href={href} className={cx(cls, "eyeq-press block no-underline text-inherit")} {...rest}>
        {children}
      </a>
    );
  }
  const Tag = as;
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
