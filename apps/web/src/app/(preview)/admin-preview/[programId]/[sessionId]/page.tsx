import { Suspense } from "react";
import { notFound } from "next/navigation";
import { asAthlete, inSequence } from "@eyeq/db";
import type { DrillMedia, SessionDrill } from "@eyeq/api-contract";
import { Player, type PlayData } from "@/app/(play)/app/session/[id]/Player";
import { PlayerSkeleton } from "@/app/(play)/app/session/[id]/PlayerSkeleton";
import { parseVideoLink } from "@/lib/video-link";
import { requireAdmin } from "@/server/auth/admin";
import { configNumbers } from "@/server/athlete";
import { serviceDb } from "@/server/db";
import { getProgram, listMeasurementTags } from "@/server/services/admin/builder";

/**
 * "Preview as athlete" (plan phase 5): a session of the builder's program in the athlete's
 * player, drafts included. Coaches and owners only (the same gate as /admin). The coach
 * already sees each drill's link in the builder, so the media comes from it here; Mark done
 * only moves on, and nothing is recorded.
 */
export default function SessionPreview({
  params,
}: {
  params: Promise<{ programId: string; sessionId: string }>;
}) {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <Load params={params} />
    </Suspense>
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Load({ params }: { params: Promise<{ programId: string; sessionId: string }> }) {
  const { programId, sessionId } = await params;
  if (!UUID.test(programId) || !UUID.test(sessionId)) notFound();
  const { session } = await requireAdmin(`/admin-preview/${programId}/${sessionId}`);
  const found = await asAthlete(serviceDb(), session.userId, async (tx) => {
    const [program, { tags }, cfg] = await inSequence([
      () => getProgram(tx, programId).catch(() => null),
      () => listMeasurementTags(tx),
      () => configNumbers(tx, ["xp.drill", "coin.drill_unlock_price", "video.done_threshold"]),
    ]);
    return { program, tags, cfg };
  });
  const s = found.program?.modules.flatMap((m) => m.sessions).find((x) => x.id === sessionId);
  if (!found.program || !s) notFound();

  const media: Record<string, DrillMedia> = {};
  const drills: SessionDrill[] = s.drills.map((d) => {
    const link = parseVideoLink(d.videoUrl);
    if (link) {
      media[d.id] = {
        drillId: d.id,
        provider: link.provider,
        ref: link.ref,
        thumbnailUrl: d.thumbnailUrl,
        durationMinutes: d.durationMinutes,
        doneThreshold: found.cfg["video.done_threshold"],
      };
    }
    const tag = found.tags.find((t) => t.slug === d.measurementTag);
    return {
      id: d.id,
      order: d.order,
      title: d.title,
      videoProvider: d.videoProvider,
      thumbnailUrl: d.thumbnailUrl,
      instructions: d.instructions,
      targetType: d.targetType,
      targetValue: d.targetValue,
      targetLabel: d.targetLabel,
      restSeconds: d.restSeconds,
      durationMinutes: d.durationMinutes,
      scoreType: d.scoreType,
      scoreDirection: d.scoreDirection,
      scoreUnit: d.scoreUnit,
      xp: d.xp ?? found.cfg["xp.drill"],
      measurement: tag
        ? {
            slug: tag.slug,
            name: tag.name,
            group: tag.group as "vision" | "reaction" | "cognition",
          }
        : null,
      access: d.access,
      coinPrice: d.coinPrice ?? found.cfg["coin.drill_unlock_price"],
      ppvProductId: d.ppvProductId,
      locked: false,
      doneToday: false,
    };
  });
  const data: PlayData = {
    kind: "program",
    sessionId: s.id,
    title: found.program.title,
    dayNumber: s.dayNumber,
    estMinutes: s.estMinutes,
    locked: false,
    programSlug: found.program.slug,
    drills,
    // A preview has no streak to protect and saves nothing.
    streakEndsAt: null,
    timezone: "Asia/Kolkata",
    localDate: "",
    lateSyncHours: 0,
  };
  return <Player data={data} preview={{ media, backHref: `/admin/programs/${programId}` }} />;
}
