-- =====================================================================
-- Evergreen CRM - Automatic offer letters and the pay rate table (Nov 11, 2026).
--   * pay_rates: one hourly pay rate per position, set once by the Executive Director, CSO, CEO or Administrator.
--   * staff_details.hours_per_week: the hours a person is hired for (full-time 36, part-time 20 if left blank).
--   * auto_offer(person): when a coordinator (their own house), a manager or HR saves a person's position,
--     full-time / part-time, hours and start date, the offer letter is written and sent to the person to sign.
--     It is signed "Evergreen Community Care Inc., Human Resources" (no personal name). The same letter is used
--     for MCFD and CLBC. If the position has no pay rate yet, the letter waits as a draft and is sent the moment
--     the rate is saved (set_pay_rate).
--   * Program Coordinators can read the offer letters of staff in their own house.
-- Needs offer-letters.sql, staff-file-access.sql. Run as migration auto_offer. Safe to re-run.
-- =====================================================================

alter table public.staff_details add column if not exists hours_per_week numeric;
do $$ begin
  alter table public.staff_details add constraint staff_details_hours_check check (hours_per_week is null or (hours_per_week > 0 and hours_per_week <= 60));
exception when duplicate_object then null; end $$;

alter table public.offer_letters add column if not exists auto boolean not null default false;

-- ---------- Pay rates ----------
create table if not exists public.pay_rates (
  id          uuid primary key default gen_random_uuid(),
  position    text not null,
  hourly_rate numeric(8,2) check (hourly_rate is null or hourly_rate > 0),
  sort        int not null default 100,
  active      boolean not null default true,
  updated_by  uuid references public.profiles,
  updated_at  timestamptz not null default now()
);
create unique index if not exists pay_rates_position_key on public.pay_rates (lower(position));
alter table public.pay_rates enable row level security;

-- Read: Administrator, HR, Payroll, Program Managers and above. Changes only through set_pay_rate().
drop policy if exists "pay rates see" on public.pay_rates;
create policy "pay rates see" on public.pay_rates for select using (
  app_role() = 'admin' or coalesce(app_group(), '') in ('hr', 'payroll') or coalesce(app_level(), 0) >= 3);

drop trigger if exists audit_pay_rates on public.pay_rates;
create trigger audit_pay_rates after insert or update or delete on public.pay_rates for each row execute function write_audit();

insert into public.pay_rates (position, sort) values
  ('Youth Worker', 10), ('Support Worker I', 20), ('Support Worker II', 30), ('Senior / Lead Support Worker', 40),
  ('Program Coordinator', 50), ('Program Manager', 60)
on conflict do nothing;

-- The position names for the drop-down (no rates): anyone who may set up a person's job.
create or replace function public.pay_positions()
returns setof text language sql stable security definer set search_path = public as $$
  select position from pay_rates
   where active and auth.uid() is not null and (app_role() = 'admin' or coalesce(app_level(), 0) >= 2)
   order by sort, position
$$;

-- ---------- Offer letters: coordinators read their own house's ----------
drop policy if exists offers_read on public.offer_letters;
create policy offers_read on public.offer_letters for select using (
  profile_id = auth.uid() or can_manage_person(profile_id)
  or (coalesce(app_level(), 0) = 2 and coalesce(app_group(), '') = '' and staff_in_my_houses(profile_id)));

