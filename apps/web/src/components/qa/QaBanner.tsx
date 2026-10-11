import { connection } from "next/server";
import { t } from "@eyeq/i18n";
import { nextJar } from "@/server/auth/next-cookies";
import { qaGrantFromJar } from "@/server/auth/qa";
import { qaAthleteName } from "@/server/auth/qa-routes";

/**
 * Says so while the QA master login is viewing as an athlete, with the way back to /qa.
 * Nothing otherwise. Render inside Suspense. Remove before public launch.
 */
export async function QaBanner() {
  await connection();
  const as = qaGrantFromJar(await nextJar())?.as;
  if (!as) return null;
  const name = (await qaAthleteName(as)) ?? as.slice(0, 8);
  return (
    <a
      href="/qa"
      className="fixed top-2 left-1/2 z-50 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-cta-text bg-surface-1 px-4 type-label text-text-primary shadow"
    >
      <span>{t("qa.banner", { name })}</span>
      <span aria-hidden="true">·</span>
      <span className="text-primary-text underline">{t("qa.banner.switch")}</span>
    </a>
  );
}
