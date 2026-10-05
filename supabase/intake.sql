-- =====================================================================
-- Evergreen CRM - Intake portal: managers send MCFD / CLBC intake forms by email,
-- people open a private link, fill the form in and sign it. Safe to run again.
-- =====================================================================
create table if not exists intake_cases (
  id             uuid primary key default gen_random_uuid(),
  person_name    text not null,
  stream         text not null check (stream in ('MCFD','CLBC')),
  home_id        uuid references homes,
  referral_date  date default current_date,
  status         text not null default 'Open' check (status in ('Open','Accepted','Declined','Closed')),
  notes          text,
  resident_id    uuid references residents,
  created_by     uuid references profiles default auth.uid(),
  created_at     timestamptz not null default now()
);

create table if not exists intake_requests (
  id               uuid primary key default gen_random_uuid(),
  case_id          uuid not null references intake_cases on delete cascade,
  form_key         text not null,
  form_title       text not null,
  recipient_name   text not null,
  recipient_email  text,
  recipient_role   text,
  token            text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status           text not null default 'Sent' check (status in ('Sent','Opened','Completed','Cancelled')),
  expires_at       timestamptz not null default now() + interval '21 days',
  sent_by          uuid references profiles default auth.uid(),
  sent_at          timestamptz not null default now(),
  opened_at        timestamptz,
  completed_at     timestamptz,
  data             jsonb,
  signed_name      text,
  signer_role      text,
  signature        text,        -- drawn signature (PNG data URL)
  signer_ip        text,
  signer_agent     text
);
create index if not exists intake_requests_case on intake_requests (case_id);

alter table intake_cases enable row level security;
alter table intake_requests enable row level security;
drop policy if exists "intake cases mgr" on intake_cases;
drop policy if exists "intake requests mgr" on intake_requests;
create policy "intake cases mgr" on intake_cases for all using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));
create policy "intake requests mgr" on intake_requests for all using (app_role() in ('admin','manager')) with check (app_role() in ('admin','manager'));

-- A completed, signed form can't be changed by anyone (only cancelled links can be removed).
create or replace function intake_request_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.status = 'Completed' then
    raise exception 'A signed form cannot be changed.';
  end if;
  if tg_op = 'DELETE' and old.status = 'Completed' then
    raise exception 'A signed form cannot be deleted.';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists intake_request_guard on intake_requests;
create trigger intake_request_guard before update or delete on intake_requests for each row execute function intake_request_guard();

-- ---------- Public link: open a form (no sign-in). Returns only what the form page needs. ----------
create or replace function intake_open(t text)
returns table (form_key text, form_title text, person_name text, stream text, recipient_name text,
               recipient_role text, status text, expired boolean, completed_at timestamptz, signed_name text)
language plpgsql security definer set search_path = public as $$
begin
  update intake_requests r set status = 'Opened', opened_at = now()
   where r.token = t and r.status = 'Sent' and r.expires_at > now();
  return query
    select r.form_key, r.form_title, c.person_name, c.stream, r.recipient_name, r.recipient_role, r.status,
           (r.expires_at <= now()), r.completed_at, r.signed_name
      from intake_requests r join intake_cases c on c.id = r.case_id
     where r.token = t;
end $$;
revoke execute on function intake_open(text) from public;
grant execute on function intake_open(text) to anon, authenticated;

-- ---------- Public link: submit and sign. The time is the server's, not the device's. ----------
create or replace function intake_submit(t text, answers jsonb, sname text, srole text, sig text, ip text, agent text)
returns text language plpgsql security definer set search_path = public as $$
declare r intake_requests; who text;
begin
  select * into r from intake_requests where token = t for update;
  if r.id is null then return 'not_found'; end if;
  if r.status = 'Completed' then return 'already'; end if;
  if r.status = 'Cancelled' then return 'cancelled'; end if;
  if r.expires_at <= now() then return 'expired'; end if;
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
revoke execute on function intake_submit(text, jsonb, text, text, text, text, text) from public;
grant execute on function intake_submit(text, jsonb, text, text, text, text, text) to anon, authenticated;

drop trigger if exists audit_intake_cases on intake_cases;
drop trigger if exists audit_intake_requests on intake_requests;
create trigger audit_intake_cases after insert or update or delete on intake_cases for each row execute function write_audit();
create trigger audit_intake_requests after insert or update or delete on intake_requests for each row execute function write_audit();
