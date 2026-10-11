import type React from "react";
import { Suspense } from "react";
import { AthleteIdentity } from "@/components/analytics/AthleteIdentity";
import { QaBanner } from "@/components/qa/QaBanner";

/**
 * The drill player and session summary (boards 3, 4, 5a, 5b) are full-screen on the boards:
 * no tab bar or side navigation, like the mobile app's modal session route. Same URL space
 * as the athlete app (/app/session/[id]); the theme follows the OS like the rest of it.
 */
export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ground text-text-primary">
      {children}
      <Suspense>
        <AthleteIdentity />
      </Suspense>
      <Suspense>
        <QaBanner />
      </Suspense>
    </div>
  );
}
