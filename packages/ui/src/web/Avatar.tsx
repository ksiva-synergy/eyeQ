import { cx } from "./cx.ts";

export type AvatarProps = {
  initials: string;
  size?: "s" | "m" | "l" | 32;
  /** Own avatar: violet fill. */
  me?: boolean;
  className?: string;
};

const SIZE = {
  s: "size-7 text-[0.6875rem]",
  m: "size-9 text-xs",
  l: "size-16 text-xl",
  32: "size-8 text-xs",
} as const;

/** Initials only (D22); photos stay off until consent is settled. Decorative: the name is always beside it. */
export function Avatar({ initials, size = "m", me, className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-grid shrink-0 place-items-center rounded-full font-extrabold",
        SIZE[size],
        me ? "bg-primary text-on-primary" : "bg-border text-text-primary",
        className,
      )}
    >
      {initials}
    </span>
  );
}
