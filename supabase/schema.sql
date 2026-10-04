-- =====================================================================
-- Evergreen CRM - starter database
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run.
-- It creates the tables, the "who can see what" rules, the lock on
-- signed notes, and an automatic audit log.
-- =====================================================================

-- ---------- Roles ----------
create type user_role as enum ('admin', 'manager', 'staff', 'family');

-- ---------- Tables ----------
create table homes (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  address         text,
  licence_number  text,
  created_at      timestamptz not null default now()
);

-- One row per person who can log in. Linked to Supabase's login table.
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text not null,
  email       text,
  phone       text,
  role        user_role not null,
  home_id     uuid references homes,          -- staff: the home they work in
  active      boolean not null default true,  -- false = cannot see anything
  created_at  timestamptz not null default now()
);

create table residents (
  id              uuid primary key default gen_random_uuid(),
  home_id         uuid not null references homes,
  first_name      text not null,
  last_name       text not null,
  date_of_birth   date,
  admission_date  date,
  status          text not null default 'active',
  allergies       text,
  created_at      timestamptz not null default now()
);

-- Which family member may see which resident.
create table family_links (
  family_id     uuid not null references profiles on delete cascade,
  resident_id   uuid not null references residents on delete cascade,
  relationship  text,
  primary key (family_id, resident_id)
);

create table shift_notes (
  id                 uuid primary key default gen_random_uuid(),
  resident_id        uuid not null references residents,
  author_id          uuid not null references profiles default auth.uid(),
  note_date          date not null default current_date,
  shift              text not null check (shift in ('Day', 'Evening', 'Night')),
  mood               text,
  meals              text,
  activities         text,
  note               text not null,
  share_with_family  boolean not null default false,
  signed_at          timestamptz,             -- set when signed; then locked
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,
  old_data    jsonb,
  new_data    jsonb,
  changed_by  uuid,
  changed_at  timestamptz not null default now()
);

-- ---------- Helper functions (who is logged in?) ----------
-- Return null when the account is inactive, so every rule below fails.
create or replace function app_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create or replace function app_home() returns uuid
language sql stable security definer set search_path = public as $$
  select home_id from profiles where id = auth.uid() and active
$$;

create or replace function is_family_of(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from family_links
    where family_id = auth.uid() and resident_id = rid
  ) and app_role() = 'family'
$$;

create or replace function resident_home(rid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select home_id from residents where id = rid
$$;

-- ---------- Turn on row-level security everywhere ----------
alter table homes        enable row level security;
alter table profiles     enable row level security;
alter table residents    enable row level security;
alter table family_links enable row level security;
alter table shift_notes  enable row level security;
alter table audit_log    enable row level security;

-- homes
create policy "homes: managers see all, staff see own"
  on homes for select using (
    app_role() in ('admin', 'manager') or id = app_home()
  );
create policy "homes: admin edits"
  on homes for all using (app_role() = 'admin') with check (app_role() = 'admin');

-- profiles
create policy "profiles: see self, managers see all"
  on profiles for select using (
    id = auth.uid()
    or app_role() in ('admin', 'manager')
    or (app_role() = 'staff' and home_id = app_home())  -- see co-workers' names
  );
create policy "profiles: admin edits"
  on profiles for update using (app_role() = 'admin') with check (app_role() = 'admin');

-- residents
create policy "residents: who can see"
  on residents for select using (
    app_role() in ('admin', 'manager')
    or (app_role() = 'staff' and home_id = app_home())
    or is_family_of(id)
  );
create policy "residents: managers edit"
  on residents for all using (app_role() in ('admin', 'manager'))
  with check (app_role() in ('admin', 'manager'));

-- family_links
create policy "family_links: who can see"
  on family_links for select using (
    app_role() in ('admin', 'manager') or family_id = auth.uid()
  );
create policy "family_links: managers edit"
  on family_links for all using (app_role() in ('admin', 'manager'))
  with check (app_role() in ('admin', 'manager'));

-- shift_notes
create policy "shift_notes: who can see"
  on shift_notes for select using (
    app_role() in ('admin', 'manager')
    or (app_role() = 'staff' and resident_home(resident_id) = app_home())
    or (is_family_of(resident_id) and share_with_family and signed_at is not null)
  );
create policy "shift_notes: staff write for own home"
  on shift_notes for insert with check (
    author_id = auth.uid()
    and (
      app_role() in ('admin', 'manager')
      or (app_role() = 'staff' and resident_home(resident_id) = app_home())
    )
  );
create policy "shift_notes: author edits unsigned only"
  on shift_notes for update using (author_id = auth.uid() and signed_at is null)
  with check (author_id = auth.uid());
-- No delete policy: notes can never be deleted from the app.

-- audit_log: admins read; only the trigger writes.
create policy "audit_log: admin reads"
  on audit_log for select using (app_role() = 'admin');

-- ---------- Lock signed notes ----------
create or replace function lock_signed_notes() returns trigger
language plpgsql as $$
begin
  if old.signed_at is not null then
    raise exception 'Signed notes cannot be changed. Add a new note instead.';
  end if;
  new.author_id  := old.author_id;     -- author can't be swapped
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

create trigger shift_notes_lock
  before update on shift_notes
  for each row execute function lock_signed_notes();

-- ---------- Automatic audit log ----------
create or replace function write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    case when tg_op = 'DELETE' then to_jsonb(old)->>'id' else to_jsonb(new)->>'id' end,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end $$;

create trigger audit_homes        after insert or update or delete on homes        for each row execute function write_audit();
create trigger audit_profiles     after insert or update or delete on profiles     for each row execute function write_audit();
create trigger audit_residents    after insert or update or delete on residents    for each row execute function write_audit();
create trigger audit_family_links after insert or update or delete on family_links for each row execute function write_audit();
create trigger audit_shift_notes  after insert or update or delete on shift_notes  for each row execute function write_audit();

-- ---------- Your first admin ----------
-- 1. Supabase -> Authentication -> Users -> "Add user" -> your email, tick "Auto confirm".
-- 2. Copy your new user's ID, then run (replace the ID and name):
--
-- insert into homes (name) values ('Evergreen House 1');
-- insert into profiles (id, full_name, email, role)
-- values ('PASTE-YOUR-USER-ID', 'Melvin', 'you@example.com', 'admin');
