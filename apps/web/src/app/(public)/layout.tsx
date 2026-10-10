import type React from "react";

// Public pages (welcome, program landing pages, legal) follow the dark boards 1a and 15.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="flex min-h-dvh flex-col bg-ground text-text-primary">
      {children}
    </div>
  );
}
