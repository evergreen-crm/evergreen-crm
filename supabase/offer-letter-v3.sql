-- Offer letter version 3 (Nov 16 2026): the full employment agreement, worded for the person's program stream
-- (MCFD children and youth, CLBC adults, or both), with key dates worked out from the start date, and the wage taken
-- from Evergreen's yearly wage grid (BC community social services JJEP grid as the benchmark).
--
--   wage_grid      one row per effective date, grid level and step (hourly rate). A new year's grid is added
--                  with a new effective date; older grids stay for history. Seen by HR, Payroll, PM and above;
--                  changed only by the Executive Director, CSO, CEO and Administrator (save_wage_grid).
--   pay_rates      each position gets a grid_level. A position with no grid level (e.g. Program Manager) keeps a
--                  fixed hourly_rate.
--   offer_letters  grid_level, wage_steps (step 1, 2, 3 rates) and grid_effective are copied in when the letter is
--                  made, so a sent or signed letter never changes. New letters are terms version 3.

create table if not exists public.wage_grid (
  effective_date date not null,
  grid_level     int  not null check (grid_level between 1 and 40),
  step           int  not null check (step between 1 and 6),
  hourly_rate    numeric(8,2) not null check (hourly_rate > 0 and hourly_rate < 500),
  updated_by     uuid references profiles(id),
  updated_at     timestamptz not null default now(),
  primary key (effective_date, grid_level, step)
);
alter table public.wage_grid enable row level security;
drop policy if exists "wage grid see" on public.wage_grid;
create policy "wage grid see" on public.wage_grid for select using (
  app_role() = 'admin' or coalesce(app_group(), '') in ('hr', 'payroll') or coalesce(app_level(), 0) >= 3);
drop trigger if exists audit_wage_grid on public.wage_grid;
create trigger audit_wage_grid after insert or update or delete on public.wage_grid for each row execute function write_audit();

-- CSSEA JJEP wage grid effective November 21, 2026 (3 steps: 0-2,000 / 2,001-4,000 / 4,001+ hours).
insert into public.wage_grid (effective_date, grid_level, step, hourly_rate) values
  ('2026-11-21', 9, 1, 28.04), ('2026-11-21', 9, 2, 29.52), ('2026-11-21', 9, 3, 31.04),
  ('2026-11-21',10, 1, 28.53), ('2026-11-21',10, 2, 30.04), ('2026-11-21',10, 3, 31.64),
  ('2026-11-21',11, 1, 30.22), ('2026-11-21',11, 2, 31.86), ('2026-11-21',11, 3, 33.54),
  ('2026-11-21',12, 1, 32.02), ('2026-11-21',12, 2, 33.75), ('2026-11-21',12, 3, 35.52),
  ('2026-11-21',13, 1, 33.70), ('2026-11-21',13, 2, 35.59), ('2026-11-21',13, 3, 37.44),
  ('2026-11-21',14, 1, 37.03), ('2026-11-21',14, 2, 39.09), ('2026-11-21',14, 3, 41.13),
  ('2026-11-21',15, 1, 40.59), ('2026-11-21',15, 2, 42.86), ('2026-11-21',15, 3, 45.04),
  ('2026-11-21',16, 1, 44.00), ('2026-11-21',16, 2, 46.47), ('2026-11-21',16, 3, 48.83),
  ('2026-11-21',17, 1, 48.32), ('2026-11-21',17, 2, 50.96), ('2026-11-21',17, 3, 53.62),
  ('2026-11-21',18, 1, 51.71), ('2026-11-21',18, 2, 54.59), ('2026-11-21',18, 3, 57.47)
on conflict do nothing;

alter table public.pay_rates add column if not exists grid_level int check (grid_level is null or grid_level between 1 and 40);
update public.pay_rates set grid_level = case lower(position)
  when 'youth worker' then 11 when 'support worker i' then 10 when 'support worker ii' then 11
  when 'senior / lead support worker' then 12 when 'program coordinator' then 14 else grid_level end
 where grid_level is null;

alter table public.offer_letters add column if not exists grid_level int;
alter table public.offer_letters add column if not exists wage_steps numeric[];
alter table public.offer_letters add column if not exists grid_effective date;
alter table public.offer_letters alter column terms_version set default 3;

