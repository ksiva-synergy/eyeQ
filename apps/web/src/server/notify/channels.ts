import type { NotificationKind } from "@eyeq/api-contract";
import type { NotificationText } from "@/lib/notification-text";

/** A row the dispatcher claimed (claim_notifications), with its device targets. */
export type Claimed = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  channel: "push" | "email" | "inapp";
  data: Record<string, unknown>;
  local_date: string;
  attempts: number;
  targets: { id: string; platform: "web" | "android" | "ios"; token: string }[];
};

/** What happened to one row; mapped onto finish_notification's outcomes. */
export type Outcome =
  | { outcome: "sent" }
  | { outcome: "skipped"; error: string }
  /** `hold`: keep retrying past the attempt limit (a missing setting, not a bad row). */
  | { outcome: "retry"; error: string; hold?: boolean }
  | { outcome: "failed"; error: string };

export type SendResult = Outcome & {
  /** Push targets the push service says are gone (404, 410): disabled, never retried. */
  goneTargets?: string[];
};

/**
 * A way to reach an athlete (plan phase 6): web push and email now, Expo push in phase 9.
 * A channel never throws for a delivery problem; it answers with an outcome.
 */
export interface Channel {
  send(n: Claimed, text: NotificationText): Promise<SendResult>;
}

export type Channels = { push: Channel; email: Channel };
