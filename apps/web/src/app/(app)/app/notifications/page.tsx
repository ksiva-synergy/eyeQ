import { Suspense } from "react";
import { Skeleton } from "@eyeq/ui/web";
import { asSignedInAthlete } from "@/server/athlete";
import { getFeed } from "@/server/services/notify";
import { Feed } from "./Feed";

/** The in-app notification feed (D29), from the bell on Today; the same as GET /notifications. */
export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      }
    >
      <Load />
    </Suspense>
  );
}

async function Load() {
  const feed = await asSignedInAthlete("/app/notifications", (tx, session) =>
    getFeed(tx, session.userId),
  );
  return <Feed feed={feed} />;
}
