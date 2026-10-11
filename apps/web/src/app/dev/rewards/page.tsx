import { Suspense } from "react";
import { rewardsResponseSchema, type RewardsResponse } from "@eyeq/api-contract";
import { AthleteShell } from "@/components/shell/AthleteShell";
import { Rewards } from "@/app/(app)/app/rewards/Rewards";
import arjun from "../compete/compete-arjun.json";

/**
 * Rewards (board 12) without a session, from seeded Arjun's recorded GET /rewards (a Pro
 * athlete: every drill already open). ?as=free is a free athlete with no freeze and two
 * seeded drills a coin unlock can open. Buying here calls the real API, which refuses
 * without a session. Behind DEV_GALLERY.
 */
const base = rewardsResponseSchema.parse(arjun.rewards);

function dataFor(as: string | undefined): RewardsResponse {
  if (as !== "free") return base;
  return {
    ...base,
    freezesHeld: 0,
    unlockableDrills: [
      {
        id: "00000006-0000-4000-a000-000000000002",
        title: "Peripheral Flash Catch",
        durationMinutes: 3,
        coinPrice: 30,
        programTitle: "Reaction Edge",
      },
      {
        id: "00000006-0000-4000-a000-000000000003",
        title: "Saccade Ladder",
        durationMinutes: 4,
        coinPrice: 30,
        programTitle: "Reaction Edge",
      },
    ],
  };
}

export default function RewardsPreview({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  return (
    <AthleteShell activePath="/app">
      <Suspense>
        <Preview searchParams={searchParams} />
      </Suspense>
    </AthleteShell>
  );
}

async function Preview({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  return <Rewards data={dataFor(as)} />;
}
