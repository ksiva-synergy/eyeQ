import type React from "react";
import { cx } from "./cx.ts";
import { Icon, type IconName } from "./Icon.tsx";

export type ButtonVariant = "cta" | "primary" | "ghost" | "text";
export type ButtonSize = "l" | "m" | "s";

type Common = {
  variant?: ButtonVariant;
  /** 52 / 44 / 36 px; `s` is for admin and desktop only (COMPONENTS 3.1). */
  size?: ButtonSize;
  icon?: IconName;
  /** When set the button is disabled and says why, inline. */
  disabledReason?: string;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
};

type AsButton = Common &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "disabled"> & {
    href?: undefined;
  };
type AsLink = Common &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & { href: string };
export type ButtonProps = AsButton | AsLink;

const VARIANT: Record<ButtonVariant, string> = {
  cta: "bg-cta text-on-cta",
  primary: "bg-primary text-on-primary",
  ghost: "bg-surface-2 text-text-primary border border-border",
  text: "bg-transparent text-primary-text",
};

const SIZE: Record<ButtonSize, string> = {
  l: "min-h-[3.25rem] px-5 rounded-m type-button",
  m: "min-h-11 px-5 rounded-m type-button",
  // Drawn 36, with a 44 px hit area (.eyeq-hit, ground rule 13).
  s: "eyeq-hit min-h-9 px-3.5 rounded-control type-body-s font-extrabold",
};

export function buttonClass({
  variant = "primary",
  size = "l",
  fullWidth,
  disabled,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
}): string {
  return cx(
    "eyeq-press inline-flex items-center justify-center gap-2 text-center no-underline select-none",
    "transition-transform duration-(--eyeq-duration-fast)",
    SIZE[size],
    variant === "text" && "px-2",
    disabled ? "bg-surface-2 text-text-disabled cursor-not-allowed" : VARIANT[variant],
    disabled && variant === "ghost" && "border border-border",
    fullWidth && "w-full",
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="eyeq-spin shrink-0"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  );
}

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "l",
    icon,
    disabledReason,
    loading,
    fullWidth,
    className,
    children,
  } = props;
  const disabled = disabledReason !== undefined;
  const cls = cx(buttonClass({ variant, size, fullWidth, disabled }), className);
  const iconSize = size === "s" ? 16 : 20;
  const content = (
    <>
      {loading ? (
        <Spinner size={iconSize} />
      ) : icon ? (
        <Icon name={icon} size={iconSize} filled={icon === "play"} />
      ) : null}
      <span>
        {children}
        {disabled && (
          <span className="font-semibold">
            {" · "}
            {disabledReason}
          </span>
        )}
      </span>
    </>
  );

  if (props.href !== undefined) {
    const {
      variant: _v,
      size: _s,
      icon: _i,
      disabledReason: _d,
      loading: _l,
      fullWidth: _f,
      className: _c,
      children: _ch,
      ...rest
    } = props;
    if (disabled) {
      return (
        <span className={cls} role="link" aria-disabled="true">
          {content}
        </span>
      );
    }
    return (
      <a {...rest} className={cls}>
        {content}
      </a>
    );
  }
  const {
    variant: _v,
    size: _s,
    icon: _i,
    disabledReason: _d,
    loading: _l,
    fullWidth: _f,
    className: _c,
    children: _ch,
    type = "button",
    ...rest
  } = props;
  return (
    <button
      {...rest}
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {content}
    </button>
  );
}

export type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconName;
  /** Required: icon-only controls need an accessible name. */
  label: string;
};

/** 44 × 44, radius control, surface-1 with a hairline (COMPONENTS 3.2). */
export function IconButton({ icon, label, className, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "eyeq-press inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-border bg-surface-1 text-text-primary",
        "disabled:cursor-not-allowed disabled:text-text-disabled",
        className,
      )}
    >
      <Icon name={icon} size={24} />
    </button>
  );
}

/** "Text link" from the board: violet, 44 tall, no fill. */
export function TextLink({
  className,
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode }) {
  return (
    <a {...rest} className={cx(buttonClass({ variant: "text", size: "m" }), className)}>
      {children}
    </a>
  );
}
