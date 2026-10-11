import { Suspense } from "react";
import { AthleteShell } from "@/components/shell/AthleteShell";
import { ComingSoon } from "@/components/shell/ComingSoon";

/**
 * The athlete shell (plan 8.2: bottom tab bar below 768 px, board 16's side navigation
 * above) without a session, with ?path= marking the current destination, so its layout,
 * active state and accessibility are checked in CI while the destinations themselves need
 * a signed-in athlete. Behind DEV_GALLERY.
 */
export default function ShellPreview({
  searchParams,
}: {
  searchParams: Promise<{ path?: string }>;
}) {
  return (
    <Suspense>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}

async function Preview({ searchParams }: { searchParams: Promise<{ path?: string }> }) {
  const { path } = await searchParams;
  return (
    <AthleteShell activePath={path ?? "/app"}>
      <ComingSoon title="shell.app.competeTitle" icon="compete" />
    </AthleteShell>
  );
}
