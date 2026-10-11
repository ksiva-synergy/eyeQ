import { z } from "zod";

/** Machine-readable codes. Clients switch on `code`, never on `message`. */
export const errorCodes = [
  "unauthenticated",
  "forbidden",
  "not_found",
  "method_not_allowed",
  "invalid_json",
  "validation_failed",
  "idempotency_key_required",
  "idempotency_key_reused",
  "idempotency_in_progress",
  "rate_limited",
  "otp_send_failed",
  "otp_invalid",
  /** Content the athlete has no entitlement for (details.reason: program_locked, drill_locked). */
  "locked",
  /** The action does not fit the current state (details.reason: freeze_cap_reached, ...). */
  "conflict",
  "internal",
] as const;
export const errorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** One error shape for every endpoint (plan section 7): `code`, `message`, `details`. */
export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Header carrying the client's idempotency key on mutating /api/v1 calls (rule 6). */
export const IDEMPOTENCY_HEADER = "idempotency-key";
/** Set on a response replayed from a stored idempotent result. */
export const IDEMPOTENT_REPLAY_HEADER = "idempotent-replayed";
