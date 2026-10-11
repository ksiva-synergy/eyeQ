import { Suspense } from "react";
import { Skeleton } from "@eyeq/ui/web";
import { asSignedInAthlete } from "@/server/athlete";
import { getBadges } from "@/server/services/compete";
import { Trophies } from "./Trophies";

/** Trophy case (board 9; from Profile), rendered on the server from GET /badges. */
export default function TrophiesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-20" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <Load />
    </Suspense>
  );
}

async function Load() {
  const { data, timeZone } = await asSignedInAthlete("/app/trophies", async (tx, session) => {
    const [p] = await tx.$queryRaw<{ timezone: string }[]>`
      select timezone from profiles where id = ${session.userId}::uuid`;
    return { data: await getBadges(tx), timeZone: p?.timezone ?? "Asia/Kolkata" };
  });
  return <Trophies data={data} timeZone={timeZone} />;
}
