-- =====================================================================
-- Evergreen CRM - Policy library (versions + digital signatures),
-- employee numbers, resignations, staff-entered training, notifications.
-- Safe to run again.
-- =====================================================================

-- ---------- Employee number and employment status ----------
create sequence if not exists employee_no_seq start 1;
alter table staff_details add column if not exists employee_no text unique;
alter table staff_details add column if not exists employment_status text not null default 'Active';
alter table staff_details drop constraint if exists staff_details_employment_status_check;
alter table staff_details add constraint staff_details_employment_status_check
  check (employment_status in ('Active','On leave','Resigned','Terminated','Retired'));
alter table staff_details add column if not exists resignation_date date;   -- date notice was given
alter table staff_details add column if not exists last_day date;
alter table staff_details add column if not exists separation_reason text;
alter table staff_details add column if not exists rehire_eligible text;
alter table staff_details add column if not exists exit_interview_on date;

create or replace function set_employee_no() returns trigger language plpgsql as $$
begin
  if new.employee_no is null then new.employee_no := 'EVG-' || lpad(nextval('employee_no_seq')::text, 4, '0'); end if;
  return new;
end $$;
drop trigger if exists staff_details_employee_no on staff_details;
create trigger staff_details_employee_no before insert on staff_details for each row execute function set_employee_no();

-- Every staff member, manager and admin gets an HR row (and an employee number).
insert into staff_details (profile_id) select p.id from profiles p
where p.role <> 'family' and not exists (select 1 from staff_details s where s.profile_id = p.id)
order by p.created_at;
update staff_details set employee_no = 'EVG-' || lpad(nextval('employee_no_seq')::text, 4, '0') where employee_no is null;

create or replace function new_profile_hr_row() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role <> 'family' then insert into staff_details (profile_id) values (new.id) on conflict do nothing; end if;
  return new;
end $$;
drop trigger if exists profiles_hr_row on profiles;
create trigger profiles_hr_row after insert on profiles for each row execute function new_profile_hr_row();

-- ---------- Staff can add their own training (a manager verifies it) ----------
drop policy if exists "trainings self add" on trainings;
create policy "trainings self add" on trainings for insert with check (
  profile_id = auth.uid() and verified_by is null and app_role() in ('staff','manager','admin'));
alter table trainings add column if not exists file_path text;

-- Training already recorded by a manager counts as verified.
update trainings t set verified_by = t.created_by
where t.verified_by is null and exists (select 1 from profiles p where p.id = t.created_by and p.role in ('admin','manager'));

