/**
 * The public program page's data (board 15): read with no athlete, published only, no
 * video reference (rule 5), and every claim from content (D15).
 */
import { createDb, type PrismaClient } from "@eyeq/db";
import { seedConfig } from "@eyeq/db/seed";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localAdminUrl } from "../../../test/db";
import { runtimeUrl } from "../db";
import { getCoach, getLanding, setCoach } from "./landing";

const url = localAdminUrl();
const describeDb = url ? describe : describe.skip;

describeDb("the public program page", () => {
  const admin = new pg.Client({ connectionString: url });
  let api: PrismaClient;
  let service: PrismaClient;
  const tag = crypto.randomUUID().slice(0, 8);
  const slug = `landing-${tag}`;

  beforeAll(async () => {
    await admin.connect();
    await seedConfig(admin);
    api = createDb({ connectionString: runtimeUrl("eyeq_api", { DATABASE_URL: url! }), max: 2 });
    service = createDb({
      connectionString: runtimeUrl("eyeq_service", { DATABASE_URL: url! }),
      max: 2,
    });
    await admin.query(
      `insert into measurement_tags (slug, name, "group") values ('executive-scan', 'Executive Scan', 'cognition') on conflict do nothing`,
    );
    const product = (
      await admin.query<{ id: string }>(
        `insert into products (kind, title, price_paise, grants) values ('program', 'Landing', 99900, '{"scope":"program"}') returning id`,
      )
    ).rows[0]!.id;
    const p = (
      await admin.query<{ id: string }>(
        `insert into programs (slug, title, description, duration_days, is_free, in_subscription, product_id, status, landing)
         values ($1, 'Landing program', 'Plain description', 2, false, true, $2, 'published',
           '{"headline": "See it | sooner.", "proof": [{"value": "20+", "label": "drills"}]}') returning id`,
        [slug, product],
      )
    ).rows[0]!.id;
    const m = (
      await admin.query<{ id: string }>(
        `insert into modules (program_id, "order", title, description, unlock_rule) values ($1, 1, 'Clear', 'Base work', 'immediate') returning id`,
        [p],
      )
    ).rows[0]!.id;
    for (const day of [1, 2]) {
      const s = (
        await admin.query<{ id: string }>(
          `insert into sessions (program_id, module_id, day_number, est_minutes) values ($1, $2, $3, 12) returning id`,
          [p, m, day],
        )
      ).rows[0]!.id;
      const d = (
        await admin.query<{ id: string }>(
          `insert into drills (title, video_provider, video_ref, measurement_tag, access, duration_minutes, score_type, score_direction, xp, status)
           values ($1, 'youtube', 'SECRET_VIDEO_REF', 'executive-scan', 'included', 3, 'none', 'higher', 15, 'published') returning id`,
          [`Drill ${day}`],
        )
      ).rows[0]!.id;
      await admin.query(
        `insert into session_drills (session_id, drill_id, "order") values ($1, $2, 1)`,
        [s, d],
      );
    }
    await admin.query(
      `insert into programs (slug, title, duration_days, status) values ($1, 'Draft', 3, 'draft')`,
      [`draft-${tag}`],
    );
  });

  afterAll(async () => {
    await api.$disconnect();
    await service.$disconnect();
    await admin.end();
  });

  it("reads a published program with no athlete, and nothing for a draft", async () => {
    const d = await api.$transaction((tx) => getLanding(tx, slug));
    expect(d).not.toBeNull();
    expect(d!.program).toMatchObject({
      title: "Landing program",
      durationDays: 2,
      minutesPerDay: 12,
    });
    expect(d!.landing.headline).toBe("See it | sooner.");
    expect(d!.landing.proof).toEqual([{ value: "20+", label: "drills" }]);
    expect(d!.landing.testimonials).toEqual([]);
    expect(d!.modules).toEqual([
      {
        order: 1,
        title: "Clear",
        description: "Base work",
        fromDay: 1,
        toDay: 2,
        drills: 2,
        xp: 30,
      },
    ]);
    expect(d!.dayOne).toEqual([{ title: "Drill 1", measurement: "Executive Scan", xp: 15 }]);
    expect(d!.product?.pricePaise).toBe(99900);
    expect(JSON.stringify(d)).not.toContain("SECRET_VIDEO_REF");
    expect(await api.$transaction((tx) => getLanding(tx, `draft-${tag}`))).toBeNull();
  });

  it("the coach block is config: a new row from now, audited (rolled back after)", async () => {
    const audits: unknown[] = [];
    const body = {
      name: "Coach",
      title: "Founder",
      bio: "Bio text",
      stats: [{ value: "10+", label: "years" }],
    };
    const rollback = new Error("rollback");
    await expect(
      service.$transaction(async (tx) => {
        await setCoach(tx, body, async (e) => void audits.push(e));
        expect(await getCoach(tx)).toEqual(body);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect(audits).toHaveLength(1);
  });
});
