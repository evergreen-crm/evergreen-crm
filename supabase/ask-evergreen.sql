-- =====================================================================
-- Evergreen CRM - 🤖 Ask Evergreen (AI helper, phase 1). Safe to run more than once.
--
--  · Answers policy and how-to questions ONLY from Evergreen's own policies (the Policies library) and the
--    CRM help tips, with the policy name and page. No youth records are ever sent.
--  · The text of each policy PDF is copied into ask_chunks (by the app, with the server key). Nobody reads
--    ask_chunks directly; questions go through ask_search().
--  · Every question is logged (ask_log) for 90 days: staff see their own, directors (level 4+) see all,
--    to spot gaps in the policies. 30 questions per person per day.
-- =====================================================================

create table if not exists ask_chunks (
  id          bigserial primary key,
  source      text not null default 'policy' check (source in ('policy', 'help')),
  policy_id   uuid references policies on delete cascade,
  version_id  uuid references policy_versions on delete cascade,
  title       text not null,
  page        int,
  link        text,
  content     text not null,
  tsv         tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || content)) stored,
  created_at  timestamptz not null default now()
);
create index if not exists ask_chunks_tsv on ask_chunks using gin (tsv);
create index if not exists ask_chunks_policy on ask_chunks (policy_id, version_id);
alter table ask_chunks enable row level security;   -- no policies: only the server key and ask_search() read it

-- Which policy versions are already read in (so the reader only does new ones).
create table if not exists ask_indexed (
  version_id  uuid primary key references policy_versions on delete cascade,
  policy_id   uuid references policies on delete cascade,
  pages       int,
  chunks      int,
  note        text,
  indexed_at  timestamptz not null default now()
);
alter table ask_indexed enable row level security;
drop policy if exists "ask indexed see" on ask_indexed;
create policy "ask indexed see" on ask_indexed for select using (coalesce(app_level(), 0) >= 4 or app_role() = 'admin');

create table if not exists ask_log (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references profiles on delete set null default auth.uid(),
  question    text not null,
  answer      text,
  sources     jsonb,
  found       boolean,
  helpful     boolean,
  created_at  timestamptz not null default now()
);
create index if not exists ask_log_who on ask_log (profile_id, created_at desc);
alter table ask_log enable row level security;
drop policy if exists "ask log see" on ask_log;
create policy "ask log see" on ask_log for select using (profile_id = auth.uid() or coalesce(app_level(), 0) >= 4 or app_role() = 'admin');
drop policy if exists "ask log rate" on ask_log;
create policy "ask log rate" on ask_log for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Search the policies. Words are OR-ed (any match), best matches first.
create or replace function ask_search(p_q text, p_n int default 8)
returns table (id bigint, source text, policy_id uuid, title text, page int, link text, content text, rank real)
language plpgsql stable security definer set search_path = public as $$
declare q tsquery; words text;
begin
  if coalesce(app_role()::text, 'family') = 'family' or not exists (select 1 from profiles pr where pr.id = auth.uid() and pr.active) then
    raise exception 'Not allowed.';
  end if;
  select string_agg(distinct w, ' | ') into words
    from regexp_split_to_table(lower(left(coalesce(p_q, ''), 500)), '[^a-z0-9]+') w where length(w) >= 3;
  if words is null then return; end if;
  q := to_tsquery('english', words);
  if q is null or numnode(q) = 0 then return; end if;
  return query
    select c.id, c.source, c.policy_id, c.title, c.page, c.link, c.content, ts_rank_cd(c.tsv, q, 32)::real
      from ask_chunks c
     where c.tsv @@ q
       and (c.policy_id is null or exists (select 1 from policies p where p.id = c.policy_id and p.active and p.current_version_id = c.version_id))
     order by 8 desc
     limit least(greatest(coalesce(p_n, 8), 1), 12);
end $$;
grant execute on function ask_search(text, int) to authenticated;

-- Start a question: checks the daily limit, logs it, returns the log id. Old log rows (90+ days) are removed.
create or replace function ask_start(p_q text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me profiles; n int; lid uuid;
begin
  select * into me from profiles where id = auth.uid() and active;
  if me.id is null or me.role::text = 'family' then raise exception 'Not allowed.'; end if;
  if length(trim(coalesce(p_q, ''))) < 3 then raise exception 'Please type a question.'; end if;
  select count(*) into n from ask_log where profile_id = me.id and created_at > now() - interval '24 hours';
  if n >= 30 then raise exception 'You have asked 30 questions in the last 24 hours. Please try again later or ask your Program Coordinator.'; end if;
  delete from ask_log where created_at < now() - interval '90 days';
  insert into ask_log (profile_id, question) values (me.id, left(trim(p_q), 1000)) returning id into lid;
  return lid;
end $$;
grant execute on function ask_start(text) to authenticated;

create or replace function ask_finish(p_id uuid, p_answer text, p_sources jsonb, p_found boolean) returns void
language sql security definer set search_path = public as $$
  update ask_log set answer = left(p_answer, 8000), sources = p_sources, found = p_found
   where id = p_id and profile_id = auth.uid() and answer is null;
$$;
grant execute on function ask_finish(uuid, text, jsonb, boolean) to authenticated;

-- Check
select 'ask evergreen ready' as result, (select count(*) from ask_chunks) as chunks;

-- ---------- Read policies in automatically ----------
-- Every 10 minutes, if a policy's newest version isn't read in yet (or the help tips are missing), ask the site to
-- read them (/api/cron/ask-index, same Vault key as the urgent emails in attendance.sql). Does nothing otherwise.
create or replace function ping_ask_index() returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from policies p where p.active and p.current_version_id is not null
               and not exists (select 1 from ask_indexed i where i.version_id = p.current_version_id))
     or not exists (select 1 from ask_chunks where source = 'help') then
    perform net.http_post(
      url := 'https://evergreen-crm-azure.vercel.app/api/cron/ask-index',
      headers := jsonb_build_object('Content-Type', 'application/json',
                                    'x-flush-key', (select decrypted_secret from vault.decrypted_secrets where name = 'urgent_flush_key')),
      body := '{}'::jsonb, timeout_milliseconds := 60000);
  end if;
end $$;
revoke execute on function ping_ask_index() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('evergreen-ask-index') where exists (select 1 from cron.job where jobname = 'evergreen-ask-index');
  perform cron.schedule('evergreen-ask-index', '*/10 * * * *', $c$select public.ping_ask_index()$c$);
exception when others then
  raise notice 'Scheduler not available here (%).', sqlerrm;
end $$;
