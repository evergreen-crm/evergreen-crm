-- =====================================================================
-- Evergreen CRM - Portal (7 operational divisions, ECC-DIV-2026-001)
-- One records table for every area, plus per-person access to divisions.
-- Run once in Supabase SQL Editor (after modules-2.sql). Safe to run again.
-- If you run this file again, run access-levels.sql again afterwards (it extends has_division with staff levels).
-- =====================================================================

create table if not exists records (
  id           uuid primary key default gen_random_uuid(),
  division     text not null,          -- governance, program, hr, finance, qa, ohs, external
  area         text not null,          -- e.g. std-b, jhsc, tool-b
  visibility   text not null default 'managers' check (visibility in ('staff','managers')),
  home_id      uuid references homes,
  resident_id  uuid references residents on delete set null,
  record_type  text,
  title        text not null,
  record_date  date not null default current_date,
  due_date     date,
  status       text not null default 'Open' check (status in ('Open','In progress','Complete','N/A')),
  data         jsonb not null default '{}'::jsonb,
  created_by   uuid references profiles default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_by   uuid references profiles,
  updated_at   timestamptz
);
create index if not exists records_area_idx on records (division, area, record_date desc);

-- Who (besides admins/managers) may use a division. can_edit = may also edit others' records.
create table if not exists portal_access (
  profile_id  uuid not null references profiles on delete cascade,
  division    text not null,
  can_edit    boolean not null default false,
  granted_by  uuid references profiles default auth.uid(),
  granted_at  timestamptz not null default now(),
  primary key (profile_id, division)
);

create or replace function has_division(div text, need_edit boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from portal_access a join profiles p on p.id = a.profile_id
    where a.profile_id = auth.uid() and a.division = div and p.active
      and (not need_edit or a.can_edit));
$$;

alter table records enable row level security;
alter table portal_access enable row level security;

drop policy if exists "records see" on records;
drop policy if exists "records add" on records;
drop policy if exists "records edit" on records;
drop policy if exists "records delete" on records;
-- Only the admin sees every division. Everyone else (managers included)
-- sees a division only after the admin gives them access.
create policy "records see" on records for select using (
  app_role() = 'admin' or has_division(division));
create policy "records add" on records for insert with check (
  created_by = auth.uid() and (app_role() = 'admin' or has_division(division)));
create policy "records edit" on records for update using (
  app_role() = 'admin' or has_division(division, true) or (created_by = auth.uid() and has_division(division)))
  with check (app_role() = 'admin' or has_division(division, true) or (created_by = auth.uid() and has_division(division)));
create policy "records delete" on records for delete using (app_role() = 'admin');

drop policy if exists "access see" on portal_access;
drop policy if exists "access manage" on portal_access;
create policy "access see" on portal_access for select using (profile_id = auth.uid() or app_role() = 'admin');
create policy "access manage" on portal_access for all using (app_role() = 'admin') with check (app_role() = 'admin');

drop trigger if exists audit_records on records;
drop trigger if exists audit_portal_access on portal_access;
create trigger audit_records after insert or update or delete on records for each row execute function write_audit();
create trigger audit_portal_access after insert or update or delete on portal_access for each row execute function write_audit();
