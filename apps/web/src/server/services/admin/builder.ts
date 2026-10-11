import type { Prisma, Tx } from "@eyeq/db";
import {
  publishCheckSchema,
  type AdminProgramListItem,
  type BuilderDrill,
  type BuilderProgram,
  type DrillInput,
  type DrillUpdate,
  type LinkCheckResult,
  type ProgramCreate,
  type ProgramUpdate,
  type PublishCheck,
  type Reorder,
} from "@eyeq/api-contract";
import type { z } from "zod";
import type {
  bulkPasteResponseSchema,
  moduleCreateSchema,
  moduleUpdateSchema,
  sessionCreateSchema,
  sessionDrillAddSchema,
  sessionUpdateSchema,
} from "@eyeq/api-contract";
import type { AuditEntry } from "../../api/admin";
import { ApiError } from "../../api/errors";
import { camelize } from "../content";
import { parseVideoLink, videoUrl, type LinkChecker } from "./link-check";

/**
 * The program builder (plan phase 4, board 17), as eyeq_service inside the admin
 * pipeline's transaction. Every change is audited. Structure is kept tidy after each
 * change: module order 1..n, and session day numbers 1..n following module order then
 * position (the ordering constraints are deferred, 0017, so rows pass through each other).
 */
type Audit = (e: AuditEntry) => Promise<void>;

const notFound = (what: string) => new ApiError(404, "not_found", `${what} not found.`);
const invalid = (path: string, message: string) =>
  new ApiError(400, "validation_failed", "The request is not valid.", {
    issues: [{ path, message }],
  });

type DrillRow = Prisma.drillsGetPayload<object>;

// ---------------------------------------------------------------- reads

const programInclude = {
  products: true,
  modules: {
    orderBy: { order: "asc" },
    include: {
      sessions: {
        orderBy: { day_number: "asc" },
        include: { session_drills: { orderBy: { order: "asc" }, include: { drills: true } } },
      },
    },
  },
} satisfies Prisma.programsInclude;

async function usesOf(tx: Tx, drillIds: string[]) {
  const rows = drillIds.length
    ? await tx.session_drills.findMany({
        where: { drill_id: { in: drillIds } },
        include: { sessions: { include: { programs: { select: { id: true, title: true } } } } },
      })
    : [];
  const uses = new Map<string, BuilderDrill["usedIn"]>();
  for (const r of rows) {
    const list = uses.get(r.drill_id) ?? [];
    list.push({
      programId: r.sessions.programs.id,
      programTitle: r.sessions.programs.title,
      sessionId: r.session_id,
      dayNumber: r.sessions.day_number,
    });
    uses.set(r.drill_id, list);
  }
  for (const list of uses.values())
    list.sort((a, b) => a.programTitle.localeCompare(b.programTitle) || a.dayNumber - b.dayNumber);
  return uses;
}

function toDrill(d: DrillRow, order: number, usedIn: BuilderDrill["usedIn"]): BuilderDrill {
  return {
    id: d.id,
    order,
    title: d.title,
    videoProvider: d.video_provider as BuilderDrill["videoProvider"],
    videoUrl: videoUrl(d.video_provider, d.video_ref),
    thumbnailUrl: d.thumbnail_url,
    instructions: d.instructions,
    targetType: d.target_type as BuilderDrill["targetType"],
    targetValue: d.target_value,
    targetLabel: d.target_label,
    restSeconds: d.rest_seconds,
    durationMinutes: d.duration_minutes,
    scoreType: d.score_type as BuilderDrill["scoreType"],
    scoreDirection: d.score_direction as BuilderDrill["scoreDirection"],
    scoreUnit: d.score_unit,
    xp: d.xp,
    measurementTag: d.measurement_tag,
    access: d.access as BuilderDrill["access"],
    ppvProductId: d.ppv_product_id,
    coinPrice: d.coin_price,
    minLevel: d.min_level,
    linkStatus: d.link_status as BuilderDrill["linkStatus"],
    linkReason: d.link_reason,
    linkCheckedAt: d.link_checked_at?.toISOString() ?? null,
    videoDurationSeconds: d.video_duration_seconds,
    videoPrivacy: d.video_privacy,
    usedIn,
  };
}

