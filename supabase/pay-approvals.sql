-- Pay setup with approval (Nov 16 2026).
--   pay_plans    how each position is paid in each program: program 'All' (default), 'MCFD' or 'CLBC';
--                pay_type 'hourly' (grid level or fixed hourly rate) or 'salary' (annual salary, e.g. PC and PM;
--                on-call duty is included in the salary). A program row overrides the 'All' row.
--   pay_changes  every change to a pay plan or to the wage grid is a request: Payroll enters it, and a leader at
--                level 4 to 8 (Director of Operations, Executive Director, CSO, CEO, Administrator) approves it.
--                Nobody approves their own request. Only an approved change is applied.
--   The old direct functions (set_pay_rate, set_pay_grid_level, save_wage_grid) are no longer callable from the portal.

create table if not exists public.pay_plans (
  id uuid primary key default gen_random_uuid(),
  position text not null,
  program text not null default 'All' check (program in ('All', 'MCFD', 'CLBC')),
  pay_type text not null default 'hourly' check (pay_type in ('hourly', 'salary')),
  grid_level int check (grid_level is null or grid_level between 1 and 40),
  hourly_rate numeric(8,2) check (hourly_rate is null or (hourly_rate > 0 and hourly_rate < 500)),
  annual_salary numeric(10,2) check (annual_salary is null or (annual_salary > 0 and annual_salary < 1000000)),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique (position, program)
);
alter table public.pay_plans enable row level security;
drop policy if exists "pay plans see" on public.pay_plans;
create policy "pay plans see" on public.pay_plans for select using (
  app_role() = 'admin' or coalesce(app_group(), '') in ('hr', 'payroll') or coalesce(app_level(), 0) >= 3);
drop trigger if exists audit_pay_plans on public.pay_plans;
create trigger audit_pay_plans after insert or update or delete on public.pay_plans for each row execute function write_audit();

insert into public.pay_plans (position, program, pay_type, grid_level, hourly_rate)
select position, 'All', 'hourly', grid_level, hourly_rate from public.pay_rates
on conflict (position, program) do nothing;

create table if not exists public.pay_changes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('plan', 'grid')),
  position text, program text, pay_type text, grid_level int, hourly_rate numeric(8,2), annual_salary numeric(10,2),
  grid_effective date, grid_rows jsonb,
  note text,
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Cancelled')),
  requested_by uuid not null references profiles(id), requested_at timestamptz not null default now(),
  decided_by uuid references profiles(id), decided_at timestamptz, decision_note text
);
alter table public.pay_changes enable row level security;
drop policy if exists "pay changes see" on public.pay_changes;
create policy "pay changes see" on public.pay_changes for select using (
  app_role() = 'admin' or coalesce(app_group(), '') in ('hr', 'payroll') or coalesce(app_level(), 0) >= 3);
drop trigger if exists audit_pay_changes on public.pay_changes;
create trigger audit_pay_changes after insert or update or delete on public.pay_changes for each row execute function write_audit();

create or replace function public.can_request_pay() returns boolean language sql stable security definer set search_path = public as $$
  select app_role() = 'admin' or coalesce(app_group(), '') = 'payroll'
$$;
create or replace function public.can_approve_pay() returns boolean language sql stable security definer set search_path = public as $$
  select app_role() = 'admin' or (coalesce(app_level(), 0) between 4 and 8 and coalesce(app_group(), '') = '')
$$;

drop function if exists public.position_wage(text, date);
-- The pay terms for a position, program and start date: {rate, unit, level, steps, effective, pay_type}.
create or replace function public.position_wage(p_position text, p_on date, p_program text default 'All')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pp pay_plans; st numeric[]; eff date;
begin
  select * into pp from pay_plans where lower(position) = lower(p_position) and program in (coalesce(p_program, 'All'), 'All')
   order by (program = coalesce(p_program, 'All')) desc limit 1;
  if pp.id is null or not exists (select 1 from pay_rates r where lower(r.position) = lower(p_position) and r.active) then
    return jsonb_build_object('rate', null);
  end if;
  if pp.pay_type = 'salary' then
    return jsonb_build_object('rate', pp.annual_salary, 'unit', 'year', 'pay_type', 'salary');
  end if;
  if pp.grid_level is not null then
    eff := grid_effective_on(p_on);
    st := grid_steps(pp.grid_level, p_on);
    if st is not null and array_length(st, 1) >= 1 then
      return jsonb_build_object('rate', st[1], 'unit', 'hour', 'level', pp.grid_level, 'steps', to_jsonb(st), 'effective', eff, 'pay_type', 'hourly');
    end if;
  end if;
  return jsonb_build_object('rate', pp.hourly_rate, 'unit', 'hour', 'pay_type', 'hourly');
