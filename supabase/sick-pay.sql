-- =====================================================================
-- Evergreen CRM - 🤒 Sick: choose how a missed shift is paid. Safe to run more than once. Run after attendance.sql.
--
-- BC Employment Standards Act (checked Oct 26, 2026): after 90 days of employment, 5 PAID sick days a year
-- (plus 3 unpaid, job-protected). The year is the CALENDAR year (resets January 1). Unused days do not carry
-- over and are not paid out.
--
--  · When staff call in sick they choose: "BC paid sick day" (takes one day off this year's 5) or
--    "Other": unpaid sick day, vacation or banked time. Family emergency / other reasons: unpaid, vacation or banked.
--  · Several shifts on the same date count as ONE sick day.
--  · If the 5 paid days are used up, or the person hasn't worked 90 days yet, the day is recorded as an unpaid
--    sick day and they are told why.
--  · Payroll and leaders see paid / unpaid sick days, vacation and banked time per person on the Attendance page.
-- =====================================================================

alter table shift_absences add column if not exists pay_type text;
alter table shift_absences add column if not exists hours    numeric(5,2);
alter table shift_absences drop constraint if exists shift_absences_pay_type_check;
alter table shift_absences add constraint shift_absences_pay_type_check
  check (pay_type is null or pay_type in ('BC paid sick', 'Unpaid sick', 'Vacation', 'Banked time', 'Unpaid'));
create index if not exists shift_absences_paid_sick on shift_absences (profile_id, shift_date) where pay_type = 'BC paid sick';

-- My BC paid sick days for a calendar year: used, left, and whether I'm eligible yet (90 days after hire).
create or replace function sick_balance(p_profile uuid default null, p_year int default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pid uuid := coalesce(p_profile, auth.uid()); y int := coalesce(p_year, extract(year from (now() at time zone evg_tz()))::int);
  used int; hire date; elig date;
begin
  if pid is distinct from auth.uid() and not (coalesce(app_level(), 0) >= 3 and app_group() is null) and coalesce(app_group(), '') <> 'payroll'
     and not (coalesce(app_level(), 0) = 2 and app_group() is null and (select home_id from profiles where id = pid) = app_home()) then
    raise exception 'Not allowed.';
  end if;
  select count(distinct shift_date) into used from shift_absences
   where profile_id = pid and pay_type = 'BC paid sick' and status = 'Called in' and extract(year from shift_date) = y;
  select hire_date into hire from staff_details where profile_id = pid;
  elig := hire + 90;
  return jsonb_build_object('year', y, 'paid_total', 5, 'paid_used', used, 'paid_left', greatest(0, 5 - used),
    'hire_date', hire, 'eligible_from', elig, 'eligible', hire is null or elig <= (now() at time zone evg_tz())::date,
    'unpaid_sick', (select count(distinct shift_date) from shift_absences where profile_id = pid and pay_type = 'Unpaid sick' and status = 'Called in' and extract(year from shift_date) = y));
end $$;
grant execute on function sick_balance(uuid, int) to authenticated;

-- Can't make my shift — now with how it's paid.
drop function if exists cant_make_shift(uuid, text, text, date);
create or replace function cant_make_shift(p_shift uuid, p_kind text, p_note text default null, p_until date default null, p_pay text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profiles; first shifts; s shifts; n int := 0; hrs numeric; min_hrs numeric; who text; pay text; want text;
  hire date; used int; converted int := 0; paid int := 0; why_unpaid text;
begin
  select * into me from profiles where id = auth.uid() and active;
  if me.id is null then raise exception 'Please sign in again.'; end if;
  if p_kind not in ('Sick', 'Family emergency', 'Other') then raise exception 'Choose a reason: sick, family emergency or other.'; end if;
  want := coalesce(p_pay, case when p_kind = 'Sick' then 'BC paid sick' else 'Unpaid' end);
  if want not in ('BC paid sick', 'Unpaid sick', 'Vacation', 'Banked time', 'Unpaid') then raise exception 'Choose how this is paid.'; end if;
  if want = 'BC paid sick' and p_kind <> 'Sick' then raise exception 'BC paid sick days are only for when you are sick. Choose unpaid, vacation or banked time.'; end if;
  if want = 'Unpaid sick' and p_kind <> 'Sick' then want := 'Unpaid'; end if;
  select * into first from shifts where id = p_shift and profile_id = me.id;
  if first.id is null then raise exception 'That shift is not yours (it may already have been covered).'; end if;
  if p_until is not null and (p_until < first.shift_date or p_until > first.shift_date + 14) then raise exception 'Choose an end date within 14 days.'; end if;
  select hire_date into hire from staff_details where profile_id = me.id;
  for s in select * from shifts x where x.profile_id = me.id
             and (x.id = first.id or (p_until is not null and x.shift_date between first.shift_date and p_until))
             and shift_end_ts(x.shift_date, x.start_time, x.end_time) > now()
             and not exists (select 1 from time_entries t where t.shift_id = x.id)
           order by x.shift_date, x.start_time for update loop
    hrs := round((extract(epoch from (shift_start_ts(s.shift_date, s.start_time) - now())) / 3600)::numeric, 1);
    min_hrs := least(coalesce(min_hrs, hrs), hrs);
    pay := want;
    if pay = 'BC paid sick' then
      if hire is not null and hire + 90 > s.shift_date then
        pay := 'Unpaid sick'; why_unpaid := 'BC paid sick days start after 90 days of work (from ' || to_char(hire + 90, 'Mon DD') || ')';
      elsif not exists (select 1 from shift_absences a where a.profile_id = me.id and a.pay_type = 'BC paid sick' and a.status = 'Called in' and a.shift_date = s.shift_date) then
        select count(distinct shift_date) into used from shift_absences
         where profile_id = me.id and pay_type = 'BC paid sick' and status = 'Called in' and extract(year from shift_date) = extract(year from s.shift_date);
        if used >= 5 then pay := 'Unpaid sick'; why_unpaid := 'all 5 BC paid sick days for ' || extract(year from s.shift_date) || ' are used'; end if;
      end if;
      if pay = 'BC paid sick' then paid := paid + 1; else converted := converted + 1; end if;
    end if;
    insert into shift_absences (shift_id, profile_id, home_id, shift_date, shift_label, starts_at, kind, status, hours_notice, note, pay_type, hours)
    values (s.id, me.id, s.home_id, s.shift_date, s.label, shift_start_ts(s.shift_date, s.start_time), p_kind, 'Called in', hrs, left(nullif(trim(p_note), ''), 300),
            pay, round((extract(epoch from (shift_end_ts(s.shift_date, s.start_time, s.end_time) - shift_start_ts(s.shift_date, s.start_time))) / 3600)::numeric, 2))
    on conflict do nothing;
    update shifts set profile_id = null, offered = false, offered_note = null, source = 'changed',
      open_reason = 'Called in (' || lower(p_kind) || ')', cover_needed_at = now(), cover_all_at = null, cover_pm_at = null, cover_doo_at = null
     where id = s.id;
    update shift_pickups set status = 'Cancelled' where shift_id = s.id and status = 'Pending';
    who := me.full_name || ' called in (' || lower(p_kind) || ')' || case when hrs < 4 then ' · less than 4 hours’ notice' else '' end;
    perform notify_now(l, '📞 Can’t make shift: ' || shift_words(s.id), who || '. The shift is open now — staff who can take it were told.',
                       '/attendance', 'cin:' || s.id || ':' || l)
      from house_leaders(s.home_id) l;
    perform offer_cover(s.id, false);
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'That shift has already started or ended. Phone the on-call supervisor.'; end if;
  return jsonb_build_object('shifts', n, 'hours_notice', min_hrs, 'pay', want, 'paid_days', paid, 'made_unpaid', converted, 'why_unpaid', why_unpaid,
    'balance', sick_balance(me.id, null),
    'on_call_phone', (select on_call_phone from homes where id = first.home_id),
    'house', (select name from homes where id = first.home_id));
end $$;
grant execute on function cant_make_shift(uuid, text, text, date, text) to authenticated;

-- Check
select 'sick pay ready' as result, (select count(*) from pg_proc where proname = 'cant_make_shift') as cant_make_shift_versions;
