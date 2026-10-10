-- Evergreen Academy: storage for training videos (private bucket "academy-media").
-- Everyone signed in can watch; Program Manager+ (level 3) can upload or replace. Safe to run again.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('academy-media', 'academy-media', false, 52428800, array['video/mp4', 'text/vtt'])   -- 50 MB per file
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['video/mp4', 'text/vtt'];

drop policy if exists "academy media read" on storage.objects;
drop policy if exists "academy media add" on storage.objects;
drop policy if exists "academy media change" on storage.objects;
drop policy if exists "academy media remove" on storage.objects;
create policy "academy media read" on storage.objects for select to authenticated
  using (bucket_id = 'academy-media');
create policy "academy media add" on storage.objects for insert to authenticated
  with check (bucket_id = 'academy-media' and app_level() >= 3);
create policy "academy media change" on storage.objects for update to authenticated
  using (bucket_id = 'academy-media' and app_level() >= 3) with check (bucket_id = 'academy-media' and app_level() >= 3);
create policy "academy media remove" on storage.objects for delete to authenticated
  using (bucket_id = 'academy-media' and app_level() >= 3);
