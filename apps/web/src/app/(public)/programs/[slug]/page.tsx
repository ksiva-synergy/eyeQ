import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { asAthlete } from "@eyeq/db";
import { formatRupees, t } from "@eyeq/i18n";
import { BrandMark, Button, Chip, Icon } from "@eyeq/ui/web";
import { sportKey } from "@/app/onboarding/options";
import { currentSession } from "@/server/auth/current";
import { apiDb } from "@/server/db";
import { env } from "@/server/env";
import { getLanding, type LandingData } from "@/server/services/landing";
import { LandingCheckout } from "./LandingCheckout";

/**
 * Board 15: the public page for one program, server-rendered for search (metadata and
 * Course/Product structured data). Every claim on it is content: the program row, its
 * `landing` and the coach block (D15); empty slots are left off, there is no refund
 * promise and no trial (D6). Checkout confirms the phone first (D16).
 */
type Params = { params: Promise<{ slug: string }> };

const SLUG = /^[a-z0-9-]{1,80}$/;

async function load(slug: string): Promise<LandingData | null> {
  // Request time, not prerender: the read (Prisma's transaction id is a crypto.randomUUID())
  // must not run while Next prerenders the shell with cacheComponents (staging, 2026-10-17).
  await connection();
  if (!SLUG.test(slug)) return null;
  // Public read (plan 5.3): eyeq_api with no athlete; RLS shows published content only.
  return apiDb().$transaction((tx) => getLanding(tx, slug));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  const title = `${d.program.title} · ${t("app.name")} ${t("shell.public.byline")}`;
  const description = d.landing.intro || d.program.description || undefined;
  const base = env.appUrl();
  return {
    title,
    description,
    ...(base ? { alternates: { canonical: `${base}/programs/${d.program.slug}` } } : {}),
    openGraph: {
      title,
      ...(description ? { description } : {}),
      type: "website",
      ...(d.program.coverUrl ? { images: [d.program.coverUrl] } : {}),
    },
  };
}

export default function LandingPage({ params }: Params) {
  return (
    <Suspense>
      <Load params={params} />
    </Suspense>
  );
}

function structuredData(d: LandingData, url: string | null) {
  const offer = d.product
    ? {
        "@type": "Offer",
        price: (d.product.pricePaise / 100).toFixed(2),
        priceCurrency: "INR",
        availability: "https://schema.org/InStock",
        category: "Paid",
        ...(url ? { url } : {}),
      }
    : d.program.isFree
      ? { "@type": "Offer", price: "0", priceCurrency: "INR", category: "Free" }
      : undefined;
  const provider = { "@type": "Organization", name: "Forge Your Peak" };
  const description = d.landing.intro || d.program.description || d.program.title;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Course",
        name: d.program.title,
        description,
        provider,
        ...(offer ? { offers: offer } : {}),
        hasCourseInstance: {
          "@type": "CourseInstance",
          courseMode: "online",
          ...(d.program.minutesPerDay ? { courseWorkload: `PT${d.program.minutesPerDay}M` } : {}),
        },
      },
      {
        "@type": "Product",
        name: d.program.title,
        description,
        brand: provider,
        ...(d.program.coverUrl ? { image: d.program.coverUrl } : {}),
        ...(offer ? { offers: offer } : {}),
      },
    ],
  };
}

