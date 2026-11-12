-- =====================================================================
-- Evergreen CRM - Policy sign-off records and the witness review (Nov 12, 2026).
--   * Staff sign each policy on its own (the signature is stamped inside the policy PDF).
--   * When a person has signed every policy that applies to them, one sign-off record is made listing them.
--     A witness reviews the signed copies and signs the record once: the Program Coordinator first,
--     then (after 7 days) the Program Manager, then (after 7 more days) the directors.
--   * Read: the person themself, their house leaders (staff_in_my_houses), HR, directors, Administrator.
--     Writes only by the server after its own checks (service key): no insert/update/delete policies.
-- Run as migration policy_records. Safe to re-run.
-- =====================================================================

create table if not exists public.policy_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'awaiting_witness' check (status in ('awaiting_witness', 'witnessed', 'superseded')),
  items jsonb not null default '[]'::jsonb,   -- [{ policy_id, version_id, ack_id, code, title, version_label, signed_at }]
  items_key text not null,                     -- the signed versions, sorted: tells when the set has changed
  stage smallint not null default 1 check (stage between 1 and 3),  -- 1 coordinator, 2 program manager, 3 directors
  stage_started_at timestamptz not null default now(),
  ready_at timestamptz not null default now(),
  witnessed_by uuid references public.profiles(id),
  witnessed_name text,
  witnessed_role text,
  witnessed_at timestamptz,
  witness_signature text,
  file_path text,
  file_sha256 text,
  created_at timestamptz not null default now()
);
create index if not exists policy_records_profile_idx on public.policy_records(profile_id);
create index if not exists policy_records_status_idx on public.policy_records(status);
create unique index if not exists policy_records_one_open on public.policy_records(profile_id) where status = 'awaiting_witness';

create table if not exists public.policy_record_events (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.policy_records(id) on delete cascade,
  at timestamptz not null default now(),
  event text not null,        -- created | escalated | witnessed | superseded
  by_profile uuid references public.profiles(id),
  detail text
);
create index if not exists policy_record_events_record_idx on public.policy_record_events(record_id, at);

alter table public.policy_records enable row level security;
alter table public.policy_record_events enable row level security;

create or replace function public.can_see_policy_record(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p = auth.uid() or app_role() = 'admin' or coalesce(app_group(), '') = 'hr'
      or (coalesce(app_level(), 0) >= 4 and coalesce(app_group(), '') = '')
      or (coalesce(app_level(), 0) in (2, 3) and coalesce(app_group(), '') = '' and staff_in_my_houses(p))
$$;
-- A witness is never the person themself, and is always above them: house leaders, directors, Administrator.
create or replace function public.can_witness_policy_record(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p is not null and p <> auth.uid() and (
    app_role() = 'admin'
    or (coalesce(app_group(), '') = '' and coalesce(app_level(), 0) in (2, 3) and staff_in_my_houses(p))
    or (coalesce(app_group(), '') = '' and coalesce(app_level(), 0) >= 4
        and coalesce(app_level(), 0) > coalesce((select case when role = 'admin' then 8 else coalesce(level, 1) end from profiles where id = p), 1)))
$$;
revoke execute on function public.can_see_policy_record(uuid), public.can_witness_policy_record(uuid) from public, anon;
grant execute on function public.can_see_policy_record(uuid), public.can_witness_policy_record(uuid) to authenticated, service_role;

drop policy if exists "policy records read" on public.policy_records;
create policy "policy records read" on public.policy_records for select to authenticated using (can_see_policy_record(profile_id));
drop policy if exists "policy record events read" on public.policy_record_events;
create policy "policy record events read" on public.policy_record_events for select to authenticated
  using (exists (select 1 from policy_records r where r.id = record_id and can_see_policy_record(r.profile_id)));

-- Witness details on each signed policy (stamped into the signed copy when the record is witnessed).
alter table public.policy_acks add column if not exists witnessed_by uuid references public.profiles(id);
alter table public.policy_acks add column if not exists witnessed_name text;
alter table public.policy_acks add column if not exists witnessed_at timestamptz;
