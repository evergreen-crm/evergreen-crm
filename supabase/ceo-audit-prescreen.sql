-- =====================================================================
-- Evergreen CRM - CEO sees the security audit log and prescreening (Nov 11, 2026).
--   * Security audit log (audit_log) and the log of security-setting changes (section_access_log):
--     the CEO (level 7) can now READ them, like the Administrator. Nobody can change or delete them.
--   * Prescreening and reference checks: the CEO is in automatically, with the same access as HR.
--     Executive approval is still signed by the Administrator only (prescreen_guard is unchanged).
--   * Admin settings (sign-ins, security settings, policy import, course videos) stay Administrator-only.
-- Run as migration ceo_audit_prescreen. Safe to re-run.
-- =====================================================================

alter policy "audit see" on public.audit_log using (app_role() = 'admin' or coalesce(app_level(), 0) >= 7);
alter policy "section log see" on public.section_access_log using (app_role() = 'admin' or coalesce(app_level(), 0) >= 7);

create index if not exists audit_log_changed_at on public.audit_log (changed_at desc);

-- The areas (tables) that have audit entries, for the filter on /admin/audit. Follows the policy above.
create or replace function public.audit_log_tables()
returns setof text language sql stable security invoker set search_path = public as $$
  select distinct table_name from audit_log order by 1
$$;
revoke execute on function public.audit_log_tables() from public, anon;
grant execute on function public.audit_log_tables() to authenticated, service_role;

create or replace function public.prescreen_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when app_role() = 'admin' then 'admin'
    when app_role() is null then null
    when app_group() = 'hr' then 'hr'
    when coalesce(app_level(), 0) >= 7 then 'hr'
    else (select access from prescreen_access where profile_id = auth.uid())
  end
$$;
revoke execute on function public.prescreen_role() from public, anon;
grant execute on function public.prescreen_role() to authenticated, service_role;
