-- =====================================================================
-- Evergreen CRM - Signatures, part 2: outside signers, fill-in boxes, access by house. Safe to run again.
-- Run AFTER sign-requests.sql.
--
-- * Outside people (a social worker, doctor, parent, lawyer...) can be asked to sign by email: name,
--   occupation, organization, phone and email. They get a private link plus a 6-digit code by email,
--   so no CRM account is needed.
-- * On a PDF the sender places boxes on the page for each person: Signature, Initials, Date signed,
--   Name, Text and Checkbox. When everyone is done, a finished PDF is made with everything filled in
--   plus a signing certificate page.
-- * Who can send: Program Coordinators, Program Managers, Directors and up (not frontline, HR or payroll).
--   Each request belongs to a house. Coordinators, managers and directors see their own house's requests
--   (and any they sent). Level 6 and up (CSO, CEO, Admin) see every house.
-- =====================================================================

-- ---------- New columns ----------
alter table sign_requests add column if not exists home_id uuid references homes;
alter table sign_requests add column if not exists fields jsonb not null default '[]'::jsonb;
alter table sign_requests add column if not exists filled_path text;
alter table sign_requests add column if not exists filled_hash text;
alter table sign_requests add column if not exists filled_at timestamptz;
update sign_requests r set home_id = p.home_id from profiles p where p.id = r.created_by and r.home_id is null;
create index if not exists sign_requests_home on sign_requests (home_id, created_at desc);

alter table sign_request_signers alter column profile_id drop not null;
alter table sign_request_signers add column if not exists ext_name text;
alter table sign_request_signers add column if not exists ext_email text;
alter table sign_request_signers add column if not exists ext_role text;          -- occupation, e.g. Social worker
alter table sign_request_signers add column if not exists ext_org text;           -- e.g. MCFD Surrey office
alter table sign_request_signers add column if not exists ext_phone text;
alter table sign_request_signers add column if not exists ext_notes text;
alter table sign_request_signers add column if not exists token text;
alter table sign_request_signers add column if not exists otp_hash text;
alter table sign_request_signers add column if not exists otp_sent_at timestamptz;
alter table sign_request_signers add column if not exists otp_expires_at timestamptz;
alter table sign_request_signers add column if not exists otp_attempts int not null default 0;
alter table sign_request_signers add column if not exists session_hash text;
alter table sign_request_signers add column if not exists verified_at timestamptz;
alter table sign_request_signers add column if not exists signer_ip text;
alter table sign_request_signers add column if not exists field_values jsonb;
alter table sign_request_signers add column if not exists slot text
  generated always as (case when profile_id is not null then 'p:' || profile_id::text else 'e:' || lower(ext_email) end) stored;
create unique index if not exists sign_signers_token on sign_request_signers (token) where token is not null;
create unique index if not exists sign_signers_ext_email on sign_request_signers (request_id, lower(ext_email)) where ext_email is not null;
alter table sign_request_signers drop constraint if exists sign_signer_kind;
alter table sign_request_signers add constraint sign_signer_kind check ((profile_id is not null) <> (ext_email is not null));

-- ---------- Who may do what ----------
-- Send: Program Coordinator (level 2, not HR/payroll), Program Manager and up.
create or replace function can_send_sign() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_level(), 0) >= 3 or (coalesce(app_level(), 0) = 2 and app_group() is null);
$$;

-- Send to a staff member: Director and up (level 4+) anyone; Coordinators and Managers staff at their own house.
create or replace function can_send_to(staff uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_level(), 0) >= 4
      or (can_send_sign() and exists (
            select 1 from profiles s, profiles me
            where s.id = staff and me.id = auth.uid() and s.home_id is not null and s.home_id = me.home_id));
$$;

-- Follow up a request (see every signer and signature, remind, cancel):
-- the sender, level 6+ (every house), or a sender-level person at the request's house.
create or replace function can_manage_sign_request(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_level(), 0) >= 6
      or exists (select 1 from sign_requests r where r.id = rid and (
            r.created_by = auth.uid()
            or (can_send_sign() and r.home_id is not null and r.home_id = app_home())));
$$;

