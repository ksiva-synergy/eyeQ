"use client";
import type React from "react";
import { useId, useRef } from "react";
import { t } from "@eyeq/i18n";
import { cx } from "./cx.ts";
import { Icon } from "./Icon.tsx";

const fieldBase =
  "w-full min-w-0 border bg-surface-2 px-3.5 text-base font-bold text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none disabled:text-text-disabled";

export type TextInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  error?: string;
  hint?: string;
  /** Admin inputs are 40 tall (size.input-admin). */
  dense?: boolean;
};

/** COMPONENTS 3.20: label above in the label style, never placeholder-only; error = border + glyph + message. */
export function TextInput({ label, error, hint, dense, id, className, ...rest }: TextInputProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const msgId = `${inputId}-msg`;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="type-label text-text-muted">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        className={cx(
          fieldBase,
          dense ? "min-h-10 rounded-control text-sm" : "min-h-[3.25rem] rounded-m",
          error ? "border-cta-text" : "border-border",
        )}
        {...rest}
      />
      {(error || hint) && (
        <span
          id={msgId}
          className={cx(
            "flex items-center gap-1.5 type-caption",
            error ? "text-cta-text" : "text-text-secondary",
          )}
        >
          {error && <Icon name="alert" size={16} />}
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

/** Phone number with the fixed +91 prefix. */
export function PhoneInput({
  label,
  error,
  id,
  className,
  ...rest
}: Omit<TextInputProps, "type" | "dense">) {
  const auto = useId();
  const inputId = id ?? auto;
  const msgId = `${inputId}-msg`;
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="type-label text-text-muted">
        {label}
      </label>
      <div className="flex gap-2">
        <span
          className="flex min-h-[3.25rem] items-center rounded-m border border-border bg-surface-2 px-3 text-[0.9375rem] font-bold"
          aria-hidden="true"
        >
          {t("input.phonePrefix")}
        </span>
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? msgId : undefined}
          className={cx(
            fieldBase,
            "min-h-[3.25rem] rounded-m",
            error ? "border-cta-text" : "border-border",
          )}
          {...rest}
        />
      </div>
      {error && (
        <span id={msgId} className="flex items-center gap-1.5 type-caption text-cta-text">
          <Icon name="alert" size={16} />
          {error}
        </span>
      )}
    </div>
  );
}

export type OTPInputProps = {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  label: string;
  error?: string;
  className?: string;
};

/** Six 56 px boxes; auto-advance, paste fills all, SMS autofill on the first box. */
export function OTPInput({ value, onChange, length = 6, label, error, className }: OTPInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  const groupId = useId();
  const set = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join("").slice(0, length));
  };
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <span id={groupId} className="type-label text-text-muted">
        {label}
      </span>
      <div role="group" aria-labelledby={groupId} className="flex gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={length}
            aria-label={t("input.otpDigit", { n: i + 1, total: length })}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "");
              if (raw.length > 1) {
                onChange((digits.slice(0, i).join("") + raw).slice(0, length));
                refs.current[Math.min(length - 1, i + raw.length)]?.focus();
                return;
              }
              set(i, raw);
              if (raw && i < length - 1) refs.current[i + 1]?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            className={cx(
              "min-h-14 w-full min-w-0 flex-1 rounded-control border bg-surface-2 text-center font-display text-[1.75rem] font-bold text-text-primary tabular-nums focus:border-primary focus:outline-none",
              error ? "border-cta-text" : "border-border",
            )}
          />
        ))}
      </div>
      {error && (
        <span className="flex items-center gap-1.5 type-caption text-cta-text">
          <Icon name="alert" size={16} />
          {error}
        </span>
      )}
    </div>
  );
}

export type SegmentedOption = { value: string; label: string };

/** Track surface-2 with 4px padding; selected segment primary with white text; radio semantics. */
export function SegmentedControl({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        "flex flex-wrap gap-1 rounded-m border border-border bg-surface-2 p-1",
        className,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cx(
              // Wraps onto a second row at large text sizes rather than overflowing.
              "min-h-10 min-w-fit flex-1 rounded-control px-2 type-body-strong",
              on ? "bg-primary text-on-primary" : "bg-transparent text-text-secondary",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 52 × 32 switch with an On / Off word beside it (the non-colour cue). */
export function Toggle({
  label,
  checked,
  onChange,
  className,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <label
      className={cx("flex min-h-11 cursor-pointer items-center justify-between gap-3", className)}
    >
      <span className="text-[0.9375rem] font-bold">{label}</span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cx("type-label", checked ? "text-success-text" : "text-text-muted")}
        >
          {checked ? t("input.on") : t("input.off")}
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className={cx(
            "relative h-8 w-[3.25rem] shrink-0 rounded-full transition-colors duration-(--eyeq-duration-fast) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring",
            checked ? "bg-primary" : "border border-border bg-surface-2",
          )}
        >
          <span
            className={cx(
              "absolute top-1 left-1 size-6 rounded-full bg-white transition-transform duration-(--eyeq-duration-fast)",
              checked ? "translate-x-5" : "translate-x-0 bg-text-muted",
            )}
          />
        </span>
      </span>
    </label>
  );
}

/** Toggleable chip: min 44, aria-pressed. */
export function Pill({
  pressed,
  onClick,
  children,
  className,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3.5 type-body-s font-bold",
        pressed
          ? "border-primary bg-primary-subtle text-primary-on-subtle"
          : "border-border bg-surface-2 text-text-secondary",
        className,
      )}
    >
      {pressed && <Icon name="check" size={14} />}
      {children}
    </button>
  );
}

/** 1–5 self-rating: values below the pick get primary-subtle, the pick gets primary. */
export function RatingInput({
  value,
  onChange,
  label,
  className,
}: {
  value: number | null;
  onChange: (v: number) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div role="radiogroup" aria-label={label} className="flex gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          const below = value !== null && n < value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={t("input.ratingValue", { n })}
              onClick={() => onChange(n)}
              className={cx(
                "min-h-11 min-w-11 flex-1 rounded-control border font-display text-xl font-extrabold",
                on
                  ? "border-primary bg-primary text-on-primary"
                  : below
                    ? "border-primary-subtle-border bg-primary-subtle text-primary-on-subtle"
                    : "border-border bg-surface-2 text-text-primary",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between type-caption text-text-secondary" aria-hidden="true">
        <span>{t("input.ratingLow")}</span>
        <span>{t("input.ratingHigh")}</span>
      </div>
    </div>
  );
}
