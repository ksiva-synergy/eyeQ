import type { Tx } from "@eyeq/db";
import { feedResponseSchema, type FeedResponse, type PushTokenRequest } from "@eyeq/api-contract";
import { ApiError } from "../api/errors";

/**
 * The in-app feed and push subscriptions (plan phase 6, D29). Runs as eyeq_api in the
 * request transaction: RLS keeps every query to the athlete's own rows, and the only
 * column of a notification the athlete may change is its read state.
 */

/** GET /notifications: the last 30 days, newest first. A kind switched off is left out. */
export async function getFeed(tx: Tx, userId: string): Promise<FeedResponse> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      kind: string;
      data: Record<string, unknown>;
      created_at: Date;
      read_at: Date | null;
    }[]
  >`
    select id, kind, data, created_at, read_at from notifications
    where user_id = ${userId}::uuid
      and not (status = 'skipped' and last_error = 'toggle_off')
      and created_at > now() - interval '30 days'
    order by created_at desc, id
    limit 50`;
  const [p] = await tx.$queryRaw<{ timezone: string }[]>`
    select timezone from profiles where id = ${userId}::uuid`;
  return feedResponseSchema.parse({
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      data: r.data,
      createdAt: r.created_at.toISOString(),
      readAt: r.read_at?.toISOString() ?? null,
    })),
    unread: rows.filter((r) => !r.read_at).length,
    timezone: p?.timezone ?? "Asia/Kolkata",
  });
}

/** Unread items in the feed, for the bell on Today. */
export async function unreadCount(tx: Tx, userId: string): Promise<number> {
  const [r] = await tx.$queryRaw<{ n: number }[]>`
    select count(*)::int as n from notifications
    where user_id = ${userId}::uuid and read_at is null
      and not (status = 'skipped' and last_error = 'toggle_off')
      and created_at > now() - interval '30 days'`;
  return r?.n ?? 0;
}

/** POST /notifications/read: the given items, or every unread one. */
export async function markRead(
  tx: Tx,
  userId: string,
  ids: string[] | undefined,
): Promise<{ unread: number }> {
  await tx.notifications.updateMany({
    where: { user_id: userId, read_at: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { read_at: new Date() },
  });
  return { unread: await unreadCount(tx, userId) };
}

/**
 * POST /me/push-tokens. A web subscription is stored as its JSON (endpoint and keys, all
 * the dispatcher needs); an older subscription for the same endpoint is replaced. A token
 * seen again is marked live. A token held by another account is refused (RLS).
 */
export async function savePushToken(
  tx: Tx,
  userId: string,
  req: PushTokenRequest,
): Promise<{ id: string }> {
  const token =
    req.platform === "web"
      ? JSON.stringify({ endpoint: req.subscription.endpoint, keys: req.subscription.keys })
      : req.token;
  if (req.platform === "web")
    await tx.$executeRaw`
      delete from push_tokens
      where user_id = ${userId}::uuid and token <> ${token}
        and case when platform = 'web' then token::jsonb->>'endpoint' end = ${req.subscription.endpoint}`;
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    insert into push_tokens (user_id, token, platform)
    values (${userId}::uuid, ${token}, ${req.platform})
    on conflict (token) do update set last_seen_at = now(), disabled_at = null
    returning id`;
  if (!row) throw new ApiError(409, "conflict", "That device is registered to another account.");
  return { id: row.id };
}

/** DELETE /me/push-tokens: by Expo token, or by a web subscription's endpoint. */
export async function deletePushToken(tx: Tx, userId: string, token: string): Promise<void> {
  await tx.$executeRaw`
    delete from push_tokens
    where user_id = ${userId}::uuid
      and (token = ${token} or case when platform = 'web' then token::jsonb->>'endpoint' end = ${token})`;
}
