import { t, type MessageKey } from "@eyeq/i18n";
import { EmptyState, type IconName } from "@eyeq/ui/web";
import { PageHeader } from "./PageHeader";

/** Placeholder body for a destination whose screen is built in a later phase. */
export function ComingSoon({
  title,
  icon,
  body = "shell.app.soonBody",
}: {
  title: MessageKey;
  icon: IconName;
  body?: MessageKey;
}) {
  return (
    <>
      <PageHeader title={t(title)} />
      <EmptyState
        icon={icon}
        title={t("shell.app.soonTitle")}
        body={t(body)}
        className="max-w-xl"
      />
    </>
  );
}
