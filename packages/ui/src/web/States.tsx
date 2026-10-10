import type React from "react";
import { t } from "@eyeq/i18n";
import { cx } from "./cx.ts";
import { Icon, type IconName } from "./Icon.tsx";

/** Empty: glyph + one line + the next action (COMPONENTS 5). */
export function EmptyState({
  icon = "compete",
  title,
  body,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-2 rounded-l border border-border bg-surface-1 p-5 text-center",
        className,
      )}
    >
      <Icon name={icon} size={48} strokeWidth={1.5} className="text-text-muted" />
      <div className="text-[0.9375rem] font-extrabold">{title}</div>
      {body && <div className="type-body-s text-text-secondary">{body}</div>}
      {action}
    </div>
  );
}

/** One shimmering block; shimmer is 1.4 s and stops under reduced motion. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={cx("eyeq-skeleton rounded-s bg-surface-2", className)}
      style={style}
    />
  );
}

/** A loading row shaped like a drill card. Never a spinner in a list. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className={cx(
        "flex items-center gap-3 rounded-l border border-border bg-surface-1 p-3.5",
        className,
      )}
    >
      <span className="sr-only">{t("common.loading")}</span>
      <Skeleton className="size-12 rounded-control" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-[70%]" />
        <Skeleton className="h-3 w-[45%]" />
      </div>
    </div>
  );
}

/** Inline error card with a retry action; never a blocking modal. */
export function ErrorCard({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cx(
        "flex flex-wrap items-center gap-3 rounded-l border border-border bg-surface-1 p-3.5",
        className,
      )}
    >
      <Icon name="alert" className="text-text-secondary" />
      <span className="min-w-0 flex-1 type-body-s">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="eyeq-press min-h-11 rounded-control border border-border bg-surface-2 px-4 type-body-strong"
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}