export async function publishCheck(tx: Tx, programId: string): Promise<PublishCheck> {
  const [row] = await tx.$queryRaw<{ v: unknown }[]>`
    select program_publish_check(${programId}::uuid) as v`;
  if (!row?.v) throw notFound("Program");
  return publishCheckSchema.parse(camelize(row.v));
}

export async function listPrograms(tx: Tx): Promise<{ programs: AdminProgramListItem[] }> {
  const rows = await tx.programs.findMany({
    orderBy: [{ status: "asc" }, { updated_at: "desc" }],
    include: {
      _count: { select: { modules: true, sessions: true } },
      sessions: { select: { _count: { select: { session_drills: true } } } },
    },
  });
  return {
    programs: rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status as "draft" | "published",
      isFree: p.is_free,
      inSubscription: p.in_subscription,
      durationDays: p.duration_days,
      moduleCount: p._count.modules,
      sessionCount: p._count.sessions,
      drillCount: p.sessions.reduce((n, s) => n + s._count.session_drills, 0),
      updatedAt: p.updated_at.toISOString(),
    })),
  };
}

export async function getProgram(tx: Tx, id: string): Promise<BuilderProgram> {
  const p = await tx.programs.findUnique({ where: { id }, include: programInclude });
  if (!p) throw notFound("Program");
  const drillIds = p.modules.flatMap((m) =>
    m.sessions.flatMap((s) => s.session_drills.map((sd) => sd.drill_id)),
  );
  const uses = await usesOf(tx, [...new Set(drillIds)]);
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    coverUrl: p.cover_url,
    sportTags: p.sport_tags,
    level: p.level,
    durationDays: p.duration_days,
    isFree: p.is_free,
    inSubscription: p.in_subscription,
    productId: p.product_id,
    completionXp: p.completion_xp,
    minLevel: p.min_level,
    coachLine: p.coach_line,
    product: p.products
      ? {
          id: p.products.id,
          title: p.products.title,
          pricePaise: p.products.price_paise,
          active: p.products.active,
        }
      : null,
    status: p.status as "draft" | "published",
    updatedAt: p.updated_at.toISOString(),
    modules: p.modules.map((m) => ({
      id: m.id,
      order: m.order,
      title: m.title,
      description: m.description,
      unlockRule: m.unlock_rule as "immediate" | "after_previous" | "on_day",
      unlockDay: m.unlock_day,
      sessions: m.sessions.map((s) => ({
        id: s.id,
        dayNumber: s.day_number,
        title: s.title,
        estMinutes: s.est_minutes,
        drills: s.session_drills.map((sd) =>
          toDrill(sd.drills, sd.order, uses.get(sd.drill_id) ?? []),
        ),
      })),
    })),
    check: await publishCheck(tx, p.id),
  };
}

/** The drill library for reuse: newest first, optionally by title. */
export async function listDrills(tx: Tx, search: string | null) {
  const rows = await tx.drills.findMany({
    where: search ? { title: { contains: search, mode: "insensitive" } } : {},
    orderBy: { created_at: "desc" },
    take: 50,
    include: { _count: { select: { session_drills: true } } },
  });
  return {
    drills: rows.map((d) => ({
      id: d.id,
      title: d.title,
      videoProvider: d.video_provider as "youtube" | "drive" | "mux",
      thumbnailUrl: d.thumbnail_url,
      linkStatus: d.link_status as "unchecked" | "ok" | "broken",
      useCount: d._count.session_drills,
    })),
  };
}

export async function listMeasurementTags(tx: Tx) {
  const rows = await tx.measurement_tags.findMany({ orderBy: [{ group: "asc" }, { sort: "asc" }] });
  return { tags: rows.map((t) => ({ slug: t.slug, name: t.name, group: t.group })) };
}

// ---------------------------------------------------------------- structure helpers

async function programOf(tx: Tx, where: { moduleId?: string; sessionId?: string }) {
  if (where.moduleId) {
    const m = await tx.modules.findUnique({ where: { id: where.moduleId } });
    if (!m) throw notFound("Module");
    return m.program_id;
  }
  const s = await tx.sessions.findUnique({ where: { id: where.sessionId! } });
  if (!s) throw notFound("Session");
  return s.program_id;
}

