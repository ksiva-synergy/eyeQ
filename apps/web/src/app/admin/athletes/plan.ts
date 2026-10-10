import type { AdminAthleteRow } from "@eyeq/api-contract";
import type { MessageKey } from "@eyeq/i18n";
import type { ChipProps } from "@eyeq/ui/web";

type Plan = AdminAthleteRow["plan"];

export const planKey = (p: Plan) => `admin.athletes.plan.${p}` as MessageKey;

/** Pro reads as "selected" violet, Program as XP gold, Free as neutral (board 17); the word carries it. */
export const planChip = (p: Plan): ChipProps["kind"] =>
  p === "pro" ? "selected" : p === "program" ? "xp" : "neutral";
