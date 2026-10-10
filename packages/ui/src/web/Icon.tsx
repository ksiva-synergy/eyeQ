import type React from "react";
import { cx } from "./cx.ts";

/**
 * The 16 icons of the "DS · Type, spacing, radii, elevation, icons" board, plus
 * the glyphs other boards draw inline (back, close, play, plus, menu). 24 grid,
 * 2px stroke, round caps and joins, `currentColor`. Filled variants exist only
 * for the active tab, the done streak flame and the XP bolt (plan 8).
 */
const PATHS = {
  home: <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  train: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8l6 4-6 4z" />
    </>
  ),
  compete: (
    <>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" />
    </>
  ),
  progress: <path d="M4 20v-7M10 20V6M16 20v-10M22 20H2" />,
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  streak: (
    <path d="M12 3c.5 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2.5-4.5C9.5 12 11 13 12 13c-.5-3-1.5-6 0-10z" />
  ),
  xp: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  freeze: <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" />,
  check: <path d="M5 12l5 5 9-11" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  whatsapp: (
    <>
      <path d="M4 20l1.5-4A8 8 0 1 1 8 18.5z" />
      <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1a4 4 0 0 1-2-2l1-1-1-2z" />
    </>
  ),
  share: <path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
    </>
  ),
  back: <path d="M15 6l-6 6 6 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  play: <path d="M8 5v14l11-7z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  cross: <path d="M7 7l10 10M17 7L7 17" />,
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </>
  ),
  builder: <path d="M4 6h16M4 12h10M4 18h7" />,
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];
/** The 16 named icons of the design-system board, in board order. */
export const BOARD_ICONS: IconName[] = [
  "home",
  "train",
  "compete",
  "progress",
  "profile",
  "streak",
  "xp",
  "coin",
  "eye",
  "lock",
  "freeze",
  "check",
  "chevron",
  "whatsapp",
  "share",
  "settings",
];

const FILLABLE = new Set<IconName>([
  "home",
  "train",
  "compete",
  "progress",
  "profile",
  "streak",
  "xp",
  "play",
]);

export type IconProps = {
  name: IconName;
  /** px; 16, 20 or 24 in the system (size.icon-*), other values for heroes. */
  size?: number;
  /** Filled variant: active tab, done streak flame, XP bolt. */
  filled?: boolean;
  className?: string;
  /** Icons are decorative unless given a label. */
  label?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
};

export function Icon({
  name,
  size = 24,
  filled,
  className,
  label,
  strokeWidth = 2,
  style,
}: IconProps) {
  const fill = filled && FILLABLE.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cx("shrink-0", className)}
      style={style}
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
