import { Suspense } from "react";
import { connection } from "next/server";
import { env } from "@/server/env";
import { SignInForm } from "./sign-in-form";

/**
 * Board 1b. The form reads ?next= and ?error=, so it renders inside Suspense. Whether Google
 * is offered is read per request (AUTH_GOOGLE_ENABLED), not baked in at build.
 */
export default function SignInPage() {
  return (
    <Suspense>
      <Form />
    </Suspense>
  );
}

async function Form() {
  await connection();
  return <SignInForm google={env.googleSignIn()} />;
}
