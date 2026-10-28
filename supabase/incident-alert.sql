-- =====================================================================
-- Evergreen CRM - Urgent alerts for house leaders (Program Coordinator, Program Manager).
-- A saved entry alerts the house's leaders (urgent pop-up in the app, and the urgent email the
-- notifications job already sends) for:
--   mcfd_incident    Reportable incident (MCFD C.2.8)
--   mcfd_restraint   Physical restraint or seclusion (MCFD C.3.9, C.3.11, C.3.13(b))
--   mcfd_illness     Serious illness or injury (MCFD D.6.5(b))
-- Other records (day book, wellness, discipline, service record, views, reviews) only document; no alert.
-- Uses house_leaders() and notify_now(), both already in the database. Safe to run more than once.
-- =====================================================================

create or replace function mcfd_incident_alert() returns trigger language plpgsql security definer set search_path = public as $$
declare ldr uuid; hname text; rname text; ttl text; lbl text;
begin
  if new.kind not in ('mcfd_incident', 'mcfd_restraint', 'mcfd_illness') then return new; end if;
  ttl := case new.kind
    when 'mcfd_incident' then '🚨 Reportable incident: '
    when 'mcfd_restraint' then '🚨 Restraint or seclusion: '
    else '🚨 Serious illness or injury: ' end;
  lbl := case new.kind
    when 'mcfd_incident' then coalesce(new.data->>'incident_type', 'incident')
    when 'mcfd_restraint' then 'physical restraint or seclusion'
    else coalesce(new.data->>'description', 'illness or injury') end;
  select name into hname from homes where id = new.home_id;
  select coalesce(preferred_name, first_name) || ' ' || last_name into rname from residents where id = new.resident_id;
  for ldr in select l from house_leaders(new.home_id) l loop
    perform notify_now(
      ldr,
      ttl || coalesce(rname, 'resident'),
      coalesce(hname, 'House') || ' · ' || lbl
        || case when new.data ? 'sw_notified' then ' · social worker notified: ' || coalesce(new.data->>'sw_notified', 'not recorded') else '' end,
      '/residents/' || new.resident_id || '?tab=logs&type=' || new.kind,
      'inc:' || new.id || ':' || ldr
    );
  end loop;
  return new;
end $$;

drop trigger if exists entries_mcfd_incident_alert on entries;
create trigger entries_mcfd_incident_alert after insert on entries
  for each row execute function mcfd_incident_alert();