/** Module order 1..n and day numbers 1..n; `sessionOrder` overrides the current order. */
async function renumber(tx: Tx, programId: string, sessionOrder?: string[]) {
  const modules = await tx.modules.findMany({
    where: { program_id: programId },
    orderBy: { order: "asc" },
    include: { sessions: { orderBy: { day_number: "asc" }, select: { id: true } } },
  });
  for (const [i, m] of modules.entries())
    if (m.order !== i + 1) await tx.modules.update({ where: { id: m.id }, data: { order: i + 1 } });
  const ids = sessionOrder ?? modules.flatMap((m) => m.sessions.map((s) => s.id));
  for (const [i, id] of ids.entries())
    await tx.sessions.update({ where: { id }, data: { day_number: i + 1 } });
  await touch(tx, programId);
}

const touch = (tx: Tx, programId: string) =>
  tx.programs.update({ where: { id: programId }, data: { updated_at: new Date() } });

/** Placements get order 1..n. */
async function reorderSessionDrills(tx: Tx, sessionId: string) {
  const rows = await tx.session_drills.findMany({
    where: { session_id: sessionId },
    orderBy: { order: "asc" },
  });
  for (const [i, r] of rows.entries())
    if (r.order !== i + 1)
      await tx.session_drills.update({
        where: { session_id_drill_id: { session_id: sessionId, drill_id: r.drill_id } },
        data: { order: i + 1 },
      });
}

// ---------------------------------------------------------------- programs

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "program";

export async function createProgram(tx: Tx, body: ProgramCreate, audit: Audit) {
  let slug = body.slug ?? slugify(body.title);
  if (!body.slug) {
    const taken = await tx.programs.findMany({
      where: { slug: { startsWith: slug } },
      select: { slug: true },
    });
    const set = new Set(taken.map((t) => t.slug));
    for (let n = 2; set.has(slug); n++) slug = `${slugify(body.title)}-${n}`;
  }
  const p = await tx.programs.create({
    data: { slug, title: body.title, duration_days: body.durationDays, status: "draft" },
  });
  await audit({
    action: "program.create",
    targetType: "program",
    targetId: p.id,
    after: { slug, title: p.title },
  });
  return getProgram(tx, p.id);
}

const programColumns: Record<keyof ProgramUpdate, string> = {
  slug: "slug",
  title: "title",
  description: "description",
  coverUrl: "cover_url",
  sportTags: "sport_tags",
  level: "level",
  durationDays: "duration_days",
  isFree: "is_free",
  inSubscription: "in_subscription",
  productId: "product_id",
  completionXp: "completion_xp",
  minLevel: "min_level",
  coachLine: "coach_line",
};

function mapped<T extends object>(body: T, columns: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(body)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [columns[k] ?? k, v]),
  );
}

export async function updateProgram(tx: Tx, id: string, body: ProgramUpdate, audit: Audit) {
  const before = await tx.programs.findUnique({ where: { id } });
  if (!before) throw notFound("Program");
  if (body.productId) {
    const product = await tx.products.findUnique({ where: { id: body.productId } });
    if (!product || product.kind !== "program") throw invalid("productId", "not a program product");
  }
  const after = await tx.programs.update({
    where: { id },
    data: { ...mapped(body, programColumns), updated_at: new Date() },
  });
  await audit({
    action: "program.update",
    targetType: "program",
    targetId: id,
    before: pick(before, Object.values(programColumns)),
    after: pick(after, Object.values(programColumns)),
  });
  return getProgram(tx, id);
}

const pick = (o: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, o[k]]));

/** Publish runs the same check the builder shows; a refusal carries every problem. */
export async function publishProgram(tx: Tx, id: string, audit: Audit) {
  const check = await publishCheck(tx, id);
  if (!check.ok) {
    throw new ApiError(409, "validation_failed", "This program cannot be published yet.", {
      problems: check.problems,
      warnings: check.warnings,
    });
  }
  await tx.programs.update({
    where: { id },
    data: { status: "published", updated_at: new Date() },
  });
  await audit({
    action: "program.publish",
    targetType: "program",
    targetId: id,
    after: { warnings: check.warnings },
  });
  return getProgram(tx, id);
}

export async function unpublishProgram(tx: Tx, id: string, audit: Audit) {
  const p = await tx.programs.findUnique({ where: { id } });
  if (!p) throw notFound("Program");
  await tx.programs.update({ where: { id }, data: { status: "draft", updated_at: new Date() } });
  await audit({ action: "program.unpublish", targetType: "program", targetId: id });
  return getProgram(tx, id);
}

