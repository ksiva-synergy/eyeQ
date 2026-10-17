import type { Tx } from "@eyeq/db";
import { inSequence } from "@eyeq/db";
import type { PurchaseProduct } from "@eyeq/api-contract";
import { configNumbers } from "../athlete";
import { listPurchaseProducts } from "./purchases";

/**
 * What the paywall (board 11) shows, from the server: the subscription products at their
 * own prices, the one program to offer once (when the paywall was opened from a program),
 * how many programs Pro opens, the subscriber freeze allowance (game_config, rule 8), the
 * athlete's Pro if any, and the receipt email on file.
 */
export interface PaywallData {
  plans: { annual?: PurchaseProduct; quarterly?: PurchaseProduct; monthly?: PurchaseProduct };
  program: { product: PurchaseProduct; title: string; slug: string } | null;
  programsInPro: number;
  freezesPerWeek: number;
  subscription: { status: "active" | "grace"; endsAt: string | null } | null;
  billingEmail: string | null;
}

export async function getPaywall(
  tx: Tx,
  userId: string,
  programSlug: string | null,
): Promise<PaywallData> {
  const [{ products, subscription }, cfg, profile, programsInPro] = await inSequence([
    () => listPurchaseProducts(tx),
    () => configNumbers(tx, ["streak.subscriber_freeze_per_week"] as const),
    () => tx.profiles.findUnique({ where: { id: userId }, select: { billing_email: true } }),
    () => tx.programs.count({ where: { in_subscription: true, status: "published" } }),
  ]);
  const subs = products.filter((p) => p.kind === "subscription" && p.available);
  const byDays = (d: number) => subs.find((p) => p.durationDays === d);
  let program: PaywallData["program"] = null;
  if (programSlug) {
    const row = await tx.programs.findFirst({
      where: { slug: programSlug, status: "published" },
      select: { title: true, slug: true, product_id: true },
    });
    const product = row && products.find((p) => p.kind === "program" && p.id === row.product_id);
    if (row && product) program = { product, title: row.title, slug: row.slug };
  }
  return {
    plans: { annual: byDays(365), quarterly: byDays(90), monthly: byDays(30) },
    program,
    programsInPro,
    freezesPerWeek: cfg["streak.subscriber_freeze_per_week"],
    subscription,
    billingEmail: profile?.billing_email ?? null,
  };
}

/**
 * The pay-per-view price of each drill on the list (Rewards' drill unlock): only drills
 * sold on their own (`ppv` with an active product) have one. Coins stay the other way in.
 */
export async function ppvPrices(
  tx: Tx,
  drillIds: string[],
): Promise<Record<string, { productId: string; pricePaise: number }>> {
  if (drillIds.length === 0) return {};
  const drills = await tx.drills.findMany({
    where: { id: { in: drillIds }, access: "ppv", ppv_product_id: { not: null } },
    select: { id: true, ppv_product_id: true },
  });
  const products = await tx.products.findMany({
    where: { id: { in: drills.map((d) => d.ppv_product_id!) }, active: true, kind: "drill" },
    select: { id: true, price_paise: true },
  });
  const out: Record<string, { productId: string; pricePaise: number }> = {};
  for (const d of drills) {
    const p = products.find((x) => x.id === d.ppv_product_id);
    if (p) out[d.id] = { productId: p.id, pricePaise: p.price_paise };
  }
  return out;
}

/**
 * The day-4 paywall (plan phase 7): once the free Reset is finished, from day
 * `paywall.day_after_reset` (game_config, counted from the day the Reset started) Today
 * offers Pro, while the athlete has no Pro and no paid program in progress (one they are
 * enrolled in but cannot open already says so on its session card).
 */
export async function resetPaywallDue(tx: Tx, userId: string, localDate: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ due: boolean }[]>`
    select exists (
      select 1 from enrollments e join programs p on p.id = e.program_id
      where e.user_id = ${userId}::uuid and p.is_free and e.completed_at is not null
        and ${localDate}::date - e.start_local_date + 1 >= config_int('paywall.day_after_reset')
    )
    and not exists (select 1 from jsonb_array_elements(my_entitlements()) x where x->>'scope' = 'subscription')
    and not exists (
      select 1 from enrollments e join programs p on p.id = e.program_id
      where e.user_id = ${userId}::uuid and e.is_active and e.completed_at is null and not p.is_free
    ) as due`;
  return rows[0]?.due ?? false;
}
