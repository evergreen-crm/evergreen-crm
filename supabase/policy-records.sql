-- Policy approval and witness records. Run once in the Supabase SQL editor (or apply as a migration).
-- Staff still sign each policy on its own. When a staff member has signed every required policy,
-- one record is made for them listing those policies. A witness (coordinator, then assigned manager,
-- then level 4+) reviews the signed copies and signs the record once. Writes go through the server
-- (service key); people can only read records they are allowed to see.

create table if not exists policy_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'awaiting_witness' check (status in ('awaiting_witness', 'witnessed', 'superseded')),
  items jsonb not null default '[]'::jsonb,        -- [{ policy_id, ack_id, code, title, version_label, effective_date, signed_at, file_sha256 }]
  stage smallint not null default 1 check (stage between 1 and 3),  -- 1 coordinator, 2 + assigned manager, 3 + level 4 and up
  stage_started_at timestamptz not null default now(),
  ready_at timestamptz not null default now(),
  witnessed_by uuid references profiles(id),
  witnessed_name text,
  witnessed_level integer,
  witnessed_at timestamptz,
  witness_signature text,
  witness_confirmed boolean not null default false,
  file_path text,
  file_sha256 text,
  created_at timestamptz not null default now()
);
create index if not exists policy_records_profile_idx on policy_records(profile_id);
create index if not exists policy_records_status_idx on policy_records(status);

create table if not exists policy_record_events (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references policy_records(id) on delete cascade,
  at timestamptz not null default now(),
  event text not null,        -- created | reminder | escalated | witnessed | superseded
  by_profile uuid references profiles(id),
  detail text
);
create index if not exists policy_record_events_record_idx on policy_record_events(record_id, at);

alter table policy_records enable row level security;
alter table policy_record_events enable row level security;

drop policy if exists "policy records read" on policy_records;
create policy "policy records read" on policy_records for select to authenticated
  using (profile_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')));

drop policy if exists "policy record events read" on policy_record_events;
create policy "policy record events read" on policy_record_events for select to authenticated
  using (exists (select 1 from policy_records r where r.id = record_id and (r.profile_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('admin', 'manager')))));
