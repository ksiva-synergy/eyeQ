import type { Tx } from "@eyeq/db";
import {
  ADMIN_ATHLETES_PAGE_SIZE,
  adminAthleteDetailSchema,
  adminAthletesQuerySchema,
  adminAthletesResponseSchema,
  adminEntitlementSchema,
  type AdminAthleteDetail,
  type AdminAthleteRow,
  type AdminAthletesResponse,
  type AdminEntitlement,
  type AdminGrant,
} from "@eyeq/api-contract";
import { t } from "@eyeq/i18n";
import type { z } from "zod";
import type { AuditEntry } from "../../api/admin";
import { ApiError } from "../../api/errors";
import { camelize } from "../content";

type Audit = (e: AuditEntry) => Promise<void>;

function shaped<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(camelize(raw));
  if (!parsed.success)
    throw new Error(`admin payload does not match the contract: ${parsed.error.message}`);
  return parsed.data;
}

/** The list query comes from the URL: ?search=&plan=&page=. */
export function readAthletesQuery(req: Request) {
  const sp = new URL(req.url).searchParams;
  const parsed = adminAthletesQuerySchema.safeParse({
    ...(sp.get("search") ? { search: sp.get("search") } : {}),
    ...(sp.get("plan") ? { plan: sp.get("plan") } : {}),
    ...(sp.get("page") ? { page: sp.get("page") } : {}),
  });
  if (!parsed.success) {
    throw new ApiError(400, "validation_failed", "The request is not valid.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return parsed.data;
}

type Query = ReturnType<typeof readAthletesQuery>;

/** GET /api/admin/athletes: one page of 50, newest activity first. */
export async function listAthletes(tx: Tx, q: Query): Promise<AdminAthletesResponse> {
  const size = ADMIN_ATHLETES_PAGE_SIZE;
  const [row] = await tx.$queryRaw<{ v: unknown }[]>`
    select admin_athletes_for(${q.search ?? null}, ${q.plan ?? null}, ${size}::int, ${(q.page - 1) * size}::int) as v`;
  const v = (row?.v ?? {}) as Record<string, unknown>;
  return shaped(adminAthletesResponseSchema, { ...v, page: q.page, page_size: size });
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote everything; a leading = + - @ is neutralised so a spreadsheet never runs it.
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/**
 * GET /api/admin/athletes/export.csv: every match for the same filters. Phones stay
 * masked and nothing else personal is added (rule 11). The export itself is audited.
 */
export async function exportAthletesCsv(tx: Tx, q: Query, audit: Audit): Promise<string> {
  const [row] = await tx.$queryRaw<{ v: unknown }[]>`
    select admin_athletes_for(${q.search ?? null}, ${q.plan ?? null}, 0, 0) as v`;
  const v = (row?.v ?? {}) as Record<string, unknown>;
  const { athletes } = shaped(adminAthletesResponseSchema, { ...v, page: 1, page_size: 0 });
  const header = [
    "admin.athletes.csv.name",
    "admin.athletes.csv.phone",
    "admin.athletes.csv.sport",
    "admin.athletes.csv.level",
    "admin.athletes.csv.streak",
    "admin.athletes.csv.bestStreak",
    "admin.athletes.csv.xpLevel",
    "admin.athletes.csv.xp",
    "admin.athletes.csv.lastActive",
    "admin.athletes.csv.plan",
    "admin.athletes.csv.program",
    "admin.athletes.csv.joined",
  ] as const;
  const line = (a: AdminAthleteRow) =>
    [
      a.displayName,
      a.phoneMasked,
      a.sport,
      a.playingLevel,
      a.currentStreak,
      a.bestStreak,
      a.level,
      a.totalXp,
      a.lastActiveAt,
      a.plan,
      a.program ? `${a.program.title} (${a.program.currentDay}/${a.program.durationDays})` : null,
      a.joinedAt,
    ]
      .map(csvCell)
      .join(",");
  await audit({
    action: "athletes.export",
    targetType: "athletes",
    targetId: "csv",
    after: { search: q.search ?? null, plan: q.plan ?? null, rows: athletes.length },
  });
  return [header.map((k) => csvCell(t(k))).join(","), ...athletes.map(line)].join("\r\n") + "\r\n";
}

/** GET /api/admin/athletes/:id. */
export async function getAthlete(tx: Tx, id: string): Promise<AdminAthleteDetail> {
  const [row] = await tx.$queryRaw<
    { v: unknown }[]
  >`select admin_athlete_detail_for(${id}::uuid) as v`;
  if (!row?.v) throw new ApiError(404, "not_found", "Athlete not found.");
  return shaped(adminAthleteDetailSchema, row.v);
}

async function entitlement(tx: Tx, userId: string, id: string): Promise<AdminEntitlement> {
  const detail = await getAthlete(tx, userId);
  const e = detail.entitlements.find((x) => x.id === id);
  if (!e) throw new ApiError(404, "not_found", "Entitlement not found.");
  return adminEntitlementSchema.parse(e);
}

/**
 * POST /api/admin/athletes/:id/entitlements: a manual grant, source = admin, through the
 * engine's grant_entitlement (which extends a live admin grant for the same scope rather
 * than adding a second). The scope must exist; the change is audited with before and after.
 */
export async function grantEntitlement(
  tx: Tx,
  admin: { userId: string },
  userId: string,
  body: AdminGrant,
  audit: Audit,
): Promise<AdminEntitlement> {
  const [exists] = await tx.$queryRaw<
    { ok: boolean }[]
  >`select exists (select 1 from profiles where id = ${userId}::uuid) as ok`;
  if (!exists?.ok) throw new ApiError(404, "not_found", "Athlete not found.");
  if (body.scopeId) {
    const [scope] = await tx.$queryRaw<{ ok: boolean }[]>`
      select case ${body.scope}
        when 'program' then exists (select 1 from programs where id = ${body.scopeId}::uuid)
        when 'drill' then exists (select 1 from drills where id = ${body.scopeId}::uuid)
        when 'challenge' then exists (select 1 from challenges where id = ${body.scopeId}::uuid)
        else false end as ok`;
    if (!scope?.ok) {
      throw new ApiError(400, "validation_failed", "The request is not valid.", {
        issues: [{ path: "scopeId", message: `no ${body.scope} with this id` }],
      });
    }
  }
  const [prior] = await tx.$queryRaw<{ id: string }[]>`
    select id from entitlements where user_id = ${userId}::uuid and scope = ${body.scope}
      and scope_id is not distinct from ${body.scopeId}::uuid and source = 'admin' and status in ('active', 'grace')
    order by coalesce(ends_at, 'infinity'::timestamptz) desc limit 1`;
  const before = prior ? await entitlement(tx, userId, prior.id) : undefined;
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    select (grant_entitlement(${userId}::uuid, ${body.scope}, ${body.scopeId}::uuid, 'admin', now(),
      ${body.endsAt}::timestamptz, null, null, ${admin.userId}::uuid, ${body.reason})).id as id`;
  const after = await entitlement(tx, userId, row!.id);
  await audit({
    action: before ? "entitlement.extend" : "entitlement.grant",
    targetType: "entitlement",
    targetId: after.id,
    ...(before ? { before } : {}),
    after: { ...after, userId, reason: body.reason },
  });
  return after;
}

/** POST /api/admin/athletes/:id/entitlements/:entitlementId/revoke. Any source can be revoked. */
export async function revokeEntitlement(
  tx: Tx,
  admin: { userId: string },
  userId: string,
  entitlementId: string,
  reason: string,
  audit: Audit,
): Promise<AdminEntitlement> {
  const before = await entitlement(tx, userId, entitlementId);
  if (before.status === "ended") {
    throw new ApiError(409, "validation_failed", "This entitlement has already ended.");
  }
  await tx.$queryRaw`select end_entitlement(${entitlementId}::uuid, ${reason}, now(), null, ${admin.userId}::uuid, true)`;
  const after = await entitlement(tx, userId, entitlementId);
  await audit({
    action: "entitlement.revoke",
    targetType: "entitlement",
    targetId: entitlementId,
    before,
    after: { ...after, userId, reason },
  });
  return after;
}
