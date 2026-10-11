import { Suspense } from "react";
import { feedResponseSchema } from "@eyeq/api-contract";
import { AthleteShell } from "@/components/shell/AthleteShell";
import { Feed } from "@/app/(app)/app/notifications/Feed";

/**
 * The in-app notification feed without a session: three notices as seeded Arjun would
 * have them on a Saturday, two unread. ?state=empty is a feed with nothing yet. Behind
 * DEV_GALLERY. Opening it posts "read" to the real API, which refuses without a session.
 */
const feed = feedResponseSchema.parse({
  timezone: "Asia/Kolkata",
  unread: 2,
  items: [
    {
      id: "00000000-0000-4000-a000-00000000f001",
      kind: "streak_at_risk",
      data: { streak: 12, ends_at: "2026-10-10T18:30:00Z" },
      createdAt: "2026-10-10T14:35:00Z",
      readAt: null,
    },
    {
      id: "00000000-0000-4000-a000-00000000f002",
      kind: "challenge_ending",
      data: { title: "5 sessions this week", window_end: "2026-10-11T18:30:00Z" },
      createdAt: "2026-10-10T18:30:00Z",
      readAt: null,
    },
    {
      id: "00000000-0000-4000-a000-00000000f003",
      kind: "daily_reminder",
      data: { local_date: "2026-10-09" },
      createdAt: "2026-10-09T13:00:00Z",
      readAt: "2026-10-09T15:00:00Z",
    },
  ],
});

export default function FeedPreview({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  return (
    <AthleteShell activePath="/app/notifications">
      <Suspense>
        <Preview searchParams={searchParams} />
      </Suspense>
    </AthleteShell>
  );
}

async function Preview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  return <Feed feed={state === "empty" ? { ...feed, items: [], unread: 0 } : feed} />;
}