// ---------------------------------------------------------------- modules

export async function createModule(
  tx: Tx,
  programId: string,
  body: z.output<typeof moduleCreateSchema>,
  audit: Audit,
) {
  if (!(await tx.programs.findUnique({ where: { id: programId } }))) throw notFound("Program");
  if (body.unlockRule === "on_day" && body.unlockDay === null)
    throw invalid("unlockDay", "needed for on_day");
  const max = await tx.modules.aggregate({
    where: { program_id: programId },
    _max: { order: true },
  });
  const m = await tx.modules.create({
    data: {
      program_id: programId,
      order: (max._max.order ?? 0) + 1,
      title: body.title,
      description: body.description,
      unlock_rule: body.unlockRule,
      unlock_day: body.unlockDay,
    },
  });
  await touch(tx, programId);
  await audit({
    action: "module.create",
    targetType: "module",
    targetId: m.id,
    after: { programId, title: m.title },
  });
  return getProgram(tx, programId);
}

export async function updateModule(
  tx: Tx,
  id: string,
  body: z.output<typeof moduleUpdateSchema>,
  audit: Audit,
) {
  const before = await tx.modules.findUnique({ where: { id } });
  if (!before) throw notFound("Module");
  const rule = body.unlockRule ?? before.unlock_rule;
  const day = body.unlockDay !== undefined ? body.unlockDay : before.unlock_day;
  if (rule === "on_day" && day === null) throw invalid("unlockDay", "needed for on_day");
  const after = await tx.modules.update({
    where: { id },
    data: mapped(body, { unlockRule: "unlock_rule", unlockDay: "unlock_day" }),
  });
  await touch(tx, before.program_id);
  await audit({ action: "module.update", targetType: "module", targetId: id, before, after });
  return getProgram(tx, before.program_id);
}

/** Deleting a module deletes its sessions; refused (409) once athletes have used them. */
export async function deleteModule(tx: Tx, id: string, audit: Audit) {
  const before = await tx.modules.findUnique({ where: { id } });
  if (!before) throw notFound("Module");
  await tx.modules.delete({ where: { id } });
  await renumber(tx, before.program_id);
  await audit({ action: "module.delete", targetType: "module", targetId: id, before });
  return getProgram(tx, before.program_id);
}

// ---------------------------------------------------------------- sessions

export async function createSession(
  tx: Tx,
  moduleId: string,
  body: z.output<typeof sessionCreateSchema>,
  audit: Audit,
) {
  const programId = await programOf(tx, { moduleId });
  const max = await tx.sessions.aggregate({
    where: { program_id: programId },
    _max: { day_number: true },
  });
  const s = await tx.sessions.create({
    data: {
      program_id: programId,
      module_id: moduleId,
      day_number: (max._max.day_number ?? 0) + 1,
      title: body.title,
      est_minutes: body.estMinutes,
    },
  });
  await renumber(tx, programId);
  await audit({
    action: "session.create",
    targetType: "session",
    targetId: s.id,
    after: { programId, moduleId },
  });
  return getProgram(tx, programId);
}

export async function updateSession(
  tx: Tx,
  id: string,
  body: z.output<typeof sessionUpdateSchema>,
  audit: Audit,
) {
  const before = await tx.sessions.findUnique({ where: { id } });
  if (!before) throw notFound("Session");
  const after = await tx.sessions.update({
    where: { id },
    data: mapped(body, { estMinutes: "est_minutes" }),
  });
  await touch(tx, before.program_id);
  await audit({ action: "session.update", targetType: "session", targetId: id, before, after });
  return getProgram(tx, before.program_id);
}

export async function deleteSession(tx: Tx, id: string, audit: Audit) {
  const before = await tx.sessions.findUnique({ where: { id } });
  if (!before) throw notFound("Session");
  await tx.sessions.delete({ where: { id } });
  await renumber(tx, before.program_id);
  await audit({ action: "session.delete", targetType: "session", targetId: id, before });
  return getProgram(tx, before.program_id);
}

