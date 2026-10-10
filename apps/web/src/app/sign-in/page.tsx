import { Suspense } from "react";
import { t } from "@eyeq/i18n";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-5 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-[2.25rem] leading-none font-bold uppercase">
          {t("auth.title")}
        </h1>
        <p className="type-body text-text-secondary">{t("auth.subtitle")}</p>
      </header>
      <Suspense>
        <SignInForm />
      </Suspense>
    </main>
  );
}
