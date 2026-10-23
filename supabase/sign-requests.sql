-- =====================================================================
-- Evergreen CRM - Send a document for signature (staff). Safe to run again.
-- HR, Program Coordinators (staff at their own house) and Program Managers and up can send a document
-- (PDF, Word or photo, max 10 MB) to one or more staff. Each person opens it, ticks "I have read it",
-- types their name and draws their signature — or declines with a reason.
-- Signatures can't be changed or deleted. The file's fingerprint (SHA-256) is saved when it is sent,
-- so the signed record shows exactly which file was signed.
-- =====================================================================

create table if not exists sign_requests (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      text not null default 'Other',
  message       text,
  file_path     text not null,
  file_name     text not null,
  file_type     text,
  file_size     bigint,
  doc_hash      text,                                   -- SHA-256 of the file, worked out when it was sent
  due_date      date,
  status        text not null default 'Open' check (status in ('Open', 'Complete', 'Cancelled')),
  created_by    uuid not null default auth.uid() references profiles,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  cancelled_at  timestamptz,
  cancelled_by  uuid references profiles,
  cancel_reason text
);
create index if not exists sign_requests_created on sign_requests (created_at desc);

create table if not exists sign_request_signers (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references sign_requests on delete cascade,
  profile_id      uuid not null references profiles,
  status          text not null default 'Waiting' check (status in ('Waiting', 'Signed', 'Declined')),
  viewed_at       timestamptz,
  signed_at       timestamptz,
  signed_name     text,
  signature_image text,                                 -- drawn signature (PNG data URL)
  signer_agent    text,
  decline_reason  text,
  declined_at     timestamptz,
  reminded_at     timestamptz,
  unique (request_id, profile_id)
);
create index if not exists sign_signers_profile on sign_request_signers (profile_id, status);

alter table sign_requests enable row level security;
alter table sign_request_signers enable row level security;

-- Who may send: HR, Program Manager and up (anyone), Program Coordinator (staff at their own house).
create or replace function can_send_to(staff uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_level(), 0) >= 3
      or coalesce(app_group(), '') = 'hr'
      or (coalesce(app_level(), 0) = 2 and app_group() is null and exists (
            select 1 from profiles s, profiles me
            where s.id = staff and me.id = auth.uid() and s.home_id is not null and s.home_id = me.home_id));
$$;

-- Who may see a request: the sender, the people asked to sign, HR, Program Manager and up.
create or replace function can_see_sign_request(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_level(), 0) >= 3 or coalesce(app_group(), '') = 'hr'
      or exists (select 1 from sign_requests r where r.id = rid and r.created_by = auth.uid())
      or exists (select 1 from sign_request_signers s where s.request_id = rid and s.profile_id = auth.uid());
$$;
grant execute on function can_send_to(uuid) to authenticated;
grant execute on function can_see_sign_request(uuid) to authenticated;

