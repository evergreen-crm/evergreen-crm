-- =====================================================================
-- Evergreen CRM - House contacts: the social worker, emergency and other contacts for each house.
-- Read by the house's staff, Program Coordinators, Program Managers, admins and above.
-- Edited by the house's Program Coordinator, Program Managers and admins.
-- Safe to run more than once.
-- =====================================================================

create table if not exists house_contacts (
  id            uuid primary key default gen_random_uuid(),
  home_id       uuid not null references homes on delete cascade,
  kind          text not null check (kind in (
    'MCFD social worker', 'CLBC facilitator', 'Guardian or family', 'Emergency contact', 'Doctor or clinic',
    'Pharmacy', 'Dentist', 'School or day program', 'Police (non-emergency)', 'Other')),
  name          text not null,
  organisation  text,
  phone         text,
  email         text,
  address       text,
  notes         text,
  active        boolean not null default true,
  created_by    uuid references profiles default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists house_contacts_home on house_contacts (home_id, active);
alter table house_contacts enable row level security;

drop policy if exists hc_read on house_contacts;
create policy hc_read on house_contacts for select
  using (app_role() = 'admin' or app_level() >= 3 or app_home() = home_id);

drop policy if exists hc_write on house_contacts;
create policy hc_write on house_contacts for all
  using (app_role() = 'admin' or app_level() >= 3 or (app_level() = 2 and app_home() = home_id))
  with check (app_role() = 'admin' or app_level() >= 3 or (app_level() = 2 and app_home() = home_id));
