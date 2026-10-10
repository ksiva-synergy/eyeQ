import { AdminShell } from "@/components/shell/AdminShell";
import { ComingSoon } from "@/components/shell/ComingSoon";

/**
 * The admin shell (board 17) without the admin gate, so its layout, theme and
 * accessibility can be checked in CI without a coach session. Behind DEV_GALLERY.
 */
export default function AdminShellPreview() {
  return (
    <AdminShell>
      <ComingSoon title="shell.admin.programsTitle" icon="builder" body="shell.admin.soonBody" />
    </AdminShell>
  );
}
