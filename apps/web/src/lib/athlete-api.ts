import type { ErrorCode } from "@eyeq/api-contract";
import { clientId } from "./client-id";

/**
 * /api/v1 from the athlete's browser: JSON in and out, the session travels as the cookie.
 * Mutations carry an Idempotency-Key (rule 6). Pass the same key when retrying the same
 * action, so a request that reached the server but whose answer was lost is replayed, not
 * repeated; with none given a fresh one is made per call.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      code: ErrorCode | "network";
      details: Record<string, unknown> | null;
    };

export async function v1<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  opts: { idempotencyKey?: string } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/v1${path}`, {
      method,
      cache: "no-store",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(method !== "GET" ? { "idempotency-key": opts.idempotencyKey ?? clientId() } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (res.ok) return { ok: true, data: json as T };
    const err = (json ?? {}) as { code?: ErrorCode; details?: Record<string, unknown> };
    return {
      ok: false,
      status: res.status,
      code: err.code ?? "internal",
      details: err.details ?? null,
    };
  } catch {
    return { ok: false, status: 0, code: "network", details: null };
  }
}

/** Whether trying the same request again could succeed (offline, a timeout, a 5xx, 429). */
export function retryable(r: ApiResult<unknown>): boolean {
  return !r.ok && (r.status === 0 || r.status === 429 || r.status >= 500);
}
