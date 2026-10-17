import { Suspense } from "react";
import {
  programDetailSchema,
  programsResponseSchema,
  type ProgramCard,
  type ProgramDetail,
} from "@eyeq/api-contract";
import { AthleteShell } from "@/components/shell/AthleteShell";
import { Catalogue } from "@/app/(app)/app/programs/Catalogue";
import { ProgramDetailView } from "@/app/(app)/app/programs/[slug]/ProgramDetailView";
import catalog from "./catalog-arjun.json";
import detail from "./detail-reaction-edge.json";

/**
 * Programs (boards 10a, 10b) without a session, from seeded Arjun's recorded GET /programs
 * and GET /programs/reaction-edge. ?as=free is an athlete without Pro (locked states);
 * ?view=detail shows the detail. Behind DEV_GALLERY.
 */
const { programs } = programsResponseSchema.parse(catalog);
const reactionEdge = programDetailSchema.parse(detail);

function asFree<T extends ProgramCard | ProgramDetail>(p: T): T {
  return { ...p, hasAccess: p.isFree, enrollment: p.isFree ? p.enrollment : null };
}

export default function ProgramsPreview({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; view?: string }>;
}) {
  return (
    <Suspense>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; view?: string }>;
}) {
  const { as, view } = await searchParams;
  const free = as === "free";
  return (
    <AthleteShell activePath="/app/programs">
      {view === "detail" ? (
        <ProgramDetailView
          program={free ? asFree(reactionEdge) : reactionEdge}
          athleteLevel={7}
          currentProgram={free ? null : "Cricket Vision Foundations"}
        />
      ) : (
        <Catalogue
          programs={free ? programs.map(asFree) : programs}
          athleteLevel={7}
          sport="cricket"
          whatsapp="https://wa.me/910000000000"
          hasPro={!free}
        />
      )}
    </AthleteShell>
  );
}
