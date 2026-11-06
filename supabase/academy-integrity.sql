-- =====================================================================
-- Evergreen Academy - quiz marking and "watch the whole lesson first" (saved from the live database, Nov 5, 2026).
-- These were only ever created on the live database, so a rebuilt database or the test site had no quizzes.
--   * course_keys: each course's answer key, pass mark, training title, hours, renewal months, and the
--     minimum watching time (min_seconds, set from the video's length). Read only by the functions below:
--     row-level security is on with NO policies, so staff can never read the answers.
--   * lesson_sessions: a viewing is timed in the database; the quiz opens only after the whole lesson played.
--   * grade_course(): marks the quiz on the server, saves the attempt, and on a pass adds the training to the
--     person's file with its renewal date.
-- Fixes made while saving it:
--   * set_lesson_length() checked "level < 6" without coalesce, so anyone with no level (a family account)
--     could set a course's watching time to 0. Now coalesce(app_level(), 0) and Admin allowed.
--   * "Please answer every question" never fired for a blank answer (NULL <> 'number'), so a blank was
--     silently marked wrong. Now "is distinct from".
--   * The Mandatory Reporting key had 10 answers but the quiz shows 18 (8 added Oct 26), so questions 11-18
--     didn't count. The keys below come from lib/courses/answers.js and lib/courses/orientationKey.js.
-- Keep the answer files and this table in step: change both, or re-run the insert at the bottom.
-- Run as migration academy_integrity. Safe to run more than once (min_seconds already set is kept).
-- =====================================================================
create table if not exists public.course_keys (
  course_key text primary key,
  answers jsonb not null,
  pass_percent integer not null default 80,
  training_title text not null,
  hours numeric,
  min_seconds integer not null default 0,
  updated_at timestamptz not null default now(),
  renew_months integer
);
alter table public.course_keys enable row level security;

create table if not exists public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  course_key text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  used boolean not null default false
);
create index if not exists lesson_sessions_person on public.lesson_sessions (profile_id, course_key, started_at desc);
alter table public.lesson_sessions enable row level security;
drop policy if exists lesson_sessions_select on public.lesson_sessions;
create policy lesson_sessions_select on public.lesson_sessions for select to authenticated
  using (profile_id = auth.uid() or coalesce(app_level(), 0) >= 3);

create or replace function public.lesson_start(p_key text) returns uuid
language plpgsql security definer set search_path to 'public' as $function$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from course_keys where course_key = p_key) then raise exception 'Unknown course'; end if;
  insert into lesson_sessions (profile_id, course_key) values (auth.uid(), p_key) returning id into v_id;
  return v_id;
end $function$;

create or replace function public.lesson_finish(p_session uuid) returns integer
language plpgsql security definer set search_path to 'public' as $function$
declare s lesson_sessions; need int; done int;
begin
  select * into s from lesson_sessions where id = p_session and profile_id = auth.uid();
  if not found then raise exception 'Session not found'; end if;
  if s.completed_at is not null then return 0; end if;
  select min_seconds into need from course_keys where course_key = s.course_key;
  done := floor(extract(epoch from now() - s.started_at));
  if done >= coalesce(need, 0) then
    update lesson_sessions set completed_at = now() where id = s.id;
    return 0;
  end if;
  return coalesce(need, 0) - done;
end $function$;

create or replace function public.lesson_ready(p_key text) returns boolean
language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from lesson_sessions where profile_id = auth.uid() and course_key = p_key
                 and completed_at is not null and not used);
$function$;

create or replace function public.set_lesson_length(p_key text, p_seconds integer) returns void
language plpgsql security definer set search_path to 'public' as $function$
begin
  if not (app_role() = 'admin' or coalesce(app_level(), 0) >= 6) then
    raise exception 'Only level 6-8 can change training videos';
  end if;
  update course_keys set min_seconds = greatest(0, p_seconds), updated_at = now() where course_key = p_key;
end $function$;

