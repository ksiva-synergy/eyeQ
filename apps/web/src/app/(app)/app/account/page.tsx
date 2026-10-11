import { ComingSoon } from "@/components/shell/ComingSoon";
import { SignOutButton } from "@/components/shell/SignOutButton";

// Board 14 arrives in a later phase 5 slice; sign-out lives here until then.
export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <ComingSoon title="shell.app.profileTitle" icon="profile" />
      <div>
        <SignOutButton />
      </div>
    </div>
  );
}
