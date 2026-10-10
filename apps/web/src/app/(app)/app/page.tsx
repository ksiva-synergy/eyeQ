import { Suspense } from "react";
import { redirect } from "next/navigation";
import { asAthlete } from "@eyeq/db";
import { t } from "@eyeq/i18n";
import { currentSession } from "@/server/auth/current";
import { apiDb } from "@/server/db";
import { getMe } from "@/server/services/me";
import { Card } from "@eyeq/ui/web";
import { PageHeader } from "@/components/shell/PageHeader";
import { SignOutButton } from "./sign-out-button";

/**
 * Phase 2's signed-in page, inside the phase 3 athlete shell: proves sign-in end
 * to end with the same service GET /me uses. Today (board 2) replaces it in phase 5.
 */
export default function AppHome() {
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Suspense fallback={<p className="type-body text-text-secondary">{t("common.loading")}</p>}>
        <Me />
      </Suspense>
    </div>
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
      <div>
        <PageHeader eyebrow={t("home.signedInAs")} title={me.displayName || t("home.unnamed")} />
        <p className="-mt-3 type-body-s text-text-secondary">{me.phone ?? me.email}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <dt className="type-label text-text-muted">{s.label}</dt>
            <dd className="type-display-m">{s.value}</dd>
          </Card>
        ))}
      </dl>
      <p className="type-body-s text-text-secondary">{t("home.placeholder")}</p>
      <SignOutButton />
    </>
  );
}
