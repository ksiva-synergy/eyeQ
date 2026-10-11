"use client";
import { useEffect, useRef, useState } from "react";
import { tokens } from "../tokens.ts";
import { cx } from "./cx.ts";
import { Icon, type IconName } from "./Icon.tsx";

export type ToastProps = {
  message: string;
  icon?: IconName;
  action?: { label: string; onAction: () => void };
  /** Called when it times out (duration.toast) or the action runs. */
  onDismiss?: () => void;
  /** Off in the gallery so the specimen stays put. */
  autoDismiss?: boolean;
  className?: string;
};

/** COMPONENTS 3.19: one line, raised, e1; stays while hovered or focused. */
export function Toast({
  message,
  icon = "check",
  action,
  onDismiss,
  autoDismiss = true,
  className,
}: ToastProps) {
  const [held, setHeld] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!autoDismiss || held || !onDismiss) return;
    timer.current = setTimeout(onDismiss, tokens.duration.toast);
    return () => clearTimeout(timer.current);
  }, [autoDismiss, held, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      className={cx(
        "eyeq-fade-in flex flex-wrap items-center gap-2.5 rounded-m border border-border-strong bg-surface-2 py-0 pr-2 pl-3.5 shadow-e1",
        className,
      )}
    >
      <Icon
        name={icon}
        size={20}
        className={icon === "check" ? "text-success-text" : "text-text-secondary"}
      />
      <span className="min-w-0 flex-1 py-3 type-body-strong break-words">{message}</span>
      {action && (
        <button
          type="button"
          onClick={() => {
            action.onAction();
            onDismiss?.();
          }}
          className="min-h-11 rounded-control px-2 type-body-s font-extrabold text-primary-text"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
