import { t } from "@eyeq/i18n";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold tracking-tight">{t("app.name")}</h1>
      <p className="text-neutral-500">{t("app.tagline")}</p>
      <p className="text-sm text-neutral-400">
        Phase 0 boilerplate. The design system lands in phase 3.
      </p>
    </main>
  );
}
