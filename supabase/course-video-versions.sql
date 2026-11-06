-- =====================================================================
-- Evergreen CRM - Course videos with versions, uploaded by the Admin only (Nov 5, 2026).
--   * Every new video (uploaded file or OneDrive link) becomes the next version of that course: v1, v2, v3...
--     Old versions are kept, and the Admin can switch a course back to any earlier version.
--   * Staff always get the current version. Each quiz attempt records which version was watched.
--   * The required watching time follows the current version's length (read from the file, or typed in for a link).
--   * Uploading, replacing and deleting course videos is Admin only (was CSO, CEO and Admin).
--   * Course videos can only be opened by signed-in accounts (the read rule had no sign-in check).
-- Run as migration course_video_versions. Safe to re-run.
-- =====================================================================
create table if not exists public.course_video_versions (
  id uuid primary key default gen_random_uuid(),
  course_key text not null,
  version_no int not null,
  source text not null check (source in ('upload', 'link')),
  path text,
  url text,
  file_name text,
  size_bytes bigint,
  seconds int,
  notes text,
  is_current boolean not null default false,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  unique (course_key, version_no),
  check ((source = 'upload' and path is not null) or (source = 'link' and url ~* '^https://'))
);
create unique index if not exists course_video_one_current on public.course_video_versions (course_key) where is_current;
alter table public.course_video_versions enable row level security;
drop policy if exists cvv_read on public.course_video_versions;
create policy cvv_read on public.course_video_versions for select to authenticated using (true);
-- No write rules: only the two functions below change versions.

alter table public.course_attempts add column if not exists video_version int;

create or replace function public.course_video_add(p_key text, p_source text, p_path text, p_url text, p_file_name text,
  p_size bigint, p_seconds int, p_notes text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if app_role() is distinct from 'admin' then raise exception 'Only the Admin can add course videos.'; end if;
  if not exists (select 1 from course_keys where course_key = p_key) then raise exception 'Unknown course.'; end if;
  if p_source = 'upload' and (p_path is null or p_path not like (case when p_key = 'orientation' then 'orientation/' else 'courses/' || p_key || '/' end) || '%') then
    raise exception 'The file is not in this course''s folder.';
  end if;
  perform pg_advisory_xact_lock(hashtext('cvv:' || p_key));
  select coalesce(max(version_no), 0) + 1 into n from course_video_versions where course_key = p_key;
  update course_video_versions set is_current = false where course_key = p_key and is_current;
  insert into course_video_versions (course_key, version_no, source, path, url, file_name, size_bytes, seconds, notes, is_current, uploaded_by)
  values (p_key, n, p_source, case when p_source = 'upload' then p_path end, case when p_source = 'link' then p_url end,
          left(p_file_name, 200), p_size, nullif(p_seconds, 0), left(p_notes, 500), true, auth.uid());
  if coalesce(p_seconds, 0) > 0 then
    update course_keys set min_seconds = floor(p_seconds * 0.95), updated_at = now() where course_key = p_key;
  end if;
  return n;
end $$;

create or replace function public.course_video_use(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v course_video_versions;
begin
  if app_role() is distinct from 'admin' then raise exception 'Only the Admin can change course videos.'; end if;
  select * into v from course_video_versions where id = p_id;
  if v.id is null then raise exception 'That version no longer exists.'; end if;
  update course_video_versions set is_current = false where course_key = v.course_key and is_current;
  update course_video_versions set is_current = true where id = p_id;
  if coalesce(v.seconds, 0) > 0 then
    update course_keys set min_seconds = floor(v.seconds * 0.95), updated_at = now() where course_key = v.course_key;
  end if;
  return v.version_no;
end $$;

-- Which version each quiz attempt was taken on.
create or replace function public.course_attempts_video_version() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select version_no into new.video_version from course_video_versions where course_key = new.course_key and is_current;
  return new;
end $$;
drop trigger if exists course_attempts_video_version on public.course_attempts;
create trigger course_attempts_video_version before insert on public.course_attempts
  for each row execute function public.course_attempts_video_version();

revoke execute on function public.course_video_add(text, text, text, text, text, bigint, int, text), public.course_video_use(uuid) from public, anon;
grant execute on function public.course_video_add(text, text, text, text, text, bigint, int, text), public.course_video_use(uuid) to authenticated;
revoke execute on function public.course_attempts_video_version() from public, anon, authenticated;

-- Admin only for the video files and the old link table.
drop policy if exists "academy media read" on storage.objects;
drop policy if exists "academy media add" on storage.objects;
drop policy if exists "academy media change" on storage.objects;
drop policy if exists "academy media remove" on storage.objects;
create policy "academy media read" on storage.objects for select to authenticated using (bucket_id = 'academy-media');
create policy "academy media add" on storage.objects for insert to authenticated with check (bucket_id = 'academy-media' and app_role() = 'admin');
create policy "academy media change" on storage.objects for update to authenticated
  using (bucket_id = 'academy-media' and app_role() = 'admin') with check (bucket_id = 'academy-media' and app_role() = 'admin');
create policy "academy media remove" on storage.objects for delete to authenticated using (bucket_id = 'academy-media' and app_role() = 'admin');
drop policy if exists tv_write on public.training_videos;
create policy tv_write on public.training_videos for all using (app_role() = 'admin') with check (app_role() = 'admin');

-- The two videos already uploaded become version 1.
insert into public.course_video_versions (course_key, version_no, source, path, file_name, size_bytes, notes, is_current, uploaded_at)
select case when o.name like 'orientation/%' then 'orientation' else split_part(o.name, '/', 2) end, 1, 'upload', o.name,
       'video.mp4', (o.metadata->>'size')::bigint, 'First version (uploaded before versions were kept)', true, o.created_at
  from storage.objects o
 where o.bucket_id = 'academy-media' and o.name in ('orientation/video.mp4', 'courses/missing_youth/video.mp4')
on conflict (course_key, version_no) do nothing;
-- Any saved OneDrive links become a version too.
insert into public.course_video_versions (course_key, version_no, source, url, notes, is_current, uploaded_by, uploaded_at)
select t.course_key, coalesce((select max(version_no) from course_video_versions v where v.course_key = t.course_key), 0) + 1,
       'link', t.url, 'OneDrive link saved before versions were kept',
       not exists (select 1 from course_video_versions v where v.course_key = t.course_key and v.is_current), t.updated_by, t.updated_at
  from public.training_videos t
 where t.url ~* '^https://' and not exists (select 1 from course_video_versions v where v.course_key = t.course_key and v.url = t.url);
