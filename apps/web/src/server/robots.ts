/**
 * Search engines stay off every environment but production. Staging's production domain
 * (eyeq-nu.vercel.app) is public under Vercel's Standard Protection and carries placeholder
 * prices and Course/Offer structured data, so outside production every response says
 * `X-Robots-Tag: noindex, nofollow` and robots.txt disallows everything. Production is
 * unchanged: no header and no robots.txt. Anything but APP_ENV=production counts as not
 * production, so a missing setting errs on the side of hiding.
 */
export const isProduction = (appEnv: string | undefined) => appEnv === "production";

export function robotsHeaders(appEnv: string | undefined): { key: string; value: string }[] {
  return isProduction(appEnv) ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
}

export function robotsTxt(appEnv: string | undefined): string | null {
  return isProduction(appEnv) ? null : "User-agent: *\nDisallow: /\n";
}
