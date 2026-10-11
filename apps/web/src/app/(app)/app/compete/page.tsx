import { Suspense } from "react";
import { Skeleton } from "@eyeq/ui/web";
import { asSignedInAthlete } from "@/server/athlete";
import { getChallenges, getLeaderboard } from "@/server/services/compete";
import { Compete } from "./Compete";

/**
 * Compete (boards 6, 7; plan phase 6). All four boards and the challenges are read in one
 * transaction through the same services as GET /leaderboards and GET /challenges, so the
 * period and scope filters switch without a request.
 */
export default function CompetePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-11" />
          <Skeleton className="h-36" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <Load searchParams={searchParams} />
    </Suspense>
  );
}

async function Load({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const data = await asSignedInAthlete("/app/compete", async (tx, session) => {
    const [profile] = await tx.$queryRaw<{ timezone: string }[]>`
      select timezone from profiles where id = ${session.userId}::uuid`;
    return {
      boards: {
        "week-global": await getLeaderboard(tx, { period: "week", scope: "global" }),
        "week-sport": await getLeaderboard(tx, { period: "week", scope: "sport" }),
        "all-global": await getLeaderboard(tx, { period: "all", scope: "global" }),
        "all-sport": await getLeaderboard(tx, { period: "all", scope: "sport" }),
      },
      challenges: await getChallenges(tx),
      timeZone: profile?.timezone ?? "Asia/Kolkata",
    };
  });
  return (
    <Compete
      {...data}
      now={new Date().toISOString()}
      initialTab={tab === "challenges" ? "challenges" : "board"}
    />
  );
}
