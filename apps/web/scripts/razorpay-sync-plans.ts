/**
 * Creates or links the Razorpay Plans for the active subscription products and writes
 * their ids to products.razorpay_plan_id (plan phase 7). Idempotent: a rerun creates
 * nothing. Test mode only: refuses a key id that is not `rzp_test_…`.
 *
 *   pnpm razorpay:sync-plans           show what it would do
 *   pnpm razorpay:sync-plans --apply   do it
 *
 * Needs RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and the database (DIRECT_URL or DATABASE_URL;
 * not the transaction pooler). Each relink writes an audit_log row. For staging, run it
 * from GitHub Actions › "Razorpay plan sync (staging)" (.github/workflows/razorpay-sync-plans.yml),
 * which holds the secrets; locally, against the local database.
 */
import pg from "pg";
import { targetFor } from "@eyeq/db/target";
import { syncPlans, type SubscriptionProduct } from "../src/server/payments/plans";
import { razorpayClient } from "../src/server/payments/razorpay";

const apply = process.argv.includes("--apply");
const keyId = process.env["RAZORPAY_KEY_ID"] ?? process.env["NEXT_PUBLIC_RAZORPAY_KEY_ID"];
const keySecret = process.env["RAZORPAY_KEY_SECRET"];

async function main() {
  if (!keyId || !keySecret) throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set");
  if (!keyId.startsWith("rzp_test_"))
    throw new Error("razorpay:sync-plans runs with Razorpay test keys only (rzp_test_…)");
  const client = new pg.Client({ connectionString: targetFor("admin") });
  await client.connect();
  try {
    const { rows } = await client.query<{
      id: string;
      title: string;
      price_paise: number;
      currency: string;
      duration_days: number | null;
      razorpay_plan_id: string | null;
    }>(
      `select id, title, price_paise, currency, (grants->>'duration_days')::int as duration_days, razorpay_plan_id
       from products where kind = 'subscription' and active order by price_paise`,
    );
    const products: SubscriptionProduct[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      pricePaise: r.price_paise,
      currency: r.currency,
      durationDays: r.duration_days,
      razorpayPlanId: r.razorpay_plan_id,
    }));
    const actions = await syncPlans(razorpayClient({ keyId, keySecret }), products, {
      apply,
      link: async (productId, planId) => {
        await client.query("begin");
        const before = await client.query("select razorpay_plan_id from products where id = $1", [
          productId,
        ]);
        await client.query(
          "update products set razorpay_plan_id = $2, updated_at = now() where id = $1",
          [productId, planId],
        );
        await client.query(
          `insert into audit_log (actor_role, action, target_type, target_id, before, after)
           values ('script', 'product.razorpay_plan', 'product', $1, $2, $3)`,
          [
            productId,
            JSON.stringify(before.rows[0] ?? null),
            JSON.stringify({ razorpay_plan_id: planId }),
          ],
        );
        await client.query("commit");
      },
    });
    for (const a of actions) {
      const p = products.find((x) => x.id === a.product)!;
      console.log(
        `${a.action.padEnd(6)} ${p.title} (${p.pricePaise} paise) ${a.planId ?? "(new plan)"}`,
      );
    }
    if (!apply && actions.some((a) => a.action !== "keep"))
      console.log("\nDry run. Run again with --apply to create and link.");
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
