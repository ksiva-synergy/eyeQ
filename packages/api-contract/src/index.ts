/**
 * @eyeq/api-contract: zod schemas and types for every /api/v1 and /api/admin
 * request and response, and a typed fetch client. Filled in from phase 2.
 */
import { z } from "zod";

/** One error shape for every endpoint (section 7 of the plan). */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
