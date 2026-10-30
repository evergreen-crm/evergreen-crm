-- Rules that were run straight on the live database on Oct 28, 2026, saved here so a rebuilt
-- database (for example the test site) gets the same rules. Copied from the live database on Oct 30.
-- Run AFTER time-off-chain.sql, entry-versions.sql, assigned-home-scope-fix.sql and incident-alert.sql.
-- Live migrations covered: time_off_notify_next_approver, time_off_notify_fix, time_off_visibility_directors,
-- fill_vacancy_before_approval, entry_correction_rules, entries_edit_window_one_day,
-- coordinators_managers_edit_house_ceo_sees_all, alerts_restraint_illness_and_frontline_read.

-- 1. Time-off chain: who is told about a request.
--    Frontline -> house PC and the house's PM. PC -> house PM (or a director if the house has no PM).
--    PM -> directors (level 4+). Directors -> CEO (level 7+).
create or replace function public.time_off_approvers(p_req uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with rq as (select p.id, p.home_id, p.staff_group, case when p.role = 'admin' then 8 else coalesce(p.level, 1) end as lv from profiles p where p.id = p_req),
  house_pm as (select a.id from profiles a, rq where a.active and a.level = 3 and a.staff_group is null
               and (a.home_id = rq.home_id or exists (select 1 from manager_homes m where m.profile_id = a.id and m.home_id = rq.home_id)))
  select a.id from profiles a, rq
  where a.active and a.id <> rq.id and (
       (rq.lv >= 4 and a.level >= 7)
    or (rq.lv = 3 and a.level >= 4)
    or (rq.lv = 2 and (a.id in (select id from house_pm)
                       or (a.level between 4 and 6 and not exists (select 1 from house_pm))))
    or (rq.lv <= 1 and a.id in (select id from house_pm))
    or (rq.lv <= 1 and a.level = 2 and a.staff_group is null and a.home_id = rq.home_id)
  );
$$;

create or replace function public.request_time_off(p_start date, p_end date, p_kind text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me profiles; rid uuid;
begin
  select * into me from profiles where id = auth.uid() and active;
  if p_end < p_start then raise exception 'The last day is before the first day.'; end if;
  if p_start < current_date and p_kind <> 'Sick' then raise exception 'Pick dates from today on.'; end if;
  insert into time_off_requests (profile_id, start_date, end_date, kind, note) values (me.id, p_start, p_end, p_kind, left(p_note, 500)) returning id into rid;
  perform notify(l, '🌴 Time off to approve: ' || me.full_name,
                 p_kind || ' · ' || to_char(p_start, 'Mon DD') || case when p_end > p_start then ' – ' || to_char(p_end, 'Mon DD') else '' end
                 || case when p_start < current_date + 28 and p_kind in ('Vacation', 'Personal') then ' · less than 4 weeks’ notice' else '' end,
                 '/schedule?tab=timeoff', 'tor:' || rid || ':' || l)
    from time_off_approvers(me.id) l;
  return rid;
end $$;

-- 2. Directors (level 4+), CEO and Admin see every time-off request; PCs and PMs see their homes'.
drop policy if exists "timeoff see" on public.time_off_requests;
create policy "timeoff see" on public.time_off_requests for select using (
  profile_id = auth.uid()
  or app_role() = 'admin'
  or app_level() >= 4
  or (coalesce(app_level(), 0) >= 2 and exists (select 1 from profiles p where p.id = time_off_requests.profile_id and app_sees_home(p.home_id)))
);

-- 3. Vacation is approved only after the person's shifts in those dates are filled.
create or replace function public.fill_vacancy(p_shift uuid, p_profile uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s shifts; why text;
begin
  select * into s from shifts where id = p_shift;
  if s.id is null then raise exception 'That shift no longer exists.'; end if;
  if not can_schedule(s.home_id) then raise exception 'Only the house’s Program Coordinator or a Program Manager can fill shifts.'; end if;
  if p_profile is null then raise exception 'Pick the person who will cover this shift.'; end if;
  why := shift_fit(p_profile, p_shift);
  if why is not null then raise exception '%', why; end if;
  update shifts set profile_id = p_profile, offered = false, offered_note = null, open_reason = null, source = 'changed' where id = p_shift;
  perform notify(p_profile, '📅 You are scheduled: ' || to_char(s.shift_date, 'Dy Mon DD') || ' ' || coalesce(s.label, ''),
                 to_char(s.start_time, 'HH24:MI') || ' – ' || to_char(s.end_time, 'HH24:MI'), '/schedule?tab=mine', 'fill:' || p_shift || ':' || p_profile);
end $$;

create or replace function public.decide_time_off(p_id uuid, p_approve boolean, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare r time_off_requests; them profiles; left_n int;
begin
  select * into r from time_off_requests where id = p_id;
  select * into them from profiles where id = r.profile_id;
  if r.profile_id = auth.uid() then
    if p_approve then raise exception 'You can’t approve your own time off.'; end if;
    update time_off_requests set status = 'Cancelled' where id = p_id and status = 'Pending'; return 0;
  end if;
  if not can_approve_time_off(r.profile_id) then raise exception 'This request is decided by the next person up the chain.'; end if;
  if r.status <> 'Pending' then raise exception 'This request was already %.', lower(r.status); end if;
  if p_approve then
    select count(*) into left_n from shifts where profile_id = r.profile_id and shift_date between greatest(r.start_date, current_date) and r.end_date;
    if left_n > 0 then raise exception 'Fill the % vacant shift(s) in these dates first, then approve.', left_n; end if;
  end if;
  update time_off_requests set status = case when p_approve then 'Approved' else 'Declined' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 300) where id = p_id;
  perform notify(r.profile_id, case when p_approve then '✅ Time off approved' else '⛔ Time off not approved' end,
                 to_char(r.start_date, 'Mon DD') || case when r.end_date > r.start_date then ' – ' || to_char(r.end_date, 'Mon DD') else '' end
                 || coalesce(' — ' || nullif(trim(p_note), ''), ''), '/schedule?tab=timeoff', 'tod:' || p_id);
  return 0;
end $$;

-- 4. Who can correct a record: Admin always; coordinators and managers in their assigned homes and
--    directors and up everywhere (section grid 'ind'); frontline staff their own entries for 1 day.
update section_access set level = 'assigned' where role = 'pm' and section = 'ind';
update section_access set level = 'all' where role = 'dir' and section = 'adm';
update section_access set level = 'read' where section = 'ind' and role = 'fr';

drop policy if exists "entries edit" on entries;
create policy "entries edit" on entries for update using (
  app_role() = 'admin'
  or app_scope_write('ind', home_id)
  or (created_by = auth.uid() and created_at > now() - interval '1 day')
) with check (
  app_role() = 'admin'
  or app_scope_write('ind', home_id)
  or (created_by = auth.uid() and created_at > now() - interval '1 day')
);
