import { Suspense } from "react";
import {
  challengesResponseSchema,
  leaderboardResponseSchema,
  type LeaderboardResponse,
} from "@eyeq/api-contract";
import { AthleteShell } from "@/components/shell/AthleteShell";
import { Compete, type BoardKey } from "@/app/(app)/app/compete/Compete";
import arjun from "./compete-arjun.json";

/**
 * Compete (boards 6, 7) without a session, from seeded Arjun's recorded GET /leaderboards
 * (all four boards) and GET /challenges, at the recorded instant. ?tab=challenges opens
 * board 7; ?state=private is Arjun hidden from boards; ?state=empty a board nobody is on.
 * Behind DEV_GALLERY.
 */
const KEYS: BoardKey[] = ["week-global", "week-sport", "all-global", "all-sport"];

function boardsFor(state: string | undefined): Record<BoardKey, LeaderboardResponse> {
  const out = {} as Record<BoardKey, LeaderboardResponse>;
  for (const k of KEYS) {
    const b = leaderboardResponseSchema.parse(arjun.boards[k]);
    if (state === "private" && b.me) {
      out[k] = {
        ...b,
        count: b.count - 1,
        rows: b.rows.filter((r) => !r.isMe),
        me: { ...b.me, isPublic: false },
      };
    } else if (state === "empty") {
      out[k] = { ...b, count: 0, rows: [], me: null };
    } else out[k] = b;
  }
  return out;
}

export default function CompetePreview({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; state?: string }>;
}) {
  return (
    <AthleteShell activePath="/app/compete">
      <Suspense>
        <Preview searchParams={searchParams} />
      </Suspense>
    </AthleteShell>
  );
}

async function Preview({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; state?: string }>;
}) {
  const { tab, state } = await searchParams;
  return (
    <Compete
      boards={boardsFor(state)}
      challenges={challengesResponseSchema.parse(arjun.challenges)}
      now={arjun.now}
      timeZone="Asia/Kolkata"
      initialTab={tab === "challenges" ? "challenges" : "board"}
    />
  );
}
