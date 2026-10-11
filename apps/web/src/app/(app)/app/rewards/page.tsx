import { Suspense } from "react";
import { Skeleton } from "@eyeq/ui/web";
import { asSignedInAthlete } from "@/server/athlete";
import { getRewards } from "@/server/services/compete";
import { Rewards } from "./Rewards";

/** Rewards (board 12; from the coin chip), rendered on the server from GET /rewards. */
export default function RewardsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-20" />
          <Skeleton className="h-48" />
        </div>
      }
    >
      <Load />
    </Suspense>
  );
}

async function Load() {
  const data = await asSignedInAthlete("/app/rewards", (tx) => getRewards(tx));
  return <Rewards data={data} />;
}
