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
  // Breadth-first through the wrappers: a raw query failing under the driver adapter puts
  // it at meta.driverAdapterError.cause.code beneath Prisma's own P2010.
  const seen = new Set<unknown>();
  const queue: unknown[] = [e];
  while (queue.length) {
    const cur = queue.shift();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    for (const k of ["code", "originalCode"]) {
      const v = o[k];
      // Prisma's own codes (P1000-P6999, e.g. P2010 "raw query failed") are not SQLSTATEs;
      // PL/pgSQL raises P0001-P0004, which are.
      if (typeof v === "string" && /^[0-9A-Z]{5}$/.test(v) && !/^P[1-6]\d{3}$/.test(v)) return v;
    }
    queue.push(o["meta"], o["driverAdapterError"], o["cause"]);
  }
  return undefined;
}

/**
 * The message the game engine raised with (`raise exception 'program_locked'`), which is a
 * machine reason in snake_case. Found on pg errors directly and inside Prisma's wrappers.
 */
export function engineReason(e: unknown): string | undefined {
  const seen = new Set<unknown>();
  const stack: unknown[] = [e];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    const o = cur as Record<string, unknown>;
    for (const k of ["message", "originalMessage"]) {
      const m = typeof o[k] === "string" ? /\b([a-z]+(?:_[a-z]+)+)\b/.exec(o[k] as string) : null;
      if (m && ENGINE_REASONS.has(m[1]!)) return m[1];
    }
    stack.push(o["cause"], o["meta"], o["driverAdapterError"]);
  }
  return undefined;
}

const ENGINE_REASONS = new Set([
  "drill_not_found",
  "session_not_found",
  "program_not_found",
  "drill_not_in_session",
  "profile_not_found",
  "item_not_found",
  "program_locked",
  "drill_locked",
  "freeze_cap_reached",
  "already_unlocked",
  "not_available_yet",
  "insufficient_coins",
  "insufficient_credits",
]);

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
    // Raised by the game engine (db/migrations 0008, 0009): a spend the balance cannot
    // cover, not found, locked, wrong state.
    case "P0001": {
      const reason = engineReason(e);
      return reason === "insufficient_coins" || reason === "insufficient_credits"
        ? new ApiError(409, "conflict", "Not enough coins yet.", { reason })
        : new ApiError(500, "internal", "Something went wrong.");
    }
    case "P0002":
      return new ApiError(404, "not_found", "Not found.", { reason: engineReason(e) });
    case "P0003":
      return new ApiError(403, "locked", "This needs access you do not have yet.", {
        reason: engineReason(e),
      });
    case "P0004":
      return new ApiError(409, "conflict", "That cannot be done right now.", {
        reason: engineReason(e),
      });
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
