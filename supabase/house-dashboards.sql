-- =====================================================================
-- Evergreen CRM - House dashboards: notice board posts.
-- Program Coordinators (level 2) post to their own house; Program Managers
-- and above (level 3+) post to any house or to ALL houses (main dashboard).
-- Staff mark posts as read, so managers can see who has read them.
-- Important / Urgent posts also send an in-app notification to the staff they are for.
-- Run once in Supabase SQL Editor. Safe to run again.
-- =====================================================================

create table if not exists house_posts (
  id          uuid primary key default gen_random_uuid(),
  home_id     uuid references homes on delete cascade,   -- null = all houses
  title       text not null,
  body        text,
  priority    text not null default 'Normal' check (priority in ('Normal', 'Important', 'Urgent')),
  pinned      boolean not null default false,
  expires_on  date,                                        -- hidden after this date
  created_by  uuid references profiles default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists house_posts_home_idx on house_posts (home_id, created_at desc);

create table if not exists house_post_reads (
  post_id     uuid not null references house_posts on delete cascade,
  profile_id  uuid not null references profiles on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (post_id, profile_id)
);

alter table house_posts enable row level security;
alter table house_post_reads enable row level security;

-- Who sees a post: level 3+ and admins see all; others see all-house posts and their own house's posts.
drop policy if exists "posts see" on house_posts;
create policy "posts see" on house_posts for select using (
  app_level() >= 3 or (app_level() >= 1 and (home_id is null or home_id = app_home())));

-- Who posts: level 2 to their own house; level 3+ anywhere (including all houses).
drop policy if exists "posts add" on house_posts;
create policy "posts add" on house_posts for insert with check (
  created_by = auth.uid() and (app_level() >= 3 or (app_level() = 2 and home_id is not null and home_id = app_home())));

-- Edit / remove: the author, or level 3+.
drop policy if exists "posts edit" on house_posts;
create policy "posts edit" on house_posts for update using (app_level() >= 3 or created_by = auth.uid())
  with check (app_level() >= 3 or (created_by = auth.uid() and home_id is not null and home_id = app_home()));
drop policy if exists "posts delete" on house_posts;
create policy "posts delete" on house_posts for delete using (app_level() >= 3 or created_by = auth.uid());

drop policy if exists "post reads see" on house_post_reads;
create policy "post reads see" on house_post_reads for select using (
  profile_id = auth.uid() or app_level() >= 2);
drop policy if exists "post reads add" on house_post_reads;
create policy "post reads add" on house_post_reads for insert with check (
  profile_id = auth.uid() and exists (select 1 from house_posts p where p.id = post_id));

-- Important / Urgent: notify the staff the post is for (not the author).
create or replace function notify_house_post() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.priority = 'Normal' then return new; end if;
  for r in
    select id from profiles
    where active and role in ('staff', 'manager', 'admin') and id <> coalesce(new.created_by, '00000000-0000-0000-0000-000000000000'::uuid)
      and (new.home_id is null or home_id = new.home_id or role in ('manager', 'admin'))
  loop
    perform notify(r.id, new.priority || ': ' || new.title, left(coalesce(new.body, ''), 200),
      case when new.home_id is null then '/dashboard' else '/homes/' || new.home_id || '?tab=dashboard' end,
      'post:' || new.id || ':' || r.id);
  end loop;
  return new;
end $$;
drop trigger if exists house_posts_notify on house_posts;
create trigger house_posts_notify after insert on house_posts for each row execute function notify_house_post();

drop trigger if exists audit_house_posts on house_posts;
create trigger audit_house_posts after insert or update or delete on house_posts for each row execute function write_audit();