-- The grid in force on a date: the latest grid that starts on or before it (or the earliest grid if none yet).
create or replace function public.grid_effective_on(p_on date)
returns date language sql stable security definer set search_path = public as $$
  select coalesce((select max(effective_date) from wage_grid where effective_date <= coalesce(p_on, current_date)),
                  (select min(effective_date) from wage_grid))
$$;
create or replace function public.grid_steps(p_level int, p_on date)
returns numeric[] language sql stable security definer set search_path = public as $$
  select array_agg(hourly_rate order by step) from wage_grid
   where grid_level = p_level and effective_date = grid_effective_on(p_on)
$$;

-- Wage terms for a position on a start date: {rate, level, steps, effective}. Grid first, else the fixed rate.
create or replace function public.position_wage(p_position text, p_on date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pr pay_rates; st numeric[]; eff date;
begin
  select * into pr from pay_rates where lower(position) = lower(p_position) and active;
  if pr.id is null then return jsonb_build_object('rate', null); end if;
  if pr.grid_level is not null then
    eff := grid_effective_on(p_on);
    st := grid_steps(pr.grid_level, p_on);
    if st is not null and array_length(st, 1) >= 1 then
      return jsonb_build_object('rate', st[1], 'level', pr.grid_level, 'steps', to_jsonb(st), 'effective', eff);
    end if;
  end if;
  return jsonb_build_object('rate', pr.hourly_rate);
end $$;

-- Save a whole grid for one effective date: p_rows = [{"level":11,"step":1,"rate":30.22}, ...]. Replaces that date's grid.
-- Then sends any automatic offer letters that were waiting for a rate.
create or replace function public.save_wage_grid(p_effective date, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; o record; w jsonb; sent uuid[] := '{}';
begin
  if not (app_role() = 'admin' or (coalesce(app_level(), 0) >= 5 and coalesce(app_group(), '') = '')) then
    raise exception 'Only the Executive Director, CSO, CEO or Administrator can change the wage grid.';
  end if;
  if p_effective is null then raise exception 'Choose the date this grid starts.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'The grid has no rates.'; end if;
  delete from wage_grid where effective_date = p_effective;
  for r in select * from jsonb_array_elements(p_rows) loop
    if (r->>'rate') is null or (r->>'rate') = '' then continue; end if;
    insert into wage_grid (effective_date, grid_level, step, hourly_rate, updated_by)
    values (p_effective, (r->>'level')::int, (r->>'step')::int, round((r->>'rate')::numeric, 2), auth.uid());
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Enter at least one rate.'; end if;
  for o in select id, position, start_date from offer_letters where auto and status = 'Draft' and wage is null loop
    w := position_wage(o.position, o.start_date);
    if (w->>'rate') is not null then
      update offer_letters set wage = (w->>'rate')::numeric, grid_level = (w->>'level')::int,
        wage_steps = case when w ? 'steps' then array(select jsonb_array_elements_text(w->'steps')::numeric) end,
        grid_effective = (w->>'effective')::date where id = o.id;
      if offer_auto_send(o.id) then sent := sent || o.id; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'rates', n, 'sent', to_jsonb(sent));
end $$;

-- Choose a position's grid level (null = use its fixed hourly rate). Sends waiting letters.
create or replace function public.set_pay_grid_level(p_position text, p_level int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o record; w jsonb; sent uuid[] := '{}';
begin
  if not (app_role() = 'admin' or (coalesce(app_level(), 0) >= 5 and coalesce(app_group(), '') = '')) then
    raise exception 'Only the Executive Director, CSO, CEO or Administrator can set pay rates.';
  end if;
  if p_level is not null and (p_level < 1 or p_level > 40) then raise exception 'Choose a grid level between 1 and 40.'; end if;
  update pay_rates set grid_level = p_level, updated_by = auth.uid(), updated_at = now() where lower(position) = lower(p_position);
  if not found then raise exception 'Position not found.'; end if;
  for o in select id, position, start_date from offer_letters where auto and status = 'Draft' and wage is null and lower(position) = lower(p_position) loop
    w := position_wage(o.position, o.start_date);
    if (w->>'rate') is not null then
      update offer_letters set wage = (w->>'rate')::numeric, grid_level = (w->>'level')::int,
        wage_steps = case when w ? 'steps' then array(select jsonb_array_elements_text(w->'steps')::numeric) end,
        grid_effective = (w->>'effective')::date where id = o.id;
      if offer_auto_send(o.id) then sent := sent || o.id; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'sent', to_jsonb(sent));
end $$;

revoke execute on function public.grid_effective_on(date), public.grid_steps(int, date), public.position_wage(text, date),
  public.save_wage_grid(date, jsonb), public.set_pay_grid_level(text, int) from public, anon;
grant execute on function public.save_wage_grid(date, jsonb), public.set_pay_grid_level(text, int) to authenticated, service_role;
grant execute on function public.grid_effective_on(date), public.grid_steps(int, date), public.position_wage(text, date) to service_role;

-- auto_offer: as before, plus the wage from the grid (with its steps), the program stream, and terms version 3.
create or replace function public.auto_offer(p_profile uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me uuid := auth.uid(); d staff_details; p profiles; o offer_letters;
  w jsonb; rate numeric; hrs numeric; hours_text text; v_house text; v_reports text; v_program text; lead_name text; new_id uuid; r record;
  v_steps numeric[]; v_level int; v_eff date;
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
  w := position_wage(d.position, d.hire_date);
  rate := (w->>'rate')::numeric;
  v_level := (w->>'level')::int;
  v_eff := (w->>'effective')::date;
  v_steps := case when w ? 'steps' then array(select jsonb_array_elements_text(w->'steps')::numeric) end;

  select h.name || coalesce(', ' || nullif(btrim(h.address), ''), ''), h.program into v_house, v_program from homes h where h.id = p.home_id;
  v_program := coalesce(case when d.program in ('MCFD', 'CLBC', 'Both') and coalesce(d.program_confirmed, false) then d.program end,
                        case when v_program in ('MCFD', 'CLBC', 'Both') then v_program end,
                        case when d.program in ('MCFD', 'CLBC', 'Both') then d.program end, 'Both');
  v_reports := case when p.role = 'admin' then null
                  when coalesce(p.staff_group, '') <> '' then null
                  when coalesce(p.level, 1) = 1 then 'Program Coordinator'
                  when p.level = 2 then 'Program Manager'
                  when p.level = 3 then 'Director of Operations' else null end;
  if v_reports is not null then
    select x.full_name into lead_name from profiles x
     where x.active and x.id <> p_profile and coalesce(x.staff_group, '') = '' and x.role <> 'admin'
       and x.level = coalesce(p.level, 1) + 1
       and (x.level >= 4 or x.home_id = p.home_id or exists (select 1 from manager_homes m where m.profile_id = x.id and m.home_id = p.home_id))
     order by (x.home_id = p.home_id) desc nulls last, x.created_at limit 1;
    if lead_name is not null then v_reports := v_reports || ': ' || lead_name; end if;
  end if;

  select * into o from offer_letters ol where ol.profile_id = p_profile and ol.status in ('Draft', 'Sent', 'Accepted')
   order by ol.created_at desc limit 1;
  if o.id is not null and o.position = d.position and o.employment_type is not distinct from d.employment_type
     and o.hours is not distinct from hours_text and (o.status = 'Accepted' or o.start_date is not distinct from d.hire_date) then
    if o.auto and o.status in ('Draft', 'Sent') then
      update offer_letters set person_address = nullif(btrim(d.home_address), ''), house = v_house, reports_to = v_reports where id = o.id;
    end if;
    if o.status = 'Draft' and o.auto and o.wage is null and rate is not null then
      update offer_letters set wage = rate, grid_level = v_level, wage_steps = v_steps, grid_effective = v_eff, program = v_program where id = o.id;
      perform offer_auto_send(o.id);
      return jsonb_build_object('status', 'sent', 'id', o.id);
    end if;
    return jsonb_build_object('status', case when o.status = 'Draft' and o.wage is null then 'waiting_rate' else 'unchanged' end, 'id', o.id, 'offer_status', o.status);
  end if;
  if o.id is not null and o.status in ('Draft', 'Sent') then
    if not o.auto then return jsonb_build_object('status', 'skipped', 'why', 'manual', 'id', o.id); end if;
    update offer_letters set status = 'Withdrawn', withdrawn_at = now() where id = o.id;
  end if;

  insert into offer_letters (profile_id, position, program, employment_type, wage, wage_unit, hours, start_date, house, reports_to,
                             person_address, respond_by, created_by, auto, grid_level, wage_steps, grid_effective, terms_version)
  values (p_profile, d.position, v_program, d.employment_type, rate, 'hour', hours_text, d.hire_date, v_house, v_reports,
          nullif(btrim(d.home_address), ''),
          least((now() at time zone 'Etc/GMT+7')::date + 7, greatest((now() at time zone 'Etc/GMT+7')::date + 2, d.hire_date - 1)),
          me, true, v_level, v_steps, v_eff, 3)
  returning id into new_id;

  if rate is not null then
    perform offer_auto_send(new_id);
    return jsonb_build_object('status', 'sent', 'id', new_id);
  end if;
  for r in select id from profiles where active and (role = 'admin' or (coalesce(level, 0) >= 5 and coalesce(staff_group, '') = '')) loop
    perform notify(r.id, 'Offer letter waiting for a pay rate',
      p.full_name || '''s offer letter (' || d.position || ') is ready but this position has no pay rate yet. Set its grid level or rate and the letter is sent automatically.',
      '/hr/pay-rates', 'offer-rate:' || new_id || ':' || r.id);
  end loop;
  return jsonb_build_object('status', 'waiting_rate', 'id', new_id);
end $function$;


-- The signature fingerprint also covers the program stream and the wage steps.
create or replace function public.accept_offer(p_id uuid, p_name text, p_ip text default null, p_agent text default null)
 returns text language plpgsql security definer set search_path to 'public' as $function$
declare o offer_letters; me profiles; sig text; h text;
  norm text := lower(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]+', ' ', 'g'));
begin
  select * into o from offer_letters where id = p_id;
  if o.id is null or o.profile_id <> auth.uid() then raise exception 'This is not your offer letter.'; end if;
  if o.status <> 'Sent' then raise exception 'This offer is %; it can no longer be accepted.', lower(o.status); end if;
  if o.respond_by is not null and o.respond_by < (now() at time zone 'Etc/GMT+7')::date then
    raise exception 'This offer expired on %. Please contact HR.', o.respond_by;
  end if;
  select * into me from profiles where id = auth.uid();
  if trim(norm) <> trim(lower(regexp_replace(me.full_name, '[^A-Za-z]+', ' ', 'g'))) then
    raise exception 'To sign, type your full name exactly as it is on your account: "%".', me.full_name;
  end if;
  select signature_image into sig from onboardings where profile_id = auth.uid();
  h := encode(sha256(convert_to(jsonb_build_object(
         'id', o.id, 'person', me.full_name, 'position', o.position, 'program', o.program, 'type', o.employment_type,
         'wage', o.wage, 'unit', o.wage_unit, 'hours', o.hours, 'start', o.start_date, 'house', o.house,
         'reports_to', o.reports_to, 'extra', o.extra_terms, 'file', o.file_path,
         'issued_by', o.issued_by_name, 'issued_at', o.issued_at, 'terms', o.terms_version, 'stream', o.program, 'grid', o.grid_level, 'steps', o.wage_steps)::text, 'UTF8')), 'hex');
  perform set_config('evg.offer_sign', '1', true);
  update offer_letters set status = 'Accepted', accepted_at = now(), signed_name = trim(p_name), signature_image = sig,
    signer_ip = left(p_ip, 64), signer_agent = left(p_agent, 300), doc_hash = h
  where id = p_id;
  update onboarding_items set status = 'Verified', signed_name = trim(p_name), signed_at = now(),
    data = coalesce(data, '{}'::jsonb) || jsonb_build_object('offer_id', p_id, 'doc_hash', h)
  where profile_id = auth.uid() and item_key = 'offer';
  update staff_details set position = coalesce(position, o.position),
    employment_type = coalesce(employment_type, case when o.employment_type in ('Full-time','Part-time','Casual') then o.employment_type end),
    hire_date = coalesce(hire_date, o.start_date)
  where profile_id = auth.uid();
  perform notify(o.issued_by, me.full_name || ' accepted the offer', o.position || ' — signed ' || to_char(now() at time zone 'Etc/GMT+7', 'Mon DD, YYYY HH24:MI'),
    '/offer/' || p_id, 'offer-acc:' || p_id);
  return h;
end $function$;
