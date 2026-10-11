"use client";

import { useRouter } from "next/navigation";
import { t } from "@eyeq/i18n";
import { buttonClass } from "@eyeq/ui/web";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className={buttonClass({ variant: "ghost", size: "m" })}
      onClick={async () => {
        await fetch("/api/auth/sign-out", { method: "POST" });
        router.replace("/sign-in");
      }}
    >
      {t("auth.signOut")}
    </button>
  );
}
