import { Suspense } from "react";
import { asSignedInAthlete } from "@/server/athlete";
import { getMe } from "@/server/services/me";
import { ProfileForm } from "./ProfileForm";

/** Board 1c (step 2 of 4). */
export default function OnboardingProfile() {
  return (
    <Suspense>
      <Load />
    </Suspense>
  );
}

async function Load() {
  const me = await asSignedInAthlete("/onboarding/profile", (tx, session) => getMe(tx, session));
  return (
    <ProfileForm
      initial={{
        displayName: me.displayName,
        sport: me.sport,
        playingLevel: me.playingLevel,
        goal: me.goal,
        sessionMinutes: me.sessionMinutes,
        hasDob: me.hasDob,
      }}
    />
  );
}
