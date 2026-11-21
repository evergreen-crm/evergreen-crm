-- Nov 21, 2026 youth worker deep test fixes. Run on BOTH databases. Safe to re-run.

-- 1. A youth worker could not save why they were late: the "own time entry" guard blocked late_reason.
--    set_late_reason now marks its one update as a trusted clock action (like clock in / clock out).
create or replace function public.set_late_reason(p_entry uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'Write a short reason.'; end if;
  perform set_config('evg.safe_clock', '1', true);
  update time_entries set late_reason = left(trim(p_reason), 300) where id = p_entry and profile_id = auth.uid() and late_minutes is not null;
  if not found then raise exception 'That time entry was not found.'; end if;
  perform set_config('evg.safe_clock', '', true);
end $function$;
