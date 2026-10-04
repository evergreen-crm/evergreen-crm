-- =====================================================================
-- Evergreen CRM - Module pack 2
-- Logs (contact, health, behaviour, money, goal progress, communication
-- book, fire drills, safety checks), medications (MAR), goals, documents,
-- shift schedule, timesheets, family messages, behavioural incidents.
-- Run once in Supabase SQL Editor (after requirements-incidents.sql).
-- =====================================================================

-- ---------- Generic log entries (one table, many entry types) ----------
create table if not exists entries (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null,            -- contact, vitals, weight, sleep, seizure, bowel, behaviour, goal_progress, money, commbook, fire_drill, safety_check
  home_id            uuid not null references homes,
  resident_id        uuid references residents on delete cascade,  -- empty for house entries
  entry_date         date not null default current_date,
  entry_time         time,
  data               jsonb not null default '{}'::jsonb,
  amount             numeric(10,2),            -- money log: + deposit, - spending
  share_with_family  boolean not null default false,
  created_by         uuid references profiles default auth.uid(),
  created_at         timestamptz not null default now()
);
create index if not exists entries_resident_idx on entries (resident_id, kind, entry_date desc);
create index if not exists entries_home_idx on entries (home_id, kind, entry_date desc);

alter table entries enable row level security;
drop policy if exists "entries see" on entries;
drop policy if exists "entries add" on entries;
drop policy if exists "entries edit" on entries;
drop policy if exists "entries delete" on entries;
create policy "entries see" on entries for select using (
  app_role() in ('admin','manager')
  or (app_role() = 'staff' and home_id = app_home())
  or (resident_id is not null and is_family_of(resident_id) and share_with_family)
);
create policy "entries add" on entries for insert with check (
  created_by = auth.uid() and (
    app_role() in ('admin','manager') or (app_role() = 'staff' and home_id = app_home()))
);
-- Entries are a permanent record: only managers/admins can correct or remove them.
create policy "entries edit" on entries for update using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));
create policy "entries delete" on entries for delete using (app_role() = 'admin');

-- ---------- Medications and MAR ----------
create table if not exists medications (
  id            uuid primary key default gen_random_uuid(),
  resident_id   uuid not null references residents on delete cascade,
  name          text not null,
  dose          text,
  route         text,                 -- oral, topical, inhaled...
  times         text[] not null default '{}',   -- scheduled times, e.g. {08:00,20:00}
  is_prn        boolean not null default false, -- as needed
  instructions  text,
  prescriber    text,
  start_date    date,
  end_date      date,
  active        boolean not null default true,
  created_by    uuid references profiles default auth.uid(),
  created_at    timestamptz not null default now()
);

create table if not exists med_administrations (
  id              uuid primary key default gen_random_uuid(),
  medication_id   uuid not null references medications on delete cascade,
  resident_id     uuid not null references residents on delete cascade,
  admin_date      date not null default current_date,
  scheduled_time  text,               -- matches one of medications.times; empty for PRN
  status          text not null check (status in ('Given','Refused','Missed','Held','Error')),
  given_at        timestamptz not null default now(),
  reason          text,               -- PRN reason / refusal / error details
  given_by        uuid references profiles default auth.uid(),
  unique (medication_id, admin_date, scheduled_time)
);

alter table medications enable row level security;
alter table med_administrations enable row level security;
drop policy if exists "meds see" on medications;
drop policy if exists "meds edit" on medications;
drop policy if exists "mar see" on med_administrations;
drop policy if exists "mar add" on med_administrations;
drop policy if exists "mar fix" on med_administrations;
create policy "meds see" on medications for select using (
  app_role() in ('admin','manager') or (app_role() = 'staff' and resident_home(resident_id) = app_home()));
create policy "meds edit" on medications for all using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));
create policy "mar see" on med_administrations for select using (
  app_role() in ('admin','manager') or (app_role() = 'staff' and resident_home(resident_id) = app_home()));
create policy "mar add" on med_administrations for insert with check (
  given_by = auth.uid() and (app_role() in ('admin','manager') or (app_role() = 'staff' and resident_home(resident_id) = app_home())));
create policy "mar fix" on med_administrations for update using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));

