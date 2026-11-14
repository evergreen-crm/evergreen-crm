-- Phase 6 (rest): HR, program review and finance duties now open a form in the portal. Safe to run again.
update public.duties set form_kind = 'staff_details_check', form_mode = 'fill' where duty_code = 'BOTH-C006' and form_kind is null;
update public.duties set form_kind = 'med_competency_check', form_mode = 'fill' where duty_code = 'BOTH-C023' and form_kind is null;
update public.duties set form_kind = 'driver_review', form_mode = 'fill' where duty_code = 'BOTH-C026' and form_kind is null;
update public.duties set form_kind = 'hr_compliance_report', form_mode = 'fill' where duty_code in ('BOTH-C028', 'MCFD-049', 'MCFD-178', 'BOTH-025') and form_kind is null;
update public.duties set form_kind = 'staffing_review', form_mode = 'fill' where duty_code in ('MCFD-067', 'MCFD-122') and form_kind is null;
update public.duties set form_kind = 'team_learning', form_mode = 'fill' where duty_code = 'BOTH-C037' and form_kind is null;
update public.duties set form_kind = 'program_evaluation', form_mode = 'fill' where duty_code in ('MCFD-081', 'MCFD-135', 'MCFD-179') and form_kind is null;
update public.duties set form_kind = 'annual_manual_review', form_mode = 'fill' where duty_code in ('MCFD-085', 'MCFD-130', 'MCFD-121', 'MCFD-037') and form_kind is null;
update public.duties set form_kind = 'personnel_file_audit', form_mode = 'fill' where duty_code in ('BOTH-C029', 'MCFD-146') and form_kind is null;
update public.duties set form_kind = 'supervision_record', form_mode = 'fill' where duty_code in ('BOTH-C030', 'MCFD-127') and form_kind is null;
update public.duties set form_kind = 'monthly_financial_review', form_mode = 'fill' where duty_code in ('MCFD-027', 'MCFD-068', 'MCFD-132', 'MCFD-167', 'BOTH-C067', 'BOTH-C068') and form_kind is null;
update public.duties set form_kind = 'annual_financial_report', form_mode = 'fill' where duty_code = 'MCFD-036' and form_kind is null;
