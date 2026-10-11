import { Suspense } from "react";
import { redirect } from "next/navigation";
import { asSignedInAthlete, configNumbers } from "@/server/athlete";
import { getHome } from "@/server/services/daily";
import { getMe } from "@/server/services/me";
import { unreadCount } from "@/server/services/notify";
import { Today } from "./today/Today";
import { TodaySkeleton } from "./today/TodaySkeleton";

/**
 * Today (boards 2 and 13a to 13c; board 16 from 768 px). Rendered on the server from the
 * same services GET /me and GET /home use, in one transaction, so the first load makes no
 * API round trip from the browser (plan phase 5 acceptance).
 */
export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <Load />
    </Suspense>
  );
}

async function Load() {
  const { me, home, cfg, unread } = await asSignedInAthlete("/app", async (tx, session) => ({
    me: await getMe(tx, session),
    home: await getHome(tx),
    cfg: await configNumbers(tx, ["streak.multiplier_days", "streak.freeze_coin_price"]),
    unread: await unreadCount(tx, session.userId),
  }));
  // Onboarding (boards 1c to 1e) comes before Today.
  if (!me.onboardedAt) redirect("/onboarding/profile");
  return (
    <Today
      home={home}
      multiplierDays={cfg["streak.multiplier_days"]}
      freezePrice={cfg["streak.freeze_coin_price"]}
      unread={unread}
    />
  );
}
