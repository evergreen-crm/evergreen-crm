-- =====================================================================
-- Evergreen CRM - Steps 7, 8 and 9.
--  7. Email: every portal alert can also go out by email. Urgent ones (🆘 emergency, injury, safety problem,
--     clock in/out permission, help requests) go right away; everything else goes in one daily email, and only
--     if it is still unread. Columns below let the CRM remember what was emailed.
--  8. Help button: "Ask for help" requests, answered by the Program Coordinator / Manager (how-to questions)
--     or the Administrator (something broken, sign-in or access).
--  9. Missing details for youth and adults: the same 1 week -> Director of Operations -> 1 month -> ED and CEO
--     steps as staff and houses (record-gaps.sql), for each active resident's face-sheet details.
-- Needs record-gaps.sql, safe-shifts.sql (house_leaders) and policies-hr.sql (notifications). Safe to run again.
-- =====================================================================

-- ---------- 7. Email ----------
alter table notifications add column if not exists urgent     boolean not null default false;
alter table notifications add column if not exists emailed_at timestamptz;
alter table notifications add column if not exists email_note text;   -- 'sent', 'skipped: read', or the error
create index if not exists notifications_email_queue on notifications (created_at) where emailed_at is null;

create or replace function notification_urgency() returns trigger language plpgsql as $$
begin
  new.urgent := new.urgent
    or new.title like '🆘%' or new.title like '🩹%' or new.title like '⚠️ Safety%' or new.title like '🙋%'
    or new.title like '✅ Approved%' or new.title like '⛔%' or new.title like '❓%' or new.title like '💬%'
    or coalesce(new.dedupe_key, '') ~ '^(sos|spr|sprd|help|helpa):';
  return new;
end $$;
drop trigger if exists notifications_urgency on notifications;
create trigger notifications_urgency before insert on notifications for each row execute function notification_urgency();

