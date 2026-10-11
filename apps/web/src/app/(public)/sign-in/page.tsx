import { Suspense } from "react";
import { SignInForm } from "./sign-in-form";

/** Board 1b. The form reads ?next= and ?error=, so it renders inside Suspense. */
export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
