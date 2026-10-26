-- =====================================================================
-- Evergreen CRM - Official incident forms + 24-hour countdown + escalation. Safe to run again.
--  * MCFD: SHSS Service Provider Reportable Incident Reporting Form (CF4179) — within 24 hours of every
--    reportable incident, one form per incident, to the MCFD Primary Professional and Resource Worker.
--  * CLBC: Critical Incident Report — urgent: phone now + written within 24 hours; non-urgent: 5 working days.
-- The CRM fills the form from the incident report. A countdown starts when a critical incident is saved:
--   saved            → house Program Coordinator(s) and Program Manager alerted (urgent email)
--   half the time up → Program Coordinator reminded
--   75% of the time  → Program Manager alerted
--   past due         → Director of Operations and Executive Director alerted; reminded every 6 hours
-- Checked every 15 minutes by pg_cron. Needs policies-hr.sql (notifications), help-email-gaps.sql (urgent),
-- shift-checklists.sql (house_leaders).
-- =====================================================================

-- ---------- Extra fields the forms ask for ----------
alter table incidents add column if not exists form_number      text unique;       -- "Service Provider Incident Number", e.g. ECC-2026-0007
alter table incidents add column if not exists form_program     text;              -- mcfd / clbc
alter table incidents add column if not exists form_due_at      timestamptz;
alter table incidents add column if not exists form_sent_at     timestamptz;
alter table incidents add column if not exists form_sent_by     uuid references profiles;
alter table incidents add column if not exists form_sent_to     text;
alter table incidents add column if not exists location         text;
alter table incidents add column if not exists contributing     text;              -- contributing factors and related incidents
alter table incidents add column if not exists people_involved  text;              -- names and roles (no other youth's details)
alter table incidents add column if not exists police_involved  boolean;
alter table incidents add column if not exists police_file      text;
alter table incidents add column if not exists coroner_involved boolean;
alter table incidents add column if not exists coroner_file     text;
alter table incidents add column if not exists addressed        text;              -- how the incident has been addressed to date
alter table incidents add column if not exists prevention       text;              -- CLBC: measures to prevent it happening again
alter table incidents add column if not exists notified         jsonb not null default '[]'::jsonb; -- [{name, role, org, at, method, copy}]
alter table incidents add column if not exists prepared_by      uuid references profiles;
alter table residents add column if not exists resource_worker_name  text;        -- MCFD resource worker (CF4179)
alter table residents add column if not exists resource_worker_email text;
alter table residents add column if not exists indigenous_agency     text;        -- ICFS agency / Indigenous authority / community

create sequence if not exists incident_form_seq;

-- Which funder's form, and when it is due.
create or replace function incident_form_program(p_resident uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when upper(coalesce(r.funder, '')) like '%MCFD%' then 'mcfd'
    when upper(coalesce(r.funder, '')) like '%CLBC%' then 'clbc'
    when r.care_type in ('Child', 'Youth') then 'mcfd'
    else 'clbc' end
  from residents r where r.id = p_resident;
$$;

create or replace function incident_form_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare base timestamptz; d date; n int := 0;
begin
  if not new.is_critical then new.form_due_at := null; return new; end if;
  if new.form_number is null then
    new.form_number := 'ECC-' || to_char(coalesce(new.occurred_on, current_date), 'YYYY') || '-' || lpad(nextval('incident_form_seq')::text, 4, '0');
  end if;
  new.form_program := coalesce(incident_form_program(new.resident_id), 'mcfd');
  -- Clock starts at the time of the incident (or when it was reported, if no time was given).
  base := case when new.occurred_time is not null
               then (new.occurred_on + new.occurred_time) at time zone 'Etc/GMT+7'
               else coalesce(new.created_at, now()) end;
  if base > now() then base := now(); end if;
  if new.form_program = 'clbc' and not new.is_urgent then
    d := (base at time zone 'Etc/GMT+7')::date;               -- 5 working days, end of that day
    while n < 5 loop d := d + 1; if extract(isodow from d) < 6 then n := n + 1; end if; end loop;
    new.form_due_at := (d + time '23:59') at time zone 'Etc/GMT+7';
  else
    new.form_due_at := base + interval '24 hours';
  end if;
  return new;
end $$;
drop trigger if exists incidents_form_fill on incidents;
create trigger incidents_form_fill before insert or update of is_critical, is_urgent, occurred_on, occurred_time, resident_id
  on incidents for each row execute function incident_form_fill();

-- Marking the written report as sent also stops the countdown (and the other way round).
create or replace function incident_form_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.written_report_sent_on is not null and new.form_sent_at is null then
    new.form_sent_at := now(); new.form_sent_by := coalesce(new.form_sent_by, auth.uid());
  end if;
  if new.form_sent_at is not null and new.written_report_sent_on is null then
    new.written_report_sent_on := (new.form_sent_at at time zone 'Etc/GMT+7')::date;
  end if;
  return new;
end $$;
drop trigger if exists incidents_form_sent on incidents;
create trigger incidents_form_sent before insert or update of written_report_sent_on, form_sent_at
  on incidents for each row execute function incident_form_sent();

-- One urgent alert (emailed within minutes; see lib/emailOutbox.js). Same key = sent once.
create or replace function incident_alert(p_who uuid, p_title text, p_body text, p_link text, p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_who is null then return; end if;
  insert into notifications (profile_id, title, body, link, dedupe_key, urgent)
  values (p_who, p_title, p_body, p_link, p_key, true)
  on conflict (dedupe_key) do nothing;
end $$;
revoke execute on function incident_alert(uuid, text, text, text, text) from public, anon, authenticated;

-- The countdown check (every 15 minutes).
create or replace function incident_form_escalate() returns int
language plpgsql security definer set search_path = public as $$
declare i record; who uuid; total interval; left_ interval; nm text; form text; due_txt text; link text; n int := 0;
begin
  for i in
    select x.*, coalesce(r.preferred_name, r.first_name) as rname, h.name as hname
      from incidents x left join residents r on r.id = x.resident_id left join homes h on h.id = x.home_id
     where x.is_critical and x.form_due_at is not null and x.form_sent_at is null and x.written_report_sent_on is null
       and x.created_at > now() - interval '30 days'
  loop
    total := i.form_due_at - least(i.created_at, i.form_due_at - interval '1 hour');
    left_ := i.form_due_at - now();
    nm := coalesce(i.rname, 'a resident') || coalesce(' (' || i.hname || ')', '');
    form := case when i.form_program = 'clbc' then 'CLBC Critical Incident Report' else 'MCFD form CF4179' end;
    due_txt := to_char(i.form_due_at at time zone 'Etc/GMT+7', 'Dy Mon DD, HH12:MI AM');
    link := '/incidents/' || i.id || '/form';

    -- 1. Saved: Program Coordinator(s) and Program Manager.
    for who in select l from house_leaders(i.home_id) l loop
      perform incident_alert(who, '📝 Incident form due by ' || due_txt, form || ' for ' || nm || ': ' || i.incident_type || '. The CRM has filled it in — check it, print or save as PDF, send it, then tap Mark sent.', link, 'incf0:' || i.id || ':' || who);
    end loop;
    -- 2. Half the time gone: Program Coordinator reminder.
    if left_ <= total / 2 and left_ > interval '0' then
      for who in select p.id from profiles p where p.active and p.staff_group is null and p.level = 2 and p.home_id = i.home_id loop
        perform incident_alert(who, '⏰ Incident form due in ' || greatest(1, floor(extract(epoch from left_) / 3600))::int || ' hours', form || ' for ' || nm || ' is not marked sent yet. Due ' || due_txt || '.', link, 'incf1:' || i.id || ':' || who);
      end loop;
    end if;
    -- 3. 75% gone: Program Manager.
    if left_ <= total / 4 and left_ > interval '0' then
      for who in select l from house_leaders(i.home_id) l join profiles p on p.id = l where p.level = 3 loop
        perform incident_alert(who, '⚠️ Incident form still not sent — due ' || due_txt, form || ' for ' || nm || ' (' || i.incident_type || '). Please make sure it goes out on time.', link, 'incf2:' || i.id || ':' || who);
      end loop;
    end if;
    -- 4. Overdue: Director of Operations and Executive Director, again every 6 hours.
    if left_ <= interval '0' then
      for who in select p.id from profiles p where p.active and p.staff_group is null and p.level in (4, 5) loop
        perform incident_alert(who, '⛔ Incident form OVERDUE — ' || nm, form || ' was due ' || due_txt || ' and is not marked sent. Incident: ' || i.incident_type || '. Late reports must be explained to the funder.', link,
          'incf3:' || i.id || ':' || who || ':' || floor(extract(epoch from -left_) / 21600)::int);
      end loop;
      for who in select l from house_leaders(i.home_id) l loop
        perform incident_alert(who, '⛔ Incident form OVERDUE — ' || nm, form || ' was due ' || due_txt || '. Send it now and tap Mark sent.', link,
          'incf3:' || i.id || ':' || who || ':' || floor(extract(epoch from -left_) / 21600)::int);
      end loop;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function incident_form_escalate() from public, anon, authenticated;

-- Start the countdown right away when a critical incident is saved.
create or replace function incident_form_kick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_critical and new.form_sent_at is null then perform incident_form_escalate(); end if;
  return new;
end $$;
drop trigger if exists incidents_form_kick on incidents;
create trigger incidents_form_kick after insert on incidents for each row execute function incident_form_kick();

-- Number the incidents already in the CRM. They keep their old due date and get no countdown alerts
-- (so switching this on doesn't send a flood of "overdue" alerts); the countdown is for new incidents.
update incidents set is_critical = is_critical where is_critical and form_number is null;
update incidents set form_due_at = null where created_at < now() - interval '5 minutes' and form_sent_at is null;
update incidents set form_sent_at = coalesce(form_sent_at, (written_report_sent_on + time '12:00') at time zone 'Etc/GMT+7')
 where written_report_sent_on is not null and form_sent_at is null;

-- Every 15 minutes.
do $$ begin
  perform cron.unschedule('incident-form-escalate') where exists (select 1 from cron.job where jobname = 'incident-form-escalate');
  perform cron.schedule('incident-form-escalate', '*/15 * * * *', 'select public.incident_form_escalate()');
exception when undefined_table or invalid_schema_name then raise notice 'pg_cron is not available: alerts run when incidents are saved and on the daily job only.';
end $$;

-- Check: should say the job is scheduled
select (select count(*) from cron.job where jobname = 'incident-form-escalate') as countdown_job,
       (select count(*) from incidents where is_critical and form_number is not null) as numbered_incidents;