-- Anything older than today is not emailed now (so switching this on doesn't send a flood of old alerts).
update notifications set emailed_at = now(), email_note = 'before email was switched on'
 where emailed_at is null and created_at < now() - interval '2 hours';

-- ---------- 8. Help requests ----------
create table if not exists help_requests (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles on delete cascade default auth.uid(),
  home_id     uuid references homes on delete set null,
  topic       text not null check (topic in ('How do I…?', 'Something isn’t working', 'Sign-in or access', 'Other')),
  page        text,
  message     text not null check (length(trim(message)) >= 3),
  status      text not null default 'Open' check (status in ('Open', 'Answered', 'Closed')),
  answer      text,
  answered_by uuid references profiles,
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists help_requests_open on help_requests (created_at desc) where status = 'Open';
alter table help_requests enable row level security;
drop policy if exists "help see" on help_requests;
create policy "help see" on help_requests for select using (
  profile_id = auth.uid() or app_level() >= 3
  or (app_level() = 2 and home_id is not null and home_id = app_home())
);

-- Who answers: tech problems -> Administrators (else Program Managers); how-to -> house PC + PM (else PMs).
create or replace function help_answerers(p_topic text, p_home uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from profiles where p_topic in ('Something isn’t working', 'Sign-in or access') and active and role = 'admin'
  union
  select id from profiles where p_topic in ('Something isn’t working', 'Sign-in or access') and active and staff_group is null and level = 3
    and not exists (select 1 from profiles a where a.active and a.role = 'admin')
  union
  select x from house_leaders(p_home) x where p_topic not in ('Something isn’t working', 'Sign-in or access') and p_home is not null
  union
  select id from profiles where p_topic not in ('Something isn’t working', 'Sign-in or access') and p_home is null
    and active and staff_group is null and level = 3;
$$;
revoke execute on function help_answerers(text, uuid) from public, anon, authenticated;

create or replace function ask_for_help(p_topic text, p_message text, p_page text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me profiles; hid uuid; rid uuid; n int;
begin
  select * into me from profiles where id = auth.uid() and active;
  if me.id is null then raise exception 'Please sign in first.'; end if;
  select count(*) into n from help_requests where profile_id = me.id and created_at > now() - interval '1 hour';
  if n >= 5 then raise exception 'You’ve sent 5 questions in the last hour. Please wait a little, or call your Program Coordinator.'; end if;
  select home_id into hid from time_entries where profile_id = me.id and clock_out is null order by clock_in desc limit 1;
  hid := coalesce(hid, me.home_id);
  insert into help_requests (profile_id, home_id, topic, page, message)
  values (me.id, hid, p_topic, left(p_page, 200), left(trim(p_message), 2000)) returning id into rid;
  perform notify(a, '❓ ' || me.full_name || ' needs help: ' || p_topic,
                 left(trim(p_message), 200) || coalesce(' (page: ' || nullif(p_page, '') || ')', ''),
                 '/help#q-' || rid, 'help:' || rid || ':' || a)
  from help_answerers(p_topic, hid) a where a <> me.id;
  return rid;
end $$;
revoke execute on function ask_for_help(text, text, text) from public, anon;
grant execute on function ask_for_help(text, text, text) to authenticated;

create or replace function answer_help(p_id uuid, p_answer text, p_close boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare r help_requests; me profiles;
begin
  select * into r from help_requests where id = p_id;
  if r.id is null then raise exception 'Question not found.'; end if;
  select * into me from profiles where id = auth.uid() and active;
  if r.profile_id = me.id then
    -- the person who asked can close their own question
    if p_close then update help_requests set status = 'Closed' where id = p_id; return; end if;
    raise exception 'You can’t answer your own question.';
  end if;
  if not (app_level() >= 3 or (app_level() = 2 and r.home_id = app_home())) then
    raise exception 'Only the Program Coordinator of that house, a Program Manager or an Administrator can answer.';
  end if;
  if coalesce(trim(p_answer), '') = '' and not p_close then raise exception 'Write an answer first.'; end if;
  update help_requests set
    answer = coalesce(nullif(trim(p_answer), ''), answer),
    status = case when p_close then 'Closed' else 'Answered' end,
    answered_by = me.id, answered_at = now()
  where id = p_id;
  if coalesce(trim(p_answer), '') <> '' then
    perform notify(r.profile_id, '💬 ' || me.full_name || ' answered your question', left(trim(p_answer), 200),
                   '/help#q-' || p_id, 'helpa:' || p_id || ':' || extract(epoch from now())::bigint);
  end if;
end $$;
revoke execute on function answer_help(uuid, text, boolean) from public, anon;
grant execute on function answer_help(uuid, text, boolean) to authenticated;

-- ---------- 9. Missing details for youth and adults ----------
alter table record_gaps drop constraint if exists record_gaps_kind_check;
alter table record_gaps add constraint record_gaps_kind_check check (kind in ('staff', 'house', 'resident'));

create or replace function current_record_gaps()
returns table (kind text, subject_id uuid, subject_name text, home_id uuid, field text, label text, fix_link text)
language sql stable security definer set search_path = public as $$
  with s as (
    select p.id, p.full_name, p.home_id, p.phone, p.level, p.staff_group, p.role,
           d.hire_date, d.program_confirmed, d.position, d.employment_type, d.emergency_contact, d.emergency_phone
      from profiles p
      left join staff_details d on d.profile_id = p.id
     where p.active and p.role in ('staff','manager')
       and coalesce(d.employment_status, 'Active') = 'Active'
  ),
  checks as (
    select s.*, c.field, c.label, c.missing, c.link from s
    cross join lateral (values
      ('hire_date',  'Hire date',                        s.hire_date is null,                                   '/records?fill=' || s.id),
      ('program',    'Program (MCFD, CLBC or both)',      not coalesce(s.program_confirmed, false),               '/records?fill=' || s.id),
      ('position',   'Position',                         coalesce(trim(s.position), '') = '',                    '/records?fill=' || s.id),
      ('employment', 'Full-time, part-time or casual',   s.employment_type is null,                              '/records?fill=' || s.id),
      ('emergency',  'Emergency contact and phone',      coalesce(trim(s.emergency_contact), '') = '' or coalesce(trim(s.emergency_phone), '') = '', '/records?fill=' || s.id),
      ('phone',      'Phone number',                     coalesce(trim(s.phone), '') = '',                       '/records?fill=' || s.id),
      ('house',      'House (where they work)',          s.home_id is null and coalesce(s.level, 1) <= 2 and s.staff_group is null, '/admin'),
      ('crc',        'Criminal record check (missing or expired)',
         not exists (select 1 from certifications c where c.profile_id = s.id and c.cert_type ilike '%criminal%'
                       and (c.expires_on is null or c.expires_on >= current_date)),                               '/hr/' || s.id),
      ('first_aid',  'First Aid & CPR (missing or expired)',
         coalesce(s.level, 1) <= 3 and s.staff_group is null
         and not exists (select 1 from certifications c where c.profile_id = s.id and c.cert_type ilike '%first aid%'
                       and (c.expires_on is null or c.expires_on >= current_date)),                               '/hr/' || s.id)
    ) as c(field, label, missing, link)
  ),
  r as (
    select x.*, coalesce(x.care_type, 'Adult') in ('Child', 'Youth') as young,
           -- first name + last initial only, so names in alerts and emails stay short
           coalesce(nullif(trim(x.preferred_name), ''), x.first_name) || coalesce(' ' || left(nullif(trim(x.last_name), ''), 1) || '.', '') as short_name
      from residents x where coalesce(x.status, 'active') = 'active'
  ),
  rchecks as (
    select r.id, r.short_name, r.home_id, c.field, c.label, c.missing from r
    cross join lateral (values
      ('dob',        'Date of birth',                                         r.date_of_birth is null),
      ('admission',  'Admission date',                                        r.admission_date is null),
      ('funder',     'Funder and file number',                                coalesce(trim(r.funder), '') = '' or coalesce(trim(r.file_number), '') = ''),
      ('worker',     case when r.young then 'Social worker name and phone' else 'CLBC facilitator / case worker name and phone' end,
                      coalesce(trim(r.case_worker_name), '') = '' or coalesce(trim(r.case_worker_phone), '') = ''),
      ('guardian',   'Guardian or parent name and phone',                     r.young and (coalesce(trim(r.guardian_name), '') = '' or coalesce(trim(r.guardian_phone), '') = '')),
      ('emergency',  'Emergency contact and phone',                           coalesce(trim(r.emergency_contact_name), '') = '' or coalesce(trim(r.emergency_contact_phone), '') = ''),
      ('phn',        'BC Personal Health Number',                             coalesce(trim(r.phn), '') = ''),
      ('doctor',     'Family doctor name and phone',                          coalesce(trim(r.doctor_name), '') = '' or coalesce(trim(r.doctor_phone), '') = ''),
      ('allergies',  'Allergies (write “None known” if none)',               coalesce(trim(r.allergies), '') = ''),
      ('care_plan',  'Care plan review date',                                 r.care_plan_review_date is null)
    ) as c(field, label, missing)
  )
  select 'staff', id, full_name, home_id, field, label, link from checks where missing
  union all
  select 'house', h.id, h.name, h.id, c.field, c.label, '/homes/' || h.id || '?edit=1'
    from homes h
    cross join lateral (values
      ('location', 'House location (map pin for clock in and out)', h.lat is null or h.lng is null),
      ('on_call',  'On-call phone (for the 🆘 button)',               coalesce(trim(h.on_call_phone), '') = ''),
      ('phone',    'House phone',                                   coalesce(trim(h.phone), '') = ''),
      ('address',  'Street address',                                coalesce(trim(h.address), '') = '')
    ) as c(field, label, missing)
   where c.missing
  union all
  select 'resident', id, short_name, home_id, field, label, '/residents/' || id || '/edit' from rchecks where missing;
$$;
revoke execute on function current_record_gaps() from public, anon, authenticated;

-- Several checks can run on the same day (morning, Check now, new resident gaps): give each run's
-- notifications their own key so a second batch on the same day isn't swallowed.
do $$
declare d text := pg_get_functiondef('scan_record_gaps(text)'::regprocedure);
begin
  if position('''gaps1:'' || r.pid || '':'' || today' in d) > 0 then
    d := replace(d, '''gaps1:'' || r.pid || '':'' || today', '''gaps1:'' || r.pid || '':'' || extract(epoch from now())::bigint');
    d := replace(d, '''gaps2:'' || r.pid || '':'' || today', '''gaps2:'' || r.pid || '':'' || extract(epoch from now())::bigint');
    d := replace(d, '''gaps3:'' || r.pid || '':'' || today', '''gaps3:'' || r.pid || '':'' || extract(epoch from now())::bigint');
    execute d;
  end if;
end $$;

-- Resident details: the house's Program Coordinator and Program Manager (no HR).
create or replace function gap_owners(p_kind text, p_home uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select x from house_leaders(p_home) x where p_home is not null
  union
  select id from profiles where p_home is null and active and staff_group is null and level = 3
  union
  select id from profiles where p_kind = 'staff' and active and role = 'staff' and staff_group = 'hr';
$$;
revoke execute on function gap_owners(text, uuid) from public, anon, authenticated;

-- The morning check now runs at 6:40 am (before the 7 am daily email, so new items make that email).
do $$
begin
  perform cron.unschedule('evergreen-record-gaps') where exists (select 1 from cron.job where jobname = 'evergreen-record-gaps');
  perform cron.schedule('evergreen-record-gaps', '40 13 * * *', $c$select public.scan_record_gaps('cron')$c$);
exception when others then
  raise notice 'Scheduler not available here (%).', sqlerrm;
end $$;

-- Run the check now so resident gaps show up (and their first notifications go out).
select scan_record_gaps('now');
select 'help, email and resident checks ready' as result,
       (select count(*) from record_gaps where fixed_at is null and kind = 'resident') as resident_gaps,
       (select count(distinct subject_id) from record_gaps where fixed_at is null and kind = 'resident') as residents_with_gaps,
       (select count(*) from record_gaps where fixed_at is null) as all_missing_now;
