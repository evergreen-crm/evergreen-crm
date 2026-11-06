-- =====================================================================
-- Evergreen CRM - Orientation path: 6 days that lead straight into the Evergreen Academy (Nov 5, 2026).
--   * Each online step links to its Academy course and ticks itself when the quiz is passed.
--   * Steps without a course yet, outside courses, and in-person steps are ticked by the Program Coordinator
--     (or PM, HR, directors, Admin) - never by the staff member themselves.
--   * A day opens when every step of the days before it is done.
--   * MCFD and CLBC versions: some steps differ by program (house program, else the person's program).
--   * When every step is done (the last one is the PC's sign-off), one "Evergreen New Staff Orientation"
--     certificate is issued: orientation_completions + a verified training record (+ a PDF from the app).
-- Plan changes agreed with Melvin (Nov 5): Mandatory Reporting replaces "Duty to report"; Medication
-- Administration (Day 4) replaces "Medication safety" (Day 1); one final quiz on Day 4 (the Orientation course);
-- Documentation and Incident reporting on Day 1; CLBC staff take Adult Protection and Restricted Practices.
-- Also: staff could insert a "passed" quiz record for themselves directly; quizzes are marked only by
-- grade_course(), so that insert rule is removed.
-- Needs staff-file-access.sql and personal-records-access.sql. Run as migration orientation_path. Safe to re-run.
-- =====================================================================

drop policy if exists course_attempts_insert_own on public.course_attempts;

alter table public.orientation_plan_items add column if not exists course_key text;
alter table public.orientation_plan_items add column if not exists program text not null default 'Both';
alter table public.orientation_plan_items add column if not exists active boolean not null default true;
alter table public.orientation_plan_items drop constraint if exists orientation_plan_items_program_check;
alter table public.orientation_plan_items add constraint orientation_plan_items_program_check check (program in ('Both', 'MCFD', 'CLBC'));

create table if not exists public.orientation_progress (
  profile_id uuid not null references profiles(id) on delete cascade,
  item_id uuid not null references orientation_plan_items(id) on delete cascade,
  done_at timestamptz not null default now(),
  done_by uuid references profiles(id),
  note text,
  primary key (profile_id, item_id)
);
alter table public.orientation_progress enable row level security;

create table if not exists public.orientation_completions (
  profile_id uuid primary key references profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  signed_off_by uuid references profiles(id),
  certificate_no text not null unique,
  training_id uuid
);
alter table public.orientation_completions enable row level security;

-- Who may see / tick a person's orientation
create or replace function public.orientation_can_view(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p = auth.uid() or can_manage_person(p)
      or (coalesce(app_level(), 0) = 2 and coalesce(app_group(), '') = '' and staff_in_my_houses(p));
$$;
create or replace function public.orientation_can_tick(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p is distinct from auth.uid() and (can_manage_person(p)
      or (coalesce(app_level(), 0) = 2 and coalesce(app_group(), '') = '' and staff_in_my_houses(p)));
$$;

drop policy if exists op_see on public.orientation_progress;
create policy op_see on public.orientation_progress for select using (orientation_can_view(profile_id));
drop policy if exists oc_see on public.orientation_completions;
create policy oc_see on public.orientation_completions for select using (orientation_can_view(profile_id));
-- No insert/update/delete policies: only orientation_tick() writes them.

-- The person's program: their house's program, else their staff file's or onboarding's program, else Both.
create or replace function public.orientation_program(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select h.program from profiles pr join homes h on h.id = pr.home_id where pr.id = p and h.program in ('MCFD', 'CLBC')),
    (select d.program from staff_details d where d.profile_id = p and d.program in ('MCFD', 'CLBC')),
    (select o.program from onboardings o where o.profile_id = p and o.program in ('MCFD', 'CLBC') limit 1),
    'Both');
$$;

-- One person's plan, with what is done and what is still locked.
create or replace function public.orientation_plan_for(p uuid)
returns table (id uuid, day_number int, sort int, start_time text, end_time text, kind text, title text, notes text,
               course_key text, course_ready boolean, done boolean, done_at timestamptz, done_how text, score text, locked boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare prog text;
begin
  if not orientation_can_view(p) then raise exception 'You can only see your own orientation, or your house staff''s.'; end if;
  prog := orientation_program(p);
  return query
  with items as (
    select i.* from orientation_plan_items i
     where i.active and (i.program = 'Both' or prog = 'Both' or i.program = prog)
  ), st as (
    select i.id, i.day_number::int as day_number, i.sort::int as sort, i.start_time::text as start_time, i.end_time::text as end_time, i.kind, i.title, i.notes, i.course_key,
           exists (select 1 from course_keys k where k.course_key = i.course_key) as course_ready,
           pg.done_at as tick_at, pg.done_by,
           (select a.created_at from course_attempts a where a.profile_id = p and a.course_key = i.course_key and a.passed order by a.created_at limit 1) as pass_at,
           (select a.score || '/' || a.total from course_attempts a where a.profile_id = p and a.course_key = i.course_key and a.passed order by a.score desc, a.created_at limit 1) as best
      from items i left join orientation_progress pg on pg.profile_id = p and pg.item_id = i.id
  ), d as (
    select st.*, (st.kind = 'lunch' or st.tick_at is not null or st.pass_at is not null) as is_done from st
  )
  select d.id, d.day_number, d.sort, d.start_time, d.end_time, d.kind, d.title, d.notes, d.course_key, d.course_ready,
         d.is_done, coalesce(d.pass_at, d.tick_at),
         case when d.kind = 'lunch' then null
              when d.pass_at is not null then 'Course passed'
              when d.tick_at is not null then 'Signed off by ' || coalesce((select full_name from profiles where profiles.id = d.done_by), 'a leader')
              else null end,
         d.best,
         exists (select 1 from d e where e.day_number < d.day_number and not e.is_done)
    from d order by d.day_number, d.sort;
end $$;

-- Tick / untick a step for someone else; issues the certificate when the last step is done.
create or replace function public.orientation_tick(p uuid, p_item uuid, p_done boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare left_n int; cert text; tr uuid; me uuid := auth.uid(); seq int;
begin
  if not orientation_can_tick(p) then
    raise exception 'Only the person''s Program Coordinator, Program Manager, HR or a director can sign off orientation steps.';
  end if;
  if exists (select 1 from orientation_completions where profile_id = p) then
    raise exception 'This orientation is already complete and its certificate has been issued.';
  end if;
  if not exists (select 1 from orientation_plan_items where id = p_item and active) then raise exception 'That step no longer exists.'; end if;
  if p_done and exists (select 1 from orientation_plan_items i join course_keys k on k.course_key = i.course_key where i.id = p_item) then
    raise exception 'This step is an Evergreen Academy course. It is ticked automatically when the person passes the quiz.';
  end if;
  if p_done and exists (select 1 from orientation_plan_for(p) x where x.id = p_item and x.locked) then
    raise exception 'Finish the earlier days first.';
  end if;
  -- The last step (PC sign-off) only once everything else is done.
  if p_done and p_item = (select i.id from orientation_plan_items i where i.active order by i.day_number desc, i.sort desc limit 1)
     and exists (select 1 from orientation_plan_for(p) x where not x.done and x.id <> p_item) then
    raise exception 'Every other orientation step must be done before the final sign-off.';
  end if;
  if p_done then
    insert into orientation_progress (profile_id, item_id, done_by, note) values (p, p_item, me, left(p_note, 300))
    on conflict (profile_id, item_id) do update set done_at = now(), done_by = me, note = excluded.note;
  else
    delete from orientation_progress where profile_id = p and item_id = p_item;
  end if;

  select count(*) into left_n from orientation_plan_for(p) x where not x.done;
  if left_n > 0 then return jsonb_build_object('ok', true, 'left', left_n); end if;

  -- Everything done: one certificate for the whole orientation.
  perform pg_advisory_xact_lock(hashtext('orientation-cert'));
  select count(*) + 1 into seq from orientation_completions;
  cert := 'ECC-ORI-' || to_char(now() at time zone evg_tz(), 'YYYY') || '-' || lpad(seq::text, 4, '0');
  insert into trainings (profile_id, title, completed_on, hours, provider, notes, verified_by, created_by, certificate_no)
  values (p, 'Evergreen New Staff Orientation (6 days)', (now() at time zone evg_tz())::date, 33,
          'Evergreen Community Care', 'All orientation courses passed and in-person steps signed off', me, me, cert)
  returning id into tr;
  insert into orientation_completions (profile_id, signed_off_by, certificate_no, training_id) values (p, me, cert, tr);
  perform notify(p, '🎓 Orientation complete', 'Your Evergreen New Staff Orientation certificate ' || cert || ' is in your staff file.', '/orientation', 'oricomplete:' || p);
  return jsonb_build_object('ok', true, 'left', 0, 'complete', true, 'certificate_no', cert);
end $$;

-- Small summary for the Home tile.
create or replace function public.orientation_status(p uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare who uuid := coalesce(p, auth.uid()); n_total int; n_done int; cur int; c orientation_completions;
begin
  if who is null or not orientation_can_view(who) then return null; end if;
  select * into c from orientation_completions where profile_id = who;
  if c.profile_id is not null then
    return jsonb_build_object('active', false, 'complete', true, 'certificate_no', c.certificate_no, 'completed_at', c.completed_at);
  end if;
  if not exists (select 1 from onboardings where profile_id = who)
     and not exists (select 1 from orientation_progress where profile_id = who) then
    return jsonb_build_object('active', false, 'complete', false);
  end if;
  select count(*) filter (where x.kind <> 'lunch'), count(*) filter (where x.kind <> 'lunch' and x.done),
         min(x.day_number) filter (where not x.done)
    into n_total, n_done, cur from orientation_plan_for(who) x;
  return jsonb_build_object('active', true, 'complete', false, 'total', n_total, 'done', n_done, 'day', coalesce(cur, 6));
end $$;

-- Leaders: people in orientation that I can sign off.
create or replace function public.orientation_team()
returns table (profile_id uuid, full_name text, home_name text, done int, total int, day int, complete boolean)
language sql stable security definer set search_path = public as $$
  select pr.id, pr.full_name, h.name,
         (s->>'done')::int, (s->>'total')::int, (s->>'day')::int, coalesce((s->>'complete')::boolean, false)
    from profiles pr left join homes h on h.id = pr.home_id
    cross join lateral (select orientation_status(pr.id) as s) x
   where pr.active and pr.id <> auth.uid() and orientation_can_tick(pr.id)
     and (exists (select 1 from onboardings o where o.profile_id = pr.id)
          or exists (select 1 from orientation_progress g where g.profile_id = pr.id))
   order by coalesce((s->>'complete')::boolean, false), pr.full_name;
$$;

revoke execute on function public.orientation_can_view(uuid), public.orientation_can_tick(uuid), public.orientation_program(uuid),
  public.orientation_plan_for(uuid), public.orientation_tick(uuid, uuid, boolean, text), public.orientation_status(uuid),
  public.orientation_team() from public, anon;
grant execute on function public.orientation_can_view(uuid), public.orientation_can_tick(uuid), public.orientation_program(uuid),
  public.orientation_plan_for(uuid), public.orientation_tick(uuid, uuid, boolean, text), public.orientation_status(uuid),
  public.orientation_team() to authenticated, service_role;

-- The agreed 6-day plan (replaces the template; no one has progress on the old one).
delete from public.orientation_plan_items;
insert into public.orientation_plan_items (day_number, sort, start_time, end_time, kind, title, notes, course_key, program, active) values
 (1, 1, '09:00', '09:30', 'admin',     'Welcome, values and who we are', 'With your Program Coordinator, by video', null, 'Both', true),
 (1, 2, '09:30', '10:00', 'training',  'Evergreen portal walkthrough', 'Academy course and quiz', 'portal_walkthrough', 'Both', true),
 (1, 3, '10:00', '11:00', 'quiz',      'Missing youth protocol', 'Academy course and quiz', 'missing_youth', 'Both', true),
 (1, 4, '11:00', '12:00', 'quiz',      'Documentation and shift notes', 'Academy course and quiz', 'documentation', 'Both', true),
 (1, 5, '12:00', '12:30', 'lunch',     'Lunch', null, null, 'Both', true),
 (1, 6, '12:30', '13:15', 'quiz',      'Mandatory Reporting (CFCSA s.14)', 'Academy course and quiz', 'mandatory_reporting', 'MCFD', true),
 (1, 6, '12:30', '13:15', 'quiz',      'Vulnerable Adult Abuse & Neglect Reporting', 'Academy course and quiz', 'adult_protection', 'CLBC', true),
 (1, 7, '13:15', '14:45', 'quiz',      'Incident reporting', 'Academy course and quiz', 'incident_reporting', 'Both', true),
 (1, 8, '14:45', '15:00', 'admin',     'Day 1 check-in: questions and notes', 'With your Program Coordinator, by video', null, 'Both', true),
 (2, 1, '09:00', '10:00', 'quiz',      'Autism support', 'Academy course and quiz', 'autism_support', 'Both', true),
 (2, 2, '10:00', '11:00', 'quiz',      'Positive Behaviour Support', 'Academy course and quiz', 'positive_behaviour_support', 'Both', true),
 (2, 3, '11:00', '12:00', 'quiz',      'Consent and health care (ECC-HC-2026-001)', 'Academy course and quiz', 'consent_health_care', 'Both', true),
 (2, 4, '12:00', '12:30', 'lunch',     'Lunch', null, null, 'Both', true),
 (2, 5, '12:30', '13:30', 'external',  'Indigenous cultural safety', 'Outside course (San''yas or FNHA): upload your certificate in Evergreen Academy', null, 'Both', true),
 (2, 6, '13:30', '14:30', 'quiz',      'Bullying, harassment and privacy', 'On hold until the bullying policy is approved', 'bullying_harassment', 'Both', false),
 (2, 7, '14:30', '15:00', 'admin',     'Debrief and questions', 'With your Program Coordinator, by video', null, 'Both', true),
 (3, 1, '09:00', '10:00', 'quiz',      'Workplace health and safety', 'Academy course and quiz', 'workplace_health_safety', 'Both', true),
 (3, 2, '10:00', '11:00', 'quiz',      'Working Alone Safety', 'Academy course and quiz', 'working_alone', 'Both', true),
 (3, 3, '11:00', '11:30', 'training',  'Youth Rights (CFCSA s.70)', 'Academy course and quiz', 'youth_rights', 'MCFD', true),
 (3, 3, '11:00', '11:30', 'training',  'Restricted Practices (CLBC policy)', 'Academy course and quiz', 'restricted_practices', 'CLBC', true),
 (3, 4, '11:30', '12:00', 'lunch',     'Lunch', null, null, 'Both', true),
 (3, 5, '12:00', '13:30', 'training',  'LGBTQ2S+ Inclusion', 'Academy course and quiz', 'lgbtq_inclusion', 'Both', true),
 (3, 6, '13:30', '14:00', 'admin',     'Policy acknowledgements and sign-off', 'Sign in the CRM (Policies)', null, 'Both', true),
 (3, 7, '14:00', '14:30', 'admin',     'Read and sign your job description', 'Sign in the CRM', null, 'Both', true),
 (3, 8, '14:30', '15:00', 'admin',     'Supervision schedule set', 'With your Program Coordinator', null, 'Both', true),
 (4, 1, '09:00', '10:00', 'external',  'Naloxone 101 (online, free)', 'Outside course: upload your certificate in Evergreen Academy', null, 'Both', true),
 (4, 2, '10:00', '10:30', 'training',  'Privacy and FOIPPA', 'Academy course and quiz', 'privacy', 'Both', true),
 (4, 3, '10:30', '11:00', 'training',  'Abuse Recognition and Prevention', 'Academy course and quiz', 'abuse_recognition', 'Both', true),
 (4, 4, '11:00', '11:30', 'training',  'Workplace Violence Prevention', 'Academy course and quiz', 'workplace_violence', 'Both', true),
 (4, 5, '11:30', '12:00', 'lunch',     'Lunch', null, null, 'Both', true),
 (4, 6, '12:00', '13:00', 'training',  'Medication Administration (theory)', 'Academy course and quiz', 'medication_theory', 'Both', true),
 (4, 7, '13:00', '14:00', 'quiz',      'Orientation final quiz', 'Evergreen New Staff Orientation course: video and 15-question final quiz, pass mark 80%', 'orientation', 'Both', true),
 (4, 8, '14:00', '15:00', 'admin',     'Online orientation review', 'With your Program Coordinator, by video', null, 'Both', true),
 (5, 1, '09:00', '10:00', 'practical', 'Facility tour, exits and emergency procedures', 'In person at the house, with the Program Coordinator', null, 'Both', true),
 (5, 2, '10:00', '10:45', 'practical', 'Naloxone administration (hands-on)', 'In person', null, 'Both', true),
 (5, 3, '10:45', '12:45', 'practical', 'CPI Nonviolent Crisis Intervention (Module 1)', 'In person. Required before any solo shift', null, 'Both', true),
 (5, 4, '12:45', '13:15', 'lunch',     'Lunch', null, null, 'Both', true),
 (5, 5, '13:15', '13:45', 'admin',     'Meet your mentor', 'Your Program Coordinator introduces your mentor', null, 'Both', true),
 (5, 6, '13:45', '14:30', 'shift',     'House walkthrough', 'With a Shift Lead', null, 'Both', true),
 (5, 7, '14:30', '15:00', 'admin',     'Shadow briefing: shift notes and medication checks', 'With a Shift Lead', null, 'Both', true),
 (6, 1, '09:00', '11:00', 'shift',     'Shadow a day shift with a Shift Lead', 'Practise shift notes and medication checks', null, 'Both', true),
 (6, 2, '11:00', '12:00', 'shift',     'Shadow the evening shift handover', 'With a Shift Lead', null, 'Both', true),
 (6, 3, '12:00', '12:30', 'lunch',     'Lunch', null, null, 'Both', true),
 (6, 4, '12:30', '13:00', 'admin',     'Review the two shifts with the Shift Lead', 'Write up any gaps', null, 'Both', true),
 (6, 5, '13:00', '13:30', 'external',  'First Aid / CPR certificate checked', 'Full course booked before your first unsupervised shift', null, 'Both', true),
 (6, 6, '13:30', '14:00', 'admin',     'Training records and first supervision date', 'Meeting with the Program Coordinator', null, 'Both', true),
 (6, 7, '14:00', '14:30', 'admin',     'On-call leader briefing', null, null, 'Both', true),
 (6, 8, '21:00', '07:00', 'shift',     'Awake-night shadow shift', 'Overnight with the on-call leader. Paid as a night shift', null, 'Both', true),
 (6, 9, '07:00', '07:30', 'admin',     'Program Coordinator sign-off: orientation complete', 'After the night shadow shift. The last step. Issues the Evergreen New Staff Orientation certificate', null, 'Both', true);
