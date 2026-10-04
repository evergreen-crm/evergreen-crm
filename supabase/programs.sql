-- =====================================================================
-- Evergreen CRM - MCFD / CLBC / Both labels on policies and staff.
-- Staff only get asked to sign policies that apply to their program. Safe to run again.
-- =====================================================================
alter table policies add column if not exists applies_to text not null default 'Both';
alter table policies drop constraint if exists policies_applies_to_check;
alter table policies add constraint policies_applies_to_check check (applies_to in ('MCFD','CLBC','Both'));

alter table staff_details add column if not exists program text not null default 'Both';
alter table staff_details drop constraint if exists staff_details_program_check;
alter table staff_details add constraint staff_details_program_check check (program in ('MCFD','CLBC','Both'));

alter table onboardings add column if not exists program text not null default 'Both';

create or replace function staff_program(pid uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select program from staff_details where profile_id = pid), 'Both');
$$;
create or replace function program_applies(item text, person text) returns boolean language sql immutable as $$
  select coalesce(item,'Both') = 'Both' or coalesce(person,'Both') = 'Both' or item = person;
$$;

-- New policy version: only notify staff whose program it applies to
create or replace function policy_version_notify_row(v policy_versions) returns void language plpgsql security definer set search_path = public as $$
declare r record; pol record;
begin
  select * into pol from policies where id = v.policy_id;
  if pol.require_signature and pol.active then
    for r in select id from profiles where role in ('admin','manager','staff') and active
             and program_applies(pol.applies_to, staff_program(id)) loop
      perform notify(r.id, 'Policy to read and sign (' ||
        case pol.applies_to when 'MCFD' then 'MCFD' when 'CLBC' then 'CLBC' else 'MCFD & CLBC' end || '): ' || pol.title,
        'Version ' || v.version_label || coalesce(' — ' || v.change_note, ''), '/policies/' || pol.id, 'policy:' || v.id || ':' || r.id);
    end loop;
  end if;
end $$;

-- Daily reminders: unsigned-policy check now respects each person's program
create or replace function daily_unsigned_policy_reminders() returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select pol.id as policy_id, pol.title, v.id as version_id, pr.id as profile_id, pr.full_name
    from policies pol join policy_versions v on v.id = pol.current_version_id
    cross join profiles pr
    where pol.active and pol.require_signature and pr.active and pr.role in ('admin','manager','staff')
      and program_applies(pol.applies_to, staff_program(pr.id))
      and v.published_at < now() - interval '14 days'
      and not exists (select 1 from policy_acks a where a.policy_version_id = v.id and a.profile_id = pr.id)
  loop
    perform notify(r.profile_id, 'Reminder: please sign ' || r.title, null, '/policies/' || r.policy_id, 'pol14:' || r.version_id || ':' || r.profile_id);
    perform notify_managers(r.full_name || ' has not signed ' || r.title || ' (14 days)', null, '/policies/' || r.policy_id, 'pol14:' || r.version_id || ':' || r.profile_id);
  end loop;
end $$;
revoke execute on function daily_unsigned_policy_reminders() from public, authenticated;

-- Updated daily reminder job (same schedule)
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
