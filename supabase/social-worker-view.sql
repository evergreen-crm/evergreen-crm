-- =====================================================================
-- Evergreen CRM - Social worker view (Nov 21, 2026; Melvin: own social worker view, weekly summary of daily
-- notes, incidents only after the Program Manager's review).
--   * A social worker (MCFD / CLBC / DAA) signs in with an email code like everyone else. Their account has the
--     'family' role, so every staff rule already shuts them out; what they may see comes ONLY from the
--     functions below, and only for youth on their worker_access list.
--   * worker_access: one row per youth they work with. Added by the house's PC or a manager; ends when removed
--     or on expires_on (6 months by default, renewable). Ended rows are kept as a record.
--   * They never see family messages, family links, staff files, medications, or other youth.
--   * Every view is written to the "Who opened" log (resident_file_views).
--   * worker_messages: a separate thread between the social worker and the house leaders (not the family thread).
-- Run as migration social_worker_view on BOTH databases. Safe to re-run.
-- =====================================================================

create table if not exists public.worker_access (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  worker_role text not null default 'Social worker',
  org text not null default 'MCFD',
  expires_on date not null default ((now() at time zone 'Etc/GMT+7')::date + 183),
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  renewed_by uuid references public.profiles(id),
  renewed_at timestamptz,
  ended_at timestamptz,
  ended_by uuid references public.profiles(id),
  end_reason text,
  reminded_at timestamptz,
  constraint worker_access_role_ck check (worker_role in ('Social worker','Guardianship worker','Resource worker','Youth worker (MCFD)','CLBC facilitator','CLBC analyst','Other')),
  constraint worker_access_org_ck check (org in ('MCFD','CLBC','Delegated Aboriginal Agency','Other'))
);
create unique index if not exists worker_access_one_open on public.worker_access(resident_id, profile_id) where ended_at is null;
create index if not exists worker_access_profile on public.worker_access(profile_id) where ended_at is null;
alter table public.worker_access enable row level security;

-- Who may manage a youth's social worker access: the Administrator, or level 2+ house staff (not HR/Payroll)
-- who look after that youth's house.
create or replace function public.can_manage_workers(rid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select app_role() = 'admin'
      or (coalesce(app_level(), 0) >= 2 and app_group() is null and app_role() in ('staff','manager')
          and app_scope_home('ind', resident_home(rid)));
$$;

create or replace function public.is_worker_of(rid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select app_role() = 'family' and exists (
    select 1 from worker_access w
     where w.profile_id = auth.uid() and w.resident_id = rid and w.ended_at is null
       and w.expires_on >= (now() at time zone 'Etc/GMT+7')::date);
$$;

drop policy if exists "worker access staff" on public.worker_access;
create policy "worker access staff" on public.worker_access for all to authenticated
  using (can_manage_workers(resident_id)) with check (can_manage_workers(resident_id));
drop policy if exists "worker access own" on public.worker_access;
create policy "worker access own" on public.worker_access for select to authenticated using (profile_id = auth.uid());

-- The "Who opened" log also records social workers.
create or replace function public.log_resident_view(rid uuid, t text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare me uuid := auth.uid(); vtab text := left(coalesce(nullif(t, ''), 'overview'), 40);
begin
  if me is null or rid is null then return; end if;
  if not (app_role() = 'admin' or app_scope_home('ind', resident_home(rid)) or is_family_of(rid) or is_worker_of(rid)) then return; end if;
  if exists (select 1 from resident_file_views v where v.profile_id = me and v.resident_id = rid and v.tab = vtab
             and v.viewed_at > now() - interval '10 minutes') then return; end if;
  insert into resident_file_views (resident_id, profile_id, tab) values (rid, me, vtab);
end $function$;

-- ---------- Messages between the social worker and the house leaders ----------
create table if not exists public.worker_messages (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.residents(id) on delete cascade,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists worker_messages_thread on public.worker_messages(resident_id, worker_id, created_at);
alter table public.worker_messages enable row level security;
drop policy if exists "worker messages see" on public.worker_messages;
create policy "worker messages see" on public.worker_messages for select to authenticated
  using ((worker_id = auth.uid() and is_worker_of(resident_id)) or can_manage_workers(resident_id));
drop policy if exists "worker messages send" on public.worker_messages;
create policy "worker messages send" on public.worker_messages for insert to authenticated
  with check (sender_id = auth.uid() and ((worker_id = auth.uid() and is_worker_of(resident_id))
              or (can_manage_workers(resident_id) and exists (select 1 from worker_access w where w.resident_id = worker_messages.resident_id and w.profile_id = worker_messages.worker_id and w.ended_at is null))));
drop policy if exists "worker messages read" on public.worker_messages;
create policy "worker messages read" on public.worker_messages for update to authenticated
  using ((worker_id = auth.uid() and is_worker_of(resident_id)) or can_manage_workers(resident_id))
  with check ((worker_id = auth.uid() and is_worker_of(resident_id)) or can_manage_workers(resident_id));

-- House leaders for a youth: the house's PC (level 2) and PMs (level 3, own house or extra houses).
create or replace function public.youth_leaders(rid uuid)
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct x.id from profiles x, residents r
   where r.id = rid and x.active and x.staff_group is null and coalesce(x.level, 0) in (2, 3)
     and (x.home_id = r.home_id or exists (select 1 from manager_homes m where m.profile_id = x.id and m.home_id = r.home_id));
$$;

create or replace function public.worker_message_notify()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare nm text; youth text; l uuid;
begin
  select full_name into nm from profiles where id = new.sender_id;
  select coalesce(preferred_name, first_name) || ' ' || left(coalesce(last_name, ''), 1) || '.' into youth from residents where id = new.resident_id;
  if new.sender_id = new.worker_id then
    for l in select youth_leaders(new.resident_id) loop
      perform notify(l, '💬 Message from ' || nm || ' (social worker) about ' || youth, left(new.body, 140),
        '/residents/' || new.resident_id || '?tab=worker', 'wmsg:' || new.id || ':' || l);
    end loop;
  else
    perform notify(new.worker_id, '💬 Reply from ' || nm || ' about ' || youth, left(new.body, 140),
      '/worker/' || new.resident_id || '?tab=messages', 'wmsg:' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists worker_message_notify on public.worker_messages;
create trigger worker_message_notify after insert on public.worker_messages for each row execute function public.worker_message_notify();

-- ---------- What a social worker sees ----------
create or replace function public.worker_my_youth()
returns table (resident_id uuid, name text, preferred_name text, date_of_birth date, home_name text, worker_role text,
               org text, expires_on date, unread int)
language sql stable security definer set search_path to 'public' as $$
  select r.id, r.first_name || ' ' || coalesce(r.last_name, ''), r.preferred_name, r.date_of_birth, h.name,
         w.worker_role, w.org, w.expires_on,
         (select count(*)::int from worker_messages m where m.resident_id = r.id and m.worker_id = auth.uid()
            and m.sender_id <> auth.uid() and m.read_at is null)
    from worker_access w join residents r on r.id = w.resident_id left join homes h on h.id = r.home_id
   where app_role() = 'family' and w.profile_id = auth.uid() and w.ended_at is null
     and w.expires_on >= (now() at time zone 'Etc/GMT+7')::date
   order by r.last_name, r.first_name;
$$;

-- One youth's file for their social worker: only these parts, read-only. p_week = any day of the week to summarize.
create or replace function public.worker_file(p_resident uuid, p_tab text default 'overview', p_week date default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r residents; h homes; wk date; out jsonb := '{}'::jsonb; today date := (now() at time zone 'Etc/GMT+7')::date;
begin
  if not is_worker_of(p_resident) then raise exception 'You don’t have access to this youth’s file. Ask the house’s Program Coordinator.'; end if;
  select * into r from residents where id = p_resident;
  select * into h from homes where id = r.home_id;
  out := jsonb_build_object(
    'youth', jsonb_build_object('id', r.id, 'name', r.first_name || ' ' || coalesce(r.last_name, ''), 'preferred_name', r.preferred_name,
      'date_of_birth', r.date_of_birth, 'status', r.status, 'care_type', r.care_type, 'admission_date', r.admission_date,
      'file_number', r.file_number, 'funder', r.funder),
    'house', jsonb_build_object('name', h.name, 'phone', h.phone, 'on_call_phone', h.on_call_phone, 'program', h.program),
    'leaders', coalesce((select jsonb_agg(jsonb_build_object('name', p.full_name, 'role', case when p.level = 2 then 'Program Coordinator' else 'Program Manager' end,
                         'email', p.email, 'phone', p.phone) order by p.level)
                           from profiles p where p.id in (select youth_leaders(p_resident))), '[]'::jsonb),
    'access', (select jsonb_build_object('worker_role', w.worker_role, 'org', w.org, 'expires_on', w.expires_on)
                 from worker_access w where w.profile_id = auth.uid() and w.resident_id = p_resident and w.ended_at is null limit 1));

  if p_tab in ('overview', 'plan') then
    out := out || jsonb_build_object(
      'plan', (select jsonb_build_object('what_matters', c.what_matters, 'strengths', c.strengths, 'how_to_support', c.how_to_support,
                 'last_review_on', c.last_review_on, 'next_review_on', c.next_review_on, 'started_on', c.started_on)
                 from care_plans c where c.resident_id = p_resident order by c.updated_at desc nulls last limit 1),
      'goals', coalesce((select jsonb_agg(jsonb_build_object('title', g.title, 'domain', g.domain, 'status', g.status, 'target_date', g.target_date,
                 'steps', (select count(*) from goal_steps s where s.goal_id = g.id),
                 'steps_done', (select count(*) from goal_steps s where s.goal_id = g.id and s.done_on is not null)) order by g.created_at)
                 from goals g where g.resident_id = p_resident and coalesce(g.status, '') <> 'Archived'), '[]'::jsonb));
  end if;

  if p_tab in ('overview', 'appointments') then
    out := out || jsonb_build_object('appointments', coalesce((select jsonb_agg(jsonb_build_object('title', a.title, 'category', a.category,
                 'date', a.appt_date, 'start', a.start_time, 'location', a.location, 'status', a.status) order by a.appt_date, a.start_time)
                 from appointments a where a.resident_id = p_resident and a.appt_date between today - 30 and today + 60), '[]'::jsonb));
  end if;

  if p_tab in ('overview', 'incidents') then
    -- Only after the Program Manager's review (critical ones still reach the funder by phone/form within 24 hours).
    out := out || jsonb_build_object('incidents', coalesce((select jsonb_agg(jsonb_build_object('occurred_on', i.occurred_on, 'time', i.occurred_time,
                 'type', i.incident_type, 'class', i.incident_class, 'critical', i.is_critical, 'description', i.description,
                 'actions_taken', i.actions_taken, 'injuries', i.injuries, 'physical_intervention', i.physical_intervention,
                 'police', i.police_involved, 'form_number', i.form_number, 'form_sent_at', i.form_sent_at,
                 'reviewed_at', i.manager_review_at) order by i.occurred_on desc, i.occurred_time desc nulls last)
                 from incidents i where i.resident_id = p_resident and i.manager_review_at is not null and i.occurred_on >= today - 365), '[]'::jsonb),
      'missing', coalesce((select jsonb_agg(jsonb_build_object('started_at', m.started_at, 'found_at', m.found_at, 'status', m.status,
                 'police', m.police_called_at is not null, 'found_where', m.found_where) order by m.started_at desc)
                 from missing_episodes m where m.resident_id = p_resident and m.started_at >= now() - interval '365 days'), '[]'::jsonb));
  end if;

  if p_tab in ('overview', 'week') then
    wk := coalesce(p_week, today);
    wk := wk - ((extract(isodow from wk))::int - 1);   -- Monday
    out := out || jsonb_build_object('week_start', wk, 'week', coalesce((select jsonb_agg(d order by d->>'date') from (
        select jsonb_build_object('date', n.note_date, 'notes', count(*),
               'moods', (select jsonb_agg(distinct x.mood) from shift_notes x where x.resident_id = p_resident and x.note_date = n.note_date and x.signed_at is not null and x.mood is not null),
               'meals', (select jsonb_agg(distinct x.meals) from shift_notes x where x.resident_id = p_resident and x.note_date = n.note_date and x.signed_at is not null and x.meals is not null),
               'activities', (select jsonb_agg(distinct a) from shift_notes x, unnest(string_to_array(coalesce(x.activities, ''), ', ')) a where x.resident_id = p_resident and x.note_date = n.note_date and x.signed_at is not null and a <> ''),
               'goals', (select jsonb_agg(distinct g.title) from shift_notes x join goals g on g.id = any(x.goal_ids) where x.resident_id = p_resident and x.note_date = n.note_date and x.signed_at is not null)) d
          from shift_notes n where n.resident_id = p_resident and n.signed_at is not null and n.note_date between wk and wk + 6
         group by n.note_date) s), '[]'::jsonb));
  end if;

  if p_tab in ('overview', 'documents') then
    out := out || jsonb_build_object('documents', coalesce((select jsonb_agg(jsonb_build_object('title', q.title, 'status', s.status, 'due', q.due_date,
                 'signed_at', s.signed_at, 'request_id', q.id, 'token', case when s.profile_id = auth.uid() then null else s.token end,
                 'mine', s.profile_id = auth.uid()) order by q.created_at desc)
                 from sign_request_signers s join sign_requests q on q.id = s.request_id
                where (s.profile_id = auth.uid() or lower(s.ext_email) = lower((select email from profiles where id = auth.uid())))
                  and q.status <> 'Cancelled'), '[]'::jsonb));
  end if;
  perform log_resident_view(p_resident, 'social worker: ' || coalesce(p_tab, 'overview'));
  return out;
end $$;

-- Expiry reminders (daily job): 14 days before access ends, tell the house leaders and whoever granted it.
create or replace function public.worker_access_remind()
returns int language plpgsql security definer set search_path to 'public' as $$
declare w record; l uuid; n int := 0; today date := (now() at time zone 'Etc/GMT+7')::date;
begin
  for w in select a.*, p.full_name worker, r.first_name || ' ' || left(coalesce(r.last_name, ''), 1) || '.' youth
             from worker_access a join profiles p on p.id = a.profile_id join residents r on r.id = a.resident_id
            where a.ended_at is null and a.reminded_at is null and a.expires_on between today and today + 14 loop
    for l in select youth_leaders(w.resident_id) union select w.granted_by loop
      perform notify(l, '⏳ Social worker access ends ' || to_char(w.expires_on, 'Mon DD') || ': ' || w.worker,
        'For ' || w.youth || '. Renew it on the youth’s Social worker tab if they are still the worker.',
        '/residents/' || w.resident_id || '?tab=worker', 'wexp:' || w.id || ':' || l);
    end loop;
    update worker_access set reminded_at = now() where id = w.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.worker_my_youth(), public.worker_file(uuid, text, date) from public, anon;
grant execute on function public.worker_my_youth(), public.worker_file(uuid, text, date) to authenticated;
revoke execute on function public.worker_access_remind(), public.worker_message_notify() from public, anon, authenticated;
grant execute on function public.worker_access_remind() to service_role;
revoke execute on function public.youth_leaders(uuid) from public, anon;
