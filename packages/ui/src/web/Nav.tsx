import type React from "react";
import { t } from "@eyeq/i18n";
import { cx } from "./cx.ts";
import { Icon, type IconName } from "./Icon.tsx";

export type NavItem = { href: string; label: string; icon: IconName };

/** Anything that renders an anchor: "a" or next/link. */
export type LinkComponent = React.ComponentType<{
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-current"?: "page" | undefined;
}>;

const DefaultLink: LinkComponent = ({ children, ...rest }) => <a {...rest}>{children}</a>;

export type NavProps = {
  items: NavItem[];
  activeHref: string;
  Link?: LinkComponent;
  className?: string;
};

/**
 * Bottom tab bar (COMPONENTS 3.18): 84 px including the 24 px home-indicator
 * inset, labels always shown, active = violet icon and label, filled icon and
 * a 3 × 24 px bar above it (the non-colour cue). Links with aria-current, since
 * on the web each tab is a page, not an in-page tab panel.
 */
export function BottomTabBar({ items, activeHref, Link = DefaultLink, className }: NavProps) {
  return (
    <nav
      aria-label={t("nav.main")}
      className={cx("border-t border-border bg-surface-tabbar", className)}
    >
      <ul className="flex min-h-[calc(5.25rem-1px)] px-2 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {items.map((item) => {
          const active = item.href === activeHref;
          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  // Labels grow with text size up to 1.5× (as heroes do on native), so five
                  // tabs still fit a 390 px phone at 200 %; they wrap rather than clip.
                  "relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-center text-[min(0.6875rem,16.5px)] leading-tight font-bold break-words no-underline",
                  active ? "text-primary-text" : "text-text-muted",
                )}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-2 h-[3px] w-6 rounded-[2px] bg-primary"
                  />
                )}
                <Icon name={item.icon} size={24} filled={active} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Side navigation of board 16 (athlete) and board 17 (admin, light theme). */
export function SideNav({
  items,
  activeHref,
  Link = DefaultLink,
  brand,
  footer,
  label,
  className,
}: NavProps & { brand: React.ReactNode; footer?: React.ReactNode; label: string }) {
  return (
    <div className={cx("flex h-full flex-col gap-2 border-r border-border px-4 py-6", className)}>
      <div className="px-3 pb-4">{brand}</div>
      <nav aria-label={label}>
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const active = item.href === activeHref;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-h-11 items-center gap-2.5 rounded-control px-3 text-sm font-bold no-underline",
                    active
                      ? "bg-primary-subtle text-primary-on-subtle"
                      : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  <Icon name={item.icon} size={24} filled={active} />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {footer && <div className="mt-auto">{footer}</div>}
    </div>
  );
}

/** The EyeQ mark from boards 16 and 17: violet ring, red pupil, display wordmark. */
export function BrandMark({ suffix }: { suffix?: string }) {
  return (
    <span className="flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="12" fill="none" stroke="var(--eyeq-primary)" strokeWidth="2.5" />
        <circle cx="14" cy="14" r="5" fill="var(--eyeq-cta)" />
      </svg>
      <span className="font-display text-2xl leading-none font-bold tracking-[0.02em] uppercase">
        {t("app.name")}
      </span>
      {suffix && <span className="ml-1 type-label text-text-muted">{suffix}</span>}
    </span>
  );
}
