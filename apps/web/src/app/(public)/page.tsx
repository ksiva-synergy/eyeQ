import { t } from "@eyeq/i18n";
import { BrandMark, Button } from "@eyeq/ui/web";

// Board 1a Welcome. Both actions go to sign-in, as on the board.
export default function Welcome() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 pt-16 pb-10">
      <div className="flex items-center justify-between gap-3">
        <BrandMark />
        <span className="type-label text-text-muted">{t("shell.public.byline")}</span>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <svg
          className="aspect-square w-full max-w-[18.75rem]"
          viewBox="0 0 300 300"
          role="img"
          aria-label={t("shell.public.targetAlt")}
        >
          <circle
            cx="150"
            cy="150"
            r="140"
            fill="none"
            stroke="var(--eyeq-border)"
            strokeWidth="2"
            strokeDasharray="6 10"
          />
          <circle
            cx="150"
            cy="150"
            r="110"
            fill="none"
            stroke="var(--eyeq-primary-subtle-border)"
            strokeWidth="2"
          />
          <circle
            cx="150"
            cy="150"
            r="78"
            fill="none"
            stroke="var(--eyeq-primary)"
            strokeWidth="3"
          />
          <circle
            cx="150"
            cy="150"
            r="44"
            fill="none"
            stroke="var(--eyeq-primary-text)"
            strokeWidth="3"
          />
          <path
            d="M150 0v34M150 266v34M0 150h34M266 150h34"
            stroke="var(--eyeq-primary)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="150" cy="150" r="12" fill="var(--eyeq-cta)" />
          <circle cx="214" cy="104" r="7" fill="var(--eyeq-xp)" />
          <circle cx="96" cy="196" r="5" fill="var(--eyeq-streak)" />
        </svg>
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-[2.875rem] leading-[0.95] font-bold uppercase">
          {t("shell.public.welcomeLine1")}
          <br />
          <span className="text-primary-text">{t("shell.public.welcomeLine2")}</span>
          <br />
          {t("shell.public.welcomeLine3")}
        </h1>
        <p className="type-body text-text-secondary">{t("shell.public.welcomeBody")}</p>
      </div>
      <div className="flex flex-col gap-3">
        <Button variant="cta" href="/sign-in" fullWidth>
          {t("shell.public.getStarted")}
        </Button>
        <Button variant="ghost" href="/sign-in" fullWidth>
          {t("shell.public.haveAccount")}
        </Button>
        <p className="text-center text-[0.6875rem] leading-normal text-text-muted">
          {t("shell.public.disclaimer")}
        </p>
      </div>
    </main>
  );
}
