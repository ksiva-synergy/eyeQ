/** Back to where sign-in was asked for, but only to a path on this site (no open redirect). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return "/app";
  return next;
}
