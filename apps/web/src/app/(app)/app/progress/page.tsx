import { Suspense } from "react";
import { Skeleton } from "@eyeq/ui/web";
import { asSignedInAthlete } from "@/server/athlete";
import { getProgress } from "@/server/services/daily";
import { Progress } from "./Progress";

/** Progress (board 8; board 16 from 768 px), rendered on the server from GET /progress. */
export default function ProgressPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      }
    >
      <Load />
    </Suspense>
  );
}

async function Load() {
  const progress = await asSignedInAthlete("/app/progress", (tx) => getProgress(tx));
  return <Progress data={progress} />;
}
