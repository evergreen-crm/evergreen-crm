-- =====================================================================
-- Evergreen CRM - Houses, full resident profiles, and calendar
-- Run once in Supabase SQL Editor (after schema.sql and hr.sql).
-- =====================================================================

-- ---------- More details on each house ----------
alter table homes add column if not exists phone text;
alter table homes add column if not exists house_type text default 'Adults'
  check (house_type in ('Children', 'Youth', 'Adults', 'Mixed'));
alter table homes add column if not exists capacity int;
alter table homes add column if not exists notes text;

-- ---------- Full resident profile (children and adults) ----------
alter table residents add column if not exists preferred_name text;
alter table residents add column if not exists gender text;
alter table residents add column if not exists care_type text default 'Adult'
  check (care_type in ('Child', 'Youth', 'Adult'));
alter table residents add column if not exists funder text;             -- MCFD, CLBC, Health Authority, Private...
alter table residents add column if not exists file_number text;        -- funder / agency file number
alter table residents add column if not exists case_worker_name text;   -- social worker / CLBC facilitator
alter table residents add column if not exists case_worker_phone text;
alter table residents add column if not exists case_worker_email text;
alter table residents add column if not exists guardian_name text;      -- parent, legal guardian, rep agreement
alter table residents add column if not exists guardian_relationship text;
alter table residents add column if not exists guardian_phone text;
alter table residents add column if not exists emergency_contact_name text;
alter table residents add column if not exists emergency_contact_phone text;
alter table residents add column if not exists phn text;                -- BC Personal Health Number
alter table residents add column if not exists doctor_name text;
alter table residents add column if not exists doctor_phone text;
alter table residents add column if not exists diagnoses text;
alter table residents add column if not exists medications_summary text;
alter table residents add column if not exists dietary_needs text;
alter table residents add column if not exists behaviour_support_notes text;
alter table residents add column if not exists school_or_day_program text;
alter table residents add column if not exists care_plan_review_date date;
alter table residents add column if not exists discharge_date date;
alter table residents add column if not exists profile_notes text;

-- ---------- Calendar: appointments and events ----------
create table if not exists appointments (
  id                 uuid primary key default gen_random_uuid(),
  home_id            uuid not null references homes,
  resident_id        uuid references residents on delete cascade,  -- empty = whole-house event
  title              text not null,
  category           text not null default 'Other',
  appt_date          date not null,
  start_time         time,
  end_time           time,
  location           text,
  notes              text,
  status             text not null default 'Scheduled'
                     check (status in ('Scheduled', 'Done', 'Cancelled')),
  share_with_family  boolean not null default false,
  created_by         uuid references profiles default auth.uid(),
  created_at         timestamptz not null default now()
);

alter table appointments enable row level security;

create policy "appointments see" on appointments for select using (
  app_role() in ('admin', 'manager')
  or (app_role() = 'staff' and home_id = app_home())
  or (resident_id is not null and is_family_of(resident_id) and share_with_family)
);
create policy "appointments add" on appointments for insert with check (
  app_role() in ('admin', 'manager') or (app_role() = 'staff' and home_id = app_home())
);
create policy "appointments edit" on appointments for update using (
  app_role() in ('admin', 'manager') or (app_role() = 'staff' and home_id = app_home())
) with check (
  app_role() in ('admin', 'manager') or (app_role() = 'staff' and home_id = app_home())
);
create policy "appointments delete" on appointments for delete using (
  app_role() in ('admin', 'manager')
);

create trigger audit_appointments after insert or update or delete on appointments
  for each row execute function write_audit();

-- Managers may edit houses (admins already can)
create policy "homes manager edit" on homes for update
  using (app_role() = 'manager') with check (app_role() = 'manager');
