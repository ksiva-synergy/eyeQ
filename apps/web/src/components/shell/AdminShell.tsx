"use client";
import type React from "react";
import { usePathname } from "next/navigation";
import { t } from "@eyeq/i18n";
import { BrandMark, SideNav, cx } from "@eyeq/ui/web";
import { NextLink } from "./NextLink";
import { SkipLink } from "./SkipLink";
import { activeHref, adminNav } from "./nav";

/**
 * Board 17, light theme. From 768 px: white side navigation. Below it the same
 * links sit in a wrapping row under the brand, since the builder is a desktop
 * tool but must still work on a phone.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const items = adminNav();
  const active = activeHref(items, usePathname() ?? "/admin");
  return (
    <div data-theme="light" className="min-h-dvh bg-ground text-text-primary md:flex">
      <SkipLink />
      <aside
        className="sticky top-0 hidden h-dvh w-60 shrink-0 bg-surface-1 md:block"
        data-testid="admin-side-nav"
      >
        <SideNav
          items={items}
          activeHref={active}
          Link={NextLink}
          label={t("nav.admin")}
          brand={<BrandMark suffix={t("nav.coachSuffix")} />}
        />
      </aside>
      <header className="border-b border-border bg-surface-1 px-gutter pt-4 pb-2 md:hidden">
        <BrandMark suffix={t("nav.coachSuffix")} />
        <nav aria-label={t("nav.admin")} className="mt-3">
          <ul className="flex flex-wrap gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <NextLink
                  href={item.href}
                  aria-current={item.href === active ? "page" : undefined}
                  className={cx(
                    "flex min-h-11 items-center rounded-control px-3 text-sm font-bold no-underline",
                    item.href === active
                      ? "bg-primary-subtle text-primary-on-subtle"
                      : "text-text-secondary",
                  )}
                >
                  {item.label}
                </NextLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        <div className="mx-auto w-full max-w-[73.75rem] px-gutter py-6 md:px-8 md:py-7">
          {children}
        </div>
      </main>
    </div>
  );
}
