import type { Tx } from "@eyeq/db";
import {
  landingCoachSchema,
  programLandingSchema,
  type LandingCoach,
  type ProgramLanding,
} from "@eyeq/api-contract";
import type { AuditEntry } from "../api/admin";

/**
 * The public program page (board 15, plan phase 7). Public reads need no athlete (plan
 * 5.3): this runs as eyeq_api without app.user_id, so RLS shows published content only,
 * and drills are read by column, never their video reference (rule 5). Every claim comes
 * from content: the program's `landing` and the coach block in game_config (D15).
 */
export interface LandingModule {
  order: number;
  title: string;
  description: string | null;
  fromDay: number | null;
  toDay: number | null;
  drills: number;
  xp: number;
}

export interface LandingData {
  program: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    sportTags: string[];
    durationDays: number;
    minutesPerDay: number | null;
    isFree: boolean;
    inSubscription: boolean;
    coverUrl: string | null;
  };
  landing: ProgramLanding;
  coach: LandingCoach;
  modules: LandingModule[];
  measurements: { slug: string; name: string; group: string }[];
  /** Day 1's drills, for the "in the app" card. */
  dayOne: { title: string; measurement: string | null; xp: number }[];
  product: { id: string; pricePaise: number } | null;
  /** The cheapest monthly Pro price, for "or get all programs with Pro from …". */
  proMonthlyPaise: number | null;
}

export async function getCoach(tx: Tx): Promise<LandingCoach> {
  const [row] = await tx.$queryRaw<{ v: unknown }[]>`select config_value('landing.coach') as v`;
  const parsed = landingCoachSchema.safeParse(row?.v ?? {});
  return parsed.success ? parsed.data : landingCoachSchema.parse({});
}

/** A new game_config row from now (config is versioned by active_from), audited. */
export async function setCoach(
  tx: Tx,
  body: LandingCoach,
  audit: (e: AuditEntry) => Promise<void>,
): Promise<LandingCoach> {
  const before = await getCoach(tx);
  await tx.$executeRaw`
    insert into game_config (key, value, active_from, note)
    values ('landing.coach', ${JSON.stringify(body)}::jsonb, now(), 'admin: coach on public pages')`;
  await audit({
    action: "config.landing_coach",
    targetType: "game_config",
    targetId: "landing.coach",
    before,
    after: body,
  });
  return body;
}

export async function getLanding(tx: Tx, slug: string): Promise<LandingData | null> {
  const p = await tx.programs.findFirst({ where: { slug, status: "published" } });
  if (!p) return null;
  const [modules, product, pro, coach, perDay] = await Promise.all([
    tx.$queryRaw<
      {
        order: number;
        title: string;
        description: string | null;
        from_day: number | null;
        to_day: number | null;
        drills: number;
        xp: number;
      }[]
    >`
      select m."order", m.title, m.description, min(s.day_number) as from_day, max(s.day_number) as to_day,
        count(distinct sd.drill_id)::int as drills,
        coalesce(sum(coalesce(d.xp, config_int('xp.drill'))), 0)::int as xp
      from modules m
      left join sessions s on s.module_id = m.id
      left join session_drills sd on sd.session_id = s.id
      left join drills d on d.id = sd.drill_id and d.status = 'published'
      where m.program_id = ${p.id}::uuid
      group by m.id order by m."order"`,
    p.product_id
      ? tx.products.findFirst({ where: { id: p.product_id, active: true, kind: "program" } })
      : null,
    tx.products.findFirst({
      where: {
        active: true,
        kind: "subscription",
        grants: { path: ["duration_days"], equals: 30 },
      },
      orderBy: { price_paise: "asc" },
    }),
    getCoach(tx),
    tx.$queryRaw<{ m: number | null }[]>`
      select round(avg(est_minutes))::int as m from sessions where program_id = ${p.id}::uuid`,
  ]);
  const measurements = await tx.$queryRaw<{ slug: string; name: string; group: string }[]>`
    select distinct mt.slug, mt.name, mt."group", mt.sort
    from session_drills sd join sessions s on s.id = sd.session_id join drills d on d.id = sd.drill_id
    join measurement_tags mt on mt.slug = d.measurement_tag
    where s.program_id = ${p.id}::uuid and d.status = 'published'
    order by mt.sort, mt.name`;
  const dayOne = await tx.$queryRaw<{ title: string; measurement: string | null; xp: number }[]>`
    select d.title, mt.name as measurement, coalesce(d.xp, config_int('xp.drill'))::int as xp
    from sessions s join session_drills sd on sd.session_id = s.id join drills d on d.id = sd.drill_id
    left join measurement_tags mt on mt.slug = d.measurement_tag
    where s.program_id = ${p.id}::uuid and s.day_number = 1 and d.status = 'published'
    order by sd."order"`;
  const landing = programLandingSchema.safeParse(p.landing ?? {});
  return {
    program: {
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      sportTags: p.sport_tags,
      durationDays: p.duration_days,
      minutesPerDay: perDay[0]?.m ?? null,
      isFree: p.is_free,
      inSubscription: p.in_subscription,
      coverUrl: p.cover_url,
    },
    landing: landing.success ? landing.data : programLandingSchema.parse({}),
    coach,
    modules: modules.map((m) => ({
      order: m.order,
      title: m.title,
      description: m.description,
      fromDay: m.from_day,
      toDay: m.to_day,
      drills: m.drills,
      xp: m.xp,
    })),
    measurements: measurements.map(({ slug, name, group }) => ({ slug, name, group })),
    dayOne,
    product: product ? { id: product.id, pricePaise: product.price_paise } : null,
    proMonthlyPaise: pro?.price_paise ?? null,
  };
}
