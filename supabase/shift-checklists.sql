-- =====================================================================
-- Evergreen CRM - Shift duty checklists (3 x 8-hour shifts), every staff member, every shift, every house.
--  * Each house has 3 shifts (default Day 07:00, Evening 15:00, Night 23:00 - change per house).
--  * Program templates (MCFD youth / CLBC adults) are copied to every house automatically, including new houses.
--    The Program Coordinator / Program Manager can add, reword or switch off items for one house.
--  * Clocking in at a house opens that shift's checklist. Each item: Done / N/A (with a reason) / Problem.
--    Safety-critical (*) items can't be N/A; "Problem" on one alerts the Program Coordinator and Program Manager.
--  * The staff member signs at the end (initials + saved signature). Signed checklists are locked.
--  * Reminders every 15 minutes: 30 min before the end (staff), 30 min after the end if not signed
--    (staff + Program Coordinator + Program Manager).
-- Uses app_level(), app_home(), notify() (policies-hr.sql). Safe to run more than once.
-- =====================================================================

-- ---------- House settings ----------
alter table homes add column if not exists shift_day_start     time not null default '07:00';
alter table homes add column if not exists shift_evening_start time not null default '15:00';
alter table homes add column if not exists shift_night_start   time not null default '23:00';
alter table homes add column if not exists bed_check_minutes   int  not null default 30 check (bed_check_minutes between 10 and 120);
alter table homes add column if not exists med_count_required  boolean not null default false;

create or replace function home_program(h homes) returns text language sql immutable as $$
  select case when coalesce(h.house_type, 'Adults') = 'Adults' then 'CLBC' else 'MCFD' end
$$;

-- ---------- Program template ----------
create table if not exists shift_checklist_template (
  code      text primary key,
  program   text not null default 'Both' check (program in ('MCFD','CLBC','Both')),
  shift     text not null check (shift in ('Start','Day','Evening','Night','End')),
  area      text not null default 'Care',      -- Safety, Care, Medication, Cleaning, Records, House
  sort      int  not null,
  item      text not null,
  critical  boolean not null default false,
  weekday   int check (weekday between 0 and 6),   -- 0 = Sunday; only on that day
  only_if   text check (only_if in ('med_count'))
);

