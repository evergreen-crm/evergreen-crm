-- =====================================================================
-- Evergreen CRM - HR portal (run once in Supabase SQL Editor)
-- Staff details, certifications (with expiry) and training records.
-- =====================================================================

-- Extra HR details for each staff member (one row per person)
create table staff_details (
  profile_id         uuid primary key references profiles on delete cascade,
  position           text,                 -- e.g. Support Worker, House Lead
  employment_type    text check (employment_type in ('Full-time', 'Part-time', 'Casual')),
  hire_date          date,
  emergency_contact  text,
  emergency_phone    text,
  notes              text,
  updated_at         timestamptz not null default now()
);

-- Certificates that expire (First Aid, Med Admin, Criminal Record Check, etc.)
create table certifications (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references profiles on delete cascade,
  cert_type    text not null,
  issued_on    date,
  expires_on   date,
  notes        text,
  created_by   uuid references profiles default auth.uid(),
  created_at   timestamptz not null default now()
);

-- Training completed (orientation, workshops, etc.)
create table trainings (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references profiles on delete cascade,
  title         text not null,
  completed_on  date not null default current_date,
  hours         numeric(5,1),
  notes         text,
  created_by    uuid references profiles default auth.uid(),
  created_at    timestamptz not null default now()
);

alter table staff_details  enable row level security;
alter table certifications enable row level security;
alter table trainings      enable row level security;

-- Managers/admins see and edit everyone; staff see only their own records.
create policy "staff_details see" on staff_details for select
  using (app_role() in ('admin','manager') or profile_id = auth.uid());
create policy "staff_details edit" on staff_details for all
  using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));

create policy "certifications see" on certifications for select
  using (app_role() in ('admin','manager') or profile_id = auth.uid());
create policy "certifications edit" on certifications for all
  using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));

create policy "trainings see" on trainings for select
  using (app_role() in ('admin','manager') or profile_id = auth.uid());
create policy "trainings edit" on trainings for all
  using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));

-- Every change is recorded in the audit log
create trigger audit_staff_details  after insert or update or delete on staff_details  for each row execute function write_audit();
create trigger audit_certifications after insert or update or delete on certifications for each row execute function write_audit();
create trigger audit_trainings      after insert or update or delete on trainings      for each row execute function write_audit();