-- Internal: sign an automatic draft for Evergreen (no personal name) and send it to the person.
create or replace function public.offer_auto_send(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare o offer_letters;
begin
  select * into o from offer_letters where id = p_id;
  if o.id is null or not o.auto or o.status <> 'Draft' or o.wage is null or o.start_date is null then return false; end if;
  update offer_letters set status = 'Sent', issued_by = o.created_by, issued_by_name = 'Evergreen Community Care Inc.',
         issued_by_title = 'Human Resources', issued_at = now()
   where id = p_id;
  perform notify(o.profile_id, 'Your offer letter is ready to sign',
    'Evergreen Community Care has sent you an offer of employment as ' || o.position || '. Please read and sign it.',
    '/offer/' || p_id, 'offer:' || p_id);
  return true;
end $$;
revoke execute on function public.offer_auto_send(uuid) from public, anon, authenticated;

-- Called after a person's job details are saved. Returns {status, id}:
--   sent | waiting_rate | unchanged | skipped (with why).
create or replace function public.auto_offer(p_profile uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d staff_details; p profiles; o offer_letters;
  rate numeric; hrs numeric; hours_text text; house text; reports text; new_id uuid; r record;
begin
  if me is null then raise exception 'Please sign in first.'; end if;
  if p_profile = me then return jsonb_build_object('status', 'skipped', 'why', 'own'); end if;
  if not (app_role() = 'admin' or coalesce(app_group(), '') = 'hr'
       or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
       or (coalesce(app_level(), 0) in (2, 3) and coalesce(app_group(), '') = '' and staff_in_my_houses(p_profile))) then
    raise exception 'You can only set this up for staff in your own house.';
  end if;
  select * into d from staff_details where profile_id = p_profile;
  select * into p from profiles where id = p_profile;
  if p.id is null or not p.active then return jsonb_build_object('status', 'skipped', 'why', 'inactive'); end if;
  if d.profile_id is null or d.position is null or d.hire_date is null
     or d.employment_type is null or d.employment_type not in ('Full-time', 'Part-time') then
    return jsonb_build_object('status', 'skipped', 'why', 'incomplete');
  end if;

  hrs := coalesce(d.hours_per_week, case d.employment_type when 'Full-time' then 36 else 20 end);
  hours_text := (case when hrs = trunc(hrs) then trunc(hrs)::text else round(hrs, 1)::text end)
                || ' hours per week (' || lower(d.employment_type) || ')';
  select hourly_rate into rate from pay_rates where lower(position) = lower(d.position) and active;

  select * into o from offer_letters where profile_id = p_profile and status in ('Draft', 'Sent', 'Accepted')
   order by created_at desc limit 1;
  if o.id is not null and o.position = d.position and o.employment_type is not distinct from d.employment_type
     and o.hours is not distinct from hours_text and (o.status = 'Accepted' or o.start_date is not distinct from d.hire_date) then
    -- Same terms. A waiting draft goes out as soon as there is a rate.
    if o.status = 'Draft' and o.auto and o.wage is null and rate is not null then
      update offer_letters set wage = rate where id = o.id;
      perform offer_auto_send(o.id);
      return jsonb_build_object('status', 'sent', 'id', o.id);
    end if;
    return jsonb_build_object('status', case when o.status = 'Draft' and o.wage is null then 'waiting_rate' else 'unchanged' end, 'id', o.id, 'offer_status', o.status);
  end if;
  if o.id is not null and o.status in ('Draft', 'Sent') then
    -- Never touch a letter someone wrote by hand.
    if not o.auto then return jsonb_build_object('status', 'skipped', 'why', 'manual', 'id', o.id); end if;
    update offer_letters set status = 'Withdrawn', withdrawn_at = now() where id = o.id;
  end if;

  select name into house from homes where id = p.home_id;
  reports := case when p.role = 'admin' then null
                  when coalesce(p.staff_group, '') <> '' then null
                  when coalesce(p.level, 1) = 1 then 'Program Coordinator'
                  when p.level = 2 then 'Program Manager'
                  when p.level = 3 then 'Director of Operations' else null end;
  insert into offer_letters (profile_id, position, employment_type, wage, wage_unit, hours, start_date, house, reports_to, respond_by, created_by, auto)
  values (p_profile, d.position, d.employment_type, rate, 'hour', hours_text, d.hire_date, house, reports,
          (now() at time zone 'Etc/GMT+7')::date + 7, me, true)
  returning id into new_id;

  if rate is not null then
    perform offer_auto_send(new_id);
    return jsonb_build_object('status', 'sent', 'id', new_id);
  end if;
  -- No pay rate for this position yet: tell the people who set rates.
  for r in select id from profiles where active and (role = 'admin' or (coalesce(level, 0) >= 5 and coalesce(staff_group, '') = '')) loop
    perform notify(r.id, 'Offer letter waiting for a pay rate',
      p.full_name || '''s offer letter (' || d.position || ') is ready but this position has no pay rate yet. Set it and the letter is sent automatically.',
      '/hr/pay-rates', 'offer-rate:' || new_id || ':' || r.id);
  end loop;
  return jsonb_build_object('status', 'waiting_rate', 'id', new_id);
end $$;

-- Set (or add) a position's hourly rate. Sends any automatic offer letters that were waiting for it.
create or replace function public.set_pay_rate(p_position text, p_rate numeric, p_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pos text := nullif(trim(regexp_replace(coalesce(p_position, ''), '\s+', ' ', 'g')), ''); r record; sent uuid[] := '{}';
begin
  if not (app_role() = 'admin' or (coalesce(app_level(), 0) >= 5 and coalesce(app_group(), '') = '')) then
    raise exception 'Only the Executive Director, CSO, CEO or Administrator can set pay rates.';
  end if;
  if pos is null or length(pos) > 80 then raise exception 'Enter the position name.'; end if;
  if p_rate is not null and (p_rate <= 0 or p_rate > 500) then raise exception 'Enter an hourly rate between $1 and $500.'; end if;
  update pay_rates set hourly_rate = p_rate, active = coalesce(p_active, true), updated_by = auth.uid(), updated_at = now()
   where lower(position) = lower(pos);
  if not found then
    insert into pay_rates (position, hourly_rate, active, updated_by) values (pos, p_rate, coalesce(p_active, true), auth.uid());
  end if;
  if p_rate is not null and coalesce(p_active, true) then
    for r in select id from offer_letters where auto and status = 'Draft' and wage is null and lower(position) = lower(pos) loop
      update offer_letters set wage = p_rate where id = r.id;
      if offer_auto_send(r.id) then sent := sent || r.id; end if;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'sent', to_jsonb(sent));
end $$;

revoke execute on function public.pay_positions(), public.auto_offer(uuid), public.set_pay_rate(text, numeric, boolean) from public, anon;
grant execute on function public.pay_positions(), public.auto_offer(uuid), public.set_pay_rate(text, numeric, boolean) to authenticated, service_role;
