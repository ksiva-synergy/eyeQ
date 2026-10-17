import { Suspense } from "react";
import { inSequence } from "@eyeq/db";
import { redirect } from "next/navigation";
import type { SessionDrill } from "@eyeq/api-contract";
import { asSignedInAthlete, configNumbers } from "@/server/athlete";
import { getSession } from "@/server/services/content";
import { getDrill, getHome } from "@/server/services/daily";
import { Player, type PlayData } from "./Player";
import { PlayerSkeleton } from "./PlayerSkeleton";

/**
 * The drill player (board 3), then the session summary (board 4). `today` resolves to
 * today's session from GET /home: the program's session, or the free drill of the day
 * (D20). A session id plays that session. Rendered on the server; the video reference is
 * fetched per drill from GET /drills/:id/media only when the athlete plays it (rule 5).
 */
export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <Load params={params} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Load({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== "today" && !UUID.test(id)) redirect("/app");
  const data = await asSignedInAthlete(
    `/app/session/${id}`,
    async (tx): Promise<PlayData | null> => {
      const [home, cfg] = await inSequence([
        () => getHome(tx),
        () => configNumbers(tx, ["streak.late_sync_hours"]),
      ]);
      const common = {
        streakEndsAt: home.streak.endsAt,
        timezone: home.timezone,
        localDate: home.localDate,
        lateSyncHours: cfg["streak.late_sync_hours"],
      };
      const sessionId =
        id === "today" ? (home.today.kind === "program" ? home.today.sessionId : null) : id;
      if (sessionId) {
        const s = await getSession(tx, sessionId);
        return {
          ...common,
          kind: "program",
          sessionId: s.id,
          title: s.program.title,
          dayNumber: s.dayNumber,
          estMinutes: s.estMinutes,
          locked: !s.program.hasAccess,
          programSlug: s.program.slug,
          drills: s.drills,
        };
      }
      if (home.today.kind !== "free") return null;
      const d = await getDrill(tx, home.today.drillId);
      return {
        ...common,
        kind: "free",
        sessionId: null,
        title: d.title,
        dayNumber: null,
        estMinutes: d.durationMinutes,
        locked: false,
        programSlug: null,
        drills: [d satisfies SessionDrill],
      };
    },
  );
  if (!data) redirect("/app");
  return <Player data={data} />;
}