-- ---------- Notifications ----------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles on delete cascade,
  title       text not null,
  body        text,
  link        text,
  dedupe_key  text unique,          -- stops the daily check sending the same reminder twice
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_profile_idx on notifications (profile_id, created_at desc);
alter table notifications enable row level security;
drop policy if exists "notif see" on notifications;
drop policy if exists "notif read" on notifications;
create policy "notif see" on notifications for select using (profile_id = auth.uid());
create policy "notif read" on notifications for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create or replace function notify(pid uuid, t text, b text, l text, k text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if pid is null then return; end if;
  insert into notifications (profile_id, title, body, link, dedupe_key) values (pid, t, b, l, k)
  on conflict (dedupe_key) do nothing;
end $$;

create or replace function notify_managers(t text, b text, l text, k text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from profiles where role in ('admin','manager') and active loop
    perform notify(r.id, t, b, l, case when k is null then null else k || ':' || r.id end);
  end loop;
end $$;
revoke execute on function notify(uuid, text, text, text, text) from public, authenticated;
revoke execute on function notify_managers(text, text, text, text) from public, authenticated;

-- Onboarding events
create or replace function onboarding_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select full_name into who from profiles where id = new.profile_id;
  if tg_table_name = 'onboardings' then
    if tg_op = 'INSERT' then
      perform notify(new.profile_id, 'Your onboarding checklist is ready', 'Please complete it before your start date.', '/onboarding');
    elsif new.status = 'Submitted' and old.status is distinct from 'Submitted' then
      perform notify_managers(who || ' sent their onboarding for review', null, '/hr/' || new.profile_id || '/onboarding');
    end if;
  else
    if new.status is distinct from old.status then
      if new.status = 'Submitted' then
        perform notify_managers(who || ': ' || new.title || ' — ready to review', null, '/hr/' || new.profile_id || '/onboarding');
      elsif new.status = 'Returned' then
        perform notify(new.profile_id, 'Please fix: ' || new.title, new.review_note, '/onboarding');
      elsif new.status = 'Verified' and new.section = 'training' then
        perform notify(new.profile_id, 'Training verified — certificate ready', new.title, '/hr/' || new.profile_id);
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists onboardings_notify on onboardings;
drop trigger if exists onboarding_items_notify on onboarding_items;
create trigger onboardings_notify after insert or update on onboardings for each row execute function onboarding_notify();
create trigger onboarding_items_notify after update on onboarding_items for each row execute function onboarding_notify();

-- Staff-added training → managers verify
create or replace function training_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare who text;
begin
  select full_name into who from profiles where id = new.profile_id;
  if tg_op = 'INSERT' and new.verified_by is null then
    perform notify_managers(who || ' added training: ' || new.title, 'Please verify it.', '/hr/' || new.profile_id);
  elsif tg_op = 'UPDATE' and new.verified_by is not null and old.verified_by is null then
    perform notify(new.profile_id, 'Training verified — certificate ready', new.title, '/hr/certificate/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists trainings_notify on trainings;
create trigger trainings_notify after insert or update on trainings for each row execute function training_notify();

-- ---------- Policy library with version control ----------
create table if not exists policies (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  code                text,                 -- e.g. ECC-HR-POL-2026-001
  category            text,
  description         text,
  require_signature   boolean not null default true,
  active              boolean not null default true,
  current_version_id  uuid,
  created_by          uuid references profiles default auth.uid(),
  created_at          timestamptz not null default now()
);
create table if not exists policy_versions (
  id              uuid primary key default gen_random_uuid(),
  policy_id       uuid not null references policies on delete cascade,
  version_label   text not null,            -- 1.0, 1.1, 2.0
  file_path       text not null,
  file_name       text,
  file_type       text,
  change_note     text,
  effective_date  date not null default current_date,
  published_by    uuid references profiles default auth.uid(),
  published_at    timestamptz not null default now(),
  unique (policy_id, version_label)
);
create table if not exists policy_acks (
  id                 uuid primary key default gen_random_uuid(),
  policy_id          uuid not null references policies on delete cascade,
  policy_version_id  uuid not null references policy_versions on delete cascade,
  profile_id         uuid not null references profiles on delete cascade default auth.uid(),
  signed_name        text not null,
  signed_at          timestamptz not null default now(),
  unique (policy_version_id, profile_id)
);
-- Link a policy to its current version (needed by the Policies pages)
alter table policies drop constraint if exists policies_current_version_fk;
alter table policies add constraint policies_current_version_fk foreign key (current_version_id) references policy_versions(id) on delete set null;

alter table policies enable row level security;
alter table policy_versions enable row level security;
alter table policy_acks enable row level security;

drop policy if exists "policies see" on policies;
drop policy if exists "policies admin" on policies;
drop policy if exists "pversions see" on policy_versions;
drop policy if exists "pversions admin" on policy_versions;
drop policy if exists "packs see" on policy_acks;
drop policy if exists "packs sign" on policy_acks;
create policy "policies see" on policies for select using (app_role() in ('admin','manager','staff'));
create policy "policies admin" on policies for all using (app_role() = 'admin') with check (app_role() = 'admin');
create policy "pversions see" on policy_versions for select using (app_role() in ('admin','manager','staff'));
create policy "pversions admin" on policy_versions for all using (app_role() = 'admin') with check (app_role() = 'admin');
create policy "packs see" on policy_acks for select using (profile_id = auth.uid() or app_role() in ('admin','manager'));
-- Staff can only sign for themselves, only the current version. Signatures can never be edited or deleted.
create policy "packs sign" on policy_acks for insert with check (
  profile_id = auth.uid() and app_role() in ('admin','manager','staff')
  and policy_version_id = (select current_version_id from policies where id = policy_id));

create or replace function stamp_policy_ack() returns trigger language plpgsql as $$
begin new.signed_at := now(); return new; end $$;
drop trigger if exists policy_acks_stamp on policy_acks;
create trigger policy_acks_stamp before insert on policy_acks for each row execute function stamp_policy_ack();

-- (notifications are sent when the version becomes current — see below)
create or replace function policy_version_notify_row(v policy_versions) returns void language plpgsql security definer set search_path = public as $$
declare r record; pol record;
begin
  select * into pol from policies where id = v.policy_id;
  if pol.require_signature and pol.active then
    for r in select id from profiles where role in ('admin','manager','staff') and active loop
      perform notify(r.id, 'Policy to read and sign: ' || pol.title, 'Version ' || v.version_label ||
        coalesce(' — ' || v.change_note, ''), '/policies/' || pol.id, 'policy:' || v.id || ':' || r.id);
    end loop;
  end if;
end $$;
create or replace function policy_current_notify() returns trigger language plpgsql security definer set search_path = public as $$
declare v policy_versions;
begin
  if new.current_version_id is not null and new.current_version_id is distinct from old.current_version_id then
    select * into v from policy_versions where id = new.current_version_id;
    perform policy_version_notify_row(v);
  end if;
  return new;
end $$;
drop trigger if exists policy_versions_notify on policy_versions;
drop function if exists policy_version_notify();
drop trigger if exists policies_current_notify on policies;
create trigger policies_current_notify after update of current_version_id on policies for each row execute function policy_current_notify();

-- Private storage for policy files (everyone signed in can read; only admin uploads)
insert into storage.buckets (id, name, public, file_size_limit)
values ('policies', 'policies', false, 52428800)
on conflict (id) do nothing;
drop policy if exists "policy files read" on storage.objects;
drop policy if exists "policy files write" on storage.objects;
drop policy if exists "policy files delete" on storage.objects;
create policy "policy files read" on storage.objects for select to authenticated using (
  bucket_id = 'policies' and app_role() in ('admin','manager','staff'));
create policy "policy files write" on storage.objects for insert to authenticated with check (
  bucket_id = 'policies' and app_role() = 'admin');
create policy "policy files delete" on storage.objects for delete to authenticated using (
  bucket_id = 'policies' and app_role() = 'admin');

-- ---------- Daily reminders (renewals, overdue onboarding, unsigned policies) ----------
create or replace function daily_reminders() returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- Training and certificates: 30 days before expiry, and on expiry
  for r in
    select t.id, t.profile_id, t.title, t.expires_on, p.full_name from trainings t join profiles p on p.id = t.profile_id
    where p.active and t.expires_on is not null and t.expires_on <= current_date + 30
      and not exists (select 1 from trainings n where n.profile_id = t.profile_id and n.title = t.title and n.completed_on > t.completed_on)
  loop
    if r.expires_on < current_date then
      perform notify(r.profile_id, 'Training expired: ' || r.title, 'Expired ' || r.expires_on || '. Please renew and add the new date.', '/hr/' || r.profile_id, 'texp:' || r.id);
      perform notify_managers(r.full_name || ': ' || r.title || ' has expired', 'Expired ' || r.expires_on, '/hr/' || r.profile_id, 'texp:' || r.id);
    else
      perform notify(r.profile_id, 'Training renewal due: ' || r.title, 'Expires ' || r.expires_on || '.', '/hr/' || r.profile_id, 't30:' || r.id);
      perform notify_managers(r.full_name || ': ' || r.title || ' expires ' || r.expires_on, null, '/hr/' || r.profile_id, 't30:' || r.id);
    end if;
  end loop;

  for r in
    select c.id, c.profile_id, c.cert_type, c.expires_on, p.full_name from certifications c join profiles p on p.id = c.profile_id
    where p.active and c.expires_on is not null and c.expires_on <= current_date + 30
  loop
    if r.expires_on < current_date then
      perform notify(r.profile_id, 'Certificate expired: ' || r.cert_type, 'Expired ' || r.expires_on, '/hr/' || r.profile_id, 'cexp:' || r.id);
      perform notify_managers(r.full_name || ': ' || r.cert_type || ' has expired', null, '/hr/' || r.profile_id, 'cexp:' || r.id);
    else
      perform notify(r.profile_id, 'Certificate renewal due: ' || r.cert_type, 'Expires ' || r.expires_on, '/hr/' || r.profile_id, 'c30:' || r.id);
      perform notify_managers(r.full_name || ': ' || r.cert_type || ' expires ' || r.expires_on, null, '/hr/' || r.profile_id, 'c30:' || r.id);
    end if;
  end loop;

  -- Onboarding items past due
  for r in
    select i.id, i.profile_id, i.title, p.full_name from onboarding_items i join profiles p on p.id = i.profile_id
    where p.active and i.status in ('To do','Returned') and i.due_date < current_date
  loop
    perform notify(r.profile_id, 'Onboarding item overdue: ' || r.title, null, '/onboarding', 'onbod:' || r.id);
    perform notify_managers(r.full_name || ': onboarding item overdue — ' || r.title, null, '/hr/' || r.profile_id || '/onboarding', 'onbod:' || r.id);
  end loop;

  -- Policies still unsigned 14 days after a version was published (program-aware, see programs.sql)
  if to_regproc('public.daily_unsigned_policy_reminders') is not null then
    perform public.daily_unsigned_policy_reminders();
  end if;
end $$;
revoke execute on function daily_reminders() from public, authenticated;

-- Run the reminders every day at 8 am Vancouver time (15:00 UTC) using Supabase's scheduler.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('evergreen-daily-reminders') where exists (select 1 from cron.job where jobname = 'evergreen-daily-reminders');
  perform cron.schedule('evergreen-daily-reminders', '0 15 * * *', 'select public.daily_reminders()');
exception when others then
  raise notice 'Scheduler not available here (%). Reminders can be run with: select daily_reminders();', sqlerrm;
end $$;

-- ---------- Audit ----------
drop trigger if exists audit_policies on policies;
drop trigger if exists audit_policy_versions on policy_versions;
drop trigger if exists audit_policy_acks on policy_acks;
create trigger audit_policies after insert or update or delete on policies for each row execute function write_audit();
create trigger audit_policy_versions after insert or update or delete on policy_versions for each row execute function write_audit();
create trigger audit_policy_acks after insert or update or delete on policy_acks for each row execute function write_audit();