-- ---------- Goals ----------
create table if not exists goals (
  id           uuid primary key default gen_random_uuid(),
  resident_id  uuid not null references residents on delete cascade,
  title        text not null,
  domain       text,                 -- Health, Daily living, Social, Education/Work, Culture, Behaviour
  description  text,
  target_date  date,
  status       text not null default 'Active' check (status in ('Active','Achieved','Discontinued')),
  created_by   uuid references profiles default auth.uid(),
  created_at   timestamptz not null default now()
);
alter table goals enable row level security;
drop policy if exists "goals see" on goals;
drop policy if exists "goals edit" on goals;
create policy "goals see" on goals for select using (
  app_role() in ('admin','manager') or (app_role() = 'staff' and resident_home(resident_id) = app_home())
  or is_family_of(resident_id));
create policy "goals edit" on goals for all using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));

-- ---------- Documents (files stored in Supabase Storage, private) ----------
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  home_id      uuid not null references homes,
  resident_id  uuid references residents on delete cascade,
  title        text not null,
  category     text,
  file_path    text not null,        -- {home_id}/{resident_id or 'house'}/{uuid}-{filename}
  file_size    bigint,
  uploaded_by  uuid references profiles default auth.uid(),
  created_at   timestamptz not null default now()
);
alter table documents enable row level security;
drop policy if exists "documents see" on documents;
drop policy if exists "documents add" on documents;
drop policy if exists "documents delete" on documents;
create policy "documents see" on documents for select using (
  app_role() in ('admin','manager') or (app_role() = 'staff' and home_id = app_home()));
create policy "documents add" on documents for insert with check (
  app_role() in ('admin','manager') or (app_role() = 'staff' and home_id = app_home()));
create policy "documents delete" on documents for delete using (app_role() in ('admin','manager'));

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 26214400)   -- 25 MB per file
on conflict (id) do nothing;

drop policy if exists "evergreen docs read" on storage.objects;
drop policy if exists "evergreen docs upload" on storage.objects;
drop policy if exists "evergreen docs delete" on storage.objects;
create policy "evergreen docs read" on storage.objects for select to authenticated using (
  bucket_id = 'documents' and (app_role() in ('admin','manager')
    or (app_role() = 'staff' and (storage.foldername(name))[1] = app_home()::text)));
create policy "evergreen docs upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'documents' and (app_role() in ('admin','manager')
    or (app_role() = 'staff' and (storage.foldername(name))[1] = app_home()::text)));
create policy "evergreen docs delete" on storage.objects for delete to authenticated using (
  bucket_id = 'documents' and app_role() in ('admin','manager'));

-- ---------- Shift schedule ----------
create table if not exists shifts (
  id           uuid primary key default gen_random_uuid(),
  home_id      uuid not null references homes,
  profile_id   uuid references profiles on delete set null,   -- empty = open shift
  shift_date   date not null,
  start_time   time not null,
  end_time     time not null,
  label        text,                 -- Day, Evening, Awake night...
  notes        text,
  created_by   uuid references profiles default auth.uid(),
  created_at   timestamptz not null default now()
);
alter table shifts enable row level security;
drop policy if exists "shifts see" on shifts;
drop policy if exists "shifts edit" on shifts;
create policy "shifts see" on shifts for select using (
  app_role() in ('admin','manager') or (app_role() = 'staff' and (home_id = app_home() or profile_id = auth.uid())));
create policy "shifts edit" on shifts for all using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));

-- ---------- Timesheets ----------
create table if not exists time_entries (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles default auth.uid(),
  home_id      uuid references homes,
  clock_in     timestamptz not null default now(),
  clock_out    timestamptz,
  break_minutes int not null default 0,
  notes        text,
  approved_by  uuid references profiles,
  approved_at  timestamptz,
  created_at   timestamptz not null default now()
);
alter table time_entries enable row level security;
drop policy if exists "time see" on time_entries;
drop policy if exists "time add" on time_entries;
drop policy if exists "time edit own" on time_entries;
drop policy if exists "time manage" on time_entries;
drop policy if exists "time manager add" on time_entries;
drop policy if exists "time delete" on time_entries;
create policy "time see" on time_entries for select using (profile_id = auth.uid() or app_role() in ('admin','manager'));
create policy "time add" on time_entries for insert with check (profile_id = auth.uid() and app_role() is not null and app_role() <> 'family');
create policy "time edit own" on time_entries for update using (profile_id = auth.uid() and approved_at is null) with check (profile_id = auth.uid() and approved_at is null);
create policy "time manage" on time_entries for update using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));
create policy "time manager add" on time_entries for insert with check (app_role() in ('admin','manager'));
create policy "time delete" on time_entries for delete using (app_role() in ('admin','manager'));

