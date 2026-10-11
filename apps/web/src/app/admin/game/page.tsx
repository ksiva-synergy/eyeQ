import { t } from "@eyeq/i18n";
import { WeeklyEditor } from "./WeeklyEditor";

/**
 * Game settings (board 17). Phase 6 builds the weekly challenge editor; the XP, caps,
 * badge and coin settings stay in game_config until their editor is built.
 */
export default function GamePage() {
  return (
    <div className="flex flex-col gap-5 md:max-w-[56rem]">
      <div className="flex flex-col gap-1">
        <span className="type-label text-text-muted">{t("nav.gameSettings")}</span>
        <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold uppercase">
          {t("shell.admin.gameTitle")}
        </h1>
      </div>
      <WeeklyEditor />
      <p className="type-caption text-text-muted">{t("admin.challenges.otherSettings")}</p>
    </div>
  );
}
