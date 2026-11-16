-- Forms Batch 7 (leftover emergency and OHS appendices): duties that open the new forms. Safe to run again.
insert into public.duties (duty_code, title, stream, domain, applies_to, owner_role, trigger_kind, event_key, schedule, within_hours, remind_days, safety_critical, proof, source_doc, source_ref, form_kind, form_mode)
values
 ('BOTH-B701', 'New admission: emergency profile and go-bag ready', 'BOTH', 7, 'resident', 'program_coordinator', 'event', 'resident_admitted', null, 72, 1, true, 'Emergency profile and go-bag checklist', 'ECC-EP-2026-002', 'Appendix F', 'youth_go_bag', 'fill'),
 ('BOTH-B702', 'Quarterly emergency preparedness review (January, April, October)', 'BOTH', 7, 'home', 'program_coordinator', 'schedule', null, 'quarterly', null, 7, false, 'Quarterly review', 'ECC-EP-2026-002', 'Appendix M', 'ep_quarterly_memo', 'fill'),
 ('BOTH-B703', 'Monthly PPE check', 'BOTH', 6, 'home', 'program_coordinator', 'schedule', null, 'monthly', null, 5, false, 'PPE check', 'ECC-OHS-POL-2026-002', 'Appendix H', 'ppe_inspection', 'fill'),
 ('BOTH-B704', 'Yearly review of the chemical and biological exposure control plan', 'BOTH', 6, 'home', 'program_manager', 'schedule', null, 'annual', null, 14, false, 'Exposure control review', 'ECC-OHS-POL-2026-002', 'Appendix I', 'exposure_control_review', 'fill'),
 ('BOTH-B705', 'Annual health and safety performance review', 'BOTH', 6, 'home', 'program_manager', 'schedule', null, 'annual', null, 14, false, 'Annual OHS review', 'ECC-OHS-POL-2026-002', 'Appendix J', 'ohs_annual_dashboard', 'fill')
on conflict (duty_code) do nothing;
