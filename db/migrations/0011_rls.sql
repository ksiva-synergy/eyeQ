-- Phase 1 · roles, grants and row-level security (plan 5.3).
-- eyeq_api: the athlete's login role. Reads its own rows and published content; writes
-- nothing directly except its own profile, ratings and push tokens; executes the public
-- game functions (SECURITY DEFINER, owned by eyeq_owner).
-- eyeq_service: webhooks, worker, admin. Wider access granted explicitly, never BYPASSRLS.
set role eyeq_owner;

-- ---------------------------------------------------------------- athlete-facing wrappers
create function my_badges() returns jsonb language sql security definer set search_path = public as $$ select badges_for(require_user_id()) $$;
create function my_challenges() returns jsonb language sql security definer set search_path = public as $$ select challenges_for(require_user_id()) $$;
create function my_rewards() returns jsonb language sql security definer set search_path = public as $$ select rewards_for(require_user_id()) $$;
create function my_leaderboard(p_period text default 'week', p_scope text default 'global', p_limit integer default 10) returns jsonb
  language sql security definer set search_path = public as $$ select leaderboard_for(require_user_id(), p_period, p_scope, p_limit) $$;
create function my_entitlements() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'scope', scope, 'scope_id', scope_id, 'source', source, 'status', status,
    'starts_at', starts_at, 'ends_at', ends_at) order by starts_at desc), '[]'::jsonb)
  from entitlements where user_id = require_user_id() and status in ('active', 'grace')
$$;

-- ---------------------------------------------------------------- enable RLS
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','admins','self_ratings','push_tokens','notifications','enrollments','drill_completions','session_completions',
    'xp_ledger','coin_ledger','credit_ledger','freeze_ledger','entitlements','entitlement_events','payment_events','user_stats',
    'user_badges','challenge_progress','leaderboard_weekly','user_items','redemptions','promo_codes','promo_redemptions','audit_log',
    'programs','modules','sessions','drills','session_drills','products','measurement_tags','badges','challenges','reward_items','game_config','rate_limits']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- eyeq_api grants
grant select on measurement_tags, products, programs, modules, sessions, session_drills, badges, challenges, reward_items, game_config, leaderboard_weekly to eyeq_api;
-- rule 5: video_ref never reaches the athlete role as a column
grant select (id, title, thumbnail_url, instructions, target_type, target_value, target_label, rest_seconds, duration_minutes, score_type,
  score_direction, score_unit, xp, measurement_tag, access, ppv_product_id, coin_price, min_level, status, video_provider, created_at, updated_at) on drills to eyeq_api;
grant select on profiles, user_stats, self_ratings, push_tokens, enrollments, drill_completions, session_completions,
  xp_ledger, coin_ledger, credit_ledger, freeze_ledger, entitlements, entitlement_events, user_badges, challenge_progress,
  user_items, redemptions, notifications to eyeq_api;
grant update (display_name, sport, playing_level, dob, goal, session_minutes, timezone, visibility, reminder_time,
  notify_daily, notify_streak, notify_challenge, notify_recap, notify_overtaken, onboarded_at) on profiles to eyeq_api;
grant insert on self_ratings to eyeq_api;
grant insert, update, delete on push_tokens to eyeq_api;
grant update (status) on notifications to eyeq_api;    -- in-app feed read state (P1)

-- ---------------------------------------------------------------- eyeq_service grants
grant select, insert, update, delete on measurement_tags, products, programs, modules, sessions, drills, session_drills,
  badges, challenges, reward_items, game_config, promo_codes to eyeq_service;
grant select, insert, update on profiles, admins, self_ratings, push_tokens, notifications, enrollments, redemptions, user_items,
  challenge_progress, promo_redemptions, rate_limits to eyeq_service;
grant delete on push_tokens, rate_limits, admins to eyeq_service;
grant select, insert, update on payment_events to eyeq_service;
grant insert on audit_log to eyeq_service;
grant select on audit_log, user_stats, drill_completions, session_completions, xp_ledger, coin_ledger, credit_ledger, freeze_ledger,
  entitlements, entitlement_events, user_badges, leaderboard_weekly to eyeq_service;
