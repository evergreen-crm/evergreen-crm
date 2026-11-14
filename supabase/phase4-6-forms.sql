-- Phases 4 to 6: forms for safeguarding, staff leaving, health follow-up, accessibility, corrective action,
-- contracts and supervision (lib/policyForms.js). This links them to the duty engine. Safe to run again.

-- 1. Saving a form starts the next step.
create or replace function public.form_entry_event()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare k text := null;
begin
  if new.kind in ('restraint_report','mcfd_restraint','med_error_report','illness_injury_report','head_injury_start',
                  'med_refusal','emergency_debrief','emergency_drill','outbreak_start',
                  'bsp_plan','daily_schedule','schedule_review','youth_complaint',
                  'ohs_incident_report','work_refusal','violence_debrief','day1_orientation',
                  'abuse_report') then
    k := 'form_' || new.kind;
  elsif new.kind = 'health_change_notice' then
    k := case when new.data->>'change' = 'Returned from hospital' then 'hospital_discharge' else 'health_change' end;
  elsif new.kind = 'barrier_report' then
    k := 'barrier_reported';
    if new.data->>'safety' = 'Yes' then
      insert into public.duty_events (event_key, occurred_at, home_id, ref_table, ref_id) values ('barrier_safety', now(), new.home_id, 'entries', new.id);
    end if;
  elsif new.kind = 'corrective_action' then k := 'corrective_action_set';
  elsif new.kind = 'contract_start' then k := 'contract_started';
  end if;
  if k is not null then
    insert into public.duty_events (event_key, occurred_at, home_id, resident_id, profile_id, ref_table, ref_id)
    values (k, now(), new.home_id, new.resident_id, new.subject_profile_id, 'entries', new.id);
  end if;
  return new;
end $function$;

-- 2. Existing duties now open the right form ("Fill in the form" on the task).
update public.duties set form_kind = 'abuse_report', form_mode = 'fill' where duty_code = 'CLBC-C015';
update public.duties set form_kind = 'health_plan_update', form_mode = 'fill' where duty_code = 'BOTH-C024';
update public.duties set form_kind = 'discharge_reconciliation', form_mode = 'fill' where duty_code = 'BOTH-C025';
update public.duties set form_kind = 'barrier_fix', form_mode = 'fill' where duty_code in ('BOTH-C046', 'BOTH-C047');
update public.duties set form_kind = 'corrective_action_done', form_mode = 'fill' where duty_code = 'BOTH-C066';
update public.duties set form_kind = 'community_map', form_mode = 'fill' where duty_code = 'CLBC-C061';

-- 3. New duties.
insert into public.duties (duty_code, title, stream, domain, applies_to, owner_role, trigger_kind, event_key, within_hours, remind_days, safety_critical, proof, source_doc, source_ref, form_kind, form_mode)
values
 ('BOTH-G001', 'Staff leaving checklist completed (keys, accounts, property, final pay)', 'BOTH', 8, 'staff', 'program_manager', 'event', 'staff_left', 24, 1, false, 'Staff leaving checklist', 'ECC-IT-2026-001', 'ECC-HR-POL-2026-001', 'staff_offboarding', 'fill'),
 ('BOTH-G002', 'Exit interview offered and recorded', 'BOTH', 4, 'staff', 'program_manager', 'event', 'staff_left', 168, 2, false, 'Exit interview record', 'ECC-HR-POL-2026-001', 'ECC-HR-POL-2026-001', 'exit_interview', 'fill'),
 ('MCFD-G003', 'Suspected abuse or neglect of a child or youth reported to a child protection worker right away, and recorded', 'MCFD', 2, 'resident', 'program_coordinator', 'event', 'abuse_suspected', 1, 0, true, 'Report record', 'CFCSA s.14', 'CFCSA s.14', 'abuse_report', 'fill'),
 ('BOTH-G004', 'Suspected abuse report reviewed by the Program Manager; outside report confirmed', 'BOTH', 2, 'resident', 'program_manager', 'event', 'form_abuse_report', 24, 0, true, 'Review recorded', 'RFQ-590 Forms H-7 Rights', 'CFCSA s.14 · Adult Guardianship Act', 'abuse_report', 'review')
on conflict (duty_code) do nothing;
