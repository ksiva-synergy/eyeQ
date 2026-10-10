import "server-only";
import { PostHog } from "posthog-node";
import { env } from "../env";

/**
 * PostHog server client: events and feature flags (paywall variants and new game rules
 * later). Skipped cleanly without POSTHOG_API_KEY: capture does nothing and every flag
 * reads as its default. The distinct id is the EyeQ user id and events carry nothing
 * else personal (ground rule 11).
 */
let client: PostHog | null | undefined;

function ph(): PostHog | null {
  if (client !== undefined) return client;
  const cfg = env.posthog();
  // Serverless: send each event at once rather than batching across invocations.
  client = cfg ? new PostHog(cfg.key, { host: cfg.host, flushAt: 1, flushInterval: 0 }) : null;
  return client;
}

export async function capture(
  userId: string,
  event: string,
  properties: Record<string, string | number | boolean> = {},
) {
  const c = ph();
  if (!c) return;
  c.capture({ distinctId: userId, event, properties });
  await c.flush().catch(() => {});
}

export async function flag(key: string, userId: string, fallback = false): Promise<boolean> {
  const c = ph();
  if (!c) return fallback;
  try {
    return (await c.isFeatureEnabled(key, userId)) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function flagVariant(
  key: string,
  userId: string,
): Promise<string | boolean | undefined> {
  const c = ph();
  if (!c) return undefined;
  try {
    return await c.getFeatureFlag(key, userId);
  } catch {
    return undefined;
  }
}
