-- =====================================================================
-- Evergreen CRM - Changing approved hours sends them back for approval, with an alert (Nov 5, 2026).
-- Before: Payroll, Program Managers and directors could change hours after they were approved, and the
-- entry stayed "Approved" (the change was only in the audit log).
-- Now, when the clock-in, clock-out or break of an APPROVED entry changes:
--   * the approval is cleared, so the entry shows "Pending" and must be approved again;
--   * an alert goes to the person who approved it, the staff member, and the house's leaders
--     (except whoever made the change), saying who changed it, from what, to what.
-- Every change is still in the audit log. Run as migration approved_hours_change. Safe to re-run.
-- =====================================================================
create or replace function public.time_entries_approved_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; staff text; was text; now_t text; f text := 'Mon DD HH24:MI'; r uuid;
begin
  if old.approved_at is null then return new; end if;
  if new.clock_in is not distinct from old.clock_in and new.clock_out is not distinct from old.clock_out
     and coalesce(new.break_minutes, 0) = coalesce(old.break_minutes, 0) then
    return new;
  end if;
  -- Hours changed: needs approving again (unless this same update is the re-approval itself).
  if new.approved_at is not distinct from old.approved_at then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  select full_name into who from profiles where id = auth.uid();
  select full_name into staff from profiles where id = old.profile_id;
  was := to_char(old.clock_in at time zone evg_tz(), f) || ' – ' || coalesce(to_char(old.clock_out at time zone evg_tz(), 'HH24:MI'), '?')
         || case when coalesce(old.break_minutes, 0) > 0 then ' (break ' || old.break_minutes || ' min)' else '' end;
  now_t := to_char(new.clock_in at time zone evg_tz(), f) || ' – ' || coalesce(to_char(new.clock_out at time zone evg_tz(), 'HH24:MI'), '?')
         || case when coalesce(new.break_minutes, 0) > 0 then ' (break ' || new.break_minutes || ' min)' else '' end;
  for r in
    select distinct x from (
      select old.approved_by as x union all select old.profile_id union all select l from house_leaders(old.home_id) l
    ) z where x is not null and x is distinct from auth.uid()
  loop
    perform notify(r, '⏱ Approved hours changed: ' || coalesce(staff, 'staff'),
      'Changed by ' || coalesce(who, 'someone') || '. Was ' || was || ', now ' || now_t || '. It needs approving again on Timesheets.',
      '/timesheet', 'ahc:' || old.id || ':' || to_char(now(), 'YYYYMMDDHH24MISS') || ':' || r);
  end loop;
  return new;
end $$;
revoke execute on function public.time_entries_approved_change() from public, anon, authenticated;
drop trigger if exists time_entries_approved_change on public.time_entries;
create trigger time_entries_approved_change before update on public.time_entries
  for each row execute function public.time_entries_approved_change();
