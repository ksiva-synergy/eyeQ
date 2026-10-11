import type React from "react";
import { Suspense } from "react";
import { AthleteIdentity } from "@/components/analytics/AthleteIdentity";
import { AthleteShell } from "@/components/shell/AthleteShell";

export default function AthleteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AthleteShell>
      {children}
      <Suspense>
        <AthleteIdentity />
      </Suspense>
    </AthleteShell>
  );
}
