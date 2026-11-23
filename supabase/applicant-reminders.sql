-- Applicant reminders (Nov 23, 2026): the daily job emails people who started a job application (Careers) or a
-- pre-screen but didn't finish. Careers applications: only after the applicant confirmed their email with the code;
-- up to 3 reminders (2 days quiet, then 5 days, then 3 days before the posting closes or 14 days). Pre-screens: up to
-- 2 (3 days quiet, then 3 days before the link expires or 7 days). Stops when they send, withdraw, the job closes
-- or the link ends. lib/applicantReminders.js
alter table public.job_applications add column if not exists reminders_sent int not null default 0;
alter table public.job_applications add column if not exists last_reminded_at timestamptz;
alter table public.prescreens add column if not exists reminders_sent int not null default 0;
alter table public.prescreens add column if not exists last_reminded_at timestamptz;