insert into shift_checklist_template (code, program, shift, area, sort, item, critical, weekday, only_if) values
-- Every shift: start
('S1','Both','Start','Records',  10,'Clocked in and on the schedule for this house', false, null, null),
('S2','Both','Start','Records',  20,'Read the shift log, communication book, alerts and any new safety or care plans', false, null, null),
('S3','Both','Start','Safety',   30,'Verbal handover from the outgoing staff (anyone at risk, missing, unwell or upset)', true, null, null),
('S4','MCFD','Start','Safety',   40,'Headcount: every youth seen and accounted for', true, null, null),
('S4A','CLBC','Start','Safety',  40,'Headcount: every person seen or accounted for as planned', true, null, null),
('S5','Both','Start','House',    50,'Program phone, keys, vehicle keys and first aid kit checked and with me', false, null, null),
('S6','Both','Start','Medication',60,'Medication count / check at handover', true, null, 'med_count'),
-- Day 07:00-15:00
('D1','MCFD','Day','Care',      110,'Wake-up, hygiene and getting ready for school or program, as in each care plan', false, null, null),
('D1A','CLBC','Day','Care',     110,'Personal care and morning routine supported as in each support plan', false, null, null),
('D2','Both','Day','Medication',120,'Morning medications given and recorded in the MAR at the time (refusals recorded)', true, null, null),
('D3','Both','Day','Care',      130,'Breakfast and lunch served per the meal plan; allergies and diets followed', true, null, null),
('D4','MCFD','Day','Care',      140,'School or program attendance confirmed; transport done safely (cleared driver)', false, null, null),
('D4A','CLBC','Day','Care',     140,'Day program, work or community activity supported; transport done safely', false, null, null),
('D5','Both','Day','Care',      150,'Today''s appointments attended or escorted and recorded', false, null, null),
('D6','Both','Day','Safety',    160,'Supervision checks done at the level in each care plan', true, null, null),
('D7','Both','Day','Records',   170,'Contact with family, social worker / guardian or CLBC recorded', false, null, null),
('D8','Both','Day','House',     180,'Fridge and food safety check (use-by dates, fridge cold)', false, null, null),
('D9','Both','Day','Records',   190,'Money / allowance transactions recorded with receipts (or none today)', false, null, null),
('CD1','Both','Day','Cleaning', 200,'Bathrooms cleaned: toilets, sinks, showers, mirrors; supplies stocked', false, null, null),
('CD2','Both','Day','Cleaning', 210,'Common areas vacuumed or swept; entrance tidy', false, null, null),
('CD3','Both','Day','Cleaning', 220,'Kitchen counters, table and appliances wiped after breakfast and lunch', false, null, null),
('CD4','Both','Day','Cleaning', 230,'Bedrooms: youth / residents supported to tidy their own room (life skills)', false, null, null),
('CD5','Both','Day','Cleaning', 240,'Saturday: deep clean of bathrooms and kitchen (cupboard fronts, floors, bins washed)', false, 6, null),
-- Evening 15:00-23:00
('E1','MCFD','Evening','Care',  310,'After-school check-in with each youth (their day, anything to follow up)', false, null, null),
('E1A','CLBC','Evening','Care', 310,'Check-in with each person about their day and choices for the evening', false, null, null),
('E2','MCFD','Evening','Care',  320,'Homework and life-skills support', false, null, null),
('E3','Both','Evening','Care',  330,'Supper served per the meal plan; allergies and diets followed', true, null, null),
('E4','Both','Evening','Medication',340,'Evening and bedtime medications given and recorded in the MAR', true, null, null),
('E5','Both','Evening','Care',  350,'Recreation, culture and family-contact activities as in each plan', false, null, null),
('E6','MCFD','Evening','Safety',360,'Phone and internet use supervised as in each care plan', false, null, null),
('E7','MCFD','Evening','Safety',370,'Curfew: every youth home on time, or the missing youth protocol started', true, null, null),
('E7A','CLBC','Evening','Safety',370,'Everyone home or accounted for as planned', true, null, null),
('E8','Both','Evening','Care',  380,'Bedtime routine supported; everyone in their own room', false, null, null),
('E9','Both','Evening','Safety',390,'Knives, sharps, medications and cleaning products locked away', true, null, null),
('E10','Both','Evening','Safety',400,'Doors and windows locked, exits clear, alarms set (where used)', true, null, null),
('CE1','Both','Evening','Cleaning',410,'Dishes done; stove, counters and dining table cleaned after supper', false, null, null),
('CE2','Both','Evening','Cleaning',420,'Living room tidied; games and supplies put away', false, null, null),
('CE3','Both','Evening','Cleaning',430,'High-touch surfaces wiped: door handles, light switches, remotes, railings', false, null, null),
('CE4','Both','Evening','Cleaning',440,'Lunches or breakfast for tomorrow set up (if assigned)', false, null, null),
-- Night 23:00-07:00 (awake)
('N1','Both','Night','Safety',  510,'Security walk at the start: doors, windows, exits clear, fire doors closed', true, null, null),
('N2','Both','Night','Safety',  520,'Bed checks done at the interval in each care plan, every one logged', true, null, null),
('N3','Both','Night','Safety',  530,'I stayed awake for the whole shift (awake-shift rule)', true, null, null),
('N4','Both','Night','Care',    540,'Anyone awake or distressed supported and recorded; nobody in another person''s room', false, null, null),
('N5','Both','Night','Medication',550,'Overnight medications (if prescribed) given and recorded, or none prescribed', false, null, null),
('N6','Both','Night','Safety',  560,'Second security walk around 3:00 am', true, null, null),
('N7','Both','Night','Records', 570,'Night log entry written', false, null, null),
('N8','Both','Night','Care',    580,'Breakfast set up; early wake-ups done for school, work or appointments', false, null, null),
('CN1','Both','Night','Cleaning',610,'Laundry: house towels and linens washed, dried and put away', false, null, null),
('CN2','Both','Night','Cleaning',620,'Kitchen and bathroom floors mopped', false, null, null),
('CN3','Both','Night','Cleaning',630,'All garbage, recycling and compost emptied; bins out on collection day', false, null, null),
('CN4','Both','Night','Cleaning',640,'Supplies checked (toilet paper, soap, paper towel, first aid); shortages written in the shift log', false, null, null),
('CN5','Both','Night','Cleaning',650,'Monday: all bedding changed and washed', false, 1, null),
('CN6','Both','Night','Safety', 660,'Wednesday: smoke and CO alarms tested, fire extinguishers checked', true, 3, null),
('CN7','Both','Night','Cleaning',670,'Thursday: oven, microwave and fridge shelves cleaned', false, 4, null),
('CN8','Both','Night','Cleaning',680,'Sunday: fridge clean-out (expired food thrown away)', false, 0, null),
-- Every shift: end
('X1','Both','End','Records',   910,'Daily note written and signed for each youth / person', true, null, null),
('X2','Both','End','Records',   920,'Incident reports written for anything that happened, or none this shift', true, null, null),
('X3','Both','End','Records',   930,'Shift log / communication book handover written', false, null, null),
('X4','Both','End','Safety',    940,'Verbal handover to the incoming staff; I did not leave until relieved', true, null, null),
('X5','Both','End','Medication',950,'Medication count at handover', true, null, 'med_count'),
('X6','Both','End','House',     960,'Program phone, keys and vehicle handed over', false, null, null)
on conflict (code) do update set program = excluded.program, shift = excluded.shift, area = excluded.area, sort = excluded.sort,
  item = excluded.item, critical = excluded.critical, weekday = excluded.weekday, only_if = excluded.only_if;

