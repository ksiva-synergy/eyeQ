/**
 * The public program page (board 15, plan phase 7). Every claim on it is content the coach
 * writes, never code (D15): the program's own `landing` (hero, proof numbers, testimonials,
 * what's included) and the shared coach block (`game_config` key `landing.coach`). Empty
 * fields are not shown, so nothing placeholder ever reaches the page.
 */
import { z } from "zod";

const line = (max: number) => z.string().trim().max(max);

export const proofPointSchema = z.strictObject({ value: line(20).min(1), label: line(60).min(1) });
export const testimonialSchema = z.strictObject({
  quote: line(600).min(1),
  name: line(80).min(1),
  role: line(120).default(""),
});

export const programLandingSchema = z.strictObject({
  eyebrow: line(80).default(""),
  headline: line(80).default(""),
  intro: line(600).default(""),
  measurementsIntro: line(400).default(""),
  proof: z.array(proofPointSchema).max(4).default([]),
  testimonials: z.array(testimonialSchema).max(6).default([]),
  includes: z.array(line(120).min(1)).max(8).default([]),
});
export type ProgramLanding = z.infer<typeof programLandingSchema>;

export const landingCoachSchema = z.strictObject({
  name: line(80).default(""),
  title: line(160).default(""),
  bio: line(1_200).default(""),
  stats: z.array(proofPointSchema).max(4).default([]),
});
export type LandingCoach = z.infer<typeof landingCoachSchema>;

/** PUT /api/admin/landing-coach. */
export const landingCoachUpdateSchema = landingCoachSchema;
