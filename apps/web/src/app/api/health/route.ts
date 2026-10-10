import type { HealthResponse } from "@eyeq/api-contract";
import { API_VERSION } from "@eyeq/config";

export function GET(): Response {
  const body: HealthResponse = { ok: true, version: API_VERSION, time: new Date().toISOString() };
  return Response.json(body);
}