drop policy if exists sr_read on sign_requests;
drop policy if exists srs_read on sign_request_signers;
create policy sr_read on sign_requests for select using (can_see_sign_request(id));
-- Each signer sees only their own row (not other people's signatures); the sender, HR and Program Manager+ see all.
create policy srs_read on sign_request_signers for select using (
  profile_id = auth.uid()
  or coalesce(app_level(), 0) >= 3 or coalesce(app_group(), '') = 'hr'
  or exists (select 1 from sign_requests r where r.id = request_id and r.created_by = auth.uid()));
-- No insert/update/delete policies: everything goes through the functions below.

-- ---------- Send ----------
create or replace function sign_send(p_title text, p_category text, p_message text, p_file_path text, p_file_name text,
  p_file_type text, p_file_size bigint, p_doc_hash text, p_due date, p_signers uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid; s uuid; sender text;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Please give the document a title.'; end if;
  if p_signers is null or cardinality(p_signers) = 0 then raise exception 'Choose at least one person to sign.'; end if;
  if cardinality(p_signers) > 200 then raise exception 'Please send to 200 people or fewer at a time.'; end if;
  if p_file_path is null or split_part(p_file_path, '/', 1) <> auth.uid()::text then raise exception 'Wrong file folder.'; end if;
  foreach s in array p_signers loop
    if not can_send_to(s) then raise exception 'You can’t send documents to one of the people you chose.'; end if;
    if not exists (select 1 from profiles where id = s and active and role <> 'family') then raise exception 'One of the people you chose doesn’t have active CRM access.'; end if;
  end loop;
  insert into sign_requests (title, category, message, file_path, file_name, file_type, file_size, doc_hash, due_date)
  values (trim(p_title), coalesce(nullif(trim(p_category), ''), 'Other'), nullif(trim(p_message), ''), p_file_path, p_file_name, p_file_type, p_file_size, p_doc_hash, p_due)
  returning id into rid;
  select full_name into sender from profiles where id = auth.uid();
  foreach s in array (select array_agg(distinct x) from unnest(p_signers) x) loop
    insert into sign_request_signers (request_id, profile_id) values (rid, s);
    perform notify(s, '✍️ Please sign: ' || trim(p_title),
      coalesce(sender, 'Evergreen') || ' sent you a document to read and sign' || case when p_due is not null then ' by ' || to_char(p_due, 'Mon DD') else '' end || '.',
      '/sign/' || rid, 'sign:' || rid || ':' || s);
  end loop;
  return rid;
end $$;

-- ---------- Opened ----------
create or replace function sign_viewed(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update sign_request_signers set viewed_at = now()
  where request_id = p_request and profile_id = auth.uid() and viewed_at is null;
end $$;

-- ---------- Sign ----------
create or replace function sign_sign(p_request uuid, p_name text, p_image text, p_agent text) returns void
language plpgsql security definer set search_path = public as $$
declare me text; req sign_requests;
begin
  select * into req from sign_requests where id = p_request;
  if req.id is null then raise exception 'Document not found.'; end if;
  if req.status <> 'Open' then raise exception 'This document is no longer waiting for signatures.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Please type your full name.'; end if;
  if p_image is null or p_image not like 'data:image/png;base64,%' or length(p_image) < 200 then raise exception 'Please draw your signature.'; end if;
  if length(p_image) > 400000 then raise exception 'The signature picture is too big. Please clear it and draw again.'; end if;
  update sign_request_signers
     set status = 'Signed', signed_at = now(), signed_name = trim(p_name), signature_image = p_image,
         signer_agent = left(p_agent, 300), viewed_at = coalesce(viewed_at, now())
   where request_id = p_request and profile_id = auth.uid() and status = 'Waiting';
  if not found then raise exception 'You have already answered, or you weren’t asked to sign this.'; end if;
  select full_name into me from profiles where id = auth.uid();
  perform notify(req.created_by, '✅ Signed: ' || req.title, coalesce(me, 'A staff member') || ' signed it.', '/sign/' || req.id, 'signed:' || req.id || ':' || auth.uid());
  if not exists (select 1 from sign_request_signers where request_id = p_request and status = 'Waiting') then
    update sign_requests set status = 'Complete', completed_at = now() where id = p_request;
    perform notify(req.created_by, '🎉 Everyone answered: ' || req.title, 'Everyone has signed or declined.', '/sign/' || req.id, 'done:' || req.id);
  end if;
end $$;

-- ---------- Decline ----------
create or replace function sign_decline(p_request uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare me text; req sign_requests;
begin
  select * into req from sign_requests where id = p_request;
  if req.id is null or req.status <> 'Open' then raise exception 'This document is no longer waiting for signatures.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please say why you aren’t signing.'; end if;
  update sign_request_signers set status = 'Declined', declined_at = now(), decline_reason = left(trim(p_reason), 1000), viewed_at = coalesce(viewed_at, now())
   where request_id = p_request and profile_id = auth.uid() and status = 'Waiting';
  if not found then raise exception 'You have already answered, or you weren’t asked to sign this.'; end if;
  select full_name into me from profiles where id = auth.uid();
  perform notify(req.created_by, '⚠️ Not signed: ' || req.title, coalesce(me, 'A staff member') || ' declined: ' || left(trim(p_reason), 150), '/sign/' || req.id, 'declined:' || req.id || ':' || auth.uid());
  if not exists (select 1 from sign_request_signers where request_id = p_request and status = 'Waiting') then
    update sign_requests set status = 'Complete', completed_at = now() where id = p_request;
  end if;
end $$;

-- ---------- Remind (once a day at most) ----------
create or replace function sign_remind(p_request uuid) returns int
language plpgsql security definer set search_path = public as $$
declare req sign_requests; r record; n int := 0;
begin
  select * into req from sign_requests where id = p_request;
  if req.id is null or req.status <> 'Open' then raise exception 'This document is no longer waiting for signatures.'; end if;
  if not (coalesce(req.created_by = auth.uid(), false) or coalesce(app_level(), 0) >= 3 or coalesce(app_group(), '') = 'hr') then raise exception 'Only the sender, HR or a Program Manager can send reminders.'; end if;
  for r in select * from sign_request_signers where request_id = p_request and status = 'Waiting'
           and (reminded_at is null or reminded_at < now() - interval '20 hours') loop
    perform notify(r.profile_id, '⏰ Reminder — please sign: ' || req.title, 'This document is still waiting for your signature.',
      '/sign/' || req.id, 'remind:' || req.id || ':' || r.profile_id || ':' || to_char(now(), 'YYYYMMDD'));
    update sign_request_signers set reminded_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Cancel ----------
create or replace function sign_cancel(p_request uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare req sign_requests;
begin
  select * into req from sign_requests where id = p_request;
  if req.id is null or req.status <> 'Open' then raise exception 'Only open requests can be cancelled.'; end if;
  if not (coalesce(req.created_by = auth.uid(), false) or coalesce(app_level(), 0) >= 3 or coalesce(app_group(), '') = 'hr') then raise exception 'Only the sender, HR or a Program Manager can cancel this.'; end if;
  update sign_requests set status = 'Cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = nullif(trim(p_reason), '') where id = p_request;
end $$;

grant execute on function sign_send(text, text, text, text, text, text, bigint, text, date, uuid[]) to authenticated;
grant execute on function sign_viewed(uuid) to authenticated;
grant execute on function sign_sign(uuid, text, text, text) to authenticated;
grant execute on function sign_decline(uuid, text) to authenticated;
grant execute on function sign_remind(uuid) to authenticated;
grant execute on function sign_cancel(uuid, text) to authenticated;

-- ---------- File storage (private, 10 MB, documents and photos only) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sign-docs', 'sign-docs', false, 10485760, array[
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sign docs upload" on storage.objects;
drop policy if exists "sign docs read" on storage.objects;
-- Senders upload into a folder named after themselves.
create policy "sign docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'sign-docs' and (storage.foldername(name))[1] = auth.uid()::text
              and (coalesce(app_level(), 0) >= 2 or coalesce(app_group(), '') = 'hr'));
-- Anyone who can see the request can open its file (the sender can also see files they just uploaded).
create policy "sign docs read" on storage.objects for select to authenticated
  using (bucket_id = 'sign-docs' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from sign_requests r where r.file_path = name and can_see_sign_request(r.id))));

-- Audit trail (who changed what), like the other care and HR records.
drop trigger if exists audit_sign_requests on sign_requests;
drop trigger if exists audit_sign_signers on sign_request_signers;
create trigger audit_sign_requests after insert or update or delete on sign_requests for each row execute function write_audit();
create trigger audit_sign_signers after insert or update or delete on sign_request_signers for each row execute function write_audit();

-- Check: should list the 2 tables and the bucket
select (select count(*) from information_schema.tables where table_name in ('sign_requests', 'sign_request_signers')) as tables,
       (select count(*) from storage.buckets where id = 'sign-docs') as bucket;
