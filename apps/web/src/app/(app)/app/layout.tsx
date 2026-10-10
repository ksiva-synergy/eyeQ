import type React from "react";
import { AthleteShell } from "@/components/shell/AthleteShell";

// No session yet: sign-in lands in phase 2 and the shell renders without one.
export default function AthleteLayout({ children }: { children: React.ReactNode }) {
  return <AthleteShell>{children}</AthleteShell>;
}
