-- =====================================================================
-- Evergreen CRM - Version control for log entries (day book, wellness checks, and all other logs).
--  * Every correction keeps the old version, with who saved it and when, and the reason given.
--  * The entry shows its current version number and when it was last changed.
--  * The author can correct their own entry; managers and admins can correct any entry.
-- Safe to run more than once.
-- =====================================================================

alter table entries add column if not exists version      int not null default 1;
alter table entries add column if not exists updated_at   timestamptz;
alter table entries add column if not exists updated_by   uuid references profiles;
alter table entries add column if not exists updated_note text;

create table if not exists entry_versions (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references entries on delete cascade,
  version      int not null,
  kind         text not null,
  entry_date   date,
  entry_time   time,
  data         jsonb not null default '{}'::jsonb,
  saved_by     uuid references profiles,
  saved_at     timestamptz not null,
  reason       text,
  replaced_at  timestamptz not null default now()
);
create index if not exists entry_versions_entry on entry_versions (entry_id, version);
alter table entry_versions enable row level security;
drop policy if exists ev_read on entry_versions;
create policy ev_read on entry_versions for select
  using (exists (select 1 from entries e where e.id = entry_versions.entry_id));

-- Every update keeps the old version and moves the version number on.
create or replace function entries_versioning() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.data is distinct from new.data) or (old.entry_date is distinct from new.entry_date) or (old.entry_time is distinct from new.entry_time) then
    insert into entry_versions (entry_id, version, kind, entry_date, entry_time, data, saved_by, saved_at, reason)
    values (old.id, old.version, old.kind, old.entry_date, old.entry_time, old.data,
            coalesce(old.updated_by, old.created_by), coalesce(old.updated_at, old.created_at), old.updated_note);
    new.version := old.version + 1;
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists entries_versioning on entries;
create trigger entries_versioning before update on entries
  for each row execute function entries_versioning();

-- Corrections: the author can correct their own entry (managers and admins can correct any).
drop policy if exists "entries edit" on entries;
create policy "entries edit" on entries for update
  using (app_role() in ('admin', 'manager') or created_by = auth.uid())
  with check (app_role() in ('admin', 'manager') or created_by = auth.uid());

-- Updated: staff can correct their own entry only within 30 minutes of saving it.
-- Program Coordinators (their own house), Program Managers, managers and admins can correct any time.
drop policy if exists "entries edit" on entries;
create policy "entries edit" on entries for update
  using (app_role() in ('admin', 'manager') or app_level() >= 3 or (app_level() = 2 and home_id = app_home())
         or (created_by = auth.uid() and created_at > now() - interval '30 minutes'))
  with check (app_role() in ('admin', 'manager') or app_level() >= 3 or (app_level() = 2 and home_id = app_home())
         or (created_by = auth.uid() and created_at > now() - interval '30 minutes'));
