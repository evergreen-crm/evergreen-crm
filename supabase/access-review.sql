-- =====================================================================
-- Evergreen CRM - Monthly access review (plan B4, Nov 20, 2026).
-- Once a month the Administrator gets an alert to review who can see what: access level, HR / Payroll group,
-- houses, extra departments, pre-screening access, and who hasn't signed in for 30 days or has left.
-- The review is signed off with notes, and a copy of the list at that moment is kept (audit).
-- Who: the Administrator does the review; the CEO can read it.
-- Run as migration access_review. Safe to re-run.
-- =====================================================================
create table if not exists public.access_reviews (
  id uuid primary key default gen_random_uuid(),
  review_month date not null unique,                 -- first day of the month
  reviewed_by uuid references public.profiles(id) default auth.uid(),
  reviewed_at timestamptz not null default now(),
  notes text check (length(notes) <= 4000),
  flagged int not null default 0,
  snapshot jsonb not null default '[]'::jsonb
);
alter table public.access_reviews enable row level security;
drop policy if exists access_reviews_read on public.access_reviews;
create policy access_reviews_read on public.access_reviews for select using (app_role() = 'admin' or (coalesce(app_level(), 0) >= 7 and coalesce(app_group(), '') = ''));
drop policy if exists access_reviews_add on public.access_reviews;
create policy access_reviews_add on public.access_reviews for insert with check (app_role() = 'admin' and reviewed_by = auth.uid());

-- The list (includes last sign-in, which only the database can read).
create or replace function public.access_review_list()
returns table (id uuid, full_name text, email text, role text, level int, staff_group text, active boolean,
  home text, extra_homes text, departments text, prescreen text, section_overrides int,
  created_at timestamptz, last_sign_in timestamptz, added_by text, last_day date, employee_no text, job_position text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email, p.role::text, p.level, p.staff_group, p.active,
    h.name,
    (select string_agg(h2.name, ', ' order by h2.name) from manager_homes m join homes h2 on h2.id = m.home_id where m.profile_id = p.id and m.home_id is distinct from p.home_id),
    nullif(concat_ws(', ', p.department, (select string_agg(pa.division || case when pa.can_edit then ' (edit)' else ' (view)' end, ', ') from portal_access pa where pa.profile_id = p.id)), ''),
    (select string_agg(x.access, ', ') from prescreen_access x where x.profile_id = p.id),
    (select count(*)::int from person_section_access s where s.profile_id = p.id),
    p.created_at, u.last_sign_in_at, ab.full_name, d.last_day, d.employee_no, d.position
  from profiles p
  left join auth.users u on u.id = p.id
  left join homes h on h.id = p.home_id
  left join profiles ab on ab.id = p.added_by
  left join staff_details d on d.profile_id = p.id
  where (app_role() = 'admin' or (coalesce(app_level(), 0) >= 7 and coalesce(app_group(), '') = ''))
    and (p.role::text <> 'family' or p.active)
  order by p.active desc, coalesce(p.level, 0) desc, p.full_name;
$$;
revoke execute on function public.access_review_list() from public, anon;
grant execute on function public.access_review_list() to authenticated;

-- Daily job: from the 1st of each month, remind the Administrator(s) until this month's review is signed off
-- (one alert per month; a second one on the 15th if it still isn't done).
create or replace function public.access_review_remind() returns int
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', (now() at time zone evg_tz()))::date; d int := extract(day from (now() at time zone evg_tz()))::int; a record; n int := 0;
begin
  if exists (select 1 from access_reviews where review_month = m) then return 0; end if;
  for a in select id from profiles where role = 'admin' and active loop
    perform notify(a.id, 'Monthly access review due',
      'Check who can see what in the portal, remove access people no longer need, then sign off the review for ' || to_char(m, 'FMMonth YYYY') || '.',
      '/admin/access-review', 'access-review-' || a.id || '-' || to_char(m, 'YYYY-MM') || case when d >= 15 then '-2' else '' end);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.access_review_remind() from public, anon, authenticated;
grant execute on function public.access_review_remind() to service_role;
