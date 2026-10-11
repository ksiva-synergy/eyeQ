import { AdminShell } from "@/components/shell/AdminShell";
import GamePage from "@/app/admin/game/page";

/**
 * Game settings (board 17) without the admin gate, for layout, theme and accessibility
 * checks. Its API calls are answered by the Playwright test; opened by hand it shows the
 * load error. Behind DEV_GALLERY.
 */
export default function GamePreview() {
  return (
    <AdminShell>
      <GamePage />
    </AdminShell>
  );
}
