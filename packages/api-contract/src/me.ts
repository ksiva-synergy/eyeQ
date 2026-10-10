import { z } from "zod";

export const playingLevels = ["school", "club", "district", "state", "national"] as const;
export const sessionMinutes = [10, 15, 20] as const;

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM, 24-hour");

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /me. Date of birth never leaves the server (rule 11): only whether the athlete
 * is a minor, which decides board visibility defaults. The phone and email are the
 * athlete's own sign-in identifiers.
 */
export const meResponseSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  sport: z.string().nullable(),
  playingLevel: z.enum(playingLevels).nullable(),
  goal: z.string().nullable(),
  hasDob: z.boolean(),
  isMinor: z.boolean(),
  sessionMinutes: z.number().int(),
  timezone: z.string(),
  visibility: z.enum(["public", "private"]),
  reminderTime: timeOfDay,
  notifications: z.object({
    daily: z.boolean(),
    streak: z.boolean(),
    challenge: z.boolean(),
    recap: z.boolean(),
    overtaken: z.boolean(),
  }),
  onboardedAt: z.iso.datetime({ offset: true }).nullable(),
  isAdmin: z.boolean(),
  stats: z.object({
    totalXp: z.number().int(),
    level: z.number().int(),
    currentStreak: z.number().int(),
    bestStreak: z.number().int(),
    coins: z.number().int(),
    freezesHeld: z.number().int(),
  }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/** PATCH /me: every field optional, at least one present. Unknown fields are refused. */
export const patchMeRequestSchema = z
  .strictObject({
    displayName: z.string().trim().min(1).max(40),
    sport: z.string().trim().min(1).max(40).nullable(),
    playingLevel: z.enum(playingLevels).nullable(),
    dob: z.iso
      .date()
      .refine((d) => d >= "1920-01-01" && d <= new Date().toISOString().slice(0, 10), "a past date")
      .nullable(),
    goal: z.string().trim().max(200).nullable(),
    sessionMinutes: z.union(sessionMinutes.map((m) => z.literal(m))),
    timezone: z.string().refine(isTimeZone, "an IANA time zone"),
    visibility: z.enum(["public", "private"]),
    reminderTime: timeOfDay,
    notifications: z
      .strictObject({
        daily: z.boolean(),
        streak: z.boolean(),
        challenge: z.boolean(),
        recap: z.boolean(),
        overtaken: z.boolean(),
      })
      .partial(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "at least one field");
export type PatchMeRequest = z.infer<typeof patchMeRequestSchema>;
