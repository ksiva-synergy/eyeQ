"use client";

import { useState } from "react";
import { Toast } from "@eyeq/ui/web";

/** Board 13b: "Streak freeze used for Friday", shown once per visit over the tab bar. */
export function FrozenToast({ message }: { message: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="fixed inset-x-gutter bottom-24 z-(--eyeq-z-toast) md:inset-x-auto md:right-8 md:bottom-8 md:w-96">
      <Toast message={message} icon="freeze" onDismiss={() => setOpen(false)} />
    </div>
  );
}
