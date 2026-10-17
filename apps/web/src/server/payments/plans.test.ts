import { describe, expect, it } from "vitest";
import { periodFor, syncPlans, type SubscriptionProduct } from "./plans";
import type { Razorpay, RzpPlan } from "./razorpay";

const product = (
  id: string,
  durationDays: number,
  price: number,
  planId: string | null = null,
): SubscriptionProduct => ({
  id,
  title: `Pro ${durationDays}`,
  pricePaise: price,
  currency: "INR",
  durationDays,
  razorpayPlanId: planId,
});

function fake(plans: RzpPlan[]) {
  let made = 0;
  const rzp = {
    fetchPlans: async () => ({ items: plans, count: plans.length }),
    createPlan: async (b: Parameters<Razorpay["createPlan"]>[0]) => {
      const p: RzpPlan = {
        id: `plan_new${made++}`,
        entity: "plan",
        period: b.period,
        interval: b.interval,
        item: { id: "item", ...b.item },
        notes: b.notes,
      };
      plans.push(p);
      return p;
    },
  } as unknown as Razorpay;
  return rzp;
}

describe("Razorpay plans", () => {
  it("maps 30, 90 and 365 days to monthly, monthly × 3 and yearly", () => {
    expect(periodFor(30)).toEqual({ period: "monthly", interval: 1 });
    expect(periodFor(90)).toEqual({ period: "monthly", interval: 3 });
    expect(periodFor(365)).toEqual({ period: "yearly", interval: 1 });
    expect(() => periodFor(7)).toThrow();
  });

  it("creates, then a rerun keeps; a price change creates a new plan; an orphan plan is relinked", async () => {
    const plans: RzpPlan[] = [];
    const links: Record<string, string> = {};
    const rzp = fake(plans);
    const link = async (p: string, plan: string) => {
      links[p] = plan;
    };
    const products = [product("m", 30, 29900), product("q", 90, 79900), product("y", 365, 249900)];
    const dry = await syncPlans(rzp, products, { apply: false, link });
    expect(dry.map((a) => a.action)).toEqual(["create", "create", "create"]);
    expect(plans).toHaveLength(0);

    await syncPlans(rzp, products, { apply: true, link });
    expect(plans.map((p) => [p.period, p.interval, p.item.amount])).toEqual([
      ["monthly", 1, 29900],
      ["monthly", 3, 79900],
      ["yearly", 1, 249900],
    ]);
    const linked = products.map((p) => ({ ...p, razorpayPlanId: links[p.id]! }));
    const again = await syncPlans(rzp, linked, { apply: true, link });
    expect(again.map((a) => a.action)).toEqual(["keep", "keep", "keep"]);
    expect(plans).toHaveLength(3);

    const repriced = [{ ...linked[0]!, pricePaise: 34900 }];
    expect((await syncPlans(rzp, repriced, { apply: true, link }))[0]!.action).toBe("create");
    expect(plans).toHaveLength(4);

    const unlinked = [{ ...linked[1]!, razorpayPlanId: null }];
    expect(await syncPlans(rzp, unlinked, { apply: true, link })).toEqual([
      { product: "q", action: "link", planId: links["q"] },
    ]);
  });
});