-- Ledgers, entitlements and caches are written only through the functions below.

-- ---------------------------------------------------------------- policies
-- Content: athletes see published content; the service sees everything.
create policy api_read on measurement_tags for select to eyeq_api using (true);
create policy api_read on products for select to eyeq_api using (active);
create policy api_read on programs for select to eyeq_api using (status = 'published');
create policy api_read on modules for select to eyeq_api using (exists (select 1 from programs p where p.id = program_id and p.status = 'published'));
create policy api_read on sessions for select to eyeq_api using (exists (select 1 from programs p where p.id = program_id and p.status = 'published'));
create policy api_read on drills for select to eyeq_api using (status = 'published');
create policy api_read on session_drills for select to eyeq_api using (true);
create policy api_read on badges for select to eyeq_api using (active);
create policy api_read on challenges for select to eyeq_api using (true);
create policy api_read on reward_items for select to eyeq_api using (active);
create policy api_read on game_config for select to eyeq_api using (true);
create policy api_read on leaderboard_weekly for select to eyeq_api using (is_public or user_id = app_user_id());

-- Own rows only.
create policy api_own on profiles for select to eyeq_api using (id = app_user_id());
create policy api_own_update on profiles for update to eyeq_api using (id = app_user_id()) with check (id = app_user_id());
create policy api_own on user_stats for select to eyeq_api using (user_id = app_user_id());
create policy api_own on self_ratings for all to eyeq_api using (user_id = app_user_id()) with check (user_id = app_user_id());
create policy api_own on push_tokens for all to eyeq_api using (user_id = app_user_id()) with check (user_id = app_user_id());
create policy api_own on notifications for all to eyeq_api using (user_id = app_user_id()) with check (user_id = app_user_id());
create policy api_own on enrollments for select to eyeq_api using (user_id = app_user_id());
create policy api_own on drill_completions for select to eyeq_api using (user_id = app_user_id());
create policy api_own on session_completions for select to eyeq_api using (user_id = app_user_id());
create policy api_own on xp_ledger for select to eyeq_api using (user_id = app_user_id());
create policy api_own on coin_ledger for select to eyeq_api using (user_id = app_user_id());
create policy api_own on credit_ledger for select to eyeq_api using (user_id = app_user_id());
create policy api_own on freeze_ledger for select to eyeq_api using (user_id = app_user_id());
create policy api_own on entitlements for select to eyeq_api using (user_id = app_user_id());
create policy api_own on entitlement_events for select to eyeq_api using (exists (select 1 from entitlements e where e.id = entitlement_id and e.user_id = app_user_id()));
create policy api_own on user_badges for select to eyeq_api using (user_id = app_user_id());
create policy api_own on challenge_progress for select to eyeq_api using (user_id = app_user_id());
create policy api_own on user_items for select to eyeq_api using (user_id = app_user_id());
create policy api_own on redemptions for select to eyeq_api using (user_id = app_user_id());

