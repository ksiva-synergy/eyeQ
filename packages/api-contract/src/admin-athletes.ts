import { z } from "zod";

/**
 * /api/admin/athletes (plan phase 4): list with search and plan filter, athlete page,
 * manual grant and revoke (written with source = admin). Phone numbers are masked and the
 * date of birth never appears (rule 11).
 */
const timestamp = z.iso.datetime({ offset: true });
export const athletePlans = ["pro", "program", "free"] as const;

export const adminAthleteRowSchema = z.strictObject({
  id: z.uuid(),
  displayName: z.string(),
  initials: z.string(),
  phoneMasked: z.string().nullable(),
  sport: z.string().nullable(),
  playingLevel: z.string().nullable(),
  currentStreak: z.number().int(),
  bestStreak: z.number().int(),
  level: z.number().int(),
  totalXp: z.number().int(),
  lastActiveAt: timestamp.nullable(),
  plan: z.enum(athletePlans),
  program: z
    .strictObject({
      slug: z.string(),
      title: z.string(),
      currentDay: z.number().int(),
      durationDays: z.number().int(),
    })
    .nullable(),
  joinedAt: timestamp,
});
export type AdminAthleteRow = z.infer<typeof adminAthleteRowSchema>;

export const adminAthletesQuerySchema = z.strictObject({
  search: z.string().trim().max(80).optional(),
  plan: z.enum(athletePlans).optional(),
  page: z.coerce.number().int().min(1).default(1),
  /** "1" lists demo athletes retired by `pnpm demo:refresh`, hidden by default. */
  retired: z.literal("1").optional(),
});

export const ADMIN_ATHLETES_PAGE_SIZE = 50;

export const adminAthletesResponseSchema = z.strictObject({
  total: z.number().int(),
  activeThisWeek: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  athletes: z.array(adminAthleteRowSchema),
});
export type AdminAthletesResponse = z.infer<typeof adminAthletesResponseSchema>;

export const entitlementScopes = ["subscription", "program", "drill", "challenge"] as const;

export const adminEntitlementSchema = z.strictObject({
  id: z.uuid(),
  scope: z.enum(entitlementScopes),
  scopeId: z.uuid().nullable(),
  scopeTitle: z.string().nullable(),
  source: z.enum(["play", "appstore", "razorpay", "coins", "credits", "admin"]),
  status: z.enum(["active", "grace", "ended"]),
  startsAt: timestamp,
  endsAt: timestamp.nullable(),
  active: z.boolean(),
  events: z.array(
    z.strictObject({
      change: z.enum(["granted", "extended", "grace", "ended", "revoked", "reactivated"]),
      reason: z.string().nullable(),
      adminId: z.uuid().nullable(),
      at: timestamp,
    }),
  ),
});
export type AdminEntitlement = z.infer<typeof adminEntitlementSchema>;

const timelineItem = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("session"), at: timestamp, title: z.string() }),
  z.strictObject({
    kind: z.literal("xp"),
    at: timestamp,
    amount: z.number().int(),
    reason: z.string(),
  }),
  z.strictObject({ kind: z.literal("badge"), at: timestamp, title: z.string() }),
  z.strictObject({
    kind: z.literal("entitlement"),
    at: timestamp,
    change: z.string(),
    scope: z.string(),
    source: z.string(),
  }),
  z.strictObject({
    kind: z.literal("coins"),
    at: timestamp,
    amount: z.number().int(),
    reason: z.string(),
  }),
]);
export type AdminTimelineItem = z.infer<typeof timelineItem>;

export const adminAthleteDetailSchema = adminAthleteRowSchema.extend({
  isMinor: z.boolean(),
  timezone: z.string(),
  visibility: z.enum(["public", "private"]),
  onboardedAt: timestamp.nullable(),
  coins: z.number().int().nullable(),
  freezesHeld: z.number().int().nullable(),
  enrollments: z.array(
    z.strictObject({
      programId: z.uuid(),
      slug: z.string(),
      title: z.string(),
      currentDay: z.number().int(),
      durationDays: z.number().int(),
      isActive: z.boolean(),
      startedAt: timestamp,
      completedAt: timestamp.nullable(),
    }),
  ),
  entitlements: z.array(adminEntitlementSchema),
  timeline: z.array(timelineItem),
});
export type AdminAthleteDetail = z.infer<typeof adminAthleteDetailSchema>;

/** Manual grant (source = admin). A subscription has no scope id; the rest need one. */
export const adminGrantSchema = z
  .strictObject({
    scope: z.enum(entitlementScopes),
    scopeId: z.uuid().nullable().default(null),
    /** Null: lifetime. */
    endsAt: timestamp.nullable().default(null),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((v) => (v.scope === "subscription") === (v.scopeId === null), {
    message: "a subscription has no scope id; a program, drill or challenge needs one",
    path: ["scopeId"],
  })
  .refine((v) => v.endsAt === null || new Date(v.endsAt) > new Date(), {
    message: "must be in the future",
    path: ["endsAt"],
  });
export type AdminGrant = z.infer<typeof adminGrantSchema>;

export const adminRevokeSchema = z.strictObject({ reason: z.string().trim().min(3).max(300) });
export const adminAthleteParamsSchema = z.strictObject({ id: z.uuid() });
export const adminEntitlementParamsSchema = z.strictObject({
  id: z.uuid(),
  entitlementId: z.uuid(),
});
