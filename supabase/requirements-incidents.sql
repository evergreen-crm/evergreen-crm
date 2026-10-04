-- =====================================================================
-- Evergreen CRM - MCFD/CLBC requirement checklists and incident reports
-- Run once in Supabase SQL Editor (after houses-calendar.sql).
-- =====================================================================

-- Flags that switch on extra checklist items
alter table residents add column if not exists is_indigenous boolean not null default false;
alter table residents add column if not exists has_bsp boolean not null default false;      -- behaviour support plan
alter table residents add column if not exists on_medication boolean not null default false;

-- One row per resident per checklist item
create table if not exists resident_requirements (
  resident_id   uuid not null references residents on delete cascade,
  req_key       text not null,
  status        text not null default 'Not started'
                check (status in ('Not started', 'In progress', 'Complete', 'N/A')),
  completed_on  date,
  notes         text,
  updated_by    uuid references profiles default auth.uid(),
  updated_at    timestamptz not null default now(),
  primary key (resident_id, req_key)
);

-- Incident / critical incident reports
create table if not exists incidents (
  id                     uuid primary key default gen_random_uuid(),
  resident_id            uuid references residents on delete cascade,
  home_id                uuid not null references homes,
  occurred_on            date not null,
  occurred_time          time,
  incident_type          text not null,
  is_critical            boolean not null default true,   -- reportable to MCFD / CLBC
  is_urgent              boolean not null default false,  -- needs immediate phone call
  description            text not null,
  actions_taken          text,
  verbal_report_to       text,          -- who was phoned (social worker / CLBC analyst)
  verbal_report_at       timestamptz,
  written_report_sent_on date,
  family_notified        boolean not null default false,
  internal_review_on     date,
  status                 text not null default 'Open' check (status in ('Open', 'Closed')),
  reported_by            uuid references profiles default auth.uid(),
  created_at             timestamptz not null default now()
);

alter table resident_requirements enable row level security;
alter table incidents enable row level security;

-- Requirements: staff of the house can see and update; managers/admins everywhere.
create policy "requirements see" on resident_requirements for select using (
  app_role() in ('admin', 'manager')
  or (app_role() = 'staff' and resident_home(resident_id) = app_home())
);
create policy "requirements write" on resident_requirements for all using (
  app_role() in ('admin', 'manager')
  or (app_role() = 'staff' and resident_home(resident_id) = app_home())
) with check (
  app_role() in ('admin', 'manager')
  or (app_role() = 'staff' and resident_home(resident_id) = app_home())
);

-- Incidents: staff of the house can see, add and update; only managers/admins delete. Families: no access.
create policy "incidents see" on incidents for select using (
  app_role() in ('admin', 'manager') or (app_role() = 'staff' and home_id = app_home())
);
create policy "incidents add" on incidents for insert with check (
  app_role() in ('admin', 'manager') or (app_role() = 'staff' and home_id = app_home())
);
create policy "incidents edit" on incidents for update using (
  app_role() in ('admin', 'manager') or (app_role() = 'staff' and home_id = app_home())
) with check (
  app_role() in ('admin', 'manager') or (app_role() = 'staff' and home_id = app_home())
);
create policy "incidents delete" on incidents for delete using (app_role() in ('admin', 'manager'));

create trigger audit_resident_requirements after insert or update or delete on resident_requirements
  for each row execute function write_audit();
create trigger audit_incidents after insert or update or delete on incidents
  for each row execute function write_audit();
