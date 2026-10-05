-- =====================================================================
-- Evergreen CRM - HR Prescreening & Clearance (Combined Pre-Screening Standard)
-- Applicants open a private link, confirm an email code, type their experience,
-- give 3 references and sign. HR then works the screening checklist to
-- GREEN / YELLOW / RED clearance. Only the admin decides who can open prescreens.
-- Run after schema.sql and policies-hr.sql. Safe to run again.
-- =====================================================================

-- ---------- Who may open prescreens (the admin grants this) ----------
create table if not exists prescreen_access (
  profile_id  uuid primary key references profiles on delete cascade,
  access      text not null check (access in ('hr','interviewer')),
  granted_by  uuid references profiles default auth.uid(),
  granted_at  timestamptz not null default now()
);
alter table prescreen_access enable row level security;
drop policy if exists "prescreen access see" on prescreen_access;
drop policy if exists "prescreen access admin" on prescreen_access;
create policy "prescreen access see" on prescreen_access for select using (app_role() = 'admin' or profile_id = auth.uid());
create policy "prescreen access admin" on prescreen_access for all using (app_role() = 'admin') with check (app_role() = 'admin');

-- 'admin' | 'hr' | 'interviewer' | null (no access). Inactive accounts get null.
create or replace function prescreen_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when app_role() = 'admin' then 'admin'
    when app_role() is null then null
    else (select access from prescreen_access where profile_id = auth.uid())
  end
$$;
grant execute on function prescreen_role() to authenticated;

