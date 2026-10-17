import { describe, expect, it } from "vitest";
import { notificationText } from "./notification-text";

describe("notificationText", () => {
  it("names the streak and the athlete's own deadline", () => {
    // Local midnight in Kolkata on 11 Oct is 18:30 UTC on 10 Oct.
    const n = notificationText(
      "streak_at_risk",
      { streak: 12, ends_at: "2026-10-10T18:30:00Z" },
      "Asia/Kolkata",
    );
    expect(n.title).toBe("Your 12-day streak is at risk");
    expect(n.body).toBe("Train before 11:59 pm to keep it going.");
    const ny = notificationText(
      "streak_at_risk",
      { streak: 4, ends_at: "2026-10-11T04:00:00Z" },
      "America/New_York",
    );
    expect(ny.body).toBe("Train before 11:59 pm to keep it going.");
  });

  it("a receipt names what was bought, the price incl. GST, the date and the payment", () => {
    const n = notificationText(
      "receipt",
      {
        product_title: "Reaction Edge",
        amount_paise: 129900,
        payment_id: "pay_123",
        paid_at: "2026-10-17T05:00:00Z",
      },
      "Asia/Kolkata",
    );
    expect(n.title).toBe("Your EyeQ receipt");
    expect(n.body).toContain("Reaction Edge\n₹1,299, including GST · 17 Oct 2026");
    expect(n.body).toContain("Payment reference: pay_123");
    expect(n.body).toContain("GST tax invoice comes separately from Razorpay");
    expect(notificationText("receipt", {}, "Asia/Kolkata").body).toBe("Thanks for your purchase.");
  });

  it("says when a challenge closes, in the athlete's zone, and links to it", () => {
    const n = notificationText(
      "challenge_ending",
      { title: "5 sessions this week", window_end: "2026-10-11T18:30:00Z" },
      "Asia/Kolkata",
    );
    expect(n.body).toBe("5 sessions this week closes Mon 12:00 am. You're not there yet.");
    expect(n.url).toBe("/app/compete?tab=challenges");
  });

  it("claims nothing about eyesight (rule 10)", () => {
    for (const k of [
      "daily_reminder",
      "streak_at_risk",
      "challenge_ending",
      "weekly_recap",
      "overtaken",
      "receipt",
    ] as const) {
      const n = notificationText(k, {}, "Asia/Kolkata");
      expect(`${n.title} ${n.body}`).not.toMatch(
        /diagnos|test your|eyesight|vision score|clinical/i,
      );
    }
  });
});
