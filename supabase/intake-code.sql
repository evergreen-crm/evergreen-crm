-- =====================================================================
-- Evergreen CRM - Intake forms: email verification code before the form can be filled in.
-- The code is made and emailed by Evergreen's server. Only the server (secret key) can issue
-- or check codes. Run after intake.sql. Safe to run again.
-- =====================================================================
alter table intake_requests add column if not exists require_code   boolean not null default true;
alter table intake_requests add column if not exists otp_hash       text;
alter table intake_requests add column if not exists otp_sent_at    timestamptz;
alter table intake_requests add column if not exists otp_expires_at timestamptz;
alter table intake_requests add column if not exists otp_attempts   int not null default 0;
alter table intake_requests add column if not exists verified_at    timestamptz;
alter table intake_requests add column if not exists session_hash   text;

-- Server only: store a new code (as a hash) and return where to send it.
create or replace function intake_code_issue(t text, h text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r intake_requests; c intake_cases;
begin
  select * into r from intake_requests where token = t for update;
  if r.id is null or r.status in ('Completed','Cancelled') or r.expires_at <= now() then return jsonb_build_object('error', 'invalid'); end if;
  if r.recipient_email is null then return jsonb_build_object('error', 'no_email'); end if;
  if r.otp_sent_at > now() - interval '60 seconds' then return jsonb_build_object('error', 'wait'); end if;
  update intake_requests set otp_hash = h, otp_sent_at = now(), otp_expires_at = now() + interval '10 minutes', otp_attempts = 0
   where id = r.id;
  select * into c from intake_cases where id = r.case_id;
  return jsonb_build_object('email', r.recipient_email, 'name', r.recipient_name, 'form', r.form_title, 'person', c.person_name);
end $$;
revoke execute on function intake_code_issue(text, text) from public, anon, authenticated;
grant execute on function intake_code_issue(text, text) to service_role;

-- Server only: check a code. 5 tries per code; a code lasts 10 minutes.
create or replace function intake_code_verify(t text, h text, sess text) returns text
language plpgsql security definer set search_path = public as $$
declare r intake_requests;
begin
  select * into r from intake_requests where token = t for update;
  if r.id is null or r.status in ('Completed','Cancelled') then return 'invalid'; end if;
  if r.otp_hash is null or r.otp_expires_at <= now() then return 'expired'; end if;
  if r.otp_attempts >= 5 then return 'locked'; end if;
  if r.otp_hash <> h then
    update intake_requests set otp_attempts = otp_attempts + 1 where id = r.id;
    return 'wrong';
  end if;
  update intake_requests set verified_at = now(), session_hash = sess, otp_hash = null where id = r.id;
  return 'ok';
end $$;
revoke execute on function intake_code_verify(text, text, text) from public, anon, authenticated;
grant execute on function intake_code_verify(text, text, text) to service_role;

-- Public: open a link. Shows the form only after the email code is checked on this device.
drop function if exists intake_open(text);
create or replace function intake_open(t text, sess text default null)
returns table (form_key text, form_title text, person_name text, stream text, recipient_name text,
               recipient_role text, status text, expired boolean, completed_at timestamptz, signed_name text,
               needs_code boolean, verified boolean, email_hint text)
language plpgsql security definer set search_path = public as $$
begin
  update intake_requests r set status = 'Opened', opened_at = now()
   where r.token = t and r.status = 'Sent' and r.expires_at > now();
  return query
    select r.form_key, r.form_title,
           case when (r.require_code and r.recipient_email is not null) and r.session_hash is distinct from sess then null else c.person_name end,
           c.stream, r.recipient_name, r.recipient_role, r.status,
           (r.expires_at <= now()), r.completed_at, r.signed_name,
           (r.require_code and r.recipient_email is not null),
           (r.session_hash is not null and r.session_hash = sess),
           case when r.recipient_email is null then null
                else left(split_part(r.recipient_email, '@', 1), 2) || '•••@' || split_part(r.recipient_email, '@', 2) end
      from intake_requests r join intake_cases c on c.id = r.case_id
     where r.token = t;
end $$;
revoke execute on function intake_open(text, text) from public;
grant execute on function intake_open(text, text) to anon, authenticated;

-- Public: submit and sign — now also requires the verified device when a code is required.
drop function if exists intake_submit(text, jsonb, text, text, text, text, text);
create or replace function intake_submit(t text, answers jsonb, sname text, srole text, sig text, ip text, agent text, sess text default null)
returns text language plpgsql security definer set search_path = public as $$
declare r intake_requests; who text;
begin
  select * into r from intake_requests where token = t for update;
  if r.id is null then return 'not_found'; end if;
  if r.status = 'Completed' then return 'already'; end if;
  if r.status = 'Cancelled' then return 'cancelled'; end if;
  if r.expires_at <= now() then return 'expired'; end if;
  if r.require_code and r.recipient_email is not null and (r.session_hash is null or r.session_hash is distinct from sess) then return 'unverified'; end if;
  if coalesce(trim(sname), '') = '' or coalesce(sig, '') not like 'data:image/png;base64,%' then return 'unsigned'; end if;
  if length(sig) > 400000 or pg_column_size(answers) > 200000 then return 'too_large'; end if;

  update intake_requests set data = answers, signed_name = trim(sname), signer_role = srole, signature = sig,
         signer_ip = left(ip, 64), signer_agent = left(agent, 300), status = 'Completed', completed_at = now()
   where id = r.id;

  select person_name into who from intake_cases where id = r.case_id;
  perform notify_managers('Intake form signed: ' || r.form_title, who || ' — signed by ' || trim(sname),
                          '/intake/' || r.case_id, 'intake:' || r.id);
  return 'ok';
end $$;
revoke execute on function intake_submit(text, jsonb, text, text, text, text, text, text) from public;
grant execute on function intake_submit(text, jsonb, text, text, text, text, text, text) to anon, authenticated;
