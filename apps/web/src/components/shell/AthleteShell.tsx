"use client";
import type React from "react";
import { usePathname } from "next/navigation";
import { t } from "@eyeq/i18n";
import { BottomTabBar, BrandMark, SideNav } from "@eyeq/ui/web";
import { NextLink } from "./NextLink";
import { SkipLink } from "./SkipLink";
import { activeHref, athleteNav } from "./nav";

/**
 * Plan 8.2: below 768 px the web app is the phone design with the bottom tab
 * bar; from 768 px it is board 16, side navigation with the same five
 * destinations and a centred content column. One tree serves both widths.
 */
export function AthleteShell({ children }: { children: React.ReactNode }) {
  const items = athleteNav();
  const active = activeHref(items, usePathname() ?? "/app");
  return (
    <div className="min-h-dvh bg-ground text-text-primary md:flex">
      <SkipLink />
      <aside
        className="sticky top-0 hidden h-dvh w-60 shrink-0 md:block lg:w-64"
        data-testid="side-nav"
      >
        <SideNav
          items={items}
          activeHref={active}
          Link={NextLink}
          label={t("nav.main")}
          brand={<BrandMark />}
        />
      </aside>
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        <div className="mx-auto w-full max-w-[73.75rem] px-gutter pt-6 pb-32 md:px-8 md:pt-7 md:pb-10">
          {children}
        </div>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-(--eyeq-z-tabbar) md:hidden" data-testid="tab-bar">
        <BottomTabBar items={items} activeHref={active} Link={NextLink} />
      </div>
    </div>
  );
}