create or replace function public.grade_course(p_key text, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $function$
declare k course_keys; sess uuid; qid text; chose int; correct int; ok boolean;
        score int := 0; total int := 0; pct int; passed boolean; results jsonb := '[]'::jsonb;
        today date := (now() at time zone 'Etc/GMT+7')::date; recorded boolean := false; v_exp date;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into k from course_keys where course_key = p_key;
  if not found then return jsonb_build_object('error', 'Course not found.'); end if;
  select id into sess from lesson_sessions where profile_id = auth.uid() and course_key = p_key
    and completed_at is not null and not used order by completed_at desc limit 1;
  if sess is null then
    return jsonb_build_object('error', 'Watch the whole lesson first — the quiz opens when it ends.', 'needWatch', true);
  end if;
  for qid in select jsonb_object_keys(k.answers) loop
    if jsonb_typeof(p_answers -> qid) is distinct from 'number' then return jsonb_build_object('error', 'Please answer every question.'); end if;
  end loop;
  for qid, correct in select key, (value ->> 'a')::int from jsonb_each(k.answers) order by (substring(key from 2))::int loop
    chose := (p_answers ->> qid)::int; ok := chose = correct; total := total + 1;
    if ok then score := score + 1; end if;
    results := results || jsonb_build_object('id', qid, 'chose', chose, 'ok', ok, 'correct', correct, 'why', k.answers -> qid ->> 'why');
  end loop;
  pct := round(score * 100.0 / total); passed := pct >= k.pass_percent;
  update lesson_sessions set used = true where id = sess;
  insert into course_attempts (profile_id, course_key, score, total, passed, answers)
    values (auth.uid(), p_key, score, total, passed, p_answers);
  if passed then
    -- Renewal date set automatically from the training standard (renew_months; null = no renewal).
    v_exp := case when k.renew_months is null then null else (today + make_interval(months => k.renew_months))::date end;
    if not exists (select 1 from trainings where profile_id = auth.uid() and title = k.training_title and completed_on = today) then
      insert into trainings (profile_id, title, completed_on, expires_on, hours, provider, notes, created_by)
        values (auth.uid(), k.training_title, today, v_exp, k.hours, 'Evergreen Academy (online course)',
                format('Passed Evergreen Academy quiz %s/%s (%s%%) after watching the full lesson', score, total, pct), auth.uid());
    else
      update trainings set expires_on = v_exp where profile_id = auth.uid() and title = k.training_title and completed_on = today;
    end if;
    recorded := true;
  else
    -- Not passed: only say which answers were wrong, never the right ones.
    select coalesce(jsonb_agg(r - 'correct' - 'why'), '[]'::jsonb) into results from jsonb_array_elements(results) r;
  end if;
  return jsonb_build_object('ok', true, 'score', score, 'total', total, 'percent', pct, 'passed', passed, 'recorded', recorded, 'results', results,
    'expires_on', v_exp, 'renew_months', case when passed then k.renew_months end);
end $function$;

revoke execute on function public.lesson_start(text) from public, anon;
revoke execute on function public.lesson_finish(uuid) from public, anon;
revoke execute on function public.lesson_ready(text) from public, anon;
revoke execute on function public.set_lesson_length(text, integer) from public, anon;
revoke execute on function public.grade_course(text, jsonb) from public, anon;
grant execute on function public.lesson_start(text), public.lesson_finish(uuid), public.lesson_ready(text),
  public.set_lesson_length(text, integer), public.grade_course(text, jsonb) to authenticated, service_role;

-- Answer keys (from lib/courses/answers.js and lib/courses/orientationKey.js). min_seconds is only a starting
-- value: uploading a course video sets it from the video's length, and that is kept on a re-run.
insert into public.course_keys (course_key, answers, pass_percent, training_title, hours, min_seconds, renew_months) values
('abuse_recognition', '{"q1":{"a":0,"why":"Unexplained or inconsistently explained injuries, or patterned bruises, are warning signs."},"q2":{"a":3,"why":"Unexplained gifts and older contacts are classic signs of grooming and exploitation."},"q3":{"a":3,"why":"Several signs together are reasonable grounds. MCFD investigates."},"q4":{"a":2,"why":"Every prohibited practice constitutes abuse or neglect under the CFCSA."},"q5":{"a":3,"why":"Refuse, document, report. Following the instruction is not a defence."},"q6":{"a":0,"why":"Neglect includes not meeting basic needs or necessary health care."},"q7":{"a":2,"why":"Respond calmly and safely, never with shame; sexualized behaviour can indicate prior abuse and may trigger reporting."},"q8":{"a":2,"why":"Screening, monitoring, boundaries and in-program contact prevent harm."},"q9":{"a":0,"why":"Family and cultural contact is a right, never a consequence."},"q10":{"a":1,"why":"Exposure to domestic violence can emotionally harm a child and is a protection concern."},"q11":{"a":2,"why":"Be warm and honest: you can''t promise secrecy that may put a young person at risk."},"q12":{"a":0,"why":"A missing young person is a life-safety situation: safety first, then report."},"q13":{"a":1,"why":"Record facts only. Don''t investigate or interview the young person yourself."},"q14":{"a":3,"why":"If the social worker can''t be reached, call the after-hours Ministry line, 1-800-663-9122."},"q15":{"a":1,"why":"Contact happens within the program, with the team''s knowledge. Raising it protects the young person and the colleague."}}'::jsonb, 80, 'Abuse Recognition and Prevention', 3.0, 118, 12),
('adult_protection', '{"q1":{"a":2,"why":"The Adult Guardianship Act — reports go to the designated agency."},"q2":{"a":3,"why":"Taking or misusing money or property is financial abuse."},"q3":{"a":1,"why":"Suspected abuse or neglect of an adult is reported to the designated agency and to CLBC per the contract."},"q4":{"a":1,"why":"Police are called where a crime may have occurred (911 if immediate danger)."},"q5":{"a":2,"why":"Injuries of unknown origin are escalated to the PC and PM immediately."},"q6":{"a":3,"why":"CLBC: verbal same day plus a written critical incident report per the contract."},"q7":{"a":3,"why":"Self-neglect of an adult who can''t seek help is reportable under the Act."},"q8":{"a":3,"why":"Don''t investigate or confront — report and document."},"q9":{"a":3,"why":"Weight loss, poor hygiene and missed medications or appointments can signal neglect."},"q10":{"a":3,"why":"Listen, take it seriously, document their words, and report."}}'::jsonb, 80, 'Vulnerable Adult Abuse & Neglect Reporting (Adult Guardianship Act)', 2.0, 117, 24),
('driver_safety', '{"q1":{"a":1,"why":"A current abstract is submitted to HR annually in January."},"q2":{"a":0,"why":"A basic pre-trip inspection is done and logged before each work-related trip."},"q3":{"a":3,"why":"Fuel adequate for the planned trip plus a 20% reserve."},"q4":{"a":0,"why":"Handheld devices must not be used while driving; pull over and stop."},"q5":{"a":1,"why":"No alcohol within 8 hours and no cannabis within 12 hours before driving for work."},"q6":{"a":2,"why":"One additional staff is required for more than two youth or a youth with a travel safety concern."},"q7":{"a":3,"why":"Youth must never be left unattended in a vehicle, including during brief stops."},"q8":{"a":0,"why":"3 seconds normally; 6 seconds in rain, snow or reduced visibility."},"q9":{"a":2,"why":"Any defect that may affect safety is reported to the supervisor before the trip proceeds."},"q10":{"a":2,"why":"Report immediately to your supervisor and complete the Vehicle Incident Report within 24 hours."}}'::jsonb, 80, 'Driver Safety + annual driver’s abstract', 2.0, 120, 12),
('lgbtq_inclusion', '{"q1":{"a":3,"why":"From day one — no diagnosis, letter, family agreement or legal change required."},"q2":{"a":2,"why":"Correct briefly without a drawn-out apology or asking for reassurance."},"q3":{"a":1,"why":"Outing is disclosing identity without consent — a prohibited practice."},"q4":{"a":3,"why":"Disclosure is on the person''s terms only."},"q5":{"a":3,"why":"The previous name — not used in daily life."},"q6":{"a":0,"why":"No comments on bodies, presentation or how ''convincing'' someone looks."},"q7":{"a":2,"why":"Staff correct others in the moment (unless the person asked otherwise)."},"q8":{"a":0,"why":"Affirmation measurably improves safety and wellbeing."},"q9":{"a":3,"why":"The person chooses; the program makes choices available and respects them."},"q10":{"a":0,"why":"Two-Spirit is an Indigenous identity with its own cultural meaning."},"q11":{"a":1,"why":"Never confirm or share. A polite \"I''m not able to discuss that\" protects the person; tell your Program Coordinator."},"q12":{"a":2,"why":"Repeated errors after coaching go to the Program Coordinator as a training need."},"q13":{"a":3,"why":"Affirming hygiene items are provided as needed, without gatekeeping or asking the person to justify."},"q14":{"a":1,"why":"Using the person''s name and pronouns is required care, not a personal choice; the Program Coordinator follows up."},"q15":{"a":0,"why":"Let the youth know privately so they aren''t surprised, tell your Program Coordinator, and follow the youth''s wishes."}}'::jsonb, 80, 'LGBTQ2S+ Inclusion', 2.0, 118, 12),
('mandatory_reporting', '{"q1":{"a":3,"why":"The duty applies to everyone — including you — and it is personal."},"q2":{"a":0,"why":"Reasonable grounds are enough. Investigating is MCFD''s job."},"q3":{"a":0,"why":"Provincial Centralized Screening: 1-800-663-9122, 24 hours a day. (1-800-476-3933 is the Representative for Children and Youth.)"},"q4":{"a":0,"why":"No one can stop you from reporting. The duty is yours."},"q5":{"a":1,"why":"The duty applies no matter who caused the harm, including colleagues."},"q6":{"a":2,"why":"Never promise secrecy. Be honest and kind, then report."},"q7":{"a":0,"why":"Listen, don''t lead, and record their own words. Investigators handle the details."},"q8":{"a":1,"why":"Safety first: call 911 for immediate danger, then report to MCFD."},"q9":{"a":2,"why":"Exposure to domestic violence can cause emotional harm — a protection concern."},"q10":{"a":2,"why":"Report first, document what happened, then notify your Program Manager."},"q11":{"a":3,"why":"In B.C., a child is anyone under 19."},"q12":{"a":0,"why":"Failing to report is an offence under the CFCSA (section 14)."},"q13":{"a":1,"why":"That''s a leading question. Let the youth tell it in their own words."},"q14":{"a":3,"why":"Your report starts the process; MCFD investigates."},"q15":{"a":2,"why":"No action for damages can be brought for a report made in good faith."},"q16":{"a":0,"why":"Facts, times and the youth''s own words, as soon as you can."},"q17":{"a":1,"why":"Report first, then tell your Program Coordinator or on-call and write an incident report. The Program Manager reviews it."},"q18":{"a":3,"why":"A parent asking you not to call doesn''t cancel your duty."}}'::jsonb, 80, 'Mandatory Reporting (CFCSA s.14)', 1.5, 157, 24),
('medication_theory', '{"q1":{"a":3,"why":"Only staff with current authorization (training + written competency) may administer."},"q2":{"a":2,"why":"Authorization is renewed annually."},"q3":{"a":1,"why":"Right person, right medication, right dose, right route, right time."},"q4":{"a":3,"why":"Observe the dose taken, then complete the MAR. Never pre-sign."},"q5":{"a":2,"why":"Controlled substances are double-locked and counted at every shift change."},"q6":{"a":3,"why":"Any discrepancy — even one dose — is reported to the PM immediately."},"q7":{"a":3,"why":"Document the refusal with the reason and notify the supervisor. Never force or hide medication."},"q8":{"a":3,"why":"Wrong drug/dose/person/time: prescriber or 8-1-1; 911 for any adverse effect; CI report within 2 hours."},"q9":{"a":2,"why":"Removed immediately and returned through the medication return program."},"q10":{"a":1,"why":"Don''t repeat a dose without prescriber guidance."}}'::jsonb, 80, 'Medication Administration — Theory (Evergreen Academy)', 1.5, 124, 12),
('missing_youth', '{"q1":{"a":1,"why":"Phase 1 lasts a maximum of 30 minutes — it is a maximum, not a waiting period."},"q2":{"a":3,"why":"Immediate danger: skip the search and call 911 first, then the social worker or PCS."},"q3":{"a":3,"why":"There is no requirement to wait before reporting to the social worker or PCS."},"q4":{"a":3,"why":"Start the chronological log right away: time, what you did, who, and the result."},"q5":{"a":1,"why":"The shift lead notifies the PM within 30 minutes."},"q6":{"a":2,"why":"A missing youth is a Category 1 incident — CI report within 24 hours regardless of outcome."},"q7":{"a":1,"why":"Never disclose that a youth is in care — that''s a privacy breach under FOIPPA."},"q8":{"a":1,"why":"Welcome warmly, wellness check, food and calm — no interrogation."},"q9":{"a":0,"why":"Communicate the youth''s last known location to fire/police immediately; staff never re-enter an unsafe structure."},"q10":{"a":2,"why":"Mood, suicide risk, substance use, clothing and weather help assess risk."}}'::jsonb, 80, 'Missing Child/Youth Protocol', 1.0, 604, 12),
('orientation', '{"q1":{"a":1,"why":"CFCSA s.14 makes the duty personal: you report to MCFD yourself, immediately. Telling your supervisor does not fulfil it."},"q2":{"a":2,"why":"Withholding meals or any basic need is a prohibited practice — never used as a consequence."},"q3":{"a":1,"why":"Prone (face-down) restraint is prohibited under any circumstances."},"q4":{"a":2,"why":"Restraint is a last resort: imminent risk of serious harm, less restrictive approaches failed, NVCI-certified, second staff present or called."},"q5":{"a":0,"why":"Write the shift log before you leave the facility — never the next day."},"q6":{"a":2,"why":"Good entries are objective and specific: time, what happened, outcome, who was notified — facts, not labels."},"q7":{"a":1,"why":"Category 1: verbal report to MCFD within 2 hours and a written critical incident report within 24 hours."},"q8":{"a":1,"why":"No medication until you are trained and authorized in writing by the Program Manager."},"q9":{"a":0,"why":"Right youth, right medication, right dose, right route, right time — every dose."},"q10":{"a":1,"why":"Use correct names and pronouns; if unsure, ask the youth respectfully and privately."},"q11":{"a":2,"why":"Never confirm or deny that a youth is in care. Refer police, media or the public to the Program Manager."},"q12":{"a":2,"why":"No social media connections with current or recently discharged youth."},"q13":{"a":0,"why":"Your three rights: to know, to participate, and to refuse unsafe work."},"q14":{"a":1,"why":"Confidentiality never cancels the duty to report. Report even if told in confidence."},"q15":{"a":1,"why":"Probation reviews at 30, 90 and 120 days, then confirmation to full-time."}}'::jsonb, 80, 'New Staff Orientation (Evergreen Academy course)', 1.0, 600, null),
('portal_walkthrough', '{"q1":{"a":0,"why":"Clock in / out, Emergency, Sick and My ID card are first on everyone''s Home screen."},"q2":{"a":1,"why":"You can clock in up to 15 minutes before your shift; more than 5 minutes after the start counts as late."},"q3":{"a":1,"why":"Tap 🆘 Emergency, choose Missing youth, and follow the missing youth steps. Your leaders are alerted straight away."},"q4":{"a":2,"why":"Tell us before your shift starts, so the shift can be covered."},"q5":{"a":1,"why":"Records are entered in Documentation, by section, for each youth, before you leave the building."},"q6":{"a":1,"why":"Only mark a dose as given after you have watched the youth take it."},"q7":{"a":1,"why":"Tick the step as done on the youth''s Goals tab."},"q8":{"a":0,"why":"At Evergreen, a picked-up open shift is assigned to you right away and your coordinator is told."}}'::jsonb, 80, 'Evergreen Portal Walkthrough', 0.5, 150, null),
('positive_behaviour_support', '{"q1":{"a":1,"why":"Behaviour almost always communicates something the person can''t express another way."},"q2":{"a":2,"why":"The plan is your guide — read it before you work with the person and use it."},"q3":{"a":3,"why":"Praise should be specific, genuine and timely."},"q4":{"a":3,"why":"At agitation: reduce demands, offer choice, increase space, use the plan''s strategies."},"q5":{"a":1,"why":"Calm, low-stimulation environment; call backup; don''t engage the content of threats."},"q6":{"a":2,"why":"In recovery, give time and space; debrief fully when the person is regulated and ready."},"q7":{"a":1,"why":"Least restrictive first; restrictive interventions only as a last resort, never punishment."},"q8":{"a":2,"why":"Modelling appropriate social behaviour through consistent adult example is required practice."},"q9":{"a":3,"why":"Maintaining and repairing the relationship is part of the intervention."},"q10":{"a":2,"why":"Person-centred practice starts with the person''s goals, choices, communication and needs."}}'::jsonb, 80, 'Person-Centred Practice & Positive Behaviour Support', 6.0, 113, 24),
('privacy', '{"q1":{"a":1,"why":"Access is need-to-know. Other requests go to the Program Manager."},"q2":{"a":2,"why":"Records are released only with legal authority, through the PM."},"q3":{"a":3,"why":"No client information on personal devices, email or messaging apps."},"q4":{"a":1,"why":"Nothing about anyone in care is ever posted on social media."},"q5":{"a":2,"why":"Written permission from the MCFD social worker is required."},"q6":{"a":2,"why":"Service records belong to the funder and are transferred, never destroyed."},"q7":{"a":2,"why":"Only with ED authorization, by cross-cut shredding or a certified service."},"q8":{"a":3,"why":"Report suspected loss or breach the same day."},"q9":{"a":0,"why":"Gender identity is confidential and isn''t shared without the youth''s informed consent (unless a documented safety reason exists)."},"q10":{"a":3,"why":"Never confirm or deny that someone is in care."}}'::jsonb, 80, 'Privacy and FOIPPA', 1.0, 123, 12),
('restricted_practices', '{"q1":{"a":3,"why":"Only for immediate risk of serious physical harm, after less restrictive options."},"q2":{"a":0,"why":"Untrained staff never restrain — they call for trained support."},"q3":{"a":1,"why":"Prone restraint is never used because of the risk of positional asphyxia."},"q4":{"a":3,"why":"Chemical restraint is prohibited."},"q5":{"a":3,"why":"It ends at the earliest moment the risk has passed — the shortest duration necessary."},"q6":{"a":1,"why":"Any sign of physical distress triggers immediate release and first aid/911."},"q7":{"a":1,"why":"Every event is documented before the end of the shift."},"q8":{"a":3,"why":"The PM is notified the same shift for every use, planned or emergency."},"q9":{"a":3,"why":"Locked seclusion is prohibited; a person is never confined to a locked room."},"q10":{"a":2,"why":"The PM conducts a root-cause review within 5 business days."}}'::jsonb, 80, 'Restricted Practices (CLBC policy)', 3.0, 130, 12),
('working_alone', '{"q1":{"a":3,"why":"Check-ins are at intervals not exceeding 2 hours."},"q2":{"a":0,"why":"The device is confirmed working and contact is tested at shift start."},"q3":{"a":3,"why":"Two calls, 2 minutes apart; then the second contact; then 911 after 5 minutes."},"q4":{"a":1,"why":"If there''s no response after 5 minutes, call 911."},"q5":{"a":0,"why":"Working alone means no one readily available to help — like a solo overnight."},"q6":{"a":1,"why":"Every check-in is logged with date, time, contact and outcome."},"q7":{"a":2,"why":"Minimum two-staff coverage is required regardless of scheduling difficulty."},"q8":{"a":1,"why":"Never manage a physical crisis alone — call for help early."},"q9":{"a":2,"why":"Check-in failures are addressed as safety incidents."},"q10":{"a":2,"why":"Give the worker''s name, last known location and facility address."}}'::jsonb, 80, 'Working Alone Safety', 1.0, 109, 12),
('workplace_violence', '{"q1":{"a":1,"why":"Threats that give reasonable cause to fear injury count, as well as attempted or actual assaults."},"q2":{"a":3,"why":"All physical assaults are reported immediately and documented within 2 hours."},"q3":{"a":2,"why":"Threats are documented in the shift log and on an Incident Report within 24 hours."},"q4":{"a":1,"why":"Bedtimes, medication refusals, family visits, outings and shift change are higher-risk."},"q5":{"a":3,"why":"All on-duty staff have a communication device throughout the shift."},"q6":{"a":0,"why":"NVCI is required before independent work and refreshed annually."},"q7":{"a":0,"why":"WorkSafeBC is notified for injury, time lost, or medical attention beyond basic first aid."},"q8":{"a":0,"why":"A Critical Incident Stress Debrief is held within 48–72 hours."},"q9":{"a":3,"why":"No worker faces reprisal for reporting violence or refusing work based on a credible threat."},"q10":{"a":3,"why":"The JHSC reviews violence-related reports monthly and recommends prevention measures."}}'::jsonb, 80, 'Workplace Violence Prevention', 2.0, 124, 12),
('youth_rights', '{"q1":{"a":3,"why":"Section 70 of the Child, Family and Community Service Act."},"q2":{"a":3,"why":"Being fed is a right. Rights are never removed as a consequence."},"q3":{"a":1,"why":"Youth have a right to privacy when talking with their lawyer, the RCY, the Ombudsperson, an MLA or MP."},"q4":{"a":1,"why":"RCY: 1-800-476-3933. (1-800-663-9122 is the child protection line.)"},"q5":{"a":1,"why":"Body and strip searches are strictly prohibited."},"q6":{"a":0,"why":"The PM investigates within 5 business days; a written response follows within 10."},"q7":{"a":2,"why":"Youth must never face reprisal for making a complaint."},"q8":{"a":3,"why":"Indigenous youth have the right to belong to their communities and practise their traditions, customs and languages."},"q9":{"a":2,"why":"Rights are explained at placement, in language or formats the youth understands."},"q10":{"a":3,"why":"Youth have the right to religious instruction and activities of their choice."}}'::jsonb, 80, 'Youth Rights (CFCSA s.70)', 2.0, 140, 24)
on conflict (course_key) do update set answers = excluded.answers, pass_percent = excluded.pass_percent,
  training_title = excluded.training_title, hours = excluded.hours, renew_months = excluded.renew_months, updated_at = now();
