-- =====================================================================
-- Evergreen CRM - Opening-day readiness (plan E2, Nov 20, 2026).
--   * profiles.is_test marks the test accounts (the inbox.ms1187+... accounts). On opening day the Administrator
--     switches them all off with one button (portal access off; the server also blocks their sign-in).
--   * golive_items: the "before opening" tick list (lawyer review, paid plans, accounts, clean-up), with who
--     ticked each item and when.
-- Who: the Administrator; the CEO can read.
-- Run as migration go_live. Safe to re-run.
-- =====================================================================
alter table public.profiles add column if not exists is_test boolean not null default false;
update public.profiles set is_test = true
 where email ilike 'inbox.ms1187+%@gmail.com' and not is_test;

create table if not exists public.golive_items (
  key text primary key check (length(key) <= 60),
  done boolean not null default false,
  note text check (length(note) <= 1000),
  done_by uuid references public.profiles(id),
  done_at timestamptz
);
alter table public.golive_items enable row level security;
drop policy if exists golive_read on public.golive_items;
create policy golive_read on public.golive_items for select using (app_role() = 'admin' or (coalesce(app_level(), 0) >= 7 and coalesce(app_group(), '') = ''));
drop policy if exists golive_write on public.golive_items;
create policy golive_write on public.golive_items for all using (app_role() = 'admin') with check (app_role() = 'admin');

-- Opening day: switch off every test account at once. Returns their ids (the server also blocks their sign-in).
create or replace function public.golive_switch_off_tests() returns uuid[]
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  if app_role() is distinct from 'admin' then raise exception 'Only the Administrator can do this.'; end if;
  with off as (update profiles set active = false where is_test and active and id <> auth.uid() returning id)
  select coalesce(array_agg(id), '{}') into ids from off;
  return ids;
end $$;
revoke execute on function public.golive_switch_off_tests() from public, anon;
grant execute on function public.golive_switch_off_tests() to authenticated;
