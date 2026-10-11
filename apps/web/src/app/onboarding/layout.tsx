import type React from "react";

// Onboarding follows boards 1c to 1e, drawn in the dark theme.
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-ground text-text-primary">
      {children}
    </div>
  );
}