async function Load({ params }: Params) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  const session = await currentSession();
  const owned = session
    ? await asAthlete(apiDb(), session.userId, async (tx) => {
        const [r] = await tx.$queryRaw<{ r: { has_access?: boolean } | null }[]>`
          select program_detail(${d.program.slug}) as r`;
        return r?.r?.has_access === true;
      }).catch(() => false)
    : false;
  const base = env.appUrl();
  const url = base ? `${base}/programs/${d.program.slug}` : null;
  const { program, landing, coach } = d;
  const price = d.product ? formatRupees(d.product.pricePaise) : null;
  const sport = program.sportTags.length === 1 ? t(sportKey(program.sportTags[0]!)) : null;
  const min = program.minutesPerDay ?? 0;
  const [headline, accent] = (landing.headline || program.title).split("|").map((s) => s.trim());
  const appHref = `/app/programs/${program.slug}`;
  const dayOneMinutes = d.dayOne.length ? min : 0;
  const whatsapp = env.supportWhatsappUrl();
  const json = JSON.stringify(structuredData(d, url)).replace(/</g, "\\u003c");

  const cta = owned ? (
    <Button variant="cta" href={appHref}>
      {t("landing.openApp")}
    </Button>
  ) : price ? (
    <Button variant="cta" href="#price">
      {t("landing.start", { price })}
    </Button>
  ) : program.isFree ? (
    <Button variant="cta" href={`/sign-in?next=${encodeURIComponent(appHref)}`}>
      {t("landing.startFree")}
    </Button>
  ) : (
    <Button variant="cta" href={`/sign-in?next=${encodeURIComponent("/app/upgrade")}`}>
      {t("landing.inPro")}
    </Button>
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[72rem] flex-wrap items-center justify-between gap-3 px-5 py-3.5 md:px-[4.625rem]">
          <BrandMark suffix={t("shell.public.byline")} />
          <nav aria-label={t("landing.nav.label")} className="flex flex-wrap items-center gap-1">
            {(
              [
                ["#train", "landing.nav.train"],
                ["#modules", "landing.nav.modules"],
                ...(coach.name ? ([["#coach", "landing.nav.coach"]] as const) : []),
                ["#price", "landing.nav.price"],
              ] as const
            ).map(([href, key]) => (
              <a
                key={href}
                href={href}
                className="hidden min-h-11 items-center px-2.5 type-body-strong text-text-secondary no-underline md:inline-flex"
              >
                {t(key)}
              </a>
            ))}
            <Button
              variant="primary"
              size="m"
              href={`/sign-in?next=${encodeURIComponent(appHref)}`}
            >
              {t("landing.member")}
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex flex-col">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-[72rem] grid-cols-1 gap-10 px-5 py-12 md:grid-cols-2 md:px-[4.625rem] md:py-16">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <Chip kind="area" icon={null}>
                {sport
                  ? t("landing.meta", { sport: `${sport} · `, days: program.durationDays, min })
                  : t("landing.metaNoSport", { days: program.durationDays, min })}
              </Chip>
              <Chip icon={null}>{landing.eyebrow || t("landing.online")}</Chip>
            </div>
            <h1 className="font-display text-[min(3.25rem,78px)] leading-[0.92] font-extrabold break-words uppercase md:text-[min(5.5rem,132px)]">
              {headline}
              {accent && (
                <>
                  <br />
                  <span className="text-primary-text">{accent}</span>
                </>
              )}
            </h1>
            {(landing.intro || program.description) && (
              <p className="max-w-[32rem] type-body text-text-secondary md:text-lg">
                {landing.intro || program.description}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {cta}
              <Button variant="ghost" href="#modules">
                {t("landing.seeDrills")}
              </Button>
            </div>
            {landing.proof.length > 0 && (
              <dl className="flex flex-wrap gap-x-6 gap-y-2">
                {landing.proof.map((p) => (
                  <div key={`${p.value}-${p.label}`} className="flex items-baseline gap-1.5">
                    <dt className="sr-only">{p.label}</dt>
                    <dd className="font-display text-2xl font-bold">{p.value}</dd>
                    <span aria-hidden="true" className="type-caption font-bold text-text-secondary">
                      {p.label}
                    </span>
                  </div>
                ))}
              </dl>
            )}
          </div>
          {d.dayOne.length > 0 && (
            <div className="flex flex-col gap-3 self-center rounded-l border border-primary-subtle-border bg-primary-subtle p-6">
              <span className="type-label text-primary-on-subtle">{t("landing.inApp")}</span>
              <h2 className="font-display text-[1.875rem] leading-none font-bold uppercase">
                {t("landing.inAppToday", { n: d.dayOne.length, min: dayOneMinutes })}
              </h2>
              <ul className="flex flex-col gap-2">
                {d.dayOne.map((x, i) => (
                  <li
                    key={`${x.title}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-m border border-border bg-surface-1 px-3.5 py-2.5"
                  >
                    <span className="flex-1 type-body-strong">{x.title}</span>
                    {x.measurement && (
                      <Chip kind="area" compact icon={null}>
                        {x.measurement}
                      </Chip>
                    )}
                    <span className="font-extrabold text-xp-text tabular-nums">
                      {t("xp.plus", { n: x.xp })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Method */}
        <section className="border-t border-border">
          <div className="mx-auto flex max-w-[72rem] flex-col gap-6 px-5 py-14 md:px-[4.625rem]">
            <div className="flex flex-col gap-1.5">
              <span className="type-label text-primary-on-subtle">{t("landing.method")}</span>
              <h2 className="font-display text-[min(2.5rem,60px)] leading-none font-extrabold break-words uppercase md:text-[min(3.5rem,84px)]">
                {t("landing.methodLine")}
              </h2>
            </div>
            <ol className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {(
                [
                  ["01", t("landing.method.test"), t("landing.method.testBody")],
                  [
                    "02",
                    t("landing.method.train", { min, days: program.durationDays }),
                    t("landing.method.trainBody"),
                  ],
                  ["03", t("landing.method.transform"), t("landing.method.transformBody")],
                ] as const
              ).map(([n, title, body]) => (
                <li
                  key={n}
                  className="flex flex-col gap-2 rounded-l border border-border bg-surface-1 p-6"
                >
                  <span
                    aria-hidden="true"
                    className="font-display text-[2.5rem] leading-none font-bold text-primary-text"
                  >
                    {n}
                  </span>
                  <h3 className="type-title">{title}</h3>
                  <p className="type-body-s text-text-secondary">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* What you'll train */}
        {d.measurements.length > 0 && (
          <section id="train" className="border-t border-border">
            <div className="mx-auto flex max-w-[72rem] flex-col gap-6 px-5 py-14 md:px-[4.625rem]">
              <div className="flex flex-col gap-1.5">
                <span className="type-label text-primary-on-subtle">{t("landing.train")}</span>
                <h2 className="font-display text-[min(2.25rem,54px)] leading-none font-extrabold break-words uppercase md:text-[min(3.5rem,84px)]">
                  {sport
                    ? t("landing.trainTitleSport", { n: d.measurements.length, sport })
                    : t("landing.trainTitle", { n: d.measurements.length })}
                </h2>
                {landing.measurementsIntro && (
                  <p className="max-w-[42rem] type-body text-text-secondary">
                    {landing.measurementsIntro}
                  </p>
                )}
              </div>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
                {d.measurements.map((m) => (
                  <li
                    key={m.slug}
                    className="flex flex-col gap-1 rounded-l border border-primary-subtle-border bg-primary-subtle p-5"
                  >
                    <span className="type-label text-primary-on-subtle">
                      {t(`programs.group.${m.group as "vision" | "reaction" | "cognition"}`)}
                    </span>
                    <span className="type-body-strong">{m.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Modules */}
        {d.modules.length > 0 && (
          <section id="modules" className="border-t border-border">
            <div className="mx-auto flex max-w-[72rem] flex-col gap-6 px-5 py-14 md:px-[4.625rem]">
              <div className="flex flex-col gap-1.5">
                <span className="type-label text-primary-on-subtle">{t("landing.modules")}</span>
                <h2 className="font-display text-[min(2.25rem,54px)] leading-none font-extrabold break-words uppercase md:text-[min(3.5rem,84px)]">
                  {t("landing.modulesTitle", { n: d.modules.length, days: program.durationDays })}
                </h2>
              </div>
              <ol className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {d.modules.map((m) => (
                  <li
                    key={m.order}
                    className="flex flex-col gap-3 rounded-l border border-border bg-surface-1 p-6"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-display text-[1.75rem] leading-none font-bold uppercase">
                        {t("landing.moduleTitle", { n: m.order, title: m.title })}
                      </h3>
                      {m.fromDay !== null && m.toDay !== null && (
                        <span className="type-label text-text-muted">
                          {m.fromDay === m.toDay
                            ? t("landing.moduleDay", { n: m.fromDay })
                            : t("landing.moduleDays", { from: m.fromDay, to: m.toDay })}
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <p className="type-body-s text-text-secondary">{m.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Chip compact icon={null}>
                        {t("landing.moduleDrills", { n: m.drills })}
                      </Chip>
                      <Chip kind="xp" compact icon={null}>
                        {t("landing.moduleXp", { n: m.xp })}
                      </Chip>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        {/* Coach and testimonials: shown only when written */}
        {(coach.name || landing.testimonials.length > 0) && (
          <section id="coach" className="border-t border-border">
            <div className="mx-auto grid max-w-[72rem] grid-cols-1 gap-8 px-5 py-14 md:grid-cols-2 md:px-[4.625rem]">
              {coach.name && (
                <div className="flex flex-col gap-4 rounded-l border border-border bg-surface-1 p-7">
                  <div className="flex flex-wrap items-center gap-4">
                    <span
                      aria-hidden="true"
                      className="grid size-[76px] shrink-0 place-items-center rounded-full border-2 border-primary bg-primary-subtle font-display text-3xl font-bold text-primary-text"
                    >
                      {coach.name.trim()[0]?.toUpperCase()}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span className="type-label text-primary-on-subtle">
                        {t("landing.coach")}
                      </span>
                      <h2 className="font-display text-[min(2rem,48px)] leading-none font-extrabold break-words uppercase">
                        {coach.name}
                      </h2>
                      {coach.title && (
                        <span className="type-caption text-text-secondary">{coach.title}</span>
                      )}
                    </div>
                  </div>
                  {coach.bio && <p className="type-body text-text-secondary">{coach.bio}</p>}
                  {coach.stats.length > 0 && (
                    <dl className="flex flex-wrap gap-x-5 gap-y-2">
                      {coach.stats.map((s) => (
                        <div key={`${s.value}-${s.label}`} className="flex items-baseline gap-1.5">
                          <dt className="sr-only">{s.label}</dt>
                          <dd className="font-display text-xl font-bold">{s.value}</dd>
                          <span
                            aria-hidden="true"
                            className="type-caption font-bold text-text-secondary"
                          >
                            {s.label}
                          </span>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              )}
              {landing.testimonials.length > 0 && (
                <div className="flex flex-col gap-4">
                  <h2 className="type-label text-primary-on-subtle">{t("landing.testimonials")}</h2>
                  {landing.testimonials.map((q) => (
                    <figure
                      key={q.quote}
                      className="flex flex-col gap-3 rounded-l border border-border bg-surface-1 p-6"
                    >
                      <blockquote className="type-title">
                        {t("landing.quote", { quote: q.quote })}
                      </blockquote>
                      <figcaption className="type-caption text-text-secondary">
                        {[q.name, q.role].filter(Boolean).join(" · ")}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Price */}
        <section id="price" className="border-t border-border bg-primary-subtle">
          <div className="mx-auto grid max-w-[72rem] grid-cols-1 gap-8 px-5 py-14 md:grid-cols-2 md:px-[4.625rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <span className="type-label text-primary-on-subtle">{t("landing.price")}</span>
              <h2 className="font-display text-[min(2.5rem,60px)] leading-[0.92] font-extrabold break-words uppercase md:text-[min(3.75rem,90px)]">
                {t("landing.priceTitle", { days: program.durationDays })}
              </h2>
              <p className="type-body text-text-secondary">{t("landing.priceBody")}</p>
              {landing.includes.length > 0 && (
                <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body-s">
                  {landing.includes.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-col gap-4 self-start rounded-l border border-border bg-surface-1 p-7">
              <span className="type-body-strong">{program.title}</span>
              {owned ? (
                <>
                  <span className="flex items-center gap-2 type-body-strong">
                    <Icon name="check" size={20} className="text-success-text" />
                    {t("landing.owned")}
                  </span>
                  <Button variant="cta" href={appHref}>
                    {t("landing.openApp")}
                  </Button>
                </>
              ) : price && d.product ? (
                <>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-display text-[min(3.5rem,84px)] leading-none font-extrabold tabular-nums">
                      {price}
                    </span>
                    <span className="type-body-s text-text-secondary">{t("landing.oneTime")}</span>
                  </div>
                  <LandingCheckout
                    productId={d.product.id}
                    signedIn={session !== null}
                    label={t("landing.buy", { program: program.title, price })}
                  />
                </>
              ) : program.isFree ? (
                <>
                  <span className="type-body-s text-text-secondary">{t("landing.free")}</span>
                  <Button variant="cta" href={`/sign-in?next=${encodeURIComponent(appHref)}`}>
                    {t("landing.startFree")}
                  </Button>
                </>
              ) : (
                <span className="type-body-s text-text-secondary">{t("landing.inPro")}</span>
              )}
              {!owned && program.inSubscription && d.proMonthlyPaise !== null && (
                <a
                  href={`/sign-in?next=${encodeURIComponent(`/app/upgrade?program=${program.slug}&from=upgrade`)}`}
                  className="inline-flex min-h-11 items-center justify-center text-center type-body-s"
                >
                  {t("landing.orPro", { price: formatRupees(d.proMonthlyPaise) })}
                </a>
              )}
              <p className="type-caption text-text-muted">{t("landing.secure")}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[72rem] flex-col gap-3 px-5 py-10 md:px-[4.625rem]">
          <BrandMark suffix={t("landing.footer")} />
          <p className="type-caption text-text-muted">{t("pay.notMedical")}</p>
          {whatsapp && (
            <a
              href={whatsapp}
              className="inline-flex min-h-11 items-center gap-2 type-body-strong text-success-text"
            >
              <Icon name="whatsapp" size={18} />
              {t("landing.help")}
            </a>
          )}
        </div>
      </footer>
    </>
  );
}