-- ---------- Family portal messages ----------
create table if not exists messages (
  id           uuid primary key default gen_random_uuid(),
  resident_id  uuid not null references residents on delete cascade,
  sender_id    uuid not null references profiles default auth.uid(),
  body         text not null,
  sender_role  text,                 -- filled in automatically: family / staff / manager / admin
  read_at      timestamptz,          -- when staff (or family, for staff messages) read it
  created_at   timestamptz not null default now()
);
alter table messages add column if not exists sender_role text;
alter table messages enable row level security;
drop policy if exists "messages see" on messages;
drop policy if exists "messages send" on messages;
drop policy if exists "messages mark read" on messages;
create policy "messages see" on messages for select using (
  app_role() in ('admin','manager') or (app_role() = 'staff' and resident_home(resident_id) = app_home())
  or is_family_of(resident_id));
create policy "messages send" on messages for insert with check (
  sender_id = auth.uid() and (app_role() in ('admin','manager')
    or (app_role() = 'staff' and resident_home(resident_id) = app_home()) or is_family_of(resident_id)));
create policy "messages mark read" on messages for update using (
  app_role() in ('admin','manager') or (app_role() = 'staff' and resident_home(resident_id) = app_home())
  or is_family_of(resident_id)) with check (true);

-- Record who sent it (family or Evergreen) automatically.
create or replace function set_message_role() returns trigger language plpgsql as $$
begin
  new.sender_role := app_role();
  return new;
end $$;
drop trigger if exists messages_role on messages;
create trigger messages_role before insert on messages for each row execute function set_message_role();

-- Only the "read" time can change on a message; the text and sender are permanent.
create or replace function lock_message_text() returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body or new.sender_id is distinct from old.sender_id
     or new.resident_id is distinct from old.resident_id or new.sender_role is distinct from old.sender_role then
    raise exception 'Messages cannot be edited.';
  end if;
  return new;
end $$;
drop trigger if exists messages_lock on messages;
create trigger messages_lock before update on messages for each row execute function lock_message_text();

-- ---------- Critical vs behavioural incidents ----------
alter table incidents add column if not exists incident_class text not null default 'Critical'
  check (incident_class in ('Critical','Behavioural','Minor'));
alter table incidents add column if not exists antecedent text;       -- what happened before
alter table incidents add column if not exists consequence text;      -- what happened after
alter table incidents add column if not exists intervention text;     -- support / de-escalation used
alter table incidents add column if not exists duration_minutes int;
alter table incidents add column if not exists physical_intervention boolean not null default false;
alter table incidents add column if not exists injuries text;

-- ---------- Audit everything ----------
drop trigger if exists audit_entries on entries;
drop trigger if exists audit_medications on medications;
drop trigger if exists audit_med_administrations on med_administrations;
drop trigger if exists audit_goals on goals;
drop trigger if exists audit_documents on documents;
drop trigger if exists audit_shifts on shifts;
drop trigger if exists audit_time_entries on time_entries;
drop trigger if exists audit_messages on messages;
create trigger audit_entries after insert or update or delete on entries for each row execute function write_audit();
create trigger audit_medications after insert or update or delete on medications for each row execute function write_audit();
create trigger audit_med_administrations after insert or update or delete on med_administrations for each row execute function write_audit();
create trigger audit_goals after insert or update or delete on goals for each row execute function write_audit();
create trigger audit_documents after insert or update or delete on documents for each row execute function write_audit();
create trigger audit_shifts after insert or update or delete on shifts for each row execute function write_audit();
create trigger audit_time_entries after insert or update or delete on time_entries for each row execute function write_audit();
create trigger audit_messages after insert or update or delete on messages for each row execute function write_audit();
