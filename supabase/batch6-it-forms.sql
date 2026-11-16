-- Forms Batch 6 (IT and cyber security manual): saving a breach report starts the review; new duties. Safe to run again.
create or replace function public.form_entry_event()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare k text := null;
begin
  if new.kind in ('restraint_report','mcfd_restraint','med_error_report','illness_injury_report','head_injury_start',
                  'med_refusal','emergency_debrief','emergency_drill','outbreak_start',
                  'bsp_plan','daily_schedule','schedule_review','youth_complaint',
                  'ohs_incident_report','work_refusal','violence_debrief','day1_orientation',
                  'abuse_report','it_breach_report') then
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

insert into public.duties (duty_code, title, stream, domain, applies_to, owner_role, trigger_kind, event_key, schedule, within_hours, remind_days, safety_critical, proof, source_doc, source_ref, form_kind, form_mode)
values
 ('BOTH-B601', 'IT acceptable use and confidentiality acknowledgement signed before any system access', 'BOTH', 8, 'staff', 'program_coordinator', 'event', 'staff_hired', null, 24, 1, false, 'Acknowledgement signed', 'ECC-IT-2026-001', 'Appendix B', 'it_acceptable_use', 'fill'),
 ('BOTH-B602', 'Password and MFA set up on every system at onboarding', 'BOTH', 8, 'staff', 'program_coordinator', 'event', 'staff_hired', null, 48, 1, false, 'Setup checklist', 'ECC-IT-2026-001', 'Appendix D', 'it_mfa_setup', 'fill'),
 ('BOTH-B603', 'Cybersecurity incident or breach: Executive Director told within 24 hours if a person in care is affected; post-incident review within 10 business days', 'BOTH', 8, 'home', 'program_manager', 'event', 'form_it_breach_report', null, 336, 1, true, 'Review recorded on the report', 'ECC-IT-2026-001', 'Section 14', 'it_breach_report', 'review'),
 ('BOTH-B604', 'Annual IT security self-audit for the house', 'BOTH', 8, 'home', 'program_coordinator', 'schedule', null, 'annual', null, 14, false, 'Self-audit checklist', 'ECC-IT-2026-001', 'Appendix F', 'it_self_audit', 'fill')
on conflict (duty_code) do nothing;
