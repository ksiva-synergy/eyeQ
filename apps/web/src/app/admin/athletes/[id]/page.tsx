import { AthleteAdmin } from "./AthleteAdmin";

// One athlete (plan phase 4): activity timeline, purchases and entitlements, manual
// grant or revoke written with source = admin.
export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AthleteAdmin id={id} />;
}
