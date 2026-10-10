import { t } from "@eyeq/i18n";

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-m bg-primary font-bold text-on-primary focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-(--eyeq-z-takeover) focus:px-4 focus:py-3"
    >
      {t("common.skipToContent")}
    </a>
  );
}
