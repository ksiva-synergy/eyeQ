import { Suspense } from "react";
import { redirect } from "next/navigation";
import { asAthlete } from "@eyeq/db";
import { t } from "@eyeq/i18n";
import { currentSession } from "@/server/auth/current";
import { apiDb } from "@/server/db";
import { getMe } from "@/server/services/me";
import { SignOutButton } from "./sign-out-button";

/**
 * Phase 2's signed-in page: proves sign-in end to end with the same service GET /me
 * uses. Today (board 2) replaces it in phase 5.
 */
export default function AppHome() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-10">
      <Suspense fallback={<p>{t("common.loading")}</p>}>
        <Me />
      </Suspense>
    </main>
  );
}

async function Me() {
  const session = await currentSession();
  if (!session) redirect("/sign-in");
  const me = await asAthlete(apiDb(), session.userId, async (tx) => {
    await tx.$queryRaw`select ensure_my_profile(${session.name})`;
    return getMe(tx, session);
  });
  const stats = [
    { label: t("home.level"), value: me.stats.level },
    { label: t("home.xp"), value: me.stats.totalXp },
    { label: t("home.streak"), value: me.stats.currentStreak },
    { label: t("home.coins"), value: me.stats.coins },
  ];
  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-neutral-500">{t("home.signedInAs")}</p>
        <h1 className="text-2xl font-bold">{me.displayName || t("home.unnamed")}</h1>
        <p className="text-sm text-neutral-500">{me.phone ?? me.email}</p>
      </header>
      <dl className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-neutral-300 p-4">
            <dt className="text-sm text-neutral-500">{s.label}</dt>
            <dd className="text-2xl font-bold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-neutral-500">{t("home.placeholder")}</p>
      <SignOutButton />
    </>
  );
}
