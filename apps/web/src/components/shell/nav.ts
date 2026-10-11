import { t } from "@eyeq/i18n";
import type { NavItem } from "@eyeq/ui/web";

/** The five athlete destinations (plan 8.1, 8.2), identical at both widths. */
export function athleteNav(): NavItem[] {
  return [
    { href: "/app", label: t("nav.home"), icon: "home" },
    { href: "/app/programs", label: t("nav.train"), icon: "train" },
    { href: "/app/compete", label: t("nav.compete"), icon: "compete" },
    { href: "/app/progress", label: t("nav.progress"), icon: "progress" },
    { href: "/app/account", label: t("nav.profile"), icon: "profile" },
  ];
}

/** Coach admin destinations (board 17). */
export function adminNav(): NavItem[] {
  return [
    { href: "/admin/programs", label: t("nav.programBuilder"), icon: "builder" },
    { href: "/admin/athletes", label: t("nav.athletes"), icon: "profile" },
    { href: "/admin/products", label: t("nav.products"), icon: "coin" },
    { href: "/admin/game", label: t("nav.gameSettings"), icon: "settings" },
  ];
}

/** Screens reached from a destination rather than the nav: the trophy case is Profile's. */
const UNDER: [prefix: string, owner: string][] = [["/app/trophies", "/app/account"]];

/** The nav item a path belongs to: the longest matching prefix. */
export function activeHref(items: NavItem[], pathname: string): string {
  const owner = UNDER.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  if (owner) pathname = owner[1];
  let best = "";
  for (const item of items) {
    const match = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (match && item.href.length > best.length) best = item.href;
  }
  return best;
}
