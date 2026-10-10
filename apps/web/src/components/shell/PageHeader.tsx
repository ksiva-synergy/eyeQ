import type React from "react";

/** Screen title block of boards 2 and 16: label line above a display headline. */
export function PageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        {eyebrow && <span className="type-label text-text-muted">{eyebrow}</span>}
        <h1 className="font-display text-[2.25rem] leading-[0.95] font-bold uppercase md:text-[2.75rem]">
          {title}
        </h1>
      </div>
      {actions}
    </div>
  );
}
