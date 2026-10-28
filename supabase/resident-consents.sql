-- =====================================================================
-- Evergreen CRM - Resident consents with expiry dates (CLBC: consent is time-limited, and must
-- name the information and who it is shared with; MCFD: signed consents are kept in the individual service record).
--  * Each consent: what it is for, who it covers, the date signed and the date it expires.
--  * Renewing adds a new row, so the old consent stays on record.
-- Staff of the house can read; Program Coordinators, Program Managers and admins can add.
-- Safe to run more than once.
-- =====================================================================

create table if not exists resident_consents (
  id           uuid primary key default gen_random_uuid(),
  resident_id  uuid not null references residents on delete cascade,
  kind         text not null,
  shared_with  text,
  signed_on    date not null,
  expires_on   date not null,
  signed_by    text,
  note         text,
  created_by   uuid references profiles default auth.uid(),
  created_at   timestamptz not null default now(),
  check (expires_on >= signed_on)
);
create index if not exists resident_consents_resident on resident_consents (resident_id, expires_on);
alter table resident_consents enable row level security;

drop policy if exists rc_read on resident_consents;
create policy rc_read on resident_consents for select using (
  app_role() in ('admin', 'manager') or (app_role() = 'staff' and resident_home(resident_id) = app_home()));

drop policy if exists rc_write on resident_consents;
create policy rc_write on resident_consents for insert with check (
  app_role() in ('admin', 'manager') or (app_level() >= 2 and resident_home(resident_id) = app_home()));
