import Link from "next/link";
import type { LinkComponent } from "@eyeq/ui/web";

/** Adapts next/link to the LinkComponent the @eyeq/ui navs accept. */
export const NextLink: LinkComponent = ({ href, className, children, ...rest }) => (
  <Link href={href} className={className} {...rest}>
    {children}
  </Link>
);
