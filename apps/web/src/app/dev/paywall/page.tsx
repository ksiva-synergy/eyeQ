import { Suspense } from "react";
import type { PurchaseProduct } from "@eyeq/api-contract";
import { Paywall } from "@/app/(play)/app/upgrade/Paywall";
import type { PaywallData } from "@/server/services/paywall";

/**
 * The paywall (board 11) without a session, at the seed's placeholder prices (D21).
 * ?program=1 adds "this program only" as opened from Reaction Edge; ?pro=1 is an athlete
 * who already has Pro. Buying needs a session, so the CTA here fails with a message.
 * Behind DEV_GALLERY.
 */
const product = (
  id: string,
  kind: PurchaseProduct["kind"],
  title: string,
  pricePaise: number,
  durationDays: number | null,
): PurchaseProduct => ({
  id,
  kind,
  title,
  pricePaise,
  currency: "INR",
  durationDays,
  programId: kind === "program" ? "00000003-0000-4000-a000-000000000003" : null,
  programSlug: kind === "program" ? "reaction-edge" : null,
  available: true,
});

const base: PaywallData = {
  plans: {
    annual: product(
      "00000002-0000-4000-a000-000000000003",
      "subscription",
      "EyeQ Pro · annual",
      249900,
      365,
    ),
    quarterly: product(
      "00000002-0000-4000-a000-000000000002",
      "subscription",
      "EyeQ Pro · quarterly",
      79900,
      90,
    ),
    monthly: product(
      "00000002-0000-4000-a000-000000000001",
      "subscription",
      "EyeQ Pro · monthly",
      29900,
      30,
    ),
  },
  program: null,
  programsInPro: 3,
  freezesPerWeek: 1,
  subscription: null,
  billingEmail: null,
};

export default function PaywallPreview({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; pro?: string }>;
}) {
  return (
    <Suspense>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; pro?: string }>;
}) {
  const q = await searchParams;
  const data: PaywallData = {
    ...base,
    program:
      q.program === "1"
        ? {
            product: product(
              "00000002-0000-4000-a000-000000000012",
              "program",
              "Reaction Edge",
              129900,
              null,
            ),
            title: "Reaction Edge",
            slug: "reaction-edge",
          }
        : null,
    subscription: q.pro === "1" ? { status: "active", endsAt: "2026-11-12T18:30:00.000Z" } : null,
  };
  return (
    <div className="flex min-h-dvh flex-col bg-ground text-text-primary">
      <Paywall data={data} surface={q.program === "1" ? "program" : "upgrade"} variant="control" />
    </div>
  );
}
