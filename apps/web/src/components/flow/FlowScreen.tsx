import type React from "react";
import { t } from "@eyeq/i18n";
import { Icon } from "@eyeq/ui/web";

/**
 * The frame of the sign-in and onboarding boards (1b to 1e): back, "Step n of 4", content,
 * and an action bar. Below 768 px it is the phone board: the bar is fixed to the bottom
 * edge over a hairline. From 768 px (plan 8.2, D30) the same column is centred and the bar
 * sits inline under the content.
 */
export function FlowScreen({
  back,
  step,
  children,
  actions,
}: {
  /** Where back goes; a link, so it works before any script has loaded. */
  back?: string;
  step: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[28rem] flex-1 flex-col md:justify-center md:py-12">
      <div className="flex flex-col gap-5 px-gutter pt-6 pb-48 md:pb-0">
        <div className="flex min-h-11 items-center justify-between">
          {back ? (
            <a
              href={back}
              aria-label={t("common.back")}
              className="eyeq-press inline-flex size-11 items-center justify-center rounded-control border border-border bg-surface-1 text-text-primary"
            >
              <Icon name="back" size={24} />
            </a>
          ) : (
            <span />
          )}
          <span className="type-label text-text-muted">{step}</span>
        </div>
        {children}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-(--eyeq-z-dock) flex flex-col gap-2 border-t border-border bg-ground px-gutter pt-3 pb-[max(2rem,env(safe-area-inset-bottom))] md:static md:mt-6 md:border-0 md:bg-transparent md:pt-0 md:pb-0">
        {actions}
      </div>
    </div>
  );
}

export function FlowHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow && <span className="type-label text-primary-text">{eyebrow}</span>}
      <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold uppercase">{title}</h1>
      {body && <p className="type-body text-text-secondary">{body}</p>}
    </div>
  );
}
