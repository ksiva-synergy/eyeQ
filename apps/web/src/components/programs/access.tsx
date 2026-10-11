import type { ProgramCard } from "@eyeq/api-contract";
import { formatRupees, t } from "@eyeq/i18n";
import { Chip } from "@eyeq/ui/web";

/**
 * How a program can be opened, as the boards label it (10a, 10b, 1e): free, in Pro and/or
 * bought once (D23), or behind a level (D9). From the program's own access fields; the
 * athlete's access is `hasAccess`, from entitlements only (rule 4).
 */
export function AccessChip({
  program,
  athleteLevel,
}: {
  program: ProgramCard;
  athleteLevel: number;
}) {
  if (program.minLevel > athleteLevel && !program.hasAccess) {
    return <Chip icon="lock">{t("programs.unlocksAt", { n: program.minLevel })}</Chip>;
  }
  if (program.isFree) {
    return (
      <Chip kind="status" status="done">
        {t("programs.free")}
      </Chip>
    );
  }
  const price = program.product ? formatRupees(program.product.pricePaise) : null;
  if (program.inSubscription && price) {
    return (
      <Chip kind="selected" icon={null}>
        {t("programs.proOrPrice", { price })}
      </Chip>
    );
  }
  if (program.inSubscription) {
    return (
      <Chip kind="selected" icon={null}>
        {t("programs.pro")}
      </Chip>
    );
  }
  return price ? <Chip icon="lock">{t("programs.price", { price })}</Chip> : null;
}
