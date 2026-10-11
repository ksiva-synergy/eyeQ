import type { ApiError as ApiErrorBody, ErrorCode } from "@eyeq/api-contract";

/** Thrown anywhere in a route; the pipeline turns it into the one error shape. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }

  body(): ApiErrorBody {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }
}

/** Postgres SQLSTATE from a pg, Prisma or driver-adapter error, if there is one. */
export function sqlState(e: unknown): string | undefined {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    for (const k of ["code", "originalCode"]) {
      const v = o[k];
      if (typeof v === "string" && /^[0-9A-Z]{5}$/.test(v)) return v;
    }
    const meta = o["meta"] as Record<string, unknown> | undefined;
    if (meta && typeof meta["code"] === "string" && /^[0-9A-Z]{5}$/.test(meta["code"]))
      return meta["code"];
    cur = o["cause"];
  }
  return undefined;
}

/** Maps anything thrown to an ApiError. Unknown errors become a 500 with no detail. */
export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e && typeof e === "object" && (e as { code?: unknown }).code === "P2025") {
    return new ApiError(404, "not_found", "Not found.");
  }
  // Unique and foreign-key conflicts: a taken slug, or deleting content athletes have used.
  if (
    e &&
    typeof e === "object" &&
    ["P2002", "P2003"].includes(String((e as { code?: unknown }).code))
  ) {
    return new ApiError(409, "validation_failed", "This conflicts with existing data.");
  }
  switch (sqlState(e)) {
    case "23503":
    case "23505":
      return new ApiError(409, "validation_failed", "This conflicts with existing data.");
    case "28000":
      return new ApiError(401, "unauthenticated", "Sign in to continue.");
    case "42501":
      return new ApiError(403, "forbidden", "Not allowed.");
    case "22004":
    case "22007":
    case "22008":
    case "22023":
    case "22P02":
    case "23514":
      return new ApiError(400, "validation_failed", "The request is not valid.");
    default:
      return new ApiError(500, "internal", "Something went wrong.");
  }
}
