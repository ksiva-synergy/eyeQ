"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import posthog from "posthog-js";
import { formatRupees, t } from "@eyeq/i18n";
import { Button, Chip, Icon, IconButton, PlanGroup, TextInput, type Plan } from "@eyeq/ui/web";
import { useCheckout } from "@/components/purchase/checkout";
import type { PaywallData } from "@/server/services/paywall";

export type PaywallSurface = "upgrade" | "program" | "drill" | "today";

type Pick = "annual" | "quarterly" | "monthly" | "once";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Board 11 on web. Differences from the board, all from the plan: no "Restore purchases"
 * (web needs none, 8.2), no credits pack (credits are P1; coins are never sold, D4), no
 * trial in the comparison (D6), no coach feedback (D10), freezes per week from
 * game_config (D3), and no Terms link until the legal pages exist (phase 11). Prices are
 * the server's, in rupees including tax; the per-month figures and the saving are
 * arithmetic on those prices for display.
 */
export function Paywall({
  data,
  surface,
  variant,
}: {
  data: PaywallData;
  surface: PaywallSurface;
  variant: string;
}) {
  const { annual, quarterly, monthly } = data.plans;
  const firstPlan: Pick | null =
    variant === "monthly_first" && monthly
      ? "monthly"
      : annual
        ? "annual"
        : quarterly
          ? "quarterly"
          : monthly
            ? "monthly"
            : null;
  const [pick, setPick] = useState<Pick | null>(
    data.program && surface === "program" ? "once" : firstPlan,
  );
  const [email, setEmail] = useState(data.billingEmail ?? "");
  const [emailError, setEmailError] = useState(false);
  const { state, start, busy } = useCheckout();

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current || !posthog.__loaded) return;
    viewed.current = true;
    // Ids and kinds only (rule 11).
    posthog.capture("paywall_viewed", {
      surface,
      variant,
      ...(data.program ? { program_product_id: data.program.product.id } : {}),
    });
  }, [surface, variant, data.program]);

  const plans: Plan[] = useMemo(() => {
    const out: Plan[] = [];
    const save =
      annual && monthly && monthly.pricePaise > 0
        ? Math.round((1 - annual.pricePaise / (monthly.pricePaise * 12)) * 100)
        : 0;
    if (annual)
      out.push({
        id: "annual",
        title: t("pay.plan.annual"),
        sub: t("pay.plan.annualSub", { price: formatRupees(annual.pricePaise / 12) }),
        price: formatRupees(annual.pricePaise),
        ...(save > 0 ? { badge: t("pay.plan.save", { pct: save }) } : {}),
      });
    if (quarterly)
      out.push({
        id: "quarterly",
        title: t("pay.plan.quarterly"),
        sub: t("pay.plan.quarterlySub", { price: formatRupees(quarterly.pricePaise / 3) }),
        price: formatRupees(quarterly.pricePaise),
      });
    if (monthly)
      out.push({
        id: "monthly",
        title: t("pay.plan.monthly"),
        sub: t("pay.plan.monthlySub"),
        price: formatRupees(monthly.pricePaise),
      });
    return out;
  }, [annual, quarterly, monthly]);

  const once: Plan[] = data.program
    ? [
        {
          id: "once",
          title: t("pay.once.program"),
          sub: t("pay.once.programSub", { program: data.program.title }),
          price: formatRupees(data.program.product.pricePaise),
        },
      ]
    : [];

  const chosen = pick === "once" ? data.program?.product : pick ? data.plans[pick] : undefined;
  const cta =
    pick === "once" && data.program
      ? t("pay.cta.once", {
          program: data.program.title,
          price: formatRupees(data.program.product.pricePaise),
        })
      : pick && chosen
        ? t(`pay.cta.${pick as "annual" | "quarterly" | "monthly"}`, {
            price: formatRupees(chosen.pricePaise),
          })
        : t("pay.notAvailable");

  function buy() {
    if (!chosen || !pick) return;
    const e = email.trim();
    if (e && !EMAIL.test(e)) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    const common = { productId: chosen.id, surface, ...(e ? { email: e } : {}) };
    void start(
      pick === "once" ? { kind: "order", ...common } : { kind: "subscription", ...common },
    );
  }

  const close = () => {
    if (window.history.length > 1) window.history.back();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- no history to go back to
    else window.location.assign("/app/programs");
  };

  if (data.subscription) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 px-5 pt-14 pb-10">
        <div className="flex">
          <IconButton icon="close" label={t("pay.close")} onClick={close} />
        </div>
        <span className="type-label text-primary-on-subtle">{t("pay.eyebrow")}</span>
        <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold uppercase">
          {t("pay.havePro")}
        </h1>
        <p className="type-body text-text-secondary">
          {data.subscription.status === "grace" ? t("pay.haveProGrace") : t("pay.haveProBody")}
        </p>
        <Button variant="primary" href="/app/account">
          {t("pay.openAccount")}
        </Button>
      </main>
    );
  }

  const freePro: [string, boolean | string, boolean | string][] = [
    [t("pay.compare.daily"), true, true],
    [t("pay.compare.reset"), true, true],
    [t("pay.compare.boards"), true, true],
    [
      data.programsInPro > 0
        ? t("pay.compare.programs", { n: data.programsInPro })
        : t("pay.compare.programsAll"),
      false,
      true,
    ],
    [
      t("pay.compare.freezes"),
      t("pay.compare.freezesFree"),
      t("pay.compare.freezesPro", { n: data.freezesPerWeek }),
    ],
  ];
  const cell = (v: boolean | string) =>
    typeof v === "string" ? (
      <span className="text-text-secondary">{v}</span>
    ) : v ? (
      <span className="inline-flex text-success-text">
        <Icon name="check" size={18} />
        <span className="sr-only">{t("pay.compare.yes")}</span>
      </span>
    ) : (
      <span className="inline-flex text-text-muted">
        <Icon name="cross" size={16} />
        <span className="sr-only">{t("pay.compare.no")}</span>
      </span>
    );

  return (
    <>
      <main className="mx-auto flex w-full max-w-lg flex-col gap-3.5 px-5 pt-14 pb-56">
        <div className="flex">
          <IconButton icon="close" label={t("pay.close")} onClick={close} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="type-label text-primary-on-subtle">{t("pay.eyebrow")}</span>
          <h1 className="font-display text-[2.5rem] leading-[0.95] font-bold whitespace-pre-line uppercase">
            {t("pay.title")}
          </h1>
          <p className="type-body-s text-text-secondary">
            {data.programsInPro > 1 ? t("pay.lede", { n: data.programsInPro }) : t("pay.ledeOne")}
          </p>
        </div>

        {plans.length > 0 && (
          <PlanGroup
            plans={plans}
            value={pick ?? ""}
            onChange={(id) => setPick(id as Pick)}
            label={t("pay.plans")}
            name="eyeq-plan"
          />
        )}

        {once.length > 0 && (
          <>
            <h2 className="type-label text-text-muted">{t("pay.once")}</h2>
            <PlanGroup
              plans={once}
              value={pick ?? ""}
              onChange={() => setPick("once")}
              label={t("pay.once")}
              name="eyeq-plan"
            />
          </>
        )}

        <h2 className="type-label text-text-muted">{t("pay.compare")}</h2>
        <div className="rounded-card border border-border bg-surface-1 px-3.5 py-1">
          <table className="w-full border-collapse type-body-s">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="py-2 text-left">
                  <span className="sr-only">{t("pay.compare")}</span>
                </th>
                <th scope="col" className="w-16 py-2 text-center type-label text-text-muted">
                  {t("pay.compare.free")}
                </th>
                <th scope="col" className="w-16 py-2 text-center type-label text-primary-on-subtle">
                  {t("pay.compare.pro")}
                </th>
              </tr>
            </thead>
            <tbody>
              {freePro.map(([label, free, pro], i) => (
                <tr key={label} className={i < freePro.length - 1 ? "border-b border-border" : ""}>
                  <th scope="row" className="py-2.5 pr-2 text-left font-medium">
                    {label}
                  </th>
                  <td className="py-2.5 text-center">{cell(free)}</td>
                  <td className="py-2.5 text-center">{cell(pro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <TextInput
          label={t("pay.email")}
          hint={t("pay.emailHint")}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          {...(emailError ? { error: t("pay.emailInvalid") } : {})}
        />

        <p className="type-caption text-text-muted">{t("pay.fine")}</p>
        <p className="type-caption text-text-muted">{t("pay.notMedical")}</p>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-ground px-5 pt-3 pb-8">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
          {state.phase === "error" && (
            <p role="alert" className="flex items-center gap-2 type-body-s text-cta-text">
              <Icon name="alert" size={16} />
              {state.message}
            </p>
          )}
          {(state.phase === "verifying" || state.phase === "pending") && (
            <p role="status" className="type-body-s text-text-secondary">
              {state.phase === "verifying" ? t("pay.verifying") : t("pay.pending")}
            </p>
          )}
          <Button
            variant="cta"
            fullWidth
            loading={busy}
            onClick={buy}
            {...(chosen ? {} : { disabledReason: t("pay.notAvailable") })}
          >
            {cta}
          </Button>
          <div className="flex flex-wrap items-center justify-center gap-2.5 text-[0.6875rem] font-bold text-text-muted">
            <span>{t("pay.methods")}</span>
            <Chip compact icon={null}>
              {t("pay.method.upi")}
            </Chip>
            <Chip compact icon={null}>
              {t("pay.method.card")}
            </Chip>
            <Chip compact icon={null}>
              {t("pay.method.netbanking")}
            </Chip>
          </div>
        </div>
      </div>
    </>
  );
}
