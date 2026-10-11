import { Skeleton } from "@eyeq/ui/web";

export function PlayerSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-[73.75rem] flex-col gap-4 px-gutter pt-6"
      aria-busy="true"
    >
      <Skeleton className="h-11 w-full" />
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-32" />
    </div>
  );
}
