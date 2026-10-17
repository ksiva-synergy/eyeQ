import { Suspense } from "react";
import { Skeleton } from "@eyeq/ui/web";
import { asSignedInAthlete } from "@/server/athlete";
import { flagVariant } from "@/server/observability/posthog";
import { getPaywall } from "@/server/services/paywall";
import { Paywall, type PaywallSurface } from "./Paywall";

/**
 * The paywall (board 11), full-screen like the app's paywall modal. `?program=slug` adds
 * "this program only"; `?from=` names where it was opened, for paywall_viewed. The layout
 * variant comes from the PostHog flag `paywall-variant` (plan phase 7), read on the server.
 */
export default function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; from?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pt-14" aria-busy="true">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-48" />
          <Skeleton className="h-40" />
        </div>
      }
    >
      <Load searchParams={searchParams} />
    </Suspense>
  );
}

const SURFACES: PaywallSurface[] = ["upgrade", "program", "drill", "today"];

async function Load({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; from?: string }>;
}) {
  const q = await searchParams;
  const slug = q.program && /^[a-z0-9-]{1,80}$/.test(q.program) ? q.program : null;
  const surface = SURFACES.find((s) => s === q.from) ?? (slug ? "program" : "upgrade");
  const { data, userId } = await asSignedInAthlete(
    `/app/upgrade${slug ? `?program=${slug}` : ""}`,
    async (tx, session) => ({
      data: await getPaywall(tx, session.userId, slug),
      userId: session.userId,
    }),
  );
  const variant = await flagVariant("paywall-variant", userId);
  return (
    <Paywall
      data={data}
      surface={surface}
      variant={typeof variant === "string" ? variant : "control"}
    />
  );
}
