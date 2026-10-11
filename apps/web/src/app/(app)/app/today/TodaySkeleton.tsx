import { Skeleton } from "@eyeq/ui/web";

/** Today while it loads: the shapes of the header, streak, session and level cards. */
export function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-20" />
      <Skeleton className="h-72" />
      <Skeleton className="h-24" />
    </div>
  );
}
