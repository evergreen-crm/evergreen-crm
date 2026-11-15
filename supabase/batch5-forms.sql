-- Forms Batch 5 (Program Coordinator and Program Manager manuals): link the forms to the duty register. Safe to run again.
update public.duties set form_kind = 'mcfd_self_assessment', form_mode = 'fill' where duty_code = 'BOTH-C064' and form_kind is null;
update public.duties set form_kind = 'ci_trend_quarterly', form_mode = 'fill' where duty_code = 'BOTH-C013' and form_kind is null;

insert into public.duties (duty_code, title, stream, domain, applies_to, owner_role, trigger_kind, schedule, schedule_param, within_hours, remind_days, safety_critical, proof, source_doc, source_ref, form_kind, form_mode)
values
 ('MCFD-B501', 'Quarterly critical incident trend analysis, presented to the Executive Director within 10 business days', 'MCFD', 6, 'home', 'program_manager', 'schedule', 'quarterly', null, null, 7, false, 'Trend analysis', 'ECC-PM-MAN-2026-001', 'Appendix C', 'ci_trend_quarterly', 'fill'),
 ('MCFD-B502', 'Bi-annual youth file audit (January and July, at least 25% of active files)', 'MCFD', 6, 'home', 'program_manager', 'schedule', 'semiannual', null, null, 14, false, 'File audit forms', 'ECC-PM-MAN-2026-001', 'Appendix D', 'isr_file_audit', 'fill'),
 ('MCFD-B503', 'Contract tracking log reviewed and upcoming MCFD deadlines confirmed', 'MCFD', 10, 'home', 'program_manager', 'schedule', 'monthly', null, null, 5, false, 'Tracking log updated', 'ECC-PM-MAN-2026-001', 'Appendix G', 'contract_tracking', 'fill')
on conflict (duty_code) do nothing;
