-- =====================================================================
-- Evergreen CRM - Board of Directors' welcome message after orientation (Nov 10, 2026).
--   * When a person's orientation is complete, the Board's message (/orientation/welcome) opens the next time
--     they open the portal, and stays first until they accept it.
--   * The acceptance is recorded once, with its date, on the person's orientation completion.
--   * orientation_status() now also says whether the message has been accepted.
-- Needs orientation-path.sql. Run as migration orientation_welcome. Safe to re-run.
-- =====================================================================

alter table public.orientation_completions add column if not exists welcome_ack_at timestamptz;

-- The signed-in person accepts the message for themselves. The first acceptance date is kept.
create or replace function public.orientation_welcome_ack()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t timestamptz;
begin
  if me is null then raise exception 'Please sign in first.'; end if;
  update orientation_completions set welcome_ack_at = coalesce(welcome_ack_at, now())
   where profile_id = me returning welcome_ack_at into t;
  if t is null then raise exception 'Your orientation is not complete yet.'; end if;
  return jsonb_build_object('ok', true, 'at', t);
end $$;

-- Small summary for the Home tile (same as before, plus welcome_ack / welcome_ack_at when complete).
create or replace function public.orientation_status(p uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare who uuid := coalesce(p, auth.uid()); n_total int; n_done int; cur int; c orientation_completions;
begin
  if who is null or not orientation_can_view(who) then return null; end if;
  select * into c from orientation_completions where profile_id = who;
  if c.profile_id is not null then
    return jsonb_build_object('active', false, 'complete', true, 'certificate_no', c.certificate_no, 'completed_at', c.completed_at,
                              'welcome_ack', c.welcome_ack_at is not null, 'welcome_ack_at', c.welcome_ack_at);
  end if;
  if not exists (select 1 from onboardings where profile_id = who)
     and not exists (select 1 from orientation_progress where profile_id = who) then
    return jsonb_build_object('active', false, 'complete', false);
  end if;
  select count(*) filter (where x.kind <> 'lunch'), count(*) filter (where x.kind <> 'lunch' and x.done),
         min(x.day_number) filter (where not x.done)
    into n_total, n_done, cur from orientation_plan_for(who) x;
  return jsonb_build_object('active', true, 'complete', false, 'total', n_total, 'done', n_done, 'day', coalesce(cur, 6));
end $$;

revoke execute on function public.orientation_welcome_ack(), public.orientation_status(uuid) from public, anon;
grant execute on function public.orientation_welcome_ack(), public.orientation_status(uuid) to authenticated, service_role;
