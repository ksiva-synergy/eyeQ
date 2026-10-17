import { z } from "zod";
import { programLandingSchema } from "./landing.ts";

/**
 * /api/admin program builder (plan phase 4, board 17): programs, modules, sessions,
 * drills, reorder, duplicate, bulk paste, link check, publish. The admin sees the video
 * link it entered; athletes never do (rule 5 holds on /api/v1).
 */
const timestamp = z.iso.datetime({ offset: true });
const id = z.uuid();
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const linkStatuses = ["unchecked", "ok", "broken"] as const;
export const linkReasons = [
  "not_found",
  "private",
  "not_embeddable",
  "not_shared",
  "not_video",
  "unavailable",
  "unsupported",
] as const;
export const drillAccesses = ["included", "free_preview", "free_pool", "ppv"] as const;
export const unlockRules = ["immediate", "after_previous", "on_day"] as const;

// ---------------------------------------------------------------- link check
export const linkCheckRequestSchema = z.strictObject({ url: z.string().trim().min(1).max(500) });
export const linkCheckResultSchema = z.strictObject({
  provider: z.enum(["youtube", "drive"]).nullable(),
  ref: z.string().nullable(),
  url: z.string().nullable(),
  status: z.enum(linkStatuses),
  reason: z.enum(linkReasons).nullable(),
  durationSeconds: z.number().int().nullable(),
  privacy: z.string().nullable(),
  title: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
});
export type LinkCheckResult = z.infer<typeof linkCheckResultSchema>;

// ---------------------------------------------------------------- drills
const drillFields = {
  title: text(120),
  videoUrl: z.string().trim().min(1).max(500),
  thumbnailUrl: z.url().max(500).nullable(),
  instructions: z.array(text(300)).max(10),
  targetType: z.enum(["reps", "seconds", "none"]),
  targetValue: z.number().int().min(0).max(10_000).nullable(),
  targetLabel: optionalText(60),
  restSeconds: z.number().int().min(0).max(3_600).nullable(),
  durationMinutes: z.number().int().min(1).max(120),
  scoreType: z.enum(["none", "number", "rating"]),
  scoreDirection: z.enum(["higher", "lower"]),
  scoreUnit: optionalText(30),
  /** Null: the game_config default (rule 8). */
  xp: z.number().int().min(0).max(1_000).nullable(),
  measurementTag: z.string().nullable(),
  access: z.enum(drillAccesses),
  ppvProductId: id.nullable(),
  coinPrice: z.number().int().min(0).max(100_000).nullable(),
  minLevel: z.number().int().min(1).max(100),
};

/** Create: only the video link is required; the rest default (title from the link check). */
export const drillInputSchema = z.strictObject(drillFields).partial().required({ videoUrl: true });
export type DrillInput = z.infer<typeof drillInputSchema>;
export const drillUpdateSchema = z.strictObject(drillFields).partial();
export type DrillUpdate = z.infer<typeof drillUpdateSchema>;

export const drillUseSchema = z.strictObject({
  programId: id,
  programTitle: z.string(),
  sessionId: id,
  dayNumber: z.number().int(),
});

export const builderDrillSchema = z.strictObject({
  id,
  order: z.number().int(),
  title: z.string(),
  videoProvider: z.enum(["youtube", "drive", "mux"]),
  videoUrl: z.string(),
  thumbnailUrl: z.string().nullable(),
  instructions: z.array(z.string()),
  targetType: z.enum(["reps", "seconds", "none"]),
  targetValue: z.number().int().nullable(),
  targetLabel: z.string().nullable(),
  restSeconds: z.number().int().nullable(),
  durationMinutes: z.number().int(),
  scoreType: z.enum(["none", "number", "rating"]),
  scoreDirection: z.enum(["higher", "lower"]),
  scoreUnit: z.string().nullable(),
  xp: z.number().int().nullable(),
  measurementTag: z.string().nullable(),
  access: z.enum(drillAccesses),
  ppvProductId: id.nullable(),
  coinPrice: z.number().int().nullable(),
  minLevel: z.number().int(),
  linkStatus: z.enum(linkStatuses),
  linkReason: z.string().nullable(),
  linkCheckedAt: timestamp.nullable(),
  videoDurationSeconds: z.number().int().nullable(),
  videoPrivacy: z.string().nullable(),
  /** Every session that uses this drill, in any program, this one included. */
  usedIn: z.array(drillUseSchema),
});
export type BuilderDrill = z.infer<typeof builderDrillSchema>;

export const drillLibraryItemSchema = z.strictObject({
  id,
  title: z.string(),
  videoProvider: z.enum(["youtube", "drive", "mux"]),
  thumbnailUrl: z.string().nullable(),
  linkStatus: z.enum(linkStatuses),
  useCount: z.number().int(),
});
export const drillLibraryResponseSchema = z.strictObject({
  drills: z.array(drillLibraryItemSchema),
});

// ---------------------------------------------------------------- publish check
export const publishIssueSchema = z
  .object({
    code: z.string(),
    moduleId: id.optional(),
    sessionId: id.optional(),
    drillId: id.optional(),
    title: z.string().nullable().optional(),
    day: z.number().int().optional(),
    reason: z.string().nullable().optional(),
    sessions: z.number().int().optional(),
    days: z.number().int().optional(),
  })
  .strict();
export type PublishIssue = z.infer<typeof publishIssueSchema>;
export const publishCheckSchema = z.strictObject({
  ok: z.boolean(),
  problems: z.array(publishIssueSchema),
  warnings: z.array(publishIssueSchema),
});
export type PublishCheck = z.infer<typeof publishCheckSchema>;

