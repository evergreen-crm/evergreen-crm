-- =====================================================================
-- Evergreen CRM - Goal review dates (individual plan and care plan reviews).
--  * Each goal has a next review date. A review records when it was done and the next date.
--  * Goals whose review date has passed are flagged. Those due within 14 days are flagged as coming up.
-- Safe to run more than once.
-- =====================================================================
alter table goals add column if not exists review_date  date;
alter table goals add column if not exists reviewed_on  date;
alter table goals add column if not exists review_note  text;
alter table goals add column if not exists reviewed_by  uuid references profiles;
