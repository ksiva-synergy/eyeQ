import { programsResponseSchema, type MeResponse } from "@eyeq/api-contract";
import { AthleteShell } from "@/components/shell/AthleteShell";
import { Account } from "@/app/(app)/app/account/Account";
import catalog from "../programs/catalog-arjun.json";

/**
 * Profile and account (board 14) without a session, as seeded Arjun R. sees it: Pro from
 * the coach, Cricket Vision Foundations in progress. Saving needs a session, so changes here
 * fail and put the value back. Behind DEV_GALLERY.
 */
const me: MeResponse = {
  id: "00000001-0000-4000-a000-000000000001",
  displayName: "Arjun R.",
  phone: "+919840000005",
  email: null,
  sport: "cricket",
  playingLevel: "district",
  goal: "reaction",
  hasDob: true,
  isMinor: false,
  sessionMinutes: 15,
  timezone: "Asia/Kolkata",
  visibility: "public",
  reminderTime: "18:30",
  notifications: { daily: true, streak: true, challenge: true, recap: true, overtaken: false },
  onboardedAt: "2026-09-01T06:00:00.000Z",
  isAdmin: false,
  stats: { totalXp: 2040, level: 7, currentStreak: 12, bestStreak: 19, coins: 140, freezesHeld: 1 },
};
const { programs } = programsResponseSchema.parse(catalog);

export default function AccountPreview() {
  return (
    <AthleteShell activePath="/app/account">
      <Account
        me={me}
        entitlements={[
          {
            id: "00000000-0000-4000-8000-000000000101",
            scope: "subscription",
            scopeId: null,
            source: "admin",
            status: "active",
            startsAt: "2026-09-01T06:00:00.000Z",
            endsAt: "2026-10-31T18:29:59.000Z",
            title: null,
          },
        ]}
        programs={programs}
        sessions={31}
        level={{
          level: 7,
          title: "Prospect",
          totalXp: 2040,
          xpInLevel: 188,
          xpForLevel: 411,
          toNext: 223,
          nextThreshold: 2263,
        }}
        badges={7}
        whatsapp="https://wa.me/910000000000"
      />
    </AthleteShell>
  );
}
