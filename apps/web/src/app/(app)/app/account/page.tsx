import { Suspense } from "react";
import { inSequence } from "@eyeq/db";
import { Skeleton } from "@eyeq/ui/web";
import { asSignedInAthlete } from "@/server/athlete";
import { env } from "@/server/env";
import { listPrograms } from "@/server/services/content";
import { getEntitlements, getProgress } from "@/server/services/daily";
import { getMe } from "@/server/services/me";
import { listPurchases } from "@/server/services/purchases";
import { Account } from "./Account";

/** Profile and account (board 14), rendered on the server from GET /me and its neighbours. */
export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-28" />
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </div>
      }
    >
      <Load />
    </Suspense>
  );
}

async function Load() {
  const data = await asSignedInAthlete("/app/account", async (tx, session) => {
    const [me, { entitlements }, { programs }, progress, badges, purchases] = await inSequence([
      () => getMe(tx, session),
      () => getEntitlements(tx),
      () => listPrograms(tx),
      () => getProgress(tx),
      () => tx.user_badges.count({ where: { user_id: session.userId } }),
      () => listPurchases(tx, session),
    ]);
    return {
      me,
      entitlements,
      programs,
      sessions: progress.sessionsTotal,
      level: progress.level,
      badges,
      purchases,
    };
  });
  return <Account {...data} whatsapp={env.supportWhatsappUrl() ?? null} />;
}
