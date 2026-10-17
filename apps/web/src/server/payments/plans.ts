import type { Razorpay, RzpPlan } from "./razorpay";

/**
 * Razorpay Plans for the subscription products (plan phase 7): one plan per product and
 * price. A plan's amount cannot change, so a new price makes a new plan and the product is
 * relinked; subscribers already on the old plan keep it. Plans carry the product id in
 * their notes (`eyeq_product_id`), which is how a rerun finds them: running it again
 * creates nothing new.
 *
 * Periods: 30 days is monthly, 90 days is monthly with interval 3 (Razorpay's create-plan
 * page also lists a `quarterly` period, but its plan entity documents only daily, weekly,
 * monthly and yearly, so the documented form is used), 365 days is yearly.
 */
export interface SubscriptionProduct {
  id: string;
  title: string;
  pricePaise: number;
  currency: string;
  durationDays: number | null;
  razorpayPlanId: string | null;
}

export function periodFor(durationDays: number | null): { period: string; interval: number } {
  switch (durationDays) {
    case 30:
      return { period: "monthly", interval: 1 };
    case 90:
      return { period: "monthly", interval: 3 };
    case 365:
      return { period: "yearly", interval: 1 };
    default:
      throw new Error(`no Razorpay period for a ${durationDays ?? "missing"}-day subscription`);
  }
}

function matches(plan: RzpPlan, p: SubscriptionProduct): boolean {
  const { period, interval } = periodFor(p.durationDays);
  const notes = Array.isArray(plan.notes) ? {} : plan.notes;
  return (
    notes["eyeq_product_id"] === p.id &&
    plan.item.amount === p.pricePaise &&
    plan.item.currency === p.currency &&
    plan.period === period &&
    plan.interval === interval
  );
}

export type PlanAction =
  | { product: string; action: "keep"; planId: string }
  | { product: string; action: "link"; planId: string }
  | { product: string; action: "create"; planId: string | null };

async function allPlans(rzp: Razorpay): Promise<RzpPlan[]> {
  const out: RzpPlan[] = [];
  for (let skip = 0; ; skip += 100) {
    const page = await rzp.fetchPlans(100, skip);
    out.push(...page.items);
    if (page.items.length < 100) return out;
  }
}

/**
 * Works out, and with `apply` carries out, what each product needs. `link` writes an
 * existing plan's id to the product; `create` makes the plan first. Returns the actions.
 */
export async function syncPlans(
  rzp: Razorpay,
  products: SubscriptionProduct[],
  opts: { apply: boolean; link: (productId: string, planId: string) => Promise<void> },
): Promise<PlanAction[]> {
  const plans = await allPlans(rzp);
  const actions: PlanAction[] = [];
  for (const p of products) {
    const current = plans.find((pl) => pl.id === p.razorpayPlanId);
    if (current && matches(current, p)) {
      actions.push({ product: p.id, action: "keep", planId: current.id });
      continue;
    }
    const existing = plans.find((pl) => matches(pl, p));
    if (existing) {
      if (opts.apply) await opts.link(p.id, existing.id);
      actions.push({ product: p.id, action: "link", planId: existing.id });
      continue;
    }
    let planId: string | null = null;
    if (opts.apply) {
      const made = await rzp.createPlan({
        ...periodFor(p.durationDays),
        item: { name: p.title, amount: p.pricePaise, currency: p.currency },
        notes: { eyeq_product_id: p.id },
      });
      planId = made.id;
      await opts.link(p.id, made.id);
    }
    actions.push({ product: p.id, action: "create", planId });
  }
  return actions;
}
