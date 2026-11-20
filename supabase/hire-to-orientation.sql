-- =====================================================================
-- Evergreen CRM - From pre-screen to hire to orientation (Nov 20, 2026, Melvin: "connect it to orientation").
--   * prescreens.profile_id links the screening file to the new staff account (set when the Administrator
--     gives them access from the pre-screen). Only the Administrator (or the server) can set it.
--   * HR asks for the account with "Hire" (hire_requested_at); the Administrators get an alert.
--   * When the person accepts their offer: their Program Coordinator / Program Manager, HR and the
--     Administrator get an alert that orientation is starting.
--   * The screening file's "after clearance" steps follow the real records:
--       Orientation  <- the Evergreen New Staff Orientation certificate is issued
--       Competency   <- the 30-day probation review is completed as "Meets expectations"
--     Independent work stays a sign-off by HR / the Administrator.
-- Run as migration hire_to_orientation on BOTH databases. Safe to re-run.
-- =====================================================================

alter table public.prescreens add column if not exists profile_id uuid references public.profiles(id) on delete set null;
alter table public.prescreens add column if not exists hired_at timestamptz;
alter table public.prescreens add column if not exists hired_by uuid references public.profiles(id);
alter table public.prescreens add column if not exists hire_requested_at timestamptz;
alter table public.prescreens add column if not exists hire_requested_by uuid references public.profiles(id);
create unique index if not exists prescreens_profile_uq on public.prescreens(profile_id) where profile_id is not null;

-- Guard: same rules as before, plus only the Administrator (or the server) links a file to a staff account.
create or replace function public.prescreen_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare r text := prescreen_role();
begin
  if old.link_status = 'Submitted' and (
       new.application is distinct from old.application or new.signature is distinct from old.signature
    or new.signed_name is distinct from old.signed_name or new.signed_at is distinct from old.signed_at
    or new.link_status is distinct from old.link_status
    or new.resume_path is distinct from old.resume_path or new.cover_path is distinct from old.cover_path) then
    raise exception 'A signed prescreen cannot be changed.';
  end if;
  if r = 'interviewer' and (
       new.program is distinct from old.program or new.drives is distinct from old.drives
    or new.gives_meds is distinct from old.gives_meds or new.lived_outside is distinct from old.lived_outside
    or new.post is distinct from old.post or new.file_status is distinct from old.file_status
    or new.restrictions is distinct from old.restrictions or new.token is distinct from old.token
    or new.hire_requested_at is distinct from old.hire_requested_at) then
    raise exception 'Interviewers can only record interviews, reference checks and screening items.';
  end if;
  if r is not null and r <> 'admin' and (new.items -> 'exec') is distinct from (old.items -> 'exec') then
    raise exception 'Only the administrator can sign executive approval.';
  end if;
  if r is not null and r <> 'admin' and (new.profile_id is distinct from old.profile_id or new.hired_at is distinct from old.hired_at
       or new.hired_by is distinct from old.hired_by) then
    raise exception 'Only the Administrator links a screening file to a staff account.';
  end if;
  new.updated_at := now();
  return new;
end $function$;

-- Offer accepted -> orientation is starting: tell the house leaders, HR and the Administrator.
create or replace function public.offer_accepted_orientation()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare who profiles; r record; start_txt text;
begin
  if new.status <> 'Accepted' or old.status = 'Accepted' then return new; end if;
  select * into who from profiles where id = new.profile_id;
  start_txt := case when new.start_date is not null then to_char(new.start_date, 'FMDay, Mon FMDD') else 'their first day' end;
  for r in select distinct x.id from profiles x
            where x.active and x.id <> who.id and (
                  x.role = 'admin' or x.staff_group = 'hr'
               or (x.staff_group is null and coalesce(x.level, 0) in (2, 3)
                   and (x.home_id = who.home_id or exists (select 1 from manager_homes m where m.profile_id = x.id and m.home_id = who.home_id))))
  loop
    perform notify(r.id, '🧭 New hire: ' || who.full_name || ' starts orientation ' || start_txt,
      coalesce(new.position, 'Staff') || ' accepted the offer. Their 6-day orientation and training plan are ready. '
        || 'Check their screening file is GREEN – CLEARED before any shift with people in care.',
      '/orientation/team', 'hire-ori:' || new.id || ':' || r.id);
  end loop;
  perform notify(who.id, '🧭 Your orientation is ready', 'Welcome to Evergreen! Your 6-day orientation starts ' || start_txt || '. Open it to see your first day.',
    '/orientation', 'hire-ori-me:' || new.id);
  return new;
end $function$;
drop trigger if exists offer_accepted_orientation on public.offer_letters;
create trigger offer_accepted_orientation after update of status on public.offer_letters
  for each row execute function public.offer_accepted_orientation();

