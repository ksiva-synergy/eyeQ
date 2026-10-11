import { z } from "zod";

/**
 * Notifications (plan 6.9, phase 6): the in-app feed (GET /notifications) so nothing
 * depends on push alone (D29), and the athlete's push subscriptions (POST /me/push-tokens):
 * web push now, Expo tokens from the app in phase 9.
 */
const timestamp = z.iso.datetime({ offset: true });

export const notificationKinds = [
  "daily_reminder",
  "streak_at_risk",
  "challenge_ending",
  "weekly_recap",
  "overtaken",
  "receipt",
] as const;
export type NotificationKind = (typeof notificationKinds)[number];

/** A feed item: the kind and its data; the text is rendered from them by the client. */
export const feedItemSchema = z.strictObject({
  id: z.uuid(),
  kind: z.enum(notificationKinds),
  data: z.record(z.string(), z.unknown()),
  createdAt: timestamp,
  readAt: timestamp.nullable(),
});
export type FeedItem = z.infer<typeof feedItemSchema>;

export const feedResponseSchema = z.strictObject({
  items: z.array(feedItemSchema),
  unread: z.number().int(),
  /** The athlete's profile zone, for any time a message names. */
  timezone: z.string(),
});
export type FeedResponse = z.infer<typeof feedResponseSchema>;

/** POST /notifications/read: the items read, or every unread one when `ids` is absent. */
export const feedReadRequestSchema = z.strictObject({
  ids: z.array(z.uuid()).max(100).optional(),
});
export type FeedReadRequest = z.infer<typeof feedReadRequestSchema>;

export const feedReadResponseSchema = z.strictObject({ unread: z.number().int() });

/** A browser's PushSubscription.toJSON(). */
export const webPushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const pushTokenRequestSchema = z.discriminatedUnion("platform", [
  z.strictObject({ platform: z.literal("web"), subscription: webPushSubscriptionSchema }),
  z.strictObject({
    platform: z.enum(["android", "ios"]),
    token: z.string().regex(/^ExponentPushToken\[.+\]$/),
  }),
]);
export type PushTokenRequest = z.infer<typeof pushTokenRequestSchema>;

export const pushTokenResponseSchema = z.strictObject({ id: z.uuid() });

/** DELETE /me/push-tokens: the subscription endpoint (web) or Expo token being dropped. */
export const pushTokenDeleteSchema = z.strictObject({ token: z.string().min(1).max(2048) });

/** GET /me/push-config: the VAPID public key a browser subscribes with; null when unset. */
export const pushConfigResponseSchema = z.strictObject({ vapidPublicKey: z.string().nullable() });
export type PushConfigResponse = z.infer<typeof pushConfigResponseSchema>;
