"use client";
import type React from "react";
import { useEffect, useId, useRef } from "react";
import { cx } from "./cx.ts";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  /** Up to two buttons; the affirmative goes last (right). */
  actions?: React.ReactNode;
  /**
   * "sheet": a bottom sheet below 768 px and a centred dialog above it (plan 8.2).
   * "modal": always centred; only for blocking errors (COMPONENTS: Modal / sheet).
   */
  variant?: "sheet" | "modal";
  className?: string;
};

/**
 * Native <dialog> opened with showModal(): focus moves in and is trapped,
 * Escape closes, the page behind is inert. Scrim 60 %, one shadow (e1).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  actions,
  variant = "sheet",
  className,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        "eyeq-sheet m-0 max-h-[100dvh] w-full max-w-none border-border-strong bg-surface-1 p-0 text-text-primary shadow-e1-up backdrop:bg-scrim",
        variant === "sheet"
          ? "mt-auto rounded-t-l border border-b-0 md:m-auto md:max-w-lg md:rounded-l md:border-b md:shadow-e1"
          : "m-auto max-w-[calc(100%-2.5rem)] rounded-l border shadow-e1 md:max-w-lg",
        className,
      )}
    >
      <SheetBody
        titleId={titleId}
        title={title}
        actions={actions}
        handle={variant === "sheet" ? "phone" : "none"}
      >
        {children}
      </SheetBody>
    </dialog>
  );
}

function SheetBody({
  titleId,
  title,
  children,
  actions,
  handle,
}: {
  titleId: string;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  handle: "phone" | "always" | "none";
}) {
  return (
    <div className="flex flex-col gap-3.5 px-5 pt-3 pb-5">
      {handle !== "none" && (
        <div
          aria-hidden="true"
          className={cx(
            "h-1 w-10 self-center rounded-[2px] bg-border-strong",
            handle === "phone" && "md:hidden",
          )}
        />
      )}
      <h2 id={titleId} className="type-display-m">
        {title}
      </h2>
      {children && <div className="type-body text-text-secondary">{children}</div>}
      {actions && (
        <div className="flex flex-wrap gap-2.5 [&>*]:min-w-[min(100%,8rem)] [&>*]:flex-1">
          {actions}
        </div>
      )}
    </div>
  );
}

/** A sheet drawn in place (gallery, previews): same panel, no dialog. */
export function SheetPreview({
  title,
  children,
  actions,
  className,
}: Omit<SheetProps, "open" | "onClose" | "variant">) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cx(
        "rounded-t-l border border-b-0 border-border-strong bg-surface-1 shadow-e1-up",
        className,
      )}
    >
      <SheetBody titleId={titleId} title={title} actions={actions} handle="always">
        {children}
      </SheetBody>
    </section>
  );
}