-- Orientation certificate -> the screening file's Orientation step.
create or replace function public.prescreen_post_from_orientation()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  update prescreens set post = coalesce(post, '{}'::jsonb) || jsonb_build_object('orientation', jsonb_build_object(
      'by', new.signed_off_by, 'by_name', coalesce((select full_name from profiles where id = new.signed_off_by), 'Orientation module'),
      'at', new.completed_at, 'auto', 'Orientation certificate ' || new.certificate_no))
   where profile_id = new.profile_id and (post -> 'orientation') is null;
  return new;
end $function$;
drop trigger if exists prescreen_post_from_orientation on public.orientation_completions;
create trigger prescreen_post_from_orientation after insert on public.orientation_completions
  for each row execute function public.prescreen_post_from_orientation();

-- 30-day probation review "Meets expectations" -> the screening file's Competency step.
create or replace function public.prescreen_post_from_probation()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.review_day = 30 and new.completed_on is not null and new.rating = 'Meets expectations'
     and (old.completed_on is null or old.rating is distinct from new.rating) then
    update prescreens set post = coalesce(post, '{}'::jsonb) || jsonb_build_object('competency', jsonb_build_object(
        'by', new.reviewer_id, 'by_name', coalesce((select full_name from profiles where id = new.reviewer_id), 'Probation review'),
        'at', now(), 'auto', '30-day probation review: meets expectations'))
     where profile_id = new.staff_id and (post -> 'competency') is null;
  end if;
  return new;
end $function$;
drop trigger if exists prescreen_post_from_probation on public.probation_reviews;
create trigger prescreen_post_from_probation after update on public.probation_reviews
  for each row execute function public.prescreen_post_from_probation();

-- HR presses "Hire": the Administrators are asked to give the person access.
create or replace function public.prescreen_request_hire(pid uuid)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare p prescreens; r record;
begin
  if prescreen_role() not in ('admin', 'hr') then raise exception 'Only HR or the Administrator can hire.'; end if;
  select * into p from prescreens where id = pid;
  if p.id is null then raise exception 'Screening file not found.'; end if;
  if p.screen_decision is distinct from 'Passed' then raise exception 'The pre-screen has to pass first.'; end if;
  if p.profile_id is not null then raise exception 'This person already has a staff account.'; end if;
  update prescreens set hire_requested_at = coalesce(hire_requested_at, now()), hire_requested_by = coalesce(hire_requested_by, auth.uid()) where id = pid;
  for r in select id from profiles where active and role = 'admin' loop
    perform notify(r.id, '💼 Hire: ' || p.first_name || coalesce(' ' || p.last_name, '') || ' (' || coalesce(p.application_no, '') || ')',
      'HR is hiring them. Give them access: the form is filled in from their screening file and the offer letter goes out automatically.',
      '/admin?from_ps=' || pid || '#add', 'hire-req:' || pid || ':' || r.id);
  end loop;
  return 'ok';
end $function$;
revoke execute on function public.prescreen_request_hire(uuid) from public, anon;
grant execute on function public.prescreen_request_hire(uuid) to authenticated, service_role;
revoke execute on function public.offer_accepted_orientation(), public.prescreen_post_from_orientation(), public.prescreen_post_from_probation() from public, anon, authenticated;

-- Accepting the offer ticks the onboarding "offer" item (accept_offer sets evg.offer_sign for that one update).
-- The checklist guard blocked it for staff, so the offer could not be accepted once onboarding had started.
create or replace function public.guard_onboarding_item()
returns trigger language plpgsql set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare boss boolean := app_role() in ('admin','manager');
  offer_sign boolean := coalesce(current_setting('evg.offer_sign', true), '') = '1' and new.item_key = 'offer' and old.item_key = 'offer';
begin
  if new.signed_name is distinct from old.signed_name then
    new.signed_at := case when new.signed_name is null then null else now() end;
  elsif new.signed_at is distinct from old.signed_at then
    new.signed_at := old.signed_at;
  end if;
  if not boss and not offer_sign then
    if old.status in ('Verified','N/A') then raise exception 'This item has already been verified.'; end if;
    if new.status not in ('To do','Submitted') then raise exception 'Only a manager can verify items.'; end if;
    if new.section is distinct from old.section or new.item_key is distinct from old.item_key
       or new.title is distinct from old.title or new.due_date is distinct from old.due_date
       or new.profile_id is distinct from old.profile_id or new.onboarding_id is distinct from old.onboarding_id
       or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at
       or new.review_note is distinct from old.review_note or new.training_id is distinct from old.training_id then
      raise exception 'You can only fill in and sign your own items.';
    end if;
  end if;
  return new;
end $function$;
