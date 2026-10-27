-- =====================================================================
-- Evergreen CRM - 👥 Staffing changes from a date (1 staff ↔ 2 staff). Safe to run more than once.
-- Run after schedule-teams.sql.
--
-- Melvin, Oct 26 2026: "where will I switch 1 staff to 2 staff".
--  · The Program Coordinator (own house) or Program Manager+ picks how many staff on each shift and the date it
--    starts (e.g. a second youth moves in on Nov 15 → 2 staff on days and evenings from Nov 15).
--  · More staff: new lines start on that date; their shifts are posted as open from that date only, and the
--    house's PC and PM are told to assign staff.
--  · Fewer staff: the extra lines stop the day before; their untouched shifts from that date are removed.
--    Shifts already changed by hand, swapped or picked up are never touched.
--  · Every change is kept in a history (staffing_changes).
-- =====================================================================

alter table schedule_lines add column if not exists active_from date;    -- the line's shifts start on this date
alter table schedule_lines add column if not exists active_until date;   -- set when switched off: last day it works

create table if not exists staffing_changes (
  id            uuid primary key default gen_random_uuid(),
  home_id       uuid not null references homes on delete cascade,
  from_date     date not null,
  staff_day     int not null, staff_evening int not null, staff_night int not null, staff_peak int not null,
  before        jsonb,
  note          text,
  changed_by    uuid references profiles on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
alter table staffing_changes enable row level security;
drop policy if exists "staffing changes see" on staffing_changes;
create policy "staffing changes see" on staffing_changes for select using (coalesce(app_level(), 0) >= 3 or (coalesce(app_level(), 0) = 2 and home_id = app_home()) or app_role() = 'admin');

-- Lines for the house's staffing, starting / stopping on p_from.
create or replace function sync_house_lines(p_home uuid, p_from date default null) returns void
language plpgsql security definer set search_path = public as $$
declare h homes; s text; n int; i int; sl text; f date := coalesce(p_from, (now() at time zone evg_tz())::date);
begin
  select * into h from homes where id = p_home;
  foreach s in array array['Day', 'Evening', 'Night', 'Peak'] loop
    n := case s when 'Day' then h.staff_day when 'Evening' then h.staff_evening when 'Night' then h.staff_night else h.staff_peak end;
    for i in 1..4 loop
      foreach sl in array array['A', 'B'] loop
        if i <= n then
          insert into schedule_lines (home_id, shift, pair, slot, active_from) values (p_home, s, i, sl, f)
          on conflict (home_id, shift, pair, slot) do update
            set active = true, active_until = null,
                active_from = case when schedule_lines.active then schedule_lines.active_from else excluded.active_from end;
        else
          update schedule_lines set active = false, active_until = f - 1, updated_at = now()
           where home_id = p_home and shift = s and pair = i and slot = sl and active;
        end if;
      end loop;
    end loop;
  end loop;
end $$;

-- Build (or rebuild) a house's shifts from the pattern. Only untouched pattern shifts are ever changed.
create or replace function build_schedule(p_home uuid default null, p_days int default null) returns int
language plpgsql security definer set search_path = public as $$
declare st schedule_settings; h record; l record; d date; t record; n int := 0; d0 date; d1 date; who uuid; why text;
begin
  select * into st from schedule_settings where id = 1;
  for h in select * from homes where (p_home is null or id = p_home) and schedule_from is not null loop
    d0 := greatest(current_date, h.schedule_from);
    d1 := current_date + coalesce(p_days, st.horizon_days);
    -- remove untouched future pattern shifts on lines that were switched off (from the day after they stop)
    delete from shifts s using schedule_lines l2
     where s.line_id = l2.id and l2.home_id = h.id and not l2.active and s.source = 'pattern'
       and s.shift_date >= greatest(d0, coalesce(l2.active_until + 1, d0));
    for l in select * from schedule_lines where home_id = h.id and active loop
      select * into t from line_times(h.id, l.shift);
      update shifts set profile_id = l.profile_id,
             open_reason = case when l.profile_id is null then 'No one on this line yet' else null end
       where line_id = l.id and source = 'pattern' and shift_date >= d0 and profile_id is distinct from l.profile_id;
      d := greatest(d0, coalesce(l.active_from, d0));
      while d <= d1 loop
        if pattern_works(l.slot, l.pair, d) then
          who := l.profile_id; why := case when l.profile_id is null then 'No one on this line yet' end;
          if who is not null and exists (select 1 from time_off_requests r where r.profile_id = who and r.status = 'Approved'
                                           and d between r.start_date and r.end_date) then
            who := null; why := 'Time off';
          end if;
          insert into shifts (home_id, profile_id, shift_date, start_time, end_time, label, line_id, source, open_reason, created_by)
          values (h.id, who, d, t.st, t.en, t.lbl, l.id, case when why = 'Time off' then 'changed' else 'pattern' end, why, null)
          on conflict (line_id, shift_date) where line_id is not null do nothing;
          if found then n := n + 1; end if;
        end if;
        d := d + 1;
      end loop;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function build_schedule(uuid, int) from public, anon, authenticated;

-- PC (own house) / PM+: set staffing from a date, then post 6 months. p_from = when the pattern first started
-- (set once); p_change_from = when this staffing change starts (default: today).
drop function if exists save_house_staffing(uuid, int, int, int, int, date);
create or replace function save_house_staffing(p_home uuid, p_day int, p_evening int, p_night int, p_peak int,
                                               p_from date default null, p_change_from date default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h homes; f date; was jsonb; added int; removed int; built int; l uuid;
begin
  if not can_schedule(p_home) then raise exception 'Only the house’s Program Coordinator or a Program Manager can change the staffing.'; end if;
  if p_day not between 0 and 4 or p_evening not between 0 and 4 or p_night not between 0 and 2 or p_peak not between 0 and 2 then
    raise exception 'Choose 0–4 staff for days and evenings, 0–2 for nights and the 3–7 pm extra.';
  end if;
  select * into h from homes where id = p_home;
  f := greatest(coalesce(p_change_from, (now() at time zone evg_tz())::date), (now() at time zone evg_tz())::date);
  if f > (now() at time zone evg_tz())::date + 183 then raise exception 'Choose a start date within the next 6 months.'; end if;
  was := jsonb_build_object('day', h.staff_day, 'evening', h.staff_evening, 'night', h.staff_night, 'peak', h.staff_peak);
  update homes set staff_day = p_day, staff_evening = p_evening, staff_night = p_night, staff_peak = p_peak,
                   schedule_from = coalesce(h.schedule_from, p_from, f) where id = p_home;
  select count(*) into added from schedule_lines where home_id = p_home and active;
  perform sync_house_lines(p_home, f);
  select count(*) - added into added from schedule_lines where home_id = p_home and active;
  built := build_schedule(p_home);
  insert into staffing_changes (home_id, from_date, staff_day, staff_evening, staff_night, staff_peak, before, note)
  values (p_home, f, p_day, p_evening, p_night, p_peak, was, left(nullif(trim(p_note), ''), 300));
  if was <> jsonb_build_object('day', p_day, 'evening', p_evening, 'night', p_night, 'peak', p_peak) then
    for l in select * from house_leaders(p_home) loop
      perform notify(l, '👥 Staffing change: ' || h.name,
        'From ' || to_char(f, 'Mon DD') || ': ' || p_day || ' on days, ' || p_evening || ' on evenings, ' || p_night || ' on awake nights'
        || case when p_peak > 0 then ', ' || p_peak || ' extra 3–7 pm' else '' end
        || case when added > 0 then '. New lines need staff — assign them on Teams & lines.' else '.' end,
        '/schedule?tab=teams&home=' || p_home, 'staffing:' || p_home || ':' || f || ':' || p_day || p_evening || p_night || p_peak || ':' || l);
    end loop;
  end if;
  return jsonb_build_object('from', f, 'new_shifts', built, 'lines_added', greatest(added, 0), 'lines_removed', greatest(-added, 0));
end $$;
grant execute on function save_house_staffing(uuid, int, int, int, int, date, date, text) to authenticated;

-- Check
select 'staffing changes ready' as result, (select count(*) from schedule_lines where active_from is not null) as dated_lines;
