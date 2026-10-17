import { Suspense } from "react";
import { inSequence } from "@eyeq/db";
import { notFound } from "next/navigation";
import type { ProgramCard } from "@eyeq/api-contract";
import { Skeleton } from "@eyeq/ui/web";
import { ApiError } from "@/server/api/errors";
import { asSignedInAthlete } from "@/server/athlete";
import { getProgram, listPrograms } from "@/server/services/content";
import { getMe } from "@/server/services/me";
import { ProgramDetailView } from "./ProgramDetailView";

/** Program detail (board 10b), from GET /programs/:slug on the server. */
export default function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-52" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40" />
        </div>
      }
    >
      <Load params={params} />
    </Suspense>
  );
}

async function Load({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const data = await asSignedInAthlete(`/app/programs/${slug}`, async (tx, session) => {
    try {
      const [program, me, { programs }] = await inSequence([
        () => getProgram(tx, slug),
        () => getMe(tx, session),
        () => listPrograms(tx),
      ]);
      const current: ProgramCard | undefined = programs.find(
        (p) => p.enrollment?.isActive && !p.enrollment.completedAt && p.id !== program.id,
      );
      return { program, level: me.stats.level, current: current?.title ?? null };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  });
  if (!data) notFound();
  return (
    <ProgramDetailView
      program={data.program}
      athleteLevel={data.level}
      currentProgram={data.current}
    />
  );
}
