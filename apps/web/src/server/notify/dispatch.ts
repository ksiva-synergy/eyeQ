import type { PrismaClient } from "@eyeq/db";
import { notificationText } from "@/lib/notification-text";
import { log } from "../observability/log";
import type { Channels, Claimed, SendResult } from "./channels";

export type DispatchResult = {
  batches: number;
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  /** Rows whose lease ran out before they were finished (another run may have them now). */
  lost: number;
};

export type DispatchOptions = {
  db: PrismaClient;
  channels: Channels;
  /** Rows claimed per batch. */
  batch?: number;
  /** Stop claiming once this much time has passed, inside the function's time limit. */
  budgetMs?: number;
  /** Sends in flight at once. */
  concurrency?: number;
};

/**
 * Drains the notification outbox (plan phase 6): claims due rows in batches through
 * claim_notifications (SKIP LOCKED plus a lease, so an overlapping run never gets the same
 * row), renders each from kind and data, sends it through its channel, and records the
 * outcome with finish_notification (retry with backoff, or fail after five attempts).
 * Toggles and the 2-a-day cap are enforced in the claim. Runs as eyeq_service.
 */
export async function dispatch(opts: DispatchOptions): Promise<DispatchResult> {
  const { db, channels, batch = 50, budgetMs = 40_000, concurrency = 8 } = opts;
  const started = Date.now();
  const r: DispatchResult = {
    batches: 0,
    claimed: 0,
    sent: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    lost: 0,
  };

  while (Date.now() - started < budgetMs) {
    const [row] = await db.$queryRaw<{ v: Claimed[] }[]>`
      select claim_notifications(${batch}::integer, interval '2 minutes') as v`;
    const rows = row?.v ?? [];
    if (rows.length === 0) break;
    r.batches++;
    r.claimed += rows.length;

    const zones = new Map(
      (
        await db.profiles.findMany({
          where: { id: { in: [...new Set(rows.map((n) => n.user_id))] } },
          select: { id: true, timezone: true },
        })
      ).map((p) => [p.id, p.timezone]),
    );

    const queue = [...rows];
    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        for (let n = queue.shift(); n; n = queue.shift()) {
          const res = await sendOne(n, channels, zones.get(n.user_id) ?? "Asia/Kolkata");
          if (res.goneTargets?.length)
            await db.push_tokens.updateMany({
              where: { id: { in: res.goneTargets } },
              data: { disabled_at: new Date() },
            });
          const error = res.outcome === "sent" ? null : res.error;
          // A held row (production email without Resend) stays queued, retried hourly, until
          // the setting exists; it never runs out of attempts.
          const maxAttempts = res.outcome === "retry" && res.hold ? 2_147_483_647 : 5;
          const [done] = await db.$queryRaw<{ ok: boolean }[]>`
            select finish_notification(${n.id}::uuid, ${res.outcome}, ${error}, now(), ${maxAttempts}::integer) as ok`;
          if (!done?.ok) {
            r.lost++;
            log("warn", "dispatch.lease_lost", { notificationId: n.id });
            continue;
          }
          if (res.outcome === "sent") r.sent++;
          else if (res.outcome === "skipped") r.skipped++;
          else if (res.outcome === "retry") r.retried++;
          else r.failed++;
          if (res.outcome === "failed")
            log("warn", "dispatch.failed", {
              notificationId: n.id,
              kind: n.kind,
              error: res.error,
            });
        }
      }),
    );
    if (rows.length < batch) break;
  }
  return r;
}

async function sendOne(n: Claimed, channels: Channels, timeZone: string): Promise<SendResult> {
  if (n.channel === "inapp") return { outcome: "sent" };
  try {
    const text = notificationText(n.kind, n.data, timeZone);
    return await (n.channel === "email" ? channels.email : channels.push).send(n, text);
  } catch (e) {
    log("error", "dispatch.channel_threw", {
      notificationId: n.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return { outcome: "retry", error: "channel_threw" };
  }
}
