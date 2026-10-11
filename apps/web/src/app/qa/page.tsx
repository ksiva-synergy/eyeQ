import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { t } from "@eyeq/i18n";
import { FlowHeading } from "@/components/flow/FlowScreen";
import { nextJar } from "@/server/auth/next-cookies";
import { qaGrantFromJar } from "@/server/auth/qa";
import { listQaAthletes } from "@/server/auth/qa-routes";
import { env } from "@/server/env";
import { QaConsole } from "./QaConsole";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The QA master login (server/auth/qa.ts): sign in with QA_MASTER_LOGIN and
 * QA_MASTER_PASSWORD, then switch into any athlete. 404 while it is off. Remove before
 * public launch.
 */
export default function QaPage() {
  return (
    <Suspense>
      <Console />
    </Suspense>
  );
}

async function Console() {
  await connection();
  if (!env.qaMaster()) notFound();
  const grant = qaGrantFromJar(await nextJar());
  const athletes = grant ? await listQaAthletes(null) : null;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 bg-ground px-4 py-8 text-text-primary">
      <FlowHeading title={t("qa.title")} body={t("qa.body")} />
      <QaConsole
        key={grant ? "in" : "out"}
        signedIn={grant !== null}
        current={grant?.as ?? null}
        initial={athletes ?? []}
      />
    </main>
  );
}
