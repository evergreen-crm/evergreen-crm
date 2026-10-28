-- Per-person access: the level for each menu section, set by the administrator or CEO.
-- A row here overrides the person's department and the role settings for that section ('none' hides it).
create table if not exists public.person_section_access (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  section text not null,
  level text not null check (level in ('none','read','own','house','assigned','all')),
  set_by uuid references public.profiles(id),
  set_at timestamptz not null default now(),
  primary key (profile_id, section)
);
alter table public.person_section_access enable row level security;
drop policy if exists "person access see" on public.person_section_access;
create policy "person access see" on public.person_section_access for select
  using (profile_id = auth.uid() or app_role() = 'admin' or app_level() >= 7);
drop policy if exists "person access write" on public.person_section_access;
create policy "person access write" on public.person_section_access for all
  using (app_role() = 'admin' or app_level() >= 7)
  with check (app_role() = 'admin' or app_level() >= 7);
