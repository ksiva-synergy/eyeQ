import { Suspense } from "react";
import { progressResponseSchema, type ProgressResponse } from "@eyeq/api-contract";
import { AthleteShell } from "@/components/shell/AthleteShell";
import { Progress } from "@/app/(app)/app/progress/Progress";
import arjun from "./progress-arjun.json";

/**
 * Progress (boards 8, 16) without a session, from seeded Arjun's recorded GET /progress
 * (scores added, since the seed logs none). ?state=new is an athlete with nothing yet,
 * ?state=rated one with no re-rate due. Behind DEV_GALLERY.
 */
const base = progressResponseSchema.parse(arjun);

function dataFor(state: string | undefined): ProgressResponse {
  const p = structuredClone(base);
  if (state === "new") {
    return {
      ...p,
      sessionsTotal: 0,
      minutesTotal: 0,
      streak: { current: 0, best: 0 },
      weeks: p.weeks.map((w) => ({ ...w, sessions: 0, minutes: 0 })),
      calendar: p.calendar.map((c) => ({
        ...c,
        minutes: 0,
        status: c.status === "today" ? "today" : "before",
      })),
      drills: [],
      ratings: {
        baseline: null,
        latest: null,
        baselineAt: null,
        latestAt: null,
        due: null,
        day: 1,
      },
    };
  }
  if (state === "rated") return { ...p, ratings: { ...p.ratings, due: null, day: 9 } };
  return p;
}

export default function ProgressPreview({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  return (
    <AthleteShell>
      <Suspense>
        <Preview searchParams={searchParams} />
      </Suspense>
    </AthleteShell>
  );
}

async function Preview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  return <Progress data={dataFor(state)} />;
}
