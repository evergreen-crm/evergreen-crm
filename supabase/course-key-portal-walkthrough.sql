-- Evergreen Academy: answer key for the Portal Walkthrough course (Oct 30, 2026).
-- Quizzes are graded in the database from course_keys; lib/courses/answers.js must match.
-- Run as migration course_key_portal_walkthrough. Safe to run more than once.
insert into course_keys (course_key, answers, pass_percent, training_title, hours, min_seconds, renew_months, updated_at)
values ('portal_walkthrough', '{"q1":{"a":0,"why":"Clock in / out, Emergency, Sick and My ID card are first on everyone''s Home screen."},"q2":{"a":1,"why":"You can clock in up to 15 minutes before your shift; more than 5 minutes after the start counts as late."},"q3":{"a":1,"why":"Tap 🆘 Emergency, choose Missing youth, and follow the missing youth steps. Your leaders are alerted straight away."},"q4":{"a":2,"why":"Tell us before your shift starts, so the shift can be covered."},"q5":{"a":1,"why":"Records are entered in Documentation, by section, for each youth, before you leave the building."},"q6":{"a":1,"why":"Only mark a dose as given after you have watched the youth take it."},"q7":{"a":1,"why":"Tick the step as done on the youth''s Goals tab."},"q8":{"a":0,"why":"At Evergreen, a picked-up open shift is assigned to you right away and your coordinator is told."}}'::jsonb, 80, 'Evergreen Portal Walkthrough', 0.5, 150, null, now())
on conflict (course_key) do update set answers = excluded.answers, pass_percent = excluded.pass_percent,
  training_title = excluded.training_title, hours = excluded.hours, min_seconds = excluded.min_seconds,
  renew_months = excluded.renew_months, updated_at = now();
