"use client";
import type React from "react";
import { Suspense } from "react";
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
 *
 * The navs read the path inside Suspense: on a route with dynamic segments Next.js
 * prerenders the shell without it, and the fallback is the same nav with nothing marked.
 */
export function AthleteShell({
  children,
  activePath,
}: {
  children: React.ReactNode;
  /** For previews (/dev/shell): the path whose destination is marked current. */
  activePath?: string;
}) {
  return (
    <div className="min-h-dvh bg-ground text-text-primary md:flex">
      <SkipLink />
      <aside
        className="sticky top-0 hidden h-dvh w-60 shrink-0 md:block lg:w-64"
        data-testid="side-nav"
      >
        <Suspense fallback={<Side active="" />}>
          <WithPath activePath={activePath} render={(active) => <Side active={active} />} />
        </Suspense>
      </aside>
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
        <div className="mx-auto w-full max-w-[73.75rem] px-gutter pt-6 pb-32 md:px-8 md:pt-7 md:pb-10">
          {children}
        </div>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-(--eyeq-z-tabbar) md:hidden" data-testid="tab-bar">
        <Suspense fallback={<Tabs active="" />}>
          <WithPath activePath={activePath} render={(active) => <Tabs active={active} />} />
        </Suspense>
      </div>
    </div>
  );
}

function WithPath({
  activePath,
  render,
}: {
  activePath: string | undefined;
  render: (active: string) => React.ReactNode;
}) {
  const pathname = usePathname();
  return render(activeHref(athleteNav(), activePath ?? pathname ?? "/app"));
}

function Side({ active }: { active: string }) {
  return (
    <SideNav
      items={athleteNav()}
      activeHref={active}
      Link={NextLink}
      label={t("nav.main")}
      brand={<BrandMark />}
    />
  );
}

function Tabs({ active }: { active: string }) {
  return <BottomTabBar items={athleteNav()} activeHref={active} Link={NextLink} />;
}
