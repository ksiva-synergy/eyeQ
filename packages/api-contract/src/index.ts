/**
 * @eyeq/api-contract: zod schemas and types for every /api/v1 and /api/admin
 * request and response. Web and mobile both import these (ground rule 17).
 */
import { z } from "zod";

export * from "./errors.ts";
export * from "./me.ts";
export * from "./auth.ts";
export * from "./content.ts";
export * from "./daily.ts";
export * from "./compete.ts";
export * from "./notify.ts";
export * from "./purchases.ts";
export * from "./landing.ts";
export * from "./admin-products.ts";
export * from "./admin-athletes.ts";
export * from "./admin-builder.ts";
export * from "./admin-challenges.ts";

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  time: z.string(),
  /** Git commit of the running deployment (Vercel), null elsewhere. */
  commit: z.string().nullable(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
