import type { HealthResponse } from "@eyeq/api-contract";
import { API_VERSION } from "@eyeq/config";

/** Liveness, database-free. `commit` lets the migrate workflow wait for this deploy. */
export function GET(): Response {
  const body: HealthResponse = {
    ok: true,
    version: API_VERSION,
    time: new Date().toISOString(),
    commit: process.env["VERCEL_GIT_COMMIT_SHA"] ?? null,
  };
  return Response.json(body);
}
