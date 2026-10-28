-- Time-off approval chain: Frontline -> Program Coordinator -> Program Manager -> Director -> CEO.
-- Admin and CEO (level 7+) can approve anything and see the whole pool.
create or replace function public.can_approve_time_off(req uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare me_lvl int := app_level(); r profiles; rl int; homes_ok boolean;
begin
  select * into r from profiles where id = req;
  if r.id is null or r.id = auth.uid() then return false; end if;
  if app_role() = 'admin' or me_lvl >= 7 then return true; end if;
  rl := case when r.role = 'admin' then 8 else coalesce(r.level, 1) end;
  homes_ok := r.home_id is not null and (r.home_id = app_home()
                or r.home_id in (select m.home_id from manager_homes m where m.profile_id = auth.uid()));
  if rl >= 7 then return false; end if;
  if rl >= 4 then return me_lvl >= 7; end if;                       -- directors: CEO decides
  if rl = 3 then return me_lvl >= 4; end if;                        -- program managers: a director or the CEO
  if rl = 2 then return (me_lvl = 3 and homes_ok and app_group() is null) or me_lvl >= 4; end if;  -- PCs: their PM, or a director
  return (me_lvl = 2 and homes_ok and app_group() is null) or (me_lvl = 3 and homes_ok);            -- frontline: their PC, or their PM
end $$;

create or replace function public.time_off_pending_for_me() returns setof time_off_requests
language sql stable security definer set search_path = public as $$
  select t.* from time_off_requests t where t.status = 'Pending' and can_approve_time_off(t.profile_id) order by t.start_date;
$$;

create or replace function public.decide_time_off(p_id uuid, p_approve boolean, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare r time_off_requests; them profiles; n int := 0;
begin
  select * into r from time_off_requests where id = p_id;
  select * into them from profiles where id = r.profile_id;
  if r.profile_id = auth.uid() then
    if p_approve then raise exception 'You can’t approve your own time off.'; end if;
    update time_off_requests set status = 'Cancelled' where id = p_id and status = 'Pending'; return 0;
  end if;
  if not can_approve_time_off(r.profile_id) then raise exception 'This request is decided by the next person up the chain.'; end if;
  if r.status <> 'Pending' then raise exception 'This request was already %.', lower(r.status); end if;
  update time_off_requests set status = case when p_approve then 'Approved' else 'Declined' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = left(p_note, 300) where id = p_id;
  if p_approve then
    update shifts set profile_id = null, offered = false, open_reason = 'Time off: ' || them.full_name, source = 'changed'
     where profile_id = r.profile_id and shift_date between greatest(r.start_date, current_date) and r.end_date;
    get diagnostics n = row_count;
  end if;
  perform notify(r.profile_id, case when p_approve then '✅ Time off approved' else '⛔ Time off not approved' end,
                 to_char(r.start_date, 'Mon DD') || case when r.end_date > r.start_date then ' – ' || to_char(r.end_date, 'Mon DD') else '' end
                 || coalesce(' — ' || nullif(trim(p_note), ''), ''), '/schedule?tab=timeoff', 'tod:' || p_id);
  return n;
end $$;
