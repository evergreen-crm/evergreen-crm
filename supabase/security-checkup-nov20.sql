-- =====================================================================
-- Evergreen CRM - Security check-up (plan E1, Nov 20, 2026).
-- From the Supabase security scan:
--   1. Three pay-change functions and ten automatic background steps (trigger functions) could be called by
--      someone not signed in. Closed. The pay functions stay open to signed-in people (they check the person's
--      role inside); the background steps run only inside the database.
--   2. Thirteen duty-register / complaint / plan functions had no fixed search path. Fixed.
--   3. From now on, new database functions are NOT callable by people who are not signed in unless a migration
--      says so on purpose (the public forms and the ID card check already do).
-- Intentionally still public: intake_open / intake_submit, prescreen_open / prescreen_submit (public forms with
-- an email code), verify_id_card and id_photo_is_public (QR check of a staff ID card), and the "who is signed in"
-- helpers (app_role, app_level, app_group, app_home, can_* ...) that only answer for the signed-in person and
-- return nothing for someone who isn't.
-- Run as migration security_checkup_nov20. Safe to re-run.
-- =====================================================================
revoke execute on function public.cancel_pay_change(p_id uuid) from public, anon;
revoke execute on function public.decide_pay_change(p_id uuid, p_approve boolean, p_note text) from public, anon;
revoke execute on function public.request_pay_change(p jsonb) from public, anon;
grant execute on function public.cancel_pay_change(p_id uuid) to authenticated;
grant execute on function public.decide_pay_change(p_id uuid, p_approve boolean, p_note text) to authenticated;
grant execute on function public.request_pay_change(p jsonb) to authenticated;

revoke execute on function public.care_plan_touch() from public, anon, authenticated;
revoke execute on function public.duty_evt_complaint() from public, anon, authenticated;
revoke execute on function public.duty_evt_discharge() from public, anon, authenticated;
revoke execute on function public.duty_evt_incident() from public, anon, authenticated;
revoke execute on function public.duty_evt_mar() from public, anon, authenticated;
revoke execute on function public.duty_evt_missing() from public, anon, authenticated;
revoke execute on function public.duty_evt_policy() from public, anon, authenticated;
revoke execute on function public.duty_evt_resident() from public, anon, authenticated;
revoke execute on function public.duty_evt_staff() from public, anon, authenticated;
revoke execute on function public.form_entry_event() from public, anon, authenticated;
revoke execute on function public.job_application_guard() from public, anon, authenticated;
revoke execute on function public.job_posting_id() from public, anon, authenticated;
revoke execute on function public.plan_log_touch() from public, anon, authenticated;
revoke execute on function public.time_entries_own_edit() from public, anon, authenticated;

alter function public.complaint_number() set search_path = public;
alter function public.duty_holder_at_level(p_level integer, p_home uuid) set search_path = public;
alter function public.duty_make_task(p_duty duties, p_subject_kind text, p_subject uuid, p_home uuid, p_due date, p_period text, p_owner uuid) set search_path = public;
alter function public.duty_manager_of(p_owner uuid, p_home uuid) set search_path = public;
alter function public.duty_owner(p_role text, p_home uuid) set search_path = public;
alter function public.duty_run_escalations(p_today date) set search_path = public;
alter function public.duty_run_events() set search_path = public;
alter function public.duty_run_expiries(p_today date) set search_path = public;
alter function public.duty_run_plans(p_today date) set search_path = public;
alter function public.duty_run_schedules(p_today date) set search_path = public;
alter function public.duty_stream_matches(p_duty_stream text, p_program text) set search_path = public;
alter function public.duty_subject_program(p_applies text, p_subject uuid) set search_path = public;
alter function public.plan_stream(p_resident uuid) set search_path = public;

-- New functions: signed-in people and the server can call them; people not signed in can't (unless granted).
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;
