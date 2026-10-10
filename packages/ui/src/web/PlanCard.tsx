"use client";
import { cx } from "./cx.ts";
import { Chip } from "./Chip.tsx";

export type Plan = {
  id: string;
  title: string;
  sub: string;
  /** Preformatted from config, e.g. "₹[ANNUAL]". */
  price: string;
  badge?: string;
};

export type PlanGroupProps = {
  plans: Plan[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the radio group. */
  label: string;
  name: string;
  className?: string;
};

/** Radio group of plan cards; selected = violet-subtle + 2px violet border + filled dot (COMPONENTS 3.17). */
export function PlanGroup({ plans, value, onChange, label, name, className }: PlanGroupProps) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("flex flex-col gap-3", className)}>
      {plans.map((p) => {
        const selected = p.id === value;
        return (
          <label
            key={p.id}
            className={cx(
              "flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-card-s border-2 p-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
              selected ? "border-primary bg-primary-subtle" : "border-border bg-surface-1",
            )}
          >
            <input
              type="radio"
              name={name}
              value={p.id}
              checked={selected}
              onChange={() => onChange(p.id)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={cx(
                "grid size-5 shrink-0 place-items-center rounded-full border-2",
                selected ? "border-primary bg-on-primary" : "border-text-muted bg-transparent",
              )}
            >
              {selected && <span className="size-2.5 rounded-full bg-primary" />}
            </span>
            <span className="flex min-w-[min(100%,9rem)] flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[0.9375rem] font-extrabold">{p.title}</span>
                {p.badge && (
                  <Chip kind="status" status="done" compact icon={null}>
                    {p.badge}
                  </Chip>
                )}
              </span>
              <span
                className={cx(
                  "type-caption",
                  selected ? "text-primary-on-subtle" : "text-text-secondary",
                )}
              >
                {p.sub}
              </span>
            </span>
            <span className="ml-auto type-display-m">{p.price}</span>
          </label>
        );
      })}
    </div>
  );
}
