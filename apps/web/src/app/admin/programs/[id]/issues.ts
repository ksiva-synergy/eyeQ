import type { PublishIssue } from "@eyeq/api-contract";
import { t, type MessageKey } from "@eyeq/i18n";

const ISSUE_KEYS = new Set([
  "no_modules",
  "empty_module",
  "empty_session",
  "too_many_sessions",
  "no_price",
  "video_broken",
  "video_unchecked",
  "ppv_no_price",
  "drive_paid",
]);

export const reasonText = (reason: string | null | undefined) =>
  t(`admin.builder.reason.${reason ?? "unavailable"}` as MessageKey);

/** A publish problem or warning in words (the SQL sends codes and values). */
export function issueText(i: PublishIssue): string {
  if (!ISSUE_KEYS.has(i.code)) return t("admin.builder.issue.unknown", { code: i.code });
  return t(`admin.builder.issue.${i.code}` as MessageKey, {
    title: i.title ?? "",
    day: i.day ?? 0,
    sessions: i.sessions ?? 0,
    days: i.days ?? 0,
    reason: reasonText(i.reason).replace(/\.$/, ""),
  });
}

/** "3:50". */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
