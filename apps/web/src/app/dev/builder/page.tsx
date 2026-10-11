import { AdminShell } from "@/components/shell/AdminShell";
import { Builder } from "@/app/admin/programs/[id]/Builder";

/**
 * The program builder without the admin gate, for layout, theme and accessibility checks
 * in CI. Its API calls are answered by the Playwright test (e2e/fixtures); opened by hand
 * it shows the load error. Behind DEV_GALLERY.
 */
export default function BuilderPreview() {
  return (
    <AdminShell>
      <Builder id="00000000-0000-4000-8000-000000000000" />
    </AdminShell>
  );
}
