/**
 * @eyeq/api-contract: zod schemas and types for every /api/v1 and /api/admin
 * request and response. Web and mobile both import these (ground rule 17).
 */
import { z } from "zod";

export * from "./errors.ts";
export * from "./me.ts";
export * from "./auth.ts";

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