-- See a request: the managers above, or a staff member asked to sign it.
create or replace function can_see_sign_request(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_manage_sign_request(rid)
      or exists (select 1 from sign_request_signers s where s.request_id = rid and s.profile_id = auth.uid());
$$;
grant execute on function can_send_sign() to authenticated;
grant execute on function can_send_to(uuid) to authenticated;
grant execute on function can_manage_sign_request(uuid) to authenticated;
grant execute on function can_see_sign_request(uuid) to authenticated;

drop policy if exists sr_read on sign_requests;
drop policy if exists srs_read on sign_request_signers;
create policy sr_read on sign_requests for select using (can_see_sign_request(id));
-- Each signer sees only their own row; people who manage the request see all of them.
create policy srs_read on sign_request_signers for select using (profile_id = auth.uid() or can_manage_sign_request(request_id));

-- The private link and code fingerprints are never readable from the app.
revoke select on sign_request_signers from anon, authenticated;
grant select (id, request_id, profile_id, status, viewed_at, signed_at, signed_name, signature_image, signer_agent,
  decline_reason, declined_at, reminded_at, ext_name, ext_email, ext_role, ext_org, ext_phone, ext_notes,
  verified_at, signer_ip, field_values, slot) on sign_request_signers to authenticated;

-- ---------- Send ----------
drop function if exists sign_send(text, text, text, text, text, text, bigint, text, date, uuid[]);
create or replace function sign_send(p_title text, p_category text, p_message text, p_file_path text, p_file_name text,
  p_file_type text, p_file_size bigint, p_doc_hash text, p_due date, p_signers uuid[],
  p_external jsonb default '[]'::jsonb, p_fields jsonb default '[]'::jsonb, p_home uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid; s uuid; sender text; e jsonb; f jsonb; home uuid; slots text[] := '{}'; ids text[] := '{}';
  invites jsonb := '[]'::jsonb; tok text; em text; staff uuid[]; nstaff int; next int; is_pdf boolean;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  if not can_send_sign() then raise exception 'Only Program Coordinators, Program Managers and Directors can send documents for signature.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Please give the document a title.'; end if;
  if p_file_path is null or split_part(p_file_path, '/', 1) <> auth.uid()::text then raise exception 'Wrong file folder.'; end if;
  staff := coalesce((select array_agg(distinct x) from unnest(p_signers) x where x is not null), '{}');
  nstaff := cardinality(staff);
  p_external := coalesce(p_external, '[]'::jsonb);
  p_fields := coalesce(p_fields, '[]'::jsonb);
  if jsonb_typeof(p_external) <> 'array' or jsonb_typeof(p_fields) <> 'array' then raise exception 'Something went wrong with the form. Please try again.'; end if;
  next := jsonb_array_length(p_external);
  if nstaff + next = 0 then raise exception 'Choose at least one person to sign.'; end if;
  if nstaff > 200 then raise exception 'Please send to 200 staff or fewer at a time.'; end if;
  if next > 25 then raise exception 'Please add 25 outside people or fewer at a time.'; end if;

  -- Which house it belongs to: your own house; Directors and up may pick any house (or none).
  home := case when coalesce(app_level(), 0) >= 4 then coalesce(p_home, app_home()) else app_home() end;
  if home is null and coalesce(app_level(), 0) < 4 then raise exception 'You need a house on your profile to send documents. Ask the office.'; end if;

  foreach s in array staff loop
    if not can_send_to(s) then raise exception 'You can’t send documents to one of the staff you chose.'; end if;
    if not exists (select 1 from profiles where id = s and active and role <> 'family') then raise exception 'One of the people you chose doesn’t have active CRM access.'; end if;
    slots := slots || ('p:' || s::text);
  end loop;
  for e in select value from jsonb_array_elements(p_external) loop
    em := lower(trim(coalesce(e->>'email', '')));
    if coalesce(trim(e->>'name'), '') = '' then raise exception 'Type the name of each outside person.'; end if;
    if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(em) > 160 then raise exception 'Check the email address for %.', trim(e->>'name'); end if;
    if coalesce(trim(e->>'role'), '') = '' then raise exception 'Type the occupation of %, e.g. Social worker.', trim(e->>'name'); end if;
    if ('e:' || em) = any(slots) then raise exception 'The email % is listed twice.', em; end if;
    slots := slots || ('e:' || em);
  end loop;

  is_pdf := coalesce(p_file_type, '') ilike '%pdf%' or p_file_name ilike '%.pdf';
  if jsonb_array_length(p_fields) > 0 and not is_pdf then raise exception 'Boxes can only be placed on a PDF.'; end if;
  if jsonb_array_length(p_fields) > 300 then raise exception 'Please use 300 boxes or fewer.'; end if;
  for f in select value from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(f) <> 'object' or coalesce(f->>'id', '') !~ '^[a-z0-9_-]{1,40}$' or (f->>'id') = any(ids) then raise exception 'A box on the page is not set up right. Please remove it and add it again.'; end if;
    ids := ids || (f->>'id');
    if coalesce(f->>'type', '') not in ('signature', 'initials', 'date', 'name', 'text', 'checkbox') then raise exception 'Unknown kind of box.'; end if;
    if coalesce(f->>'who', '') <> all(slots) then raise exception 'Each box must belong to one of the people signing.'; end if;
    if jsonb_typeof(f->'page') <> 'number' or (f->>'page')::numeric not between 0 and 999
       or jsonb_typeof(f->'rect') <> 'array' or jsonb_array_length(f->'rect') <> 4
       or exists (select 1 from jsonb_array_elements(f->'rect') v where jsonb_typeof(v) <> 'number' or v::text::numeric not between -100000 and 100000)
    then raise exception 'A box on the page is not set up right. Please remove it and add it again.'; end if;
    if length(coalesce(f->>'label', '')) > 80 then raise exception 'Box labels must be 80 letters or fewer.'; end if;
  end loop;

  insert into sign_requests (title, category, message, file_path, file_name, file_type, file_size, doc_hash, due_date, home_id, fields)
  values (trim(p_title), coalesce(nullif(trim(p_category), ''), 'Other'), nullif(trim(p_message), ''), p_file_path, p_file_name,
          p_file_type, p_file_size, p_doc_hash, p_due, home,
          (select coalesce(jsonb_agg(jsonb_build_object('id', b->>'id', 'type', b->>'type', 'who', b->>'who', 'page', (b->>'page')::int,
             'rect', b->'rect', 'label', nullif(trim(coalesce(b->>'label', '')), ''),
             'required', coalesce((b->>'required')::boolean, b->>'type' <> 'checkbox'))), '[]'::jsonb)
           from jsonb_array_elements(p_fields) x(b)))
  returning id into rid;
  select full_name into sender from profiles where id = auth.uid();
  foreach s in array staff loop
    insert into sign_request_signers (request_id, profile_id) values (rid, s);
    perform notify(s, '✍️ Please sign: ' || trim(p_title),
      coalesce(sender, 'Evergreen') || ' sent you a document to read and sign' || case when p_due is not null then ' by ' || to_char(p_due, 'Mon DD') else '' end || '.',
      '/sign/' || rid, 'sign:' || rid || ':' || s);
  end loop;
  for e in select value from jsonb_array_elements(p_external) loop
    tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into sign_request_signers (request_id, ext_name, ext_email, ext_role, ext_org, ext_phone, ext_notes, token)
    values (rid, left(trim(e->>'name'), 120), lower(trim(e->>'email')), left(trim(e->>'role'), 120), left(nullif(trim(coalesce(e->>'org', '')), ''), 160),
            left(nullif(trim(coalesce(e->>'phone', '')), ''), 40), left(nullif(trim(coalesce(e->>'notes', '')), ''), 1000), tok);
    invites := invites || jsonb_build_object('name', trim(e->>'name'), 'email', lower(trim(e->>'email')), 'token', tok);
  end loop;
  return jsonb_build_object('id', rid, 'invites', invites, 'sender', sender);
end $$;

-- ---------- Signing (shared by staff and outside signers; not callable directly) ----------
create or replace function sign_apply(p_signer uuid, p_name text, p_image text, p_values jsonb, p_agent text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sign_request_signers; req sign_requests; f jsonb; cleaned jsonb := '{}'::jsonb; v text; who text; done boolean := false;
begin
  select * into s from sign_request_signers where id = p_signer for update;
  if s.id is null then raise exception 'You weren’t asked to sign this.'; end if;
  select * into req from sign_requests where id = s.request_id for update;
  if req.status <> 'Open' then raise exception 'This document is no longer waiting for signatures.'; end if;
  if s.status <> 'Waiting' then raise exception 'You have already answered this document.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Please type your full name.'; end if;
  if p_image is null or p_image not like 'data:image/png;base64,%' or length(p_image) < 200 then raise exception 'Please draw your signature.'; end if;
  if length(p_image) > 400000 then raise exception 'The signature picture is too big. Please clear it and draw again.'; end if;
  p_values := coalesce(p_values, '{}'::jsonb);
  if jsonb_typeof(p_values) <> 'object' then p_values := '{}'::jsonb; end if;
  for f in select value from jsonb_array_elements(req.fields) loop
    continue when f->>'who' is distinct from s.slot;
    if f->>'type' = 'text' then
      v := left(btrim(coalesce(p_values->>(f->>'id'), '')), 500);
      if coalesce((f->>'required')::boolean, true) and v = '' then
        raise exception 'Please fill in every required box%.', coalesce(' (“' || (f->>'label') || '”)', '');
      end if;
      cleaned := cleaned || jsonb_build_object(f->>'id', v);
    elsif f->>'type' = 'initials' then
      v := left(btrim(coalesce(p_values->>(f->>'id'), '')), 8);
      if v = '' then raise exception 'Please add your initials in every initials box.'; end if;
      cleaned := cleaned || jsonb_build_object(f->>'id', v);
    elsif f->>'type' = 'checkbox' then
      if coalesce((f->>'required')::boolean, false) and coalesce(p_values->(f->>'id'), 'false'::jsonb) <> 'true'::jsonb then
        raise exception 'Please tick every required checkbox%.', coalesce(' (“' || (f->>'label') || '”)', '');
      end if;
      cleaned := cleaned || jsonb_build_object(f->>'id', coalesce(p_values->(f->>'id'), 'false'::jsonb) = 'true'::jsonb);
    end if;
  end loop;
  update sign_request_signers
     set status = 'Signed', signed_at = now(), signed_name = left(trim(p_name), 120), signature_image = p_image,
         signer_agent = left(p_agent, 300), signer_ip = left(p_ip, 60), field_values = cleaned, viewed_at = coalesce(viewed_at, now())
   where id = s.id;
  select coalesce((select full_name from profiles where id = s.profile_id), s.ext_name || coalesce(' (' || s.ext_role || ')', '')) into who;
  perform notify(req.created_by, '✅ Signed: ' || req.title, coalesce(who, 'Someone') || ' signed it.', '/sign/' || req.id, 'signed:' || req.id || ':' || s.id);
  if not exists (select 1 from sign_request_signers where request_id = req.id and status = 'Waiting') then
    update sign_requests set status = 'Complete', completed_at = now() where id = req.id;
    perform notify(req.created_by, '🎉 Everyone answered: ' || req.title, 'Everyone has signed or declined.', '/sign/' || req.id, 'done:' || req.id);
    done := true;
  end if;
  return jsonb_build_object('request', req.id, 'completed', done);
end $$;

create or replace function sign_decline_apply(p_signer uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sign_request_signers; req sign_requests; who text; done boolean := false;
begin
  select * into s from sign_request_signers where id = p_signer for update;
  if s.id is null then raise exception 'You weren’t asked to sign this.'; end if;
  select * into req from sign_requests where id = s.request_id for update;
  if req.status <> 'Open' then raise exception 'This document is no longer waiting for signatures.'; end if;
  if s.status <> 'Waiting' then raise exception 'You have already answered this document.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please say why you aren’t signing.'; end if;
  update sign_request_signers set status = 'Declined', declined_at = now(), decline_reason = left(trim(p_reason), 1000), viewed_at = coalesce(viewed_at, now())
   where id = s.id;
  select coalesce((select full_name from profiles where id = s.profile_id), s.ext_name || coalesce(' (' || s.ext_role || ')', '')) into who;
  perform notify(req.created_by, '⚠️ Not signed: ' || req.title, coalesce(who, 'Someone') || ' declined: ' || left(trim(p_reason), 150), '/sign/' || req.id, 'declined:' || req.id || ':' || s.id);
  if not exists (select 1 from sign_request_signers where request_id = req.id and status = 'Waiting') then
    update sign_requests set status = 'Complete', completed_at = now() where id = req.id;
    done := true;
  end if;
  return jsonb_build_object('request', req.id, 'completed', done);
end $$;
revoke execute on function sign_apply(uuid, text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function sign_decline_apply(uuid, text) from public, anon, authenticated;

-- Staff signing in the CRM.
drop function if exists sign_sign(uuid, text, text, text);
create or replace function sign_sign(p_request uuid, p_name text, p_image text, p_agent text, p_values jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select id into sid from sign_request_signers where request_id = p_request and profile_id = auth.uid();
  if sid is null or auth.uid() is null then raise exception 'You weren’t asked to sign this.'; end if;
  return sign_apply(sid, p_name, p_image, p_values, p_agent, null);
end $$;

drop function if exists sign_decline(uuid, text);
create or replace function sign_decline(p_request uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select id into sid from sign_request_signers where request_id = p_request and profile_id = auth.uid();
  if sid is null or auth.uid() is null then raise exception 'You weren’t asked to sign this.'; end if;
  return sign_decline_apply(sid, p_reason);
end $$;

-- ---------- Remind (once a day at most). Returns the outside people to email again. ----------
drop function if exists sign_remind(uuid);
create or replace function sign_remind(p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare req sign_requests; r record; n int := 0; invites jsonb := '[]'::jsonb;
begin
  select * into req from sign_requests where id = p_request;
  if req.id is null or req.status <> 'Open' then raise exception 'This document is no longer waiting for signatures.'; end if;
  if not can_manage_sign_request(p_request) then raise exception 'Only the sender or a manager at this house can send reminders.'; end if;
  for r in select * from sign_request_signers where request_id = p_request and status = 'Waiting'
           and (reminded_at is null or reminded_at < now() - interval '20 hours') loop
    if r.profile_id is not null then
      perform notify(r.profile_id, '⏰ Reminder — please sign: ' || req.title, 'This document is still waiting for your signature.',
        '/sign/' || req.id, 'remind:' || req.id || ':' || r.profile_id || ':' || to_char(now(), 'YYYYMMDD'));
    else
      invites := invites || jsonb_build_object('name', r.ext_name, 'email', r.ext_email, 'token', r.token);
    end if;
    update sign_request_signers set reminded_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('count', n, 'invites', invites, 'title', req.title, 'due', req.due_date,
    'sender', (select full_name from profiles where id = req.created_by));
end $$;

-- ---------- Cancel ----------
create or replace function sign_cancel(p_request uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare req sign_requests;
begin
  select * into req from sign_requests where id = p_request;
  if req.id is null or req.status <> 'Open' then raise exception 'Only open requests can be cancelled.'; end if;
  if not can_manage_sign_request(p_request) then raise exception 'Only the sender or a manager at this house can cancel this.'; end if;
  update sign_requests set status = 'Cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = nullif(trim(p_reason), '') where id = p_request;
end $$;

grant execute on function sign_send(text, text, text, text, text, text, bigint, text, date, uuid[], jsonb, jsonb, uuid) to authenticated;
grant execute on function sign_sign(uuid, text, text, text, jsonb) to authenticated;
grant execute on function sign_decline(uuid, text) to authenticated;
grant execute on function sign_remind(uuid) to authenticated;
grant execute on function sign_cancel(uuid, text) to authenticated;

-- ---------- Outside signers (used only by the server with the secret key) ----------
-- Open the link: what to show. File details only after the emailed code was confirmed in this browser.
create or replace function sign_ext_open(t text, sess text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sign_request_signers; req sign_requests; ok boolean; em text;
begin
  select * into s from sign_request_signers where token = t;
  if s.id is null then return jsonb_build_object('state', 'invalid'); end if;
  select * into req from sign_requests where id = s.request_id;
  ok := s.session_hash is not null and s.session_hash = sess;
  em := s.ext_email;
  if ok and s.viewed_at is null and s.status = 'Waiting' and req.status = 'Open' then
    update sign_request_signers set viewed_at = now() where id = s.id;
  end if;
  return jsonb_build_object(
    'state', case when req.status = 'Cancelled' then 'cancelled' when not ok then 'code' else 'ok' end,
    'name', s.ext_name, 'role', s.ext_role,
    'email_hint', left(em, 2) || repeat('•', greatest(length(split_part(em, '@', 1)) - 2, 1)) || '@' || split_part(em, '@', 2),
    'title', req.title, 'sender', (select full_name from profiles where id = req.created_by),
    'house', (select name from homes where id = req.home_id),
    'request_status', req.status, 'status', s.status, 'signed_at', s.signed_at, 'signed_name', s.signed_name,
    'declined_at', s.declined_at, 'due', req.due_date,
    'request', case when ok then req.id end, 'slot', case when ok then s.slot end,
    'category', case when ok then req.category end, 'message', case when ok then req.message end,
    'file_path', case when ok then req.file_path end, 'file_name', case when ok then req.file_name end,
    'file_type', case when ok then req.file_type end, 'file_size', case when ok then req.file_size end,
    'doc_hash', case when ok then req.doc_hash end,
    'filled_path', case when ok and s.status = 'Signed' then req.filled_path end,
    'fields', case when ok then req.fields else '[]'::jsonb end);
end $$;

create or replace function sign_ext_code_issue(t text, h text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sign_request_signers; req sign_requests;
begin
  select * into s from sign_request_signers where token = t for update;
  if s.id is null then return jsonb_build_object('error', 'invalid'); end if;
  select * into req from sign_requests where id = s.request_id;
  if req.status = 'Cancelled' then return jsonb_build_object('error', 'invalid'); end if;
  if s.otp_sent_at > now() - interval '60 seconds' then return jsonb_build_object('error', 'wait'); end if;
  update sign_request_signers set otp_hash = h, otp_sent_at = now(), otp_expires_at = now() + interval '10 minutes', otp_attempts = 0 where id = s.id;
  return jsonb_build_object('name', s.ext_name, 'email', s.ext_email, 'title', req.title);
end $$;

create or replace function sign_ext_code_verify(t text, h text, sess text) returns text
language plpgsql security definer set search_path = public as $$
declare s sign_request_signers;
begin
  select * into s from sign_request_signers where token = t for update;
  if s.id is null then return 'invalid'; end if;
  if s.otp_hash is null or s.otp_expires_at <= now() then return 'expired'; end if;
  if s.otp_attempts >= 5 then return 'locked'; end if;
  if s.otp_hash <> h then
    update sign_request_signers set otp_attempts = otp_attempts + 1 where id = s.id;
    return 'wrong';
  end if;
  update sign_request_signers set verified_at = now(), session_hash = sess, otp_hash = null where id = s.id;
  return 'ok';
end $$;

create or replace function sign_ext_sign(t text, sess text, p_name text, p_image text, p_values jsonb, p_agent text, p_ip text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sign_request_signers;
begin
  select * into s from sign_request_signers where token = t;
  if s.id is null or s.session_hash is null or s.session_hash <> sess then raise exception 'Please confirm the code from your email first.'; end if;
  return sign_apply(s.id, p_name, p_image, p_values, p_agent, p_ip);
end $$;

create or replace function sign_ext_decline(t text, sess text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s sign_request_signers;
begin
  select * into s from sign_request_signers where token = t;
  if s.id is null or s.session_hash is null or s.session_hash <> sess then raise exception 'Please confirm the code from your email first.'; end if;
  return sign_decline_apply(s.id, p_reason);
end $$;

revoke execute on function sign_ext_open(text, text) from public, anon, authenticated;
revoke execute on function sign_ext_code_issue(text, text) from public, anon, authenticated;
revoke execute on function sign_ext_code_verify(text, text, text) from public, anon, authenticated;
revoke execute on function sign_ext_sign(text, text, text, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function sign_ext_decline(text, text, text) from public, anon, authenticated;
grant execute on function sign_ext_open(text, text) to service_role;
grant execute on function sign_ext_code_issue(text, text) to service_role;
grant execute on function sign_ext_code_verify(text, text, text) to service_role;
grant execute on function sign_ext_sign(text, text, text, text, jsonb, text, text) to service_role;
grant execute on function sign_ext_decline(text, text, text) to service_role;

-- ---------- File storage ----------
drop policy if exists "sign docs upload" on storage.objects;
drop policy if exists "sign docs read" on storage.objects;
create policy "sign docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'sign-docs' and (storage.foldername(name))[1] = auth.uid()::text and can_send_sign());
create policy "sign docs read" on storage.objects for select to authenticated
  using (bucket_id = 'sign-docs' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from sign_requests r where (r.file_path = name or r.filled_path = name) and can_see_sign_request(r.id))));

-- Check: should say 1 1 1
select (select count(*) from information_schema.columns where table_name = 'sign_request_signers' and column_name = 'ext_email') as outside_signers,
       (select count(*) from information_schema.columns where table_name = 'sign_requests' and column_name = 'fields') as boxes,
       (select count(*) from pg_proc where proname = 'sign_ext_open') as email_links;
