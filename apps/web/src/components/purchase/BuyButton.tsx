"use client";

import type { CheckoutSurface } from "@eyeq/api-contract";
import { Button, Icon, type ButtonVariant } from "@eyeq/ui/web";
import { t } from "@eyeq/i18n";
import { useCheckout } from "./checkout";

/**
 * A one-time purchase from a locked prompt: a program, or one pay-per-view drill. The
 * server prices it; the receipt goes to the email on file, if any (the paywall asks for
 * one). A drill bought here reloads the page it was bought from.
 */
export function BuyButton({
  productId,
  drillId,
  surface,
  label,
  variant = "cta",
  size,
  fullWidth,
  className,
}: {
  productId: string;
  drillId?: string;
  surface: CheckoutSurface;
  label: string;
  variant?: ButtonVariant;
  size?: "m" | "l";
  fullWidth?: boolean;
  className?: string;
}) {
  const { state, start, busy } = useCheckout(
    drillId ? { onDone: () => window.location.reload() } : {},
  );
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant={variant}
        {...(size ? { size } : {})}
        fullWidth={fullWidth}
        className={className}
        loading={busy}
        onClick={() =>
          void start({ kind: "order", productId, surface, ...(drillId ? { drillId } : {}) })
        }
      >
        {label}
      </Button>
      {state.phase === "error" && (
        <p role="alert" className="flex items-center gap-2 type-caption text-cta-text">
          <Icon name="alert" size={14} />
          {state.message}
        </p>
      )}
      {(state.phase === "verifying" || state.phase === "pending") && (
        <p role="status" className="type-caption text-text-secondary">
          {state.phase === "verifying" ? t("pay.verifying") : t("pay.pending")}
        </p>
      )}
    </div>
  );
}
