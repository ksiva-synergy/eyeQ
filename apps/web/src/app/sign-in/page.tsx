import { Suspense } from "react";
import { t } from "@eyeq/i18n";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">{t("auth.title")}</h1>
        <p className="text-neutral-500">{t("auth.subtitle")}</p>
      </header>
      <Suspense>
        <SignInForm />
      </Suspense>
    </main>
  );
}
