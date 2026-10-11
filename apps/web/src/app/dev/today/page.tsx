import { Suspense } from "react";
import { AthleteShell } from "@/components/shell/AthleteShell";
import { Today } from "@/app/(app)/app/today/Today";
import { STATES, homeFor, type PreviewState } from "./fixtures";

/**
 * Today (boards 2, 13a to 13c, 16) without a session, from fixtures, so layout, both widths
 * and accessibility are checked in CI's main job. ?state= picks the streak state. Behind
 * DEV_GALLERY, like /dev/components.
 */
export default function TodayPreview({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  return (
    <AthleteShell>
      <Suspense>
        <Preview searchParams={searchParams} />
      </Suspense>
    </AthleteShell>
  );
}

async function Preview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const s = (STATES as readonly string[]).includes(state ?? "")
    ? (state as PreviewState)
    : "pending";
  return <Today home={homeFor(s)} multiplierDays={7} freezePrice={50} />;
}