end $$;

-- Send automatic offer letters that were waiting for a rate.
create or replace function public.pay_send_waiting() returns uuid[] language plpgsql security definer set search_path = public as $$
declare o record; w jsonb; sent uuid[] := '{}';
begin
  for o in select id, position, start_date, program from offer_letters where auto and status = 'Draft' and wage is null loop
    w := position_wage(o.position, o.start_date, o.program);
    if (w->>'rate') is not null then
      update offer_letters set wage = (w->>'rate')::numeric, wage_unit = coalesce(w->>'unit', 'hour'), grid_level = (w->>'level')::int,
        wage_steps = case when w ? 'steps' then array(select jsonb_array_elements_text(w->'steps')::numeric) end,
        grid_effective = (w->>'effective')::date where id = o.id;
      if offer_auto_send(o.id) then sent := sent || o.id; end if;
    end if;
  end loop;
  return sent;
end $$;

-- Payroll enters a change: p = {kind:'plan', position, program, pay_type, grid_level, hourly_rate, annual_salary, note}
--                          or {kind:'grid', grid_effective, grid_rows:[{level,step,rate}], note}
create or replace function public.request_pay_change(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid; me profiles; r record; k text := p->>'kind';
begin
  if not can_request_pay() then raise exception 'Only the Payroll team can enter pay changes.'; end if;
  select * into me from profiles where id = auth.uid();
  if k = 'plan' then
    if coalesce(p->>'position', '') = '' then raise exception 'Choose the position.'; end if;
    if coalesce(p->>'program', 'All') not in ('All', 'MCFD', 'CLBC') then raise exception 'Choose the program.'; end if;
    if p->>'pay_type' = 'salary' and coalesce((p->>'annual_salary')::numeric, 0) <= 0 then raise exception 'Enter the annual salary.'; end if;
    if p->>'pay_type' = 'hourly' and (p->>'grid_level') is null and coalesce((p->>'hourly_rate')::numeric, 0) <= 0 then
      raise exception 'Choose a grid level or enter an hourly rate.'; end if;
    insert into pay_changes (kind, position, program, pay_type, grid_level, hourly_rate, annual_salary, note, requested_by)
    values ('plan', p->>'position', coalesce(p->>'program', 'All'), coalesce(p->>'pay_type', 'hourly'),
            (p->>'grid_level')::int, (p->>'hourly_rate')::numeric, (p->>'annual_salary')::numeric, nullif(btrim(p->>'note'), ''), auth.uid())
    returning id into new_id;
  elsif k = 'grid' then
    if (p->>'grid_effective') is null then raise exception 'Choose the date the grid starts.'; end if;
    if jsonb_typeof(p->'grid_rows') <> 'array' or jsonb_array_length(p->'grid_rows') = 0 then raise exception 'The grid has no rates.'; end if;
    insert into pay_changes (kind, grid_effective, grid_rows, note, requested_by)
    values ('grid', (p->>'grid_effective')::date, p->'grid_rows', nullif(btrim(p->>'note'), ''), auth.uid())
    returning id into new_id;
  else
    raise exception 'Unknown change.';
  end if;
  for r in select id from profiles where active and id <> auth.uid()
             and (role = 'admin' or (coalesce(level, 0) between 4 and 8 and coalesce(staff_group, '') = '')) loop
    perform notify(r.id, 'Pay change waiting for approval',
      me.full_name || ' entered a ' || case when k = 'grid' then 'wage grid' else 'pay rate' end || ' change. Please review and approve or reject it.',
      '/hr/pay-rates', 'paychange:' || new_id || ':' || r.id);
  end loop;
  return new_id;
end $$;

-- A leader at level 4 to 8 approves or rejects a change. Approval applies it and sends waiting offer letters.
create or replace function public.decide_pay_change(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c pay_changes; r jsonb; sent uuid[] := '{}';
begin
  if not can_approve_pay() then raise exception 'Pay changes are approved by the Director of Operations, Executive Director, CSO, CEO or Administrator.'; end if;
  select * into c from pay_changes where id = p_id for update;
  if c.id is null then raise exception 'Change not found.'; end if;
  if c.status <> 'Pending' then raise exception 'This change was already %.', lower(c.status); end if;
  if c.requested_by = auth.uid() then raise exception 'You can''t approve a change you entered.'; end if;
  update pay_changes set status = case when p_approve then 'Approved' else 'Rejected' end, decided_by = auth.uid(), decided_at = now(),
    decision_note = nullif(btrim(p_note), '') where id = p_id;
  if p_approve then
    if c.kind = 'plan' then
      insert into pay_rates (position, active) values (c.position, true) on conflict do nothing;
      insert into pay_plans (position, program, pay_type, grid_level, hourly_rate, annual_salary, updated_by, updated_at)
      values (c.position, c.program, c.pay_type, case when c.pay_type = 'hourly' then c.grid_level end,
              case when c.pay_type = 'hourly' and c.grid_level is null then c.hourly_rate end,
              case when c.pay_type = 'salary' then c.annual_salary end, c.requested_by, now())
      on conflict (position, program) do update set pay_type = excluded.pay_type, grid_level = excluded.grid_level,
        hourly_rate = excluded.hourly_rate, annual_salary = excluded.annual_salary, updated_by = excluded.updated_by, updated_at = now();
      if c.program = 'All' then
        update pay_rates set grid_level = case when c.pay_type = 'hourly' then c.grid_level end,
          hourly_rate = case when c.pay_type = 'hourly' and c.grid_level is null then c.hourly_rate end,
          updated_by = c.requested_by, updated_at = now() where lower(position) = lower(c.position);
      end if;
    else
      delete from wage_grid where effective_date = c.grid_effective;
      for r in select * from jsonb_array_elements(c.grid_rows) loop
        if coalesce(r->>'rate', '') = '' then continue; end if;
        insert into wage_grid (effective_date, grid_level, step, hourly_rate, updated_by)
        values (c.grid_effective, (r->>'level')::int, (r->>'step')::int, round((r->>'rate')::numeric, 2), c.requested_by);
      end loop;
    end if;
    sent := pay_send_waiting();
  end if;
  perform notify(c.requested_by, 'Pay change ' || case when p_approve then 'approved' else 'rejected' end,
    case when c.kind = 'grid' then 'Wage grid starting ' || to_char(c.grid_effective, 'Mon DD, YYYY') else c.position || ' (' || c.program || ')' end
    || coalesce(' — ' || nullif(btrim(p_note), ''), ''), '/hr/pay-rates', 'paydecided:' || p_id);
  return jsonb_build_object('ok', true, 'sent', to_jsonb(sent));
end $$;

create or replace function public.cancel_pay_change(p_id uuid) returns void language sql security definer set search_path = public as $$
  update pay_changes set status = 'Cancelled', decided_at = now(), decided_by = auth.uid()
   where id = p_id and status = 'Pending' and requested_by = auth.uid();
$$;

-- Offer letters now record the pay type through wage_unit ('hour' or 'year').
revoke execute on function public.set_pay_rate(text, numeric, boolean), public.set_pay_grid_level(text, int), public.save_wage_grid(date, jsonb) from authenticated;
revoke execute on function public.position_wage(text, date, text), public.pay_send_waiting() from public, anon, authenticated;
grant execute on function public.request_pay_change(jsonb), public.decide_pay_change(uuid, boolean, text), public.cancel_pay_change(uuid),
  public.can_request_pay(), public.can_approve_pay() to authenticated;

-- auto_offer: pay comes from the plan for the person's program (worked out first), and may be a salary (wage_unit 'year').
do $mig$ declare d text; blk text; begin
  d := pg_get_functiondef('public.auto_offer(uuid)'::regprocedure);
  if position('v_unit' in d) = 0 then
    blk := E'  w := position_wage(d.position, d.hire_date);\n  rate := (w->>''rate'')::numeric;\n  v_level := (w->>''level'')::int;\n  v_eff := (w->>''effective'')::date;\n  v_steps := case when w ? ''steps'' then array(select jsonb_array_elements_text(w->''steps'')::numeric) end;\n';
    if position(blk in d) = 0 then raise exception 'auto_offer wage block not found'; end if;
    d := replace(d, blk, '');
    d := replace(d, 'v_steps numeric[]; v_level int; v_eff date;', 'v_steps numeric[]; v_level int; v_eff date; v_unit text;');
    d := regexp_replace(d, '(v_program := coalesce\(.*?''Both''\);)',
      E'\\1\n  w := position_wage(d.position, d.hire_date, v_program);\n  rate := (w->>''rate'')::numeric;\n  v_unit := coalesce(w->>''unit'', ''hour'');\n  v_level := (w->>''level'')::int;\n  v_eff := (w->>''effective'')::date;\n  v_steps := case when w ? ''steps'' then array(select jsonb_array_elements_text(w->''steps'')::numeric) end;', 's');
    d := replace(d, 'update offer_letters set wage = rate, grid_level = v_level', 'update offer_letters set wage = rate, wage_unit = v_unit, grid_level = v_level');
    d := replace(d, E'rate, ''hour'', hours_text', E'rate, v_unit, hours_text');
    if position('position_wage(d.position, d.hire_date, v_program)' in d) = 0 then raise exception 'auto_offer patch failed'; end if;
    execute d;
  end if;
end $mig$;