/** The copy goes straight after the original and reuses the same drills. */
export async function duplicateSession(tx: Tx, id: string, audit: Audit) {
  const s = await tx.sessions.findUnique({
    where: { id },
    include: { session_drills: { orderBy: { order: "asc" } } },
  });
  if (!s) throw notFound("Session");
  const max = await tx.sessions.aggregate({
    where: { program_id: s.program_id },
    _max: { day_number: true },
  });
  const copy = await tx.sessions.create({
    data: {
      program_id: s.program_id,
      module_id: s.module_id,
      day_number: (max._max.day_number ?? 0) + 1,
      title: s.title,
      est_minutes: s.est_minutes,
      session_drills: {
        create: s.session_drills.map((sd) => ({ drill_id: sd.drill_id, order: sd.order })),
      },
    },
  });
  const order = (
    await tx.modules.findMany({
      where: { program_id: s.program_id },
      orderBy: { order: "asc" },
      include: { sessions: { orderBy: { day_number: "asc" }, select: { id: true } } },
    })
  ).flatMap((m) => m.sessions.map((x) => x.id).filter((x) => x !== copy.id));
  order.splice(order.indexOf(s.id) + 1, 0, copy.id);
  await renumber(tx, s.program_id, order);
  await audit({
    action: "session.duplicate",
    targetType: "session",
    targetId: copy.id,
    after: { from: s.id, drills: s.session_drills.length },
  });
  return getProgram(tx, s.program_id);
}

// ---------------------------------------------------------------- drills

const drillColumns: Record<string, string> = {
  thumbnailUrl: "thumbnail_url",
  targetType: "target_type",
  targetValue: "target_value",
  targetLabel: "target_label",
  restSeconds: "rest_seconds",
  durationMinutes: "duration_minutes",
  scoreType: "score_type",
  scoreDirection: "score_direction",
  scoreUnit: "score_unit",
  measurementTag: "measurement_tag",
  ppvProductId: "ppv_product_id",
  coinPrice: "coin_price",
  minLevel: "min_level",
};

/** Parses and checks a link; the result's columns for the drills row. */
export async function checkLink(checker: LinkChecker, url: string): Promise<LinkCheckResult> {
  const link = parseVideoLink(url);
  if (!link)
    return {
      provider: null,
      ref: null,
      url: null,
      status: "broken",
      reason: "unsupported",
      durationSeconds: null,
      privacy: null,
      title: null,
      thumbnailUrl: null,
    };
  const r = await checker.check(link);
  return { provider: link.provider, ref: link.ref, url: link.url, ...r };
}

const linkColumns = (r: LinkCheckResult) => ({
  video_provider: r.provider!,
  video_ref: r.ref!,
  link_status: r.status,
  link_reason: r.reason,
  link_checked_at: new Date(),
  video_duration_seconds: r.durationSeconds,
  video_privacy: r.privacy,
});

async function validateDrillRefs(tx: Tx, body: DrillUpdate) {
  if (body.measurementTag) {
    if (!(await tx.measurement_tags.findUnique({ where: { slug: body.measurementTag } })))
      throw invalid("measurementTag", "unknown measurement area");
  }
  if (body.ppvProductId) {
    const p = await tx.products.findUnique({ where: { id: body.ppvProductId } });
    if (!p || p.kind !== "drill") throw invalid("ppvProductId", "not a pay-per-view drill product");
  }
}

async function newDrill(tx: Tx, checker: LinkChecker, input: DrillInput): Promise<DrillRow> {
  const r = await checkLink(checker, input.videoUrl);
  if (!r.provider) throw invalid("videoUrl", "paste a YouTube or Google Drive link");
  await validateDrillRefs(tx, input);
  const { title, instructions, ...rest } = input;
  delete (rest as Partial<DrillInput>).videoUrl;
  return tx.drills.create({
    data: {
      ...mapped(rest, drillColumns),
      title: title ?? r.title?.slice(0, 120) ?? "Untitled drill",
      instructions: instructions ?? [],
      thumbnail_url: input.thumbnailUrl ?? r.thumbnailUrl,
      ...linkColumns(r),
    } as Prisma.drillsUncheckedCreateInput,
  });
}

async function place(tx: Tx, sessionId: string, drillId: string) {
  if (
    await tx.session_drills.findUnique({
      where: { session_id_drill_id: { session_id: sessionId, drill_id: drillId } },
    })
  )
    throw new ApiError(409, "validation_failed", "This drill is already in the session.");
  const max = await tx.session_drills.aggregate({
    where: { session_id: sessionId },
    _max: { order: true },
  });
  await tx.session_drills.create({
    data: { session_id: sessionId, drill_id: drillId, order: (max._max.order ?? 0) + 1 },
  });
}

