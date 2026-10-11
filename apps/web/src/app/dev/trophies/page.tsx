import { Suspense } from "react";
import { badgesResponseSchema } from "@eyeq/api-contract";
import { AthleteShell } from "@/components/shell/AthleteShell";
import { Trophies } from "@/app/(app)/app/trophies/Trophies";
import arjun from "../compete/compete-arjun.json";

/** Trophy case (board 9) without a session, from seeded Arjun's recorded GET /badges. Behind DEV_GALLERY. */
export default function TrophiesPreview() {
  return (
    <AthleteShell activePath="/app/trophies">
      <Suspense>
        <Trophies data={badgesResponseSchema.parse(arjun.badges)} timeZone="Asia/Kolkata" />
      </Suspense>
    </AthleteShell>
  );
}