// ---------------------------------------------------------------- tree
export const builderSessionSchema = z.strictObject({
  id,
  dayNumber: z.number().int(),
  title: z.string().nullable(),
  estMinutes: z.number().int(),
  drills: z.array(builderDrillSchema),
});
export const builderModuleSchema = z.strictObject({
  id,
  order: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  unlockRule: z.enum(unlockRules),
  unlockDay: z.number().int().nullable(),
  sessions: z.array(builderSessionSchema),
});

const slug = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens");

const programFields = {
  slug,
  title: text(120),
  description: optionalText(2_000),
  coverUrl: z.url().max(500).nullable(),
  sportTags: z.array(text(30)).max(10),
  level: optionalText(30),
  durationDays: z.number().int().min(1).max(365),
  isFree: z.boolean(),
  inSubscription: z.boolean(),
  productId: id.nullable(),
  completionXp: z.number().int().min(0).max(10_000).nullable(),
  minLevel: z.number().int().min(1).max(100),
  coachLine: optionalText(200),
  /** The public page's content (board 15); see landing.ts. */
  landing: programLandingSchema,
};

export const programCreateSchema = z.strictObject({
  title: text(120),
  slug: slug.optional(),
  durationDays: z.number().int().min(1).max(365).default(14),
});
export type ProgramCreate = z.infer<typeof programCreateSchema>;
export const programUpdateSchema = z.strictObject(programFields).partial();
export type ProgramUpdate = z.infer<typeof programUpdateSchema>;

export const builderProgramSchema = z.strictObject({
  id,
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  sportTags: z.array(z.string()),
  level: z.string().nullable(),
  durationDays: z.number().int(),
  isFree: z.boolean(),
  inSubscription: z.boolean(),
  productId: id.nullable(),
  completionXp: z.number().int().nullable(),
  minLevel: z.number().int(),
  coachLine: z.string().nullable(),
  landing: programLandingSchema,
  product: z
    .strictObject({ id, title: z.string(), pricePaise: z.number().int(), active: z.boolean() })
    .nullable(),
  status: z.enum(["draft", "published"]),
  updatedAt: timestamp,
  modules: z.array(builderModuleSchema),
  check: publishCheckSchema,
  /** game_config defaults the editor shows for blank fields (rule 8). */
  defaults: z.strictObject({ drillXp: z.number().int(), coinDrillPrice: z.number().int() }),
});
export type BuilderProgram = z.infer<typeof builderProgramSchema>;

export const adminProgramListItemSchema = z.strictObject({
  id,
  slug: z.string(),
  title: z.string(),
  status: z.enum(["draft", "published"]),
  isFree: z.boolean(),
  inSubscription: z.boolean(),
  durationDays: z.number().int(),
  moduleCount: z.number().int(),
  sessionCount: z.number().int(),
  drillCount: z.number().int(),
  updatedAt: timestamp,
});
export const adminProgramsResponseSchema = z.strictObject({
  programs: z.array(adminProgramListItemSchema),
});
export type AdminProgramListItem = z.infer<typeof adminProgramListItemSchema>;

// ---------------------------------------------------------------- modules, sessions
export const moduleCreateSchema = z.strictObject({
  title: text(120),
  description: optionalText(1_000).default(null),
  unlockRule: z.enum(unlockRules).default("after_previous"),
  unlockDay: z.number().int().min(1).max(365).nullable().default(null),
});
export const moduleUpdateSchema = z
  .strictObject({
    title: text(120),
    description: optionalText(1_000),
    unlockRule: z.enum(unlockRules),
    unlockDay: z.number().int().min(1).max(365).nullable(),
  })
  .partial();

export const sessionCreateSchema = z.strictObject({
  title: optionalText(120).default(null),
  estMinutes: z.number().int().min(1).max(180).default(15),
});
export const sessionUpdateSchema = z
  .strictObject({ title: optionalText(120), estMinutes: z.number().int().min(1).max(180) })
  .partial();

/** Add to a session: an existing drill (reuse) or a new one. */
export const sessionDrillAddSchema = z.union([
  z.strictObject({ drillId: id }),
  z.strictObject({ drill: drillInputSchema }),
]);

/** Bulk paste: one link per line (blank lines skipped), up to 30, appended in order. */
export const bulkPasteSchema = z.strictObject({ links: z.string().max(20_000) });
export const bulkPasteResponseSchema = z.strictObject({
  added: z.array(
    z.strictObject({ line: z.number().int(), drillId: id, linkStatus: z.enum(linkStatuses) }),
  ),
  rejected: z.array(
    z.strictObject({ line: z.number().int(), text: z.string(), reason: z.enum(linkReasons) }),
  ),
});

/**
 * Reorder: the whole tree's order in one call. It must list exactly the program's modules
 * and sessions; drills may move between sessions, but the set of placements is unchanged.
 * Day numbers follow the new session order.
 */
export const reorderSchema = z.strictObject({
  modules: z
    .array(
      z.strictObject({
        id,
        sessions: z.array(z.strictObject({ id, drillIds: z.array(id).max(50) })).max(365),
      }),
    )
    .max(50),
});
export type Reorder = z.infer<typeof reorderSchema>;

export const builderIdParamsSchema = z.strictObject({ id });
export const sessionDrillParamsSchema = z.strictObject({ id, drillId: id });

// ---------------------------------------------------------------- uploads
/** POST /api/admin/uploads (multipart: file, kind). The URL is the largest variant. */
export const imageUploadKinds = ["cover", "badge", "thumbnail"] as const;
export const uploadResultSchema = z.strictObject({
  url: z.string(),
  kind: z.enum(imageUploadKinds),
  variants: z.array(z.strictObject({ width: z.number().int(), url: z.string() })),
});
export type UploadResult = z.infer<typeof uploadResultSchema>;
