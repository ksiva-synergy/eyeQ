import type { NotificationKind } from "@eyeq/api-contract";
import { formatDate, formatRupees, formatShortWeekdayIn, formatTimeIn, t } from "@eyeq/i18n";

export type NotificationText = { title: string; body: string; url: string };

/**
 * The words for a notification, from its kind and data (the outbox stores no text, plan
 * 6.9). One renderer for push, email and the in-app feed, so they always say the same
 * thing. Times are in the athlete's profile zone.
 */
export function notificationText(
  kind: NotificationKind,
  data: Record<string, unknown>,
  timeZone: string,
): NotificationText {
  const str = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
  switch (kind) {
    case "streak_at_risk": {
      // ends_at is the next local midnight; "before 11:59 pm" reads better than "12:00 am".
      const ends = str("ends_at");
      const time = ends ? formatTimeIn(new Date(Date.parse(ends) - 60_000), timeZone) : "midnight";
      return {
        title: t("notify.streak_at_risk.title", { n: Number(data["streak"] ?? 0) }),
        body: t("notify.streak_at_risk.body", { time }),
        url: "/app",
      };
    }
    case "challenge_ending": {
      const end = str("window_end");
      const when = end
        ? `${formatShortWeekdayIn(end, timeZone)} ${formatTimeIn(end, timeZone)}`
        : "";
      return {
        title: t("notify.challenge_ending.title"),
        body: t("notify.challenge_ending.body", { title: str("title"), when }),
        url: "/app/compete?tab=challenges",
      };
    }
    case "daily_reminder":
      return {
        title: t("notify.daily_reminder.title"),
        body: t("notify.daily_reminder.body"),
        url: "/app",
      };
    case "weekly_recap":
      return {
        title: t("notify.weekly_recap.title"),
        body: t("notify.weekly_recap.body"),
        url: "/app/progress",
      };
    case "overtaken":
      return {
        title: t("notify.overtaken.title"),
        body: t("notify.overtaken.body"),
        url: "/app/compete",
      };
    case "receipt": {
      // Queued with the grant (0023): what was bought, the amount in paise, the payment id.
      const amount =
        typeof data["amount_paise"] === "number" ? (data["amount_paise"] as number) : null;
      const paid = str("paid_at");
      return {
        title: t("notify.receipt.title"),
        body:
          str("product_title") && amount !== null
            ? t("notify.receipt.detail", {
                product: str("product_title"),
                price: formatRupees(amount),
                date: paid ? formatDate(paid, timeZone) : "",
                payment: str("payment_id"),
              })
            : t("notify.receipt.body"),
        url: "/app/account",
      };
    }
  }
}