alter table shift_checklist_template enable row level security;
drop policy if exists sctpl_read on shift_checklist_template;
create policy sctpl_read on shift_checklist_template for select using (auth.uid() is not null);

-- ---------- Each house's own list (copied from the template; editable per house) ----------
create table if not exists house_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  home_id    uuid not null references homes on delete cascade,
  code       text,                      -- template code; null = added for this house only
  shift      text not null check (shift in ('Start','Day','Evening','Night','End')),
  area       text not null default 'Care',
  sort       int  not null default 500,
  item       text not null,
  critical   boolean not null default false,
  weekday    int check (weekday between 0 and 6),
  only_if    text,
  active     boolean not null default true,
  updated_by uuid references profiles,
  updated_at timestamptz not null default now(),
  unique (home_id, code)
);
create index if not exists house_checklist_items_home on house_checklist_items (home_id, shift, sort);

create or replace function seed_house_checklist(p_home uuid) returns int
language plpgsql security definer set search_path = public as $$
declare h homes; n int;
begin
  select * into h from homes where id = p_home;
  if h.id is null then return 0; end if;
  insert into house_checklist_items (home_id, code, shift, area, sort, item, critical, weekday, only_if)
  select h.id, t.code, t.shift, t.area, t.sort, t.item, t.critical, t.weekday, t.only_if
  from shift_checklist_template t where t.program in ('Both', home_program(h))
  on conflict (home_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function seed_house_checklist(uuid) from public, anon;
grant execute on function seed_house_checklist(uuid) to authenticated;

create or replace function homes_seed_checklist() returns trigger language plpgsql security definer set search_path = public as $$
begin perform seed_house_checklist(new.id); return new; end $$;
drop trigger if exists homes_seed_checklist on homes;
create trigger homes_seed_checklist after insert on homes for each row execute function homes_seed_checklist();

-- Every existing house gets its list now (and any new template items).
select seed_house_checklist(id) from homes;

alter table house_checklist_items enable row level security;
drop policy if exists hci_read on house_checklist_items;
drop policy if exists hci_write on house_checklist_items;
create policy hci_read on house_checklist_items for select using (app_level() >= 3 or home_id = app_home());
create policy hci_write on house_checklist_items for all
  using (app_level() >= 3 or (app_level() = 2 and home_id = app_home()))
  with check (app_level() >= 3 or (app_level() = 2 and home_id = app_home()));

-- ---------- One checklist per staff member per shift ----------
create table if not exists shift_checklists (
  id              uuid primary key default gen_random_uuid(),
  home_id         uuid not null references homes,
  profile_id      uuid not null references profiles default auth.uid(),
  shift_date      date not null,
  shift           text not null check (shift in ('Day','Evening','Night')),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  bed_checks      timestamptz[] not null default '{}',
  status          text not null default 'Open' check (status in ('Open','Signed')),
  initials        text,
  signature_image text,
  signed_at       timestamptz,
  reminded_pre    timestamptz,
  reminded_late   timestamptz,
  created_at      timestamptz not null default now(),
  unique (profile_id, home_id, shift_date, shift)
);
create index if not exists shift_checklists_home on shift_checklists (home_id, shift_date desc);
create index if not exists shift_checklists_open on shift_checklists (status, ends_at) where status = 'Open';

create table if not exists shift_checklist_ticks (
  id            uuid primary key default gen_random_uuid(),
  checklist_id  uuid not null references shift_checklists on delete cascade,
  item_id       uuid references house_checklist_items on delete set null,
  code          text,
  section       text not null,
  area          text not null,
  sort          int not null,
  item          text not null,
  critical      boolean not null default false,
  status        text check (status in ('Done','N/A','Problem')),
  note          text,
  at            timestamptz,
  unique (checklist_id, item_id)
);
create index if not exists shift_checklist_ticks_list on shift_checklist_ticks (checklist_id, sort);

-- Which shift a moment falls in for a house (Vancouver time). Works for 7-3/3-11/11-7 and 8-4/4-12/12-8 alike:
-- the working day starts at the Day shift; a Night shift that starts after midnight still belongs to the day before.
create or replace function house_shift_at(p_home uuid, p_at timestamptz default now(),
  out shift text, out shift_date date, out starts_at timestamptz, out ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare h homes; lt timestamp := p_at at time zone 'America/Vancouver';
  ev interval; ni interval; rel interval; op timestamp;
begin
  select * into h from homes where id = p_home;
  ev := (h.shift_evening_start - h.shift_day_start + interval '24 hours') - case when h.shift_evening_start >= h.shift_day_start then interval '24 hours' else interval '0' end;
  ni := (h.shift_night_start - h.shift_day_start + interval '24 hours') - case when h.shift_night_start >= h.shift_day_start then interval '24 hours' else interval '0' end;
  op := (lt - (h.shift_day_start - time '00:00'))::date + h.shift_day_start;   -- start of this working day
  shift_date := op::date;
  rel := lt - op;
  if rel < ev then
    shift := 'Day'; starts_at := op at time zone 'America/Vancouver'; ends_at := (op + ev) at time zone 'America/Vancouver';
  elsif rel < ni then
    shift := 'Evening'; starts_at := (op + ev) at time zone 'America/Vancouver'; ends_at := (op + ni) at time zone 'America/Vancouver';
  else
    shift := 'Night'; starts_at := (op + ni) at time zone 'America/Vancouver'; ends_at := (op + interval '24 hours') at time zone 'America/Vancouver';
  end if;
end $$;
grant execute on function house_shift_at(uuid, timestamptz) to authenticated;

-- Open (or find) my checklist for a house and shift. Items are copied in, so later edits never change history.
create or replace function open_shift_checklist(p_home uuid, p_at timestamptz default now(), p_profile uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare s record; h homes; cid uuid; who uuid := coalesce(p_profile, auth.uid()); dow int;
begin
  if p_profile is not null and p_profile <> auth.uid() and auth.uid() is not null then
    raise exception 'You can only open your own checklist.';
  end if;
  select * into h from homes where id = p_home;
  if h.id is null then raise exception 'House not found.'; end if;
  perform seed_house_checklist(p_home);
  select * into s from house_shift_at(p_home, p_at);
  insert into shift_checklists (home_id, profile_id, shift_date, shift, starts_at, ends_at)
  values (p_home, who, s.shift_date, s.shift, s.starts_at, s.ends_at)
  on conflict (profile_id, home_id, shift_date, shift) do nothing
  returning id into cid;
  if cid is null then
    select id into cid from shift_checklists where profile_id = who and home_id = p_home and shift_date = s.shift_date and shift = s.shift;
    return cid;
  end if;
  dow := extract(dow from s.shift_date)::int;
  insert into shift_checklist_ticks (checklist_id, item_id, code, section, area, sort, item, critical)
  select cid, i.id, i.code, i.shift, i.area, i.sort, i.item, i.critical
  from house_checklist_items i
  where i.home_id = p_home and i.active and i.shift in ('Start', s.shift, 'End')
    and (i.weekday is null or i.weekday = dow)
    and (i.only_if is null or (i.only_if = 'med_count' and h.med_count_required))
  on conflict do nothing;
  return cid;
end $$;
revoke execute on function open_shift_checklist(uuid, timestamptz, uuid) from public, anon;
grant execute on function open_shift_checklist(uuid, timestamptz, uuid) to authenticated;

-- Clocking in at a house opens that shift's checklist automatically.
create or replace function time_entry_open_checklist() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.home_id is not null then
    begin perform open_shift_checklist(new.home_id, new.clock_in, new.profile_id);
    exception when others then null; end;
  end if;
  return new;
end $$;
drop trigger if exists time_entry_open_checklist on time_entries;
create trigger time_entry_open_checklist after insert on time_entries for each row execute function time_entry_open_checklist();

-- Leaders to tell about a house: its Program Coordinator(s) and Program Manager(s) (all PMs if none is assigned to the house).
create or replace function house_leaders(p_home uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select id from profiles where active and staff_group is null and level = 2 and home_id = p_home
  union
  select id from profiles where active and staff_group is null and level = 3 and home_id = p_home
  union
  select id from profiles where active and staff_group is null and level = 3
    and not exists (select 1 from profiles x where x.active and x.staff_group is null and x.level = 3 and x.home_id = p_home);
$$;
revoke execute on function house_leaders(uuid) from public, anon, authenticated;

-- Locks and rules.
create or replace function shift_ticks_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare c shift_checklists; who text; hname text;
begin
  select * into c from shift_checklists where id = coalesce(new.checklist_id, old.checklist_id);
  if c.status = 'Signed' then raise exception 'This checklist is signed and locked.'; end if;
  if tg_op = 'UPDATE' then
    if new.item is distinct from old.item or new.critical is distinct from old.critical or new.section is distinct from old.section then
      raise exception 'Checklist items can''t be changed here.';
    end if;
    if new.status = 'N/A' and new.critical then raise exception 'Safety items can''t be marked N/A. Mark Done, or Problem and explain.'; end if;
    if new.status in ('N/A','Problem') and coalesce(trim(new.note), '') = '' then raise exception 'Add a few words saying why.'; end if;
    new.at := case when new.status is null then null else now() end;
    if new.status = 'Problem' and new.critical and old.status is distinct from 'Problem' then
      select full_name into who from profiles where id = c.profile_id;
      select name into hname from homes where id = c.home_id;
      perform notify(l, '⚠️ Safety problem at ' || hname, who || ' (' || c.shift || ' shift): ' || new.item || ' — ' || new.note,
        '/checklist?view=house&home=' || c.home_id, 'clp:' || new.id || ':' || l)
      from house_leaders(c.home_id) l;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists shift_ticks_rules on shift_checklist_ticks;
create trigger shift_ticks_rules before update or delete on shift_checklist_ticks for each row execute function shift_ticks_rules();

create or replace function shift_checklists_lock() returns trigger language plpgsql as $$
begin
  if old.status = 'Signed' and coalesce(current_setting('evg.cl_sign', true), '') <> '1' then
    raise exception 'This checklist is signed and locked.';
  end if;
  if new.status = 'Signed' and old.status <> 'Signed' and coalesce(current_setting('evg.cl_sign', true), '') <> '1' then
    raise exception 'Use Sign to finish the checklist.';
  end if;
  if new.profile_id is distinct from old.profile_id or new.home_id is distinct from old.home_id
     or new.shift_date is distinct from old.shift_date or new.shift is distinct from old.shift then
    raise exception 'The shift details can''t be changed.';
  end if;
  return new;
end $$;
drop trigger if exists shift_checklists_lock on shift_checklists;
create trigger shift_checklists_lock before update on shift_checklists for each row execute function shift_checklists_lock();

-- Log a night bed check (one tap).
create or replace function log_bed_check(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update shift_checklists set bed_checks = bed_checks || now()
  where id = p_id and profile_id = auth.uid() and status = 'Open'
  returning cardinality(bed_checks) into n;
  if n is null then raise exception 'Checklist not found or already signed.'; end if;
  return n;
end $$;
grant execute on function log_bed_check(uuid) to authenticated;

-- Sign: every item answered, safety items not N/A, initials, saved signature applied.
create or replace function sign_shift_checklist(p_id uuid, p_initials text) returns void
language plpgsql security definer set search_path = public as $$
declare c shift_checklists; left_n int; sig text; ini text := upper(regexp_replace(coalesce(p_initials, ''), '[^A-Za-z]', '', 'g'));
begin
  select * into c from shift_checklists where id = p_id;
  if c.id is null or c.profile_id <> auth.uid() then raise exception 'This is not your checklist.'; end if;
  if c.status = 'Signed' then raise exception 'Already signed.'; end if;
  if length(ini) < 2 or length(ini) > 4 then raise exception 'Type your initials (2 to 4 letters) to sign.'; end if;
  select count(*) into left_n from shift_checklist_ticks where checklist_id = p_id and status is null;
  if left_n > 0 then raise exception '% item(s) still to tick before you can sign.', left_n; end if;
  select signature_image into sig from onboardings where profile_id = auth.uid();
  perform set_config('evg.cl_sign', '1', true);
  update shift_checklists set status = 'Signed', initials = ini, signature_image = sig, signed_at = now() where id = p_id;
end $$;
grant execute on function sign_shift_checklist(uuid, text) to authenticated;

-- RLS
alter table shift_checklists enable row level security;
alter table shift_checklist_ticks enable row level security;
drop policy if exists scl_read on shift_checklists;
drop policy if exists scl_write on shift_checklists;
drop policy if exists sct_read on shift_checklist_ticks;
drop policy if exists sct_write on shift_checklist_ticks;
create policy scl_read on shift_checklists for select
  using (profile_id = auth.uid() or app_level() >= 3 or (app_level() = 2 and home_id = app_home()));
create policy scl_write on shift_checklists for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy sct_read on shift_checklist_ticks for select using (exists (select 1 from shift_checklists c where c.id = checklist_id));
create policy sct_write on shift_checklist_ticks for update
  using (exists (select 1 from shift_checklists c where c.id = checklist_id and c.profile_id = auth.uid() and c.status = 'Open'))
  with check (exists (select 1 from shift_checklists c where c.id = checklist_id and c.profile_id = auth.uid() and c.status = 'Open'));

-- Board view: progress for each checklist.
create or replace view shift_checklist_board with (security_invoker = true) as
select c.id, c.home_id, h.name as home_name, c.profile_id, p.full_name, c.shift_date, c.shift, c.starts_at, c.ends_at, c.status, c.signed_at, c.initials,
       cardinality(c.bed_checks) as bed_check_count, h.bed_check_minutes,
       count(t.id) as items, count(t.status) as answered,
       count(*) filter (where t.status = 'Problem') as problems,
       case when c.status = 'Signed' then 'Signed'
            when now() > c.ends_at + interval '30 minutes' then 'Late'
            when now() > c.ends_at then 'Finishing'
            else 'In progress' end as board_status
from shift_checklists c
join homes h on h.id = c.home_id
join profiles p on p.id = c.profile_id
left join shift_checklist_ticks t on t.checklist_id = c.id
group by c.id, h.name, h.bed_check_minutes, p.full_name;

-- House shift settings: Program Coordinator for their own house, Program Manager and above for any house.
create or replace function save_house_shift_settings(p_home uuid, p_day time, p_evening time, p_night time, p_bed int, p_med boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (app_level() >= 3 or (app_level() = 2 and p_home = app_home())) then
    raise exception 'Only the Program Coordinator of this house or a Program Manager can change its shift settings.';
  end if;
  if p_day = p_evening or p_evening = p_night or p_night = p_day
     or ((p_evening - p_day + interval '24 hours') - case when p_evening >= p_day then interval '24 hours' else interval '0' end)
        >= ((p_night - p_day + interval '24 hours') - case when p_night >= p_day then interval '24 hours' else interval '0' end) then
    raise exception 'Times must go in order around the day: Day, then Evening, then Night (Night may start at or after midnight).';
  end if;
  update homes set shift_day_start = p_day, shift_evening_start = p_evening, shift_night_start = p_night,
    bed_check_minutes = least(120, greatest(10, coalesce(p_bed, 30))), med_count_required = coalesce(p_med, false)
  where id = p_home;
end $$;
revoke execute on function save_house_shift_settings(uuid, time, time, time, int, boolean) from public, anon;
grant execute on function save_house_shift_settings(uuid, time, time, time, int, boolean) to authenticated;

-- ---------- Reminders (every 15 minutes) ----------
create or replace function shift_checklist_reminders() returns void language plpgsql security definer set search_path = public as $$
declare r record; left_n int; hname text;
begin
  for r in select c.*, p.full_name from shift_checklists c join profiles p on p.id = c.profile_id
           where c.status = 'Open' and c.ends_at > now() - interval '3 days' loop
    select count(*) into left_n from shift_checklist_ticks where checklist_id = r.id and status is null;
    select name into hname from homes where id = r.home_id;
    if r.reminded_pre is null and now() >= r.ends_at - interval '30 minutes' and now() < r.ends_at + interval '30 minutes' then
      perform notify(r.profile_id, 'Shift checklist: ' || left_n || ' item(s) left',
        'Finish and sign your ' || r.shift || ' shift checklist at ' || hname || ' before you leave.', '/checklist', 'clpre:' || r.id);
      update shift_checklists set reminded_pre = now() where id = r.id;
    elsif r.reminded_late is null and now() >= r.ends_at + interval '30 minutes' then
      perform notify(r.profile_id, '🔴 Shift checklist not signed',
        'Your ' || r.shift || ' shift checklist at ' || hname || ' (' || r.shift_date || ') is not signed. Please finish it now.', '/checklist?id=' || r.id, 'cllate:' || r.id);
      perform notify(l, r.full_name || ' did not sign the shift checklist',
        hname || ' · ' || r.shift || ' shift ' || r.shift_date || ' · ' || left_n || ' item(s) not done.',
        '/checklist?view=house&home=' || r.home_id, 'cllate:' || r.id || ':' || l)
      from house_leaders(r.home_id) l;
      update shift_checklists set reminded_late = now() where id = r.id;
    end if;
  end loop;
end $$;
revoke execute on function shift_checklist_reminders() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('evergreen-shift-checklists') where exists (select 1 from cron.job where jobname = 'evergreen-shift-checklists');
  perform cron.schedule('evergreen-shift-checklists', '*/15 * * * *', 'select public.shift_checklist_reminders()');
exception when others then
  raise notice 'Scheduler not available here (%).', sqlerrm;
end $$;

select 'shift checklists ready' as result, (select count(*) from house_checklist_items) as house_items, (select count(*) from homes) as houses;
