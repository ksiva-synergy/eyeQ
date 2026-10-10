import { createHash } from "node:crypto";
import type { Tx } from "@eyeq/db";
import { IDEMPOTENCY_HEADER } from "@eyeq/api-contract";
import { ApiError } from "./errors";

/** Stable JSON: object keys sorted, so the same body always hashes the same. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

export function requestHash(route: string, body: unknown): string {
  return createHash("sha256")
    .update(`${route}\n${stable(body)}`)
    .digest("hex");
}

export function idempotencyKey(req: Request): string {
  const key = req.headers.get(IDEMPOTENCY_HEADER)?.trim();
  if (!key) {
    throw new ApiError(
      400,
      "idempotency_key_required",
      `Send an ${IDEMPOTENCY_HEADER} header with this request.`,
    );
  }
  if (key.length < 8 || key.length > 200) {
    throw new ApiError(
      400,
      "validation_failed",
      `${IDEMPOTENCY_HEADER} must be 8 to 200 characters.`,
    );
  }
  return key;
}

export interface Stored {
  status: number;
  body: unknown;
}

/**
 * Claims the key inside the request's transaction. Returns the stored result for a
 * repeat; null when this request is the first and should run. A concurrent duplicate
 * waits on the unique row until the first commits, then replays its result.
 */
export async function claim(
  tx: Tx,
  userId: string,
  key: string,
  route: string,
  hash: string,
): Promise<Stored | null> {
  const inserted = await tx.$queryRaw<{ key: string }[]>`
    insert into idempotency_keys (user_id, key, route, request_hash)
    values (${userId}::uuid, ${key}, ${route}, ${hash})
    on conflict (user_id, key) do nothing
    returning key`;
  if (inserted.length > 0) return null;
  const rows = await tx.$queryRaw<
    { route: string; request_hash: string; status: number | null; response: unknown }[]
  >`
    select route, request_hash, status, response from idempotency_keys
    where user_id = ${userId}::uuid and key = ${key}`;
  const row = rows[0];
  if (!row || row.route !== route || row.request_hash !== hash) {
    throw new ApiError(
      422,
      "idempotency_key_reused",
      "This idempotency key was used for a different request.",
    );
  }
  if (row.status === null) {
    throw new ApiError(
      409,
      "idempotency_in_progress",
      "The first request with this key is still running.",
    );
  }
  return { status: row.status, body: row.response };
}

export async function complete(tx: Tx, userId: string, key: string, result: Stored): Promise<void> {
  await tx.$executeRaw`
    update idempotency_keys
    set status = ${result.status}, response = ${JSON.stringify(result.body ?? null)}::jsonb, completed_at = now()
    where user_id = ${userId}::uuid and key = ${key}`;
}
