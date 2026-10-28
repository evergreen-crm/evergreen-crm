-- =====================================================================
-- Evergreen CRM - Reportable incident alert (MCFD C.2.8).
-- Only a saved "Reportable incident" entry (kind mcfd_incident) alerts the house's leaders:
-- an urgent pop-up in the app, and the urgent email that the notifications job already sends.
-- Other records (day book, wellness, illness, discipline, service record, views, reviews) only document; no alert.
-- Uses house_leaders() and notify_now(), both already in the database. Safe to run more than once.
-- =====================================================================

create or replace function mcfd_incident_alert() returns trigger language plpgsql security definer set search_path = public as $$
declare ldr uuid; hname text; rname text;
begin
  if new.kind <> 'mcfd_incident' then return new; end if;
  select name into hname from homes where id = new.home_id;
  select coalesce(preferred_name, first_name) || ' ' || last_name into rname from residents where id = new.resident_id;
  for ldr in select l from house_leaders(new.home_id) l loop
    perform notify_now(
      ldr,
      '🚨 Reportable incident: ' || coalesce(rname, 'resident'),
      coalesce(hname, 'House') || ' · ' || coalesce(new.data->>'incident_type', 'incident')
        || ' · social worker notified: ' || coalesce(new.data->>'sw_notified', 'not recorded'),
      '/residents/' || new.resident_id || '?tab=logs&type=mcfd_incident',
      'inc:' || new.id || ':' || ldr
    );
  end loop;
  return new;
end $$;

drop trigger if exists entries_mcfd_incident_alert on entries;
create trigger entries_mcfd_incident_alert after insert on entries
  for each row execute function mcfd_incident_alert();
