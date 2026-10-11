import type { Tx } from "@eyeq/db";
import {
  completionResultSchema,
  drillDetailSchema,
  drillMediaSchema,
  enrollResponseSchema,
  entitlementsResponseSchema,
  homeResponseSchema,
  progressResponseSchema,
  type CompletionEvent,
  type CompletionResult,
  type CompletionsResponse,
  type DrillDetail,
  type DrillMedia,
  type EnrollResponse,
  type EntitlementsResponse,
  type HomeResponse,
  type ProgressResponse,
  type SelfRatingsRequest,
} from "@eyeq/api-contract";
import type { z } from "zod";
import { ApiError, toApiError } from "../api/errors";
import { camelize } from "./content";

/**
 * The athlete's daily loop. Every call runs as eyeq_api inside the request transaction
 * (asAthlete), and the SQL game functions read the athlete from app.user_id, so a service
 * cannot act for anyone else. Rewards are computed only by those functions (rule 1).
 */
function shaped<S extends z.ZodType>(schema: S, raw: unknown, what: string): z.output<S> {
  const parsed = schema.safeParse(camelize(raw));
  if (!parsed.success)
    throw new Error(`${what} payload does not match the contract: ${parsed.error.message}`);
  return parsed.data;
}

async function one(query: Promise<{ v: unknown }[]>): Promise<unknown> {
  const [row] = await query;
  return row?.v ?? null;
}

/** GET /home: Today, streak state, level, coins, challenge, rank, program in one payload. */
export async function getHome(tx: Tx): Promise<HomeResponse> {
  const v = await one(tx.$queryRaw`select home_payload() as v`);
  return shaped(homeResponseSchema, v, "home");
}

/** GET /drills/:id: a drill outside a session (the free drill of the day). */
export async function getDrill(tx: Tx, id: string): Promise<DrillDetail> {
  const v = await one(tx.$queryRaw`select drill_detail(${id}::uuid) as v`);
  if (!v) throw new ApiError(404, "not_found", "Drill not found.");
  return shaped(drillDetailSchema, v, "drill");
}

/** GET /drills/:id/media: the video reference, only after the entitlement check (rule 5). */
export async function getDrillMedia(
  tx: Tx,
  id: string,
  sessionId: string | undefined,
): Promise<DrillMedia> {
  const v = await one(
    tx.$queryRaw`select get_drill_media(${id}::uuid, ${sessionId ?? null}::uuid) as v`,
  );
  return shaped(drillMediaSchema, v, "media");
}

/**
 * POST /completions. Each event runs complete_drill under its own savepoint, so one refused
 * event (a locked drill) does not undo the others in a replayed batch. complete_drill is
 * idempotent by client_event_id (rule 6): a retry returns the stored result.
 */
export async function postCompletions(
  tx: Tx,
  events: CompletionEvent[],
): Promise<CompletionsResponse> {
  const results: CompletionsResponse["results"] = [];
  for (const [i, e] of events.entries()) {
    const sp = `completion_${i}`;
    await tx.$executeRawUnsafe(`savepoint ${sp}`);
    try {
      const v = await one(
        tx.$queryRaw`select complete_drill(${e.drillId}::uuid, ${e.sessionId}::uuid,
          ${e.completedAt}::timestamptz, ${e.score}::numeric, ${e.watchPct}::numeric,
          ${e.clientEventId}) as v`,
      );
      await tx.$executeRawUnsafe(`release savepoint ${sp}`);
      results.push({
        clientEventId: e.clientEventId,
        ok: true,
        result: shaped(completionResultSchema, v, "completion"),
      });
    } catch (err) {
      await tx.$executeRawUnsafe(`rollback to savepoint ${sp}`);
      const api = toApiError(err);
      if (api.status >= 500) throw err;
      results.push({
        clientEventId: e.clientEventId,
        ok: false,
        error: { code: api.code, message: api.message },
      });
    }
  }
  return { results };
}

/** GET /progress (board 8). */
export async function getProgress(tx: Tx): Promise<ProgressResponse> {
  const v = await one(tx.$queryRaw`select progress_payload() as v`);
  // RLS limits profiles to the caller's own row.
  const [p] = await tx.$queryRaw<{ timezone: string }[]>`
    select timezone from profiles where id = app_user_id()`;
  return shaped(progressResponseSchema, { ...(v as object), timezone: p?.timezone }, "progress");
}

/** POST /me/self-ratings: the three areas in one go (onboarding baseline, day 14, day 21). */
export async function postSelfRatings(
  tx: Tx,
  userId: string,
  input: SelfRatingsRequest,
): Promise<ProgressResponse["ratings"]> {
  await tx.self_ratings.createMany({
    data: (["focus", "reaction", "tracking"] as const).map((area) => ({
      user_id: userId,
      area,
      rating: input.ratings[area],
      kind: input.kind,
    })),
  });
  return (await getProgress(tx)).ratings;
}

/** POST /programs/:id/enroll. Requires access (enroll raises program_locked otherwise). */
export async function enroll(tx: Tx, programId: string): Promise<EnrollResponse> {
  const v = await one(tx.$queryRaw`select enroll(${programId}::uuid) as v`);
  return shaped(enrollResponseSchema, v, "enrolment");
}

/** GET /me/entitlements: what the athlete holds now, with a title for each program or drill. */
export async function getEntitlements(tx: Tx): Promise<EntitlementsResponse> {
  const v = (await one(tx.$queryRaw`select my_entitlements() as v`)) as
    { scope: string; scope_id: string | null }[] | null;
  const rows = v ?? [];
  const ids = (scope: string) =>
    rows.filter((r) => r.scope === scope && r.scope_id).map((r) => r.scope_id!);
  const [programs, drills] = await Promise.all([
    tx.programs.findMany({
      where: { id: { in: ids("program") } },
      select: { id: true, title: true },
    }),
    tx.drills.findMany({ where: { id: { in: ids("drill") } }, select: { id: true, title: true } }),
  ]);
  const title = new Map([...programs, ...drills].map((p) => [p.id, p.title]));
  return shaped(
    entitlementsResponseSchema,
    {
      entitlements: rows.map((r) => ({
        ...r,
        title: r.scope_id ? (title.get(r.scope_id) ?? null) : null,
      })),
    },
    "entitlements",
  );
}

export type { CompletionResult };
