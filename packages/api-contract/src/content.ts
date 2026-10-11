import { z } from "zod";

/**
 * Content reads (plan section 7): GET /programs, GET /programs/:slug, GET /sessions/:id.
 * Every object is strict, so a field the server must never send (rule 5: a drill's
 * video reference) fails validation instead of passing through. Video leaves the server
 * only through GET /drills/:id/media, after an entitlement check.
 */
const timestamp = z.iso.datetime({ offset: true });

export const measurementGroups = ["vision", "reaction", "cognition"] as const;

export const programCardSchema = z.strictObject({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  sportTags: z.array(z.string()),
  level: z.string().nullable(),
  durationDays: z.number().int().positive(),
  minLevel: z.number().int(),
  coachLine: z.string().nullable(),
  /** The three access fields of plan 5.2 (D23): free, in Pro, and/or bought once. */
  isFree: z.boolean(),
  inSubscription: z.boolean(),
  product: z
    .strictObject({ id: z.uuid(), pricePaise: z.number().int(), currency: z.string() })
    .nullable(),
  moduleCount: z.number().int(),
  sessionCount: z.number().int(),
  drillCount: z.number().int(),
  measurementTags: z.array(z.string()),
  measurementGroups: z.array(z.enum(measurementGroups)),
  /** Whether the caller may open it now (entitlements only, rule 4). */
  hasAccess: z.boolean(),
  enrollment: z
    .strictObject({
      currentDay: z.number().int(),
      isActive: z.boolean(),
      startedAt: timestamp,
      completedAt: timestamp.nullable(),
    })
    .nullable(),
});
export type ProgramCard = z.infer<typeof programCardSchema>;

export const programsResponseSchema = z.strictObject({ programs: z.array(programCardSchema) });
export type ProgramsResponse = z.infer<typeof programsResponseSchema>;

export const programSessionSchema = z.strictObject({
  id: z.uuid(),
  dayNumber: z.number().int().positive(),
  title: z.string().nullable(),
  estMinutes: z.number().int(),
  drillCount: z.number().int(),
  xp: z.number().int(),
  completed: z.boolean(),
});

export const programModuleSchema = z.strictObject({
  id: z.uuid(),
  order: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  unlockRule: z.enum(["immediate", "after_previous", "on_day"]),
  unlockDay: z.number().int().nullable(),
  /** Null until the caller is enrolled. */
  unlocked: z.boolean().nullable(),
  sessions: z.array(programSessionSchema),
});

export const programDetailSchema = programCardSchema.extend({
  modules: z.array(programModuleSchema),
  /** Distinct drills across every session (a drill repeated on later days counts once). */
  distinctDrills: z.number().int(),
});
export type ProgramDetail = z.infer<typeof programDetailSchema>;

export const programSlugParamsSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/, "a program slug"),
});

export const sessionDrillSchema = z.strictObject({
  id: z.uuid(),
  order: z.number().int(),
  title: z.string(),
  videoProvider: z.enum(["youtube", "drive", "mux"]),
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
  xp: z.number().int(),
  measurement: z
    .strictObject({ slug: z.string(), name: z.string(), group: z.enum(measurementGroups) })
    .nullable(),
  access: z.enum(["included", "free_preview", "free_pool", "ppv"]),
  coinPrice: z.number().int(),
  ppvProductId: z.uuid().nullable(),
  locked: z.boolean(),
  /** Completed by the caller on their current local day (a session resumes there). */
  doneToday: z.boolean(),
});
export type SessionDrill = z.infer<typeof sessionDrillSchema>;

export const sessionDetailSchema = z.strictObject({
  id: z.uuid(),
  dayNumber: z.number().int().positive(),
  title: z.string().nullable(),
  estMinutes: z.number().int(),
  program: z.strictObject({
    id: z.uuid(),
    slug: z.string(),
    title: z.string(),
    hasAccess: z.boolean(),
  }),
  module: z.strictObject({ id: z.uuid(), order: z.number().int(), title: z.string() }),
  drills: z.array(sessionDrillSchema),
});
export type SessionDetail = z.infer<typeof sessionDetailSchema>;

export const sessionIdParamsSchema = z.strictObject({ id: z.uuid() });
