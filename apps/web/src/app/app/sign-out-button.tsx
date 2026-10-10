"use client";

import { useRouter } from "next/navigation";
import { t } from "@eyeq/i18n";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="min-h-11 rounded-lg border border-neutral-400 px-4 font-semibold focus-visible:ring-2"
      onClick={async () => {
        await fetch("/api/auth/sign-out", { method: "POST" });
        router.replace("/sign-in");
      }}
    >
      {t("auth.signOut")}
    </button>
  );
}