-- Service role: explicit, wide.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','admins','self_ratings','push_tokens','notifications','enrollments','drill_completions','session_completions',
    'xp_ledger','coin_ledger','credit_ledger','freeze_ledger','entitlements','entitlement_events','payment_events','user_stats',
    'user_badges','challenge_progress','leaderboard_weekly','user_items','redemptions','promo_codes','promo_redemptions','audit_log',
    'programs','modules','sessions','drills','session_drills','products','measurement_tags','badges','challenges','reward_items','game_config','rate_limits']
  loop
    execute format('create policy service_all on %I for all to eyeq_service using (true) with check (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- function execute grants
grant execute on function app_user_id(), require_user_id(), local_date(timestamptz, text), local_time(timestamptz, text),
  local_day_start(date, text), ist_week_start(timestamptz), round_half_up(numeric), config_value(text, timestamptz),
  config_int(text, timestamptz), config_num(text, timestamptz), config_text(text, timestamptz),
  level_threshold(integer, timestamptz), level_for_xp(integer, timestamptz), rank_title(integer, timestamptz), level_progress(integer, timestamptz),
  streak_multiplier(integer, timestamptz), multiplier_bonus(integer, integer, timestamptz), drill_xp(drills, timestamptz),
  check_rate_limit(text, integer, integer)
  to eyeq_api, eyeq_service;

-- Public game functions: the athlete acts only as app.user_id.
grant execute on function todays_session(), enroll(uuid), complete_drill(uuid, uuid, timestamptz, numeric, numeric, text),
  get_drill_media(uuid, uuid), purchase_reward(uuid, uuid), home_payload(), progress_payload(),
  my_badges(), my_challenges(), my_rewards(), my_leaderboard(text, text, integer), my_entitlements()
  to eyeq_api;

-- Service: internal and job functions.
grant execute on function
  ensure_user_stats(uuid), coin_balance(uuid), credit_balance(uuid), freezes_held(uuid), freezes_held_at(uuid, date), total_xp(uuid),
  user_timezone(uuid), user_local_date(uuid, timestamptz), award_xp(uuid, integer, text, uuid, date, timestamptz), daily_capped_xp(uuid, date),
  streak_days(uuid), streak_run(uuid, date), current_streak(uuid, date), best_streak(uuid), recompute_streak(uuid, date), settle_missed_days(uuid, date),
  has_active_subscription(uuid, timestamptz), has_entitlement(uuid, text, uuid, timestamptz), has_access(uuid, text, uuid, timestamptz),
  entitlement_snapshot(entitlements),
  grant_entitlement(uuid, text, uuid, text, timestamptz, timestamptz, text, uuid, uuid, text),
  set_entitlement_status(uuid, text, text, text, timestamptz, uuid, uuid), end_entitlement(uuid, text, timestamptz, uuid, uuid, boolean),
  spend_coins(uuid, integer, text, uuid), earn_coins(uuid, integer, text, uuid), spend_credits(uuid, integer, text, uuid),
  add_freeze(uuid, text, date, uuid, timestamptz), grant_subscriber_freezes(date, timestamptz),
  free_drill_of_day(date), session_drill_list(uuid, uuid, date), module_complete(uuid, uuid), module_unlocked(uuid, uuid, enrollments, date),
  session_xp_preview(uuid, uuid, date, timestamptz), todays_session_for(uuid, date, timestamptz), enroll_for(uuid, uuid, timestamptz),
  metric_value(uuid, jsonb, timestamptz, timestamptz, timestamptz), metric_target(jsonb), rule_satisfied(numeric, jsonb), module_session_count(uuid), goal_target(jsonb),
  award_badge(uuid, uuid, timestamptz), evaluate_badges(uuid, text, timestamptz), badges_for(uuid, timestamptz),
  challenge_row(challenges, challenge_progress, timestamptz), update_challenge_progress(uuid, timestamptz), challenges_for(uuid, timestamptz),
  complete_drill_for(uuid, uuid, uuid, timestamptz, numeric, numeric, text, timestamptz),
  get_drill_media_for(uuid, uuid, uuid, timestamptz), purchase_reward_for(uuid, uuid, uuid, timestamptz), rewards_for(uuid, timestamptz),
  streak_state_for(uuid, timestamptz), weekly_rank_for(uuid, text, timestamptz), home_payload_for(uuid, timestamptz), progress_payload_for(uuid, timestamptz),
  leaderboard_compute(timestamptz), leaderboard_refresh(timestamptz), rank_day_snapshot(timestamptz), leaderboard_for(uuid, text, text, integer, timestamptz),
  streak_close(timestamptz), week_rollover(timestamptz), entitlement_expiry(timestamptz),
  enqueue_notification(uuid, text, date, text, jsonb, text), enqueue_notifications(timestamptz),
  rebuild_user_stats(uuid), rebuild_all_user_stats(), rebuild_leaderboards(timestamptz), is_admin(uuid), is_minor(date, date)
  to eyeq_service;

reset role;