-- ---------- One row per applicant ----------
create table if not exists prescreens (
  id              uuid primary key default gen_random_uuid(),
  first_name      text not null,
  last_name       text,
  email           text,
  phone           text,
  position        text,
  worker_type     text default 'Employee',
  program         text not null default 'Both' check (program in ('MCFD','CLBC','Both')),
  drives          boolean not null default false,
  gives_meds      boolean not null default true,
  lived_outside   boolean not null default false,

  -- what the applicant typed and signed (locked once submitted)
  application     jsonb,
  signed_name     text,
  signature       text,            -- drawn signature (PNG data URL)
  signed_at       timestamptz,
  signer_ip       text,
  signer_agent    text,

  -- private link
  token           text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  link_status     text not null default 'Sent' check (link_status in ('Sent','Opened','Submitted','Cancelled')),
  expires_at      timestamptz not null default now() + interval '30 days',
  opened_at       timestamptz,
  require_code    boolean not null default true,
  otp_hash        text,
  otp_sent_at     timestamptz,
  otp_expires_at  timestamptz,
  otp_attempts    int not null default 0,
  verified_at     timestamptz,
  session_hash    text,

  -- HR's screening work
  items           jsonb not null default '{}'::jsonb,   -- checklist: { key: {st, exp, note, by, at} }
  interview       jsonb not null default '{}'::jsonb,
  ref_checks      jsonb not null default '[{},{},{}]'::jsonb,
  post            jsonb not null default '{}'::jsonb,   -- orientation / competency / independent sign-offs
  restrictions    text,
  file_status     text not null default 'Open' check (file_status in ('Open','On hold','Not moving forward')),
  file_notes      text,

  created_by      uuid references profiles default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists prescreens_created on prescreens (created_at desc);

alter table prescreens enable row level security;
drop policy if exists "prescreens see" on prescreens;
drop policy if exists "prescreens add" on prescreens;
drop policy if exists "prescreens edit" on prescreens;
drop policy if exists "prescreens remove" on prescreens;
create policy "prescreens see"    on prescreens for select using (prescreen_role() is not null);
create policy "prescreens add"    on prescreens for insert with check (prescreen_role() in ('admin','hr'));
create policy "prescreens edit"   on prescreens for update using (prescreen_role() is not null) with check (prescreen_role() is not null);
create policy "prescreens remove" on prescreens for delete using (prescreen_role() in ('admin','hr'));

-- Guard: the signed application can't be changed; interviewers only touch interview,
-- references and checklist; only the admin signs executive approval.
create or replace function prescreen_guard() returns trigger language plpgsql as $$
declare r text := prescreen_role();
begin
  if old.link_status = 'Submitted' and (
       new.application is distinct from old.application or new.signature is distinct from old.signature
    or new.signed_name is distinct from old.signed_name or new.signed_at is distinct from old.signed_at
    or new.link_status is distinct from old.link_status) then
    raise exception 'A signed prescreen cannot be changed.';
  end if;
  if r = 'interviewer' and (
       new.program is distinct from old.program or new.drives is distinct from old.drives
    or new.gives_meds is distinct from old.gives_meds or new.lived_outside is distinct from old.lived_outside
    or new.post is distinct from old.post or new.file_status is distinct from old.file_status
    or new.restrictions is distinct from old.restrictions or new.token is distinct from old.token) then
    raise exception 'Interviewers can only record interviews, reference checks and screening items.';
  end if;
  if r is not null and r <> 'admin' and (new.items -> 'exec') is distinct from (old.items -> 'exec') then
    raise exception 'Only the administrator can sign executive approval.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists prescreen_guard on prescreens;
create trigger prescreen_guard before update on prescreens for each row execute function prescreen_guard();

-- Tell the admin and everyone with prescreen access.
create or replace function notify_prescreen_team(t text, b text, l text, k text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select p.id from profiles p
            where p.active and (p.role = 'admin' or p.id in (select profile_id from prescreen_access)) loop
    perform notify(r.id, t, b, l, case when k is null then null else k || ':' || r.id end);
  end loop;
end $$;
revoke execute on function notify_prescreen_team(text, text, text, text) from public, anon, authenticated;

-- ---------- Public link (no sign-in) ----------
-- Server only: store a new email code (as a hash) and return where to send it.
create or replace function prescreen_code_issue(t text, h text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r prescreens;
begin
  select * into r from prescreens where token = t for update;
  if r.id is null or r.link_status in ('Submitted','Cancelled') or r.expires_at <= now() then return jsonb_build_object('error', 'invalid'); end if;
  if r.email is null then return jsonb_build_object('error', 'no_email'); end if;
  if r.otp_sent_at > now() - interval '60 seconds' then return jsonb_build_object('error', 'wait'); end if;
  update prescreens set otp_hash = h, otp_sent_at = now(), otp_expires_at = now() + interval '10 minutes', otp_attempts = 0 where id = r.id;
  return jsonb_build_object('email', r.email, 'name', r.first_name);
end $$;
revoke execute on function prescreen_code_issue(text, text) from public, anon, authenticated;
grant execute on function prescreen_code_issue(text, text) to service_role;

-- Server only: check a code. 5 tries per code; a code lasts 10 minutes.
create or replace function prescreen_code_verify(t text, h text, sess text) returns text
language plpgsql security definer set search_path = public as $$
declare r prescreens;
begin
  select * into r from prescreens where token = t for update;
  if r.id is null or r.link_status in ('Submitted','Cancelled') then return 'invalid'; end if;
  if r.otp_hash is null or r.otp_expires_at <= now() then return 'expired'; end if;
  if r.otp_attempts >= 5 then return 'locked'; end if;
  if r.otp_hash <> h then
    update prescreens set otp_attempts = otp_attempts + 1 where id = r.id;
    return 'wrong';
  end if;
  update prescreens set verified_at = now(), session_hash = sess, otp_hash = null where id = r.id;
  return 'ok';
end $$;
revoke execute on function prescreen_code_verify(text, text, text) from public, anon, authenticated;
grant execute on function prescreen_code_verify(text, text, text) to service_role;

-- Public: open the link. Personal details are only returned after the email code is confirmed.
create or replace function prescreen_open(t text, sess text default null)
returns table (first_name text, last_name text, email text, phone text, job_position text, program text,
               link_status text, expired boolean, signed_at timestamptz, signed_name text,
               needs_code boolean, verified boolean, email_hint text)
language plpgsql security definer set search_path = public as $$
begin
  update prescreens p set link_status = 'Opened', opened_at = now()
   where p.token = t and p.link_status = 'Sent' and p.expires_at > now();
  return query
    select p.first_name,
           case when (p.require_code and p.email is not null) and p.session_hash is distinct from sess then null else p.last_name end,
           case when (p.require_code and p.email is not null) and p.session_hash is distinct from sess then null else p.email end,
           case when (p.require_code and p.email is not null) and p.session_hash is distinct from sess then null else p.phone end,
           p.position, p.program, p.link_status, (p.expires_at <= now()), p.signed_at, p.signed_name,
           (p.require_code and p.email is not null),
           (p.session_hash is not null and p.session_hash = sess),
           case when p.email is null then null
                else left(split_part(p.email, '@', 1), 2) || '•••@' || split_part(p.email, '@', 2) end
      from prescreens p where p.token = t;
end $$;
revoke execute on function prescreen_open(text, text) from public;
grant execute on function prescreen_open(text, text) to anon, authenticated;

-- Public: submit and sign. The time is the server's, not the device's.
create or replace function prescreen_submit(t text, answers jsonb, sname text, sig text, ip text, agent text, sess text default null)
returns text language plpgsql security definer set search_path = public as $$
declare r prescreens; a jsonb := answers -> 'applicant'; s jsonb := answers -> 'screen'; prog text;
begin
  select * into r from prescreens where token = t for update;
  if r.id is null then return 'not_found'; end if;
  if r.link_status = 'Submitted' then return 'already'; end if;
  if r.link_status = 'Cancelled' then return 'cancelled'; end if;
  if r.expires_at <= now() then return 'expired'; end if;
  if r.require_code and r.email is not null and (r.session_hash is null or r.session_hash is distinct from sess) then return 'unverified'; end if;
  if coalesce(trim(sname), '') = '' or coalesce(sig, '') not like 'data:image/png;base64,%' then return 'unsigned'; end if;
  if length(sig) > 400000 or pg_column_size(answers) > 200000 then return 'too_large'; end if;
  prog := coalesce(nullif(a ->> 'program', ''), r.program);
  if prog not in ('MCFD','CLBC','Both') then prog := r.program; end if;

  update prescreens set
    application = answers, signed_name = trim(sname), signature = sig, signed_at = now(),
    signer_ip = left(ip, 64), signer_agent = left(agent, 300), link_status = 'Submitted',
    first_name = coalesce(nullif(trim(a ->> 'first'), ''), first_name),
    last_name  = coalesce(nullif(trim(a ->> 'last'), ''), last_name),
    email      = coalesce(nullif(lower(trim(a ->> 'email')), ''), email),
    phone      = coalesce(nullif(trim(a ->> 'phone'), ''), phone),
    position   = coalesce(nullif(a ->> 'position', ''), position),
    worker_type = coalesce(nullif(a ->> 'type', ''), worker_type),
    program    = prog,
    drives     = coalesce(s ->> 'drive', '') = 'yes',
    lived_outside = coalesce(s ->> 'outside', '') = 'yes',
    items      = items || jsonb_build_object('app', jsonb_build_object('st', 'pending'))
  where id = r.id;

  perform notify_prescreen_team('Prescreen signed: ' || coalesce(nullif(trim(a ->> 'first'), ''), r.first_name) || ' ' || coalesce(a ->> 'last', ''),
                                coalesce(a ->> 'position', r.position), '/hr/prescreen/' || r.id, 'prescreen:' || r.id);
  return 'ok';
end $$;
revoke execute on function prescreen_submit(text, jsonb, text, text, text, text, text) from public;
grant execute on function prescreen_submit(text, jsonb, text, text, text, text, text) to anon, authenticated;

drop trigger if exists audit_prescreens on prescreens;
drop trigger if exists audit_prescreen_access on prescreen_access;
create trigger audit_prescreens after insert or update or delete on prescreens for each row execute function write_audit();
create trigger audit_prescreen_access after insert or update or delete on prescreen_access for each row execute function write_audit();
