-- Evergreen CRM - "My to-do" reminders.
-- A Program Manager and above (or HR) can send a staff member a reminder about their to-do list.
-- The reminder arrives as a portal notification (and by email when email is set up in Vercel).
-- One reminder per person per day, so nobody gets flooded. Program Managers can remind staff below
-- their level; HR, the Executive Director and above can remind anyone. Never yourself.
-- Uses app_level(), app_group() and the notifications table (policies-hr.sql). Safe to run more than once.

create or replace function send_todo_reminder(p_profile uuid, p_body text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare me profiles; them profiles; n int;
begin
  select * into me from profiles where id = auth.uid();
  select * into them from profiles where id = p_profile;
  if them.id is null or not them.active then raise exception 'Staff member not found.'; end if;
  if p_profile = auth.uid() then raise exception 'You cannot send a reminder to yourself.'; end if;
  if not (coalesce(app_group(), '') = 'hr' or coalesce(me.role, '') = 'admin' or coalesce(app_level(), 0) >= 5
          or (coalesce(app_level(), 0) >= 3 and coalesce(them.level, 1) < app_level())) then
    raise exception 'Only HR or a Program Manager and above can send reminders (to staff below their level).';
  end if;
  insert into notifications (profile_id, title, body, link, dedupe_key)
  values (p_profile, 'Reminder: you have tasks to finish',
          coalesce(nullif(trim(p_body), ''), 'Please open My to-do and finish the items that are due.') || ' — ' || me.full_name,
          '/todo', 'todo-rem:' || p_profile || ':' || (now() at time zone 'America/Vancouver')::date)
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function send_todo_reminder(uuid, text) from public, anon;
grant execute on function send_todo_reminder(uuid, text) to authenticated;

select 'todo reminders ready' as result;