export async function addSessionDrill(
  tx: Tx,
  checker: LinkChecker,
  sessionId: string,
  body: z.output<typeof sessionDrillAddSchema>,
  audit: Audit,
) {
  const programId = await programOf(tx, { sessionId });
  let drillId: string;
  if ("drillId" in body) {
    if (!(await tx.drills.findUnique({ where: { id: body.drillId } }))) throw notFound("Drill");
    drillId = body.drillId;
  } else {
    const d = await newDrill(tx, checker, body.drill);
    drillId = d.id;
    await audit({
      action: "drill.create",
      targetType: "drill",
      targetId: d.id,
      after: auditDrill(d),
    });
  }
  await place(tx, sessionId, drillId);
  await touch(tx, programId);
  await audit({
    action: "session.drill_add",
    targetType: "session",
    targetId: sessionId,
    after: { drillId, reused: "drillId" in body },
  });
  return getProgram(tx, programId);
}

/** Removes the placement only; the drill stays in the library and in other sessions. */
export async function removeSessionDrill(tx: Tx, sessionId: string, drillId: string, audit: Audit) {
  const programId = await programOf(tx, { sessionId });
  await tx.session_drills.delete({
    where: { session_id_drill_id: { session_id: sessionId, drill_id: drillId } },
  });
  await reorderSessionDrills(tx, sessionId);
  await touch(tx, programId);
  await audit({
    action: "session.drill_remove",
    targetType: "session",
    targetId: sessionId,
    before: { drillId },
  });
  return getProgram(tx, programId);
}

/** Bulk paste: each line a link, appended in order; lines that are not links are listed back. */
export async function bulkPaste(
  tx: Tx,
  checker: LinkChecker,
  sessionId: string,
  links: string,
  audit: Audit,
): Promise<z.output<typeof bulkPasteResponseSchema>> {
  const programId = await programOf(tx, { sessionId });
  const lines = links
    .split(/\r?\n/)
    .map((text, i) => ({ text: text.trim(), line: i + 1 }))
    .filter((l) => l.text !== "");
  if (lines.length === 0) throw invalid("links", "paste at least one link");
  if (lines.length > 30) throw invalid("links", "up to 30 links at a time");
  const added: z.output<typeof bulkPasteResponseSchema>["added"] = [];
  const rejected: z.output<typeof bulkPasteResponseSchema>["rejected"] = [];
  // Checked in parallel; written in order.
  const checks = await Promise.all(lines.map((l) => checkLink(checker, l.text)));
  for (const [i, l] of lines.entries()) {
    const r = checks[i]!;
    if (!r.provider) {
      rejected.push({ line: l.line, text: l.text.slice(0, 200), reason: "unsupported" });
      continue;
    }
    const d = await tx.drills.create({
      data: {
        title: r.title?.slice(0, 120) ?? `Drill ${added.length + 1}`,
        thumbnail_url: r.thumbnailUrl,
        ...linkColumns(r),
      },
    });
    await place(tx, sessionId, d.id);
    added.push({ line: l.line, drillId: d.id, linkStatus: r.status });
  }
  await touch(tx, programId);
  await audit({
    action: "session.bulk_paste",
    targetType: "session",
    targetId: sessionId,
    after: { added: added.map((a) => a.drillId), rejected: rejected.length },
  });
  return { added, rejected };
}

/** A drill for the audit log, without its video reference. */
const auditDrill = (d: DrillRow) => {
  const rest: Partial<DrillRow> = { ...d };
  delete rest.video_ref;
  return rest;
};

