-- ✋ Restraint and restricted-practice log (item 5).
-- Builds on incidents. When an incident has physical intervention / restraint, or is a restricted practice:
--   · it is always a Critical, urgent incident, and leaders are alerted right away;
--   · staff record what was tried first, the hold used, and confirm no prohibited technique was used;
--   · the incident can't be closed until the after-restraint steps are done
--     (injury check, debrief with the person, staff debrief, manager review, social worker / CLBC told).
-- Sources: MCFD Standards for Staffed Children's Residential Services (restraint and D.7.7 prohibited practices),
-- CLBC Critical Incidents Policy (every restricted practice is reportable; seclusion never allowed),
-- Evergreen Staff Rules Handbook §8. Safe to run more than once.

alter table incidents add column if not exists tried_first        text;        -- less restrictive ways tried
alter table incidents add column if not exists hold_used          text;        -- e.g. NVCI children's control position, escort
alter table incidents add column if not exists staff_involved     text;
alter table incidents add column if not exists no_prohibited      boolean not null default false; -- confirmed no prone, neck/chest/back pressure, mechanical/chemical restraint, seclusion
alter table incidents add column if not exists in_safety_plan     boolean;     -- CLBC: in an approved behaviour support / safety plan?
alter table incidents add column if not exists injury_check_at    timestamptz;
alter table incidents add column if not exists injury_check_note  text;
alter table incidents add column if not exists person_debrief_at  timestamptz;
alter table incidents add column if not exists person_view        text;        -- their side, in their words
alter table incidents add column if not exists staff_debrief_at   timestamptz;
alter table incidents add column if not exists staff_view         text;
alter table incidents add column if not exists manager_review_at  timestamptz;
alter table incidents add column if not exists manager_review_by  uuid references profiles;
alter table incidents add column if not exists manager_review     text;
alter table incidents add column if not exists funder_told_at     timestamptz; -- youth: social worker · adults: CLBC
alter table incidents add column if not exists funder_told_who    text;
alter table incidents add column if not exists nvci_flag          text;        -- set when the reporter has no current NVCI on file

-- Is this a restraint / restricted-practice incident?
create or replace function incident_is_restraint(i incidents) returns boolean language sql immutable as $$
  select coalesce(i.physical_intervention, false) or coalesce(i.incident_type, '') like 'Restricted practice%'
      or coalesce(i.incident_type, '') like 'Physical intervention%';
$$;

-- What's still missing before it can be closed (plain words). Empty = ready.
create or replace function restraint_missing(i incidents) returns text[] language sql stable as $$
  select array_remove(array[
    case when nullif(trim(coalesce(i.tried_first, '')), '') is null then 'what was tried first' end,
    case when not i.no_prohibited then 'confirm no prohibited technique was used' end,
    case when i.injury_check_at is null then 'injury and well-being check' end,
    case when i.person_debrief_at is null then 'debrief with the person (their side)' end,
    case when i.staff_debrief_at is null then 'staff debrief' end,
    case when i.funder_told_at is null then 'social worker / CLBC told' end,
    case when i.manager_review_at is null then 'Program Coordinator or Manager review' end
  ], null);
$$;

create or replace function restraint_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare who text; nm text; missing text[]; pid uuid; has_nvci boolean;
begin
  if not incident_is_restraint(new) then return new; end if;
  new.physical_intervention := new.physical_intervention or coalesce(new.incident_type, '') like 'Physical intervention%';
  new.incident_class := 'Critical';
  new.is_critical := true;
  new.is_urgent := true;

  if tg_op = 'UPDATE' and new.status = 'Closed' and old.status is distinct from 'Closed' then
    missing := restraint_missing(new);
    if array_length(missing, 1) > 0 then
      raise exception 'Finish the restraint steps before closing: %.', array_to_string(missing, ', ');
    end if;
  end if;
  if tg_op = 'UPDATE' and new.manager_review_at is not null and old.manager_review_at is null and coalesce(app_level(), 0) < 2 then
    raise exception 'Only a Program Coordinator or Manager can sign the review.';
  end if;

  if tg_op = 'INSERT' then
    select full_name into who from profiles where id = coalesce(new.reported_by, auth.uid());
    select concat_ws(' ', first_name, nullif(left(coalesce(last_name, ''), 1), '') || '.') into nm from residents where id = new.resident_id;
    select exists (select 1 from certifications c where c.profile_id = coalesce(new.reported_by, auth.uid())
                    and (c.cert_type ilike '%nvci%' or c.cert_type ilike '%crisis%')
                    and (c.expires_on is null or c.expires_on >= current_date)) into has_nvci;
    if not has_nvci then new.nvci_flag := 'No current NVCI certificate on file for ' || coalesce(who, 'the reporting staff') || '.'; end if;
    for pid in select x from house_leaders(new.home_id) x loop
      perform notify(pid, '⚠️ Safety: restraint used with ' || coalesce(nm, 'a resident'),
        'Reported by ' || coalesce(who, 'staff') || '. Check on the person and staff, tell the social worker / CLBC, and review the incident.'
          || case when not has_nvci then ' ' || new.nvci_flag else '' end,
        '/residents/' || new.resident_id || '?tab=incidents', 'rst:' || new.id || ':' || pid);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists incidents_restraint on incidents;
create trigger incidents_restraint before insert or update on incidents for each row execute function restraint_rules();

-- Older incidents with physical intervention: count them as already handled, so closing them isn't blocked.
update incidents set no_prohibited = true where physical_intervention and status = 'Closed' and not no_prohibited;

select 'restraint log ready' as result;
