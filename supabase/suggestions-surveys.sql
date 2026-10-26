-- =====================================================================
-- Evergreen CRM - 💡 Suggestions and new surveys. Safe to run again.
-- Run after qa-phase2.sql and policies-hr.sql (uses notify()).
--
--  1. 💡 Suggestion button (top bar, every page): any staff member sends an idea, concern,
--     compliment or CRM problem in a few seconds. "Send without my name" stores no name at all.
--     Directors (level 4+) read and answer them in the QA portal; the sender sees the answer
--     under 💡 My suggestions (only when they sent it with their name).
--  2. New survey: "first_week" (new staff, 7–14 days after hire: was orientation clear?).
--     The 30-day "settling in" survey for youth and families uses the existing youth / family surveys.
-- =====================================================================

-- ---------- 1. Suggestions ----------
create table if not exists suggestions (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('Idea','Concern','Compliment','Problem with the CRM')),
  message      text not null check (length(message) between 3 and 3000),
  page         text check (length(page) <= 200),
  home_id      uuid references homes,
  anonymous    boolean not null default false,
  submitted_by uuid references profiles on delete set null,   -- empty when sent without a name
  status       text not null default 'New' check (status in ('New','Reviewing','Done','Not possible')),
  response     text check (length(response) <= 3000),
  responded_by uuid references profiles,
  responded_at timestamptz,
  action_id    uuid references action_items on delete set null,
  created_at   timestamptz not null default now(),
  check (not anonymous or submitted_by is null)
);
create index if not exists suggestions_at on suggestions (created_at desc);

-- Rate limit (10 an hour) without linking a person to an anonymous suggestion.
create table if not exists suggestion_rate (
  profile_id uuid not null references profiles on delete cascade,
  sent_at    timestamptz not null default now()
);
create index if not exists suggestion_rate_idx on suggestion_rate (profile_id, sent_at desc);
alter table suggestion_rate enable row level security;   -- no policies: only the function below uses it

alter table suggestions enable row level security;
drop policy if exists sug_read on suggestions;
drop policy if exists sug_answer on suggestions;
-- Directors read all; the sender reads their own named ones. Nobody inserts directly (use submit_suggestion).
create policy sug_read on suggestions for select to authenticated using (
  (coalesce(app_level(), 0) >= 4 and app_group() is null) or submitted_by = auth.uid());
create policy sug_answer on suggestions for update to authenticated
  using (coalesce(app_level(), 0) >= 4 and app_group() is null)
  with check (coalesce(app_level(), 0) >= 4 and app_group() is null);

create or replace function submit_suggestion(p_kind text, p_message text, p_anonymous boolean, p_page text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_home uuid; d record; n int;
begin
  if auth.uid() is null or coalesce(app_level(), 0) < 1 then raise exception 'Please sign in first.'; end if;
  if p_kind not in ('Idea','Concern','Compliment','Problem with the CRM') then raise exception 'Choose what kind of suggestion this is.'; end if;
  if length(coalesce(trim(p_message), '')) < 3 then raise exception 'Write a few words.'; end if;
  select count(*) into n from suggestion_rate where profile_id = auth.uid() and sent_at > now() - interval '1 hour';
  if n >= 10 then raise exception 'You have sent 10 suggestions this hour. Please try again later.'; end if;
  insert into suggestion_rate (profile_id) values (auth.uid());
  delete from suggestion_rate where sent_at < now() - interval '1 day';
  v_home := app_home();
  insert into suggestions (kind, message, page, home_id, anonymous, submitted_by)
  values (p_kind, left(trim(p_message), 3000), left(p_page, 200), v_home, coalesce(p_anonymous, false),
          case when coalesce(p_anonymous, false) then null else auth.uid() end)
  returning id into v_id;
  for d in select id from profiles where active and staff_group is null and (role = 'admin' or (coalesce(level, 0) >= 4 and role <> 'family')) loop
    perform notify(d.id, '💡 New ' || lower(p_kind) || ' from staff', left(trim(p_message), 140), '/qa/suggestions', 'suggestion:' || v_id || ':' || d.id);
  end loop;
  return v_id;
end $$;
revoke all on function submit_suggestion(text, text, boolean, text) from public, anon;
grant execute on function submit_suggestion(text, text, boolean, text) to authenticated;

-- Tell the sender when a director answers (named suggestions only).
create or replace function suggestion_answered() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.submitted_by is not null and new.response is not null and new.response is distinct from old.response then
    perform notify(new.submitted_by, '💡 Your ' || lower(new.kind) || ' was answered', left(new.response, 160), '/suggest',
                   'suggestion-answer:' || new.id || ':' || extract(epoch from now())::bigint);
  end if;
  return new;
end $$;
drop trigger if exists suggestion_answered on suggestions;
create trigger suggestion_answered after update on suggestions for each row execute function suggestion_answered();

drop trigger if exists audit_suggestions on suggestions;
create trigger audit_suggestions after update or delete on suggestions for each row execute function write_audit();

-- ---------- 2. New survey type: first_week ----------
alter table survey_sends drop constraint if exists survey_sends_survey_key_check;
alter table survey_sends add constraint survey_sends_survey_key_check
  check (survey_key in ('youth','family','social_worker','funder','staff','new_hire','first_week','applicant','referral'));

-- Staff surveys (staff, new_hire, first_week, applicant) are seen by directors only.
create or replace function can_see_survey(p_home uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app_level(), 0) >= 4
      or (p_key not in ('staff','new_hire','first_week','applicant') and app_group() is null and (
            coalesce(app_level(), 0) = 3
            or (coalesce(app_level(), 0) = 2 and p_home is not null and p_home = app_home())));
$$;

-- Check: should say suggestions_table = 1 and first_week_allowed = true
select (select count(*) from information_schema.tables where table_name = 'suggestions') as suggestions_table,
       (select pg_get_constraintdef(oid) like '%first_week%' from pg_constraint where conname = 'survey_sends_survey_key_check') as first_week_allowed;
