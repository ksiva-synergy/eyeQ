import { Suspense } from "react";
import { Skeleton } from "@eyeq/ui/web";
import { asSignedInAthlete } from "@/server/athlete";
import { env } from "@/server/env";
import { listPrograms } from "@/server/services/content";
import { getEntitlements } from "@/server/services/daily";
import { getMe } from "@/server/services/me";
import { Catalogue } from "./Catalogue";

/** Programs (board 10a; board 16's pattern from 768 px), from GET /programs on the server. */
export default function ProgramsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-11" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      }
    >
      <Load />
    </Suspense>
  );
}

async function Load() {
  const { programs, level, sport, hasPro } = await asSignedInAthlete(
    "/app/programs",
    async (tx, session) => {
      const [{ programs }, me, { entitlements }] = await Promise.all([
        listPrograms(tx),
        getMe(tx, session),
        getEntitlements(tx),
      ]);
      return {
        programs,
        level: me.stats.level,
        sport: me.sport,
        hasPro: entitlements.some((e) => e.scope === "subscription"),
      };
    },
  );
  return (
    <Catalogue
      programs={programs}
      athleteLevel={level}
      sport={sport}
      whatsapp={env.supportWhatsappUrl() ?? null}
      hasPro={hasPro}
    />
  );
}