/** The drill editor. A changed link is checked again. Edits reach every session using it. */
export async function updateDrill(
  tx: Tx,
  checker: LinkChecker,
  id: string,
  body: DrillUpdate,
  audit: Audit,
) {
  const before = await tx.drills.findUnique({ where: { id } });
  if (!before) throw notFound("Drill");
  await validateDrillRefs(tx, body);
  const { videoUrl: url, ...rest } = body;
  let link = {};
  if (url !== undefined && url !== videoUrl(before.video_provider, before.video_ref)) {
    const r = await checkLink(checker, url);
    if (!r.provider) throw invalid("videoUrl", "paste a YouTube or Google Drive link");
    link = linkColumns(r);
  }
  const after = await tx.drills.update({
    where: { id },
    data: {
      ...mapped(rest, drillColumns),
      ...link,
      updated_at: new Date(),
    } as Prisma.drillsUncheckedUpdateInput,
  });
  await audit({
    action: "drill.update",
    targetType: "drill",
    targetId: id,
    before: auditDrill(before),
    after: auditDrill(after),
  });
  return drillWithUses(tx, after);
}

/** Re-runs the link check on the stored link (after a key is added, or a video is fixed). */
export async function recheckDrill(tx: Tx, checker: LinkChecker, id: string, audit: Audit) {
  const before = await tx.drills.findUnique({ where: { id } });
  if (!before) throw notFound("Drill");
  if (before.video_provider === "mux")
    throw invalid("videoUrl", "only YouTube and Drive links are checked");
  const r = await checkLink(checker, videoUrl(before.video_provider, before.video_ref));
  const after = await tx.drills.update({ where: { id }, data: linkColumns(r) });
  await audit({
    action: "drill.check",
    targetType: "drill",
    targetId: id,
    before: { linkStatus: before.link_status, linkReason: before.link_reason },
    after: { linkStatus: after.link_status, linkReason: after.link_reason },
  });
  return drillWithUses(tx, after);
}

async function drillWithUses(tx: Tx, d: DrillRow): Promise<BuilderDrill> {
  const uses = await usesOf(tx, [d.id]);
  return toDrill(d, 0, uses.get(d.id) ?? []);
}

// ---------------------------------------------------------------- reorder

export async function reorderProgram(tx: Tx, programId: string, body: Reorder, audit: Audit) {
  const p = await tx.programs.findUnique({
    where: { id: programId },
    include: { modules: { include: { sessions: { include: { session_drills: true } } } } },
  });
  if (!p) throw notFound("Program");
  const same = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const currentModules = p.modules.map((m) => m.id);
  const currentSessions = p.modules.flatMap((m) => m.sessions.map((s) => s.id));
  const currentDrills = p.modules.flatMap((m) =>
    m.sessions.flatMap((s) => s.session_drills.map((sd) => sd.drill_id)),
  );
  const nextSessions = body.modules.flatMap((m) => m.sessions.map((s) => s.id));
  const nextDrills = body.modules.flatMap((m) => m.sessions.flatMap((s) => s.drillIds));
  if (
    !same(
      body.modules.map((m) => m.id),
      currentModules,
    )
  )
    throw invalid("modules", "must list every module once");
  if (!same(nextSessions, currentSessions))
    throw invalid("modules.sessions", "must list every session once");
  if (!same(nextDrills, currentDrills))
    throw invalid("modules.sessions.drillIds", "must keep the same drills");
  for (const m of body.modules)
    for (const s of m.sessions)
      if (new Set(s.drillIds).size !== s.drillIds.length)
        throw invalid("modules.sessions.drillIds", "a drill appears once per session");

  const before = p.modules
    .sort((a, b) => a.order - b.order)
    .map((m) => ({
      id: m.id,
      sessions: m.sessions
        .sort((a, b) => a.day_number - b.day_number)
        .map((s) => ({
          id: s.id,
          drillIds: s.session_drills.sort((a, b) => a.order - b.order).map((sd) => sd.drill_id),
        })),
    }));

  for (const [i, m] of body.modules.entries()) {
    await tx.modules.update({ where: { id: m.id }, data: { order: i + 1 } });
    for (const s of m.sessions)
      await tx.sessions.update({ where: { id: s.id }, data: { module_id: m.id } });
  }
  await tx.session_drills.deleteMany({ where: { session_id: { in: currentSessions } } });
  await tx.session_drills.createMany({
    data: body.modules.flatMap((m) =>
      m.sessions.flatMap((s) =>
        s.drillIds.map((drillId, i) => ({ session_id: s.id, drill_id: drillId, order: i + 1 })),
      ),
    ),
  });
  await renumber(tx, programId, nextSessions);
  await audit({
    action: "program.reorder",
    targetType: "program",
    targetId: programId,
    before,
    after: body.modules,
  });
  return getProgram(tx, programId);
}
